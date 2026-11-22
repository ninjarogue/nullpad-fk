import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { type Browser, chromium } from '@playwright/test'

import {
  type Nullpad,
  type Screen,
  driver,
  linesOf,
  screenOf,
} from './nullpad.ts'

type Point = Readonly<{ x: number; y: number }>
type Spot = Readonly<{ row: number; cell: number }>
type Expectation = Readonly<{
  text?: string
  status?: string
  under?: string
  top?: string
  full?: boolean
}>

type Step =
  | Readonly<{ type: string }>
  | Readonly<{ press: string; times?: number }>
  | Readonly<{ paste: string }>
  | Readonly<{
      compose: string
      replacing?: Readonly<{ start: number; end: number }>
    }>
  | Readonly<{ commit: string }>
  | Readonly<{ click: Point | Spot }>
  | Readonly<{ wheel: number }>
  | Readonly<{ resize: Readonly<{ width: number; height: number }> }>
  | Readonly<{ shot: string }>
  | Readonly<{ expect: Expectation }>

const stepKeys = [
  'type',
  'press',
  'paste',
  'compose',
  'commit',
  'click',
  'wheel',
  'resize',
  'shot',
  'expect',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseStep = (value: unknown, index: number): Step => {
  const fail = (why: string): never => {
    throw new Error(`step ${index + 1} ${JSON.stringify(value)}: ${why}`)
  }
  if (!isRecord(value)) {
    return fail('is not an object')
  }
  const kinds = stepKeys.filter(key => key in value)
  const [kind] = kinds
  if (kinds.length !== 1 || kind === undefined) {
    return fail(`needs exactly one of ${stepKeys.join(', ')}`)
  }
  const allowed: ReadonlyArray<string> = [
    kind,
    ...(kind === 'press' ? ['times'] : []),
    ...(kind === 'compose' ? ['replacing'] : []),
  ]
  const extra = Object.keys(value).filter(key => !allowed.includes(key))
  if (extra.length > 0) {
    return fail(`${kind} takes no field ${extra.join(', ')}`)
  }
  const body = value[kind]
  const only = (
    record: Record<string, unknown>,
    names: ReadonlyArray<string>,
  ) => {
    const unknown = Object.keys(record).filter(key => !names.includes(key))
    if (unknown.length > 0) {
      fail(`${kind} takes only ${names.join(', ')}, not ${unknown.join(', ')}`)
    }
  }
  const text = (): string =>
    typeof body === 'string' ? body : fail(`${kind} takes a string`)
  const number = (field: unknown, name: string): number =>
    typeof field === 'number' && Number.isFinite(field)
      ? field
      : fail(`${name} takes a number`)
  switch (kind) {
    case 'type':
    case 'paste':
    case 'commit':
      return { [kind]: text() } as Step
    case 'shot':
      return /^[\w-]+$/u.test(text())
        ? { shot: text() }
        : fail('shot takes a name of letters, digits, - and _')
    case 'press': {
      const times = value['times']
      if (times === undefined) {
        return { press: text() }
      }
      return Number.isInteger(times) && Number(times) > 0
        ? { press: text(), times: Number(times) }
        : fail('times takes a whole number above 0')
    }
    case 'compose': {
      const replacing = value['replacing']
      if (replacing === undefined) {
        return { compose: text() }
      }
      if (isRecord(replacing)) {
        only(replacing, ['start', 'end'])
        if (Number(replacing['start']) > Number(replacing['end'])) {
          fail('replacing.start comes after replacing.end')
        }
      }
      return isRecord(replacing)
        ? {
            compose: text(),
            replacing: {
              start: number(replacing['start'], 'replacing.start'),
              end: number(replacing['end'], 'replacing.end'),
            },
          }
        : fail('replacing takes { start, end }')
    }
    case 'click':
      if (isRecord(body)) {
        only(body, 'row' in body ? ['row', 'cell'] : ['x', 'y'])
      }
      if (isRecord(body) && 'row' in body) {
        return {
          click: {
            row: number(body['row'], 'click.row'),
            cell: number(body['cell'], 'click.cell'),
          },
        }
      }
      return isRecord(body)
        ? {
            click: {
              x: number(body['x'], 'click.x'),
              y: number(body['y'], 'click.y'),
            },
          }
        : fail('click takes { row, cell } or { x, y }')
    case 'wheel':
      return { wheel: number(body, 'wheel') }
    case 'resize':
      if (isRecord(body)) {
        only(body, ['width', 'height'])
      }
      return isRecord(body)
        ? {
            resize: {
              width: number(body['width'], 'resize.width'),
              height: number(body['height'], 'resize.height'),
            },
          }
        : fail('resize takes { width, height }')
    case 'expect': {
      if (!isRecord(body)) {
        return fail('expect takes { text?, status?, under?, top?, full? }')
      }
      const fields = ['text', 'status', 'under', 'top'] as const
      const unknown = Object.keys(body).filter(
        key => ![...fields, 'full'].includes(key),
      )
      if (unknown.length > 0) {
        return fail(`expect has no field ${unknown.join(', ')}`)
      }
      const expectation: Record<string, string | boolean> = {}
      if (body['full'] === true) {
        expectation['full'] = true
      } else if (body['full'] !== undefined) {
        fail('expect.full takes true')
      }
      for (const name of fields) {
        const field = body[name]
        if (typeof field === 'string') {
          expectation[name] = field
        } else if (field !== undefined) {
          fail(`expect.${name} takes a string`)
        }
      }
      return Object.keys(expectation).length === 0
        ? fail('expect names nothing to check')
        : { expect: expectation }
    }
  }
}

const parseSteps = (json: string): ReadonlyArray<Step> => {
  const value: unknown = JSON.parse(json)
  if (!Array.isArray(value)) {
    throw new Error('steps must be a JSON array')
  }
  if (value.length === 0) {
    throw new Error('steps is empty: nothing to prove')
  }
  return value.map(parseStep)
}

const statusText = ({ status }: Screen): string =>
  `${status.line}:${status.column} ${status.lineCount}L`

const cursorText = ({ cursor }: Screen): string =>
  cursor === null
    ? 'cursor off screen'
    : `cursor row ${cursor.row} cell ${cursor.cell} on ${JSON.stringify(cursor.char)}`

const picture = (screen: Screen): string => {
  const rows = screen.rows.map((row, index) => {
    const gutter = (row.number ?? '').padStart(5)
    const line = `${String(index).padStart(3)} ${gutter} |${row.text}`
    return screen.cursor?.row === index
      ? `${line}\n${' '.repeat(11)}|${' '.repeat(screen.cursor.cell)}^`
      : line
  })
  return [`status ${statusText(screen)}, ${cursorText(screen)}`, ...rows].join(
    '\n',
  )
}

const describe = (step: Step): string => {
  const json = JSON.stringify(step)
  return json.length <= 100
    ? json
    : `${json.slice(0, 80)}… (${json.length} chars, full step in steps.json)`
}

const check = (screen: Screen, expectation: Expectation): Array<string> => {
  const misses: Array<string> = []
  const text = linesOf(screen).join('\n')
  if (expectation.text !== undefined && text !== expectation.text) {
    misses.push(
      `text is ${JSON.stringify(text)}, expected ${JSON.stringify(expectation.text)}`,
    )
  }
  if (
    expectation.status !== undefined &&
    statusText(screen) !== expectation.status
  ) {
    misses.push(
      `status is "${statusText(screen)}", expected "${expectation.status}"`,
    )
  }
  const under = screen.cursor?.char
  if (expectation.under !== undefined && under !== expectation.under) {
    misses.push(
      `cursor is on ${JSON.stringify(under ?? null)}, expected ${JSON.stringify(expectation.under)}`,
    )
  }
  const top = screen.rows.find(row => row.number !== null)?.number
  if (expectation.top !== undefined && top !== expectation.top) {
    misses.push(
      `the top line on screen is ${top ?? 'none'}, expected ${expectation.top}`,
    )
  }
  const drawnHeight = screen.rows.length * screen.rowHeight
  const areaHeight = screen.area.bottom - screen.area.top
  if (
    expectation.full === true &&
    drawnHeight < areaHeight - screen.rowHeight
  ) {
    misses.push(
      `rows fill ${drawnHeight}px of the ${areaHeight}px text area: blank screen`,
    )
  }
  return misses
}

const clickPoint = (screen: Screen, target: Point | Spot): Point => {
  if ('x' in target) {
    return target
  }
  const row = screen.rows[target.row]
  if (row === undefined) {
    throw new Error(
      `click row ${target.row}: the screen draws rows 0 to ${screen.rows.length - 1}`,
    )
  }
  return {
    x: row.left + (target.cell + 0.25) * screen.cell,
    y: row.top + screen.rowHeight / 2,
  }
}

const play = async (
  nullpad: Nullpad,
  step: Step,
  out: string,
): Promise<ReadonlyArray<string>> => {
  if ('type' in step) {
    await nullpad.type(step.type)
  } else if ('press' in step) {
    await nullpad.press(step.press, step.times)
  } else if ('paste' in step) {
    await nullpad.paste(step.paste)
  } else if ('compose' in step) {
    await nullpad.compose(step.compose, step.replacing)
  } else if ('commit' in step) {
    await nullpad.commit(step.commit)
  } else if ('click' in step) {
    const point = clickPoint(await nullpad.screen(), step.click)
    await nullpad.click(point.x, point.y)
  } else if ('wheel' in step) {
    await nullpad.wheel(step.wheel)
  } else if ('resize' in step) {
    await nullpad.resize(step.resize.width, step.resize.height)
  } else if ('shot' in step) {
    await nullpad.page.screenshot({
      path: join(out, `${step.shot}.png`),
      animations: 'disabled',
    })
  } else {
    return check(await nullpad.screen(), step.expect)
  }
  return []
}

const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address !== null
          ? done(address.port)
          : fail(new Error('no port')),
      )
    })
  })

const waitForServer = async (
  url: string,
  server: ChildProcess,
): Promise<void> => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`vite preview exited with ${server.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      await new Promise(done => setTimeout(done, 100))
    }
  }
  throw new Error(`${url} did not answer within 30 s`)
}

const repo = resolve(import.meta.dirname, '..')

const newestSource = (): number =>
  execFileSync('git', ['ls-files', 'src', 'index.html', 'vite.config.ts'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(path => path !== '' && existsSync(join(repo, path)))
    .reduce(
      (newest, path) => Math.max(newest, statSync(join(repo, path)).mtimeMs),
      0,
    )

const doctor = async (): Promise<number> => {
  const problems: Array<string> = []
  const say = (line: string) => console.log(line)
  say(`node ${process.version}`)
  const browser = await chromium.launch().catch((error: unknown) => {
    problems.push(`chromium does not launch: ${String(error)}`)
    return null
  })
  if (browser !== null) {
    const page = await browser.newPage()
    const editContext = await page.evaluate(() => 'EditContext' in window)
    say(
      `chromium ${browser.version()}, EditContext ${editContext ? 'yes' : 'no'}`,
    )
    if (!editContext) {
      problems.push(
        'this chromium has no EditContext; nullpad shows a notice instead of an editor',
      )
    }
    await browser.close()
  }
  const dist = join(repo, 'dist', 'index.html')
  if (existsSync(dist)) {
    const stale = statSync(dist).mtimeMs < newestSource()
    say(
      `dist/ ${stale ? 'is older than src/; runs build fresh anyway' : 'is current'}`,
    )
  } else {
    say('dist/ absent; runs build fresh anyway')
  }
  for (const problem of problems) {
    say(`problem: ${problem}`)
  }
  say(problems.length === 0 ? 'ok' : 'not ok')
  return problems.length === 0 ? 0 : 1
}

const run = async (
  steps: ReadonlyArray<Step>,
  options: Readonly<{
    out: string
    dist: string | undefined
    width: number
    height: number
    video: boolean
  }>,
): Promise<number> => {
  const { out } = options
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'steps.json'), `${JSON.stringify(steps, null, 2)}\n`)
  const log = (line: string) => {
    console.log(line)
    appendFileSync(join(out, 'log.txt'), `${line}\n`)
  }
  const scratch = join(
    tmpdir(),
    `nullpad-verify-${randomBytes(4).toString('hex')}`,
  )
  const dist = options.dist ?? join(scratch, 'dist')
  const owned: { server: ChildProcess | null; browser: Browser | null } = {
    server: null,
    browser: null,
  }
  const pageErrors: Array<string> = []
  let failed = false
  const stopServer = () => {
    if (owned.server?.pid !== undefined && owned.server.exitCode === null) {
      process.kill(-owned.server.pid, 'SIGTERM')
    }
  }
  const interrupted = (signal: NodeJS.Signals) => {
    stopServer()
    rmSync(scratch, { recursive: true, force: true })
    console.log(`${signal}: stopped the server, kept the evidence in ${out}`)
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  process.once('SIGHUP', interrupted)
  try {
    if (options.dist === undefined) {
      execFileSync(
        'pnpm',
        [
          'exec',
          'vite',
          'build',
          '--outDir',
          dist,
          '--emptyOutDir',
          '--logLevel',
          'error',
        ],
        {
          cwd: repo,
          stdio: ['ignore', 'ignore', 'inherit'],
        },
      )
      log(`built ${dist}`)
    }
    const port = await freePort()
    const url = `http://127.0.0.1:${port}/`
    owned.server = spawn(
      'pnpm',
      [
        'exec',
        'vite',
        'preview',
        '--outDir',
        dist,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { cwd: repo, stdio: 'ignore', detached: true },
    )
    await waitForServer(url, owned.server)
    owned.browser = await chromium.launch()
    const context = await owned.browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
      ...(options.video
        ? {
            recordVideo: {
              dir: scratch,
              size: { width: options.width, height: options.height },
            },
          }
        : {}),
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') {
        pageErrors.push(message.text())
      }
    })
    await page.goto(url)
    await page.locator('#caret').waitFor({ timeout: 10_000 })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const nullpad = driver(page, await context.newCDPSession(page))
    log(`nullpad at ${url}, viewport ${options.width}x${options.height}`)
    for (const [index, step] of steps.entries()) {
      const misses = await play(nullpad, step, out)
      const screen = await nullpad.screen()
      const preedit = await nullpad.preedit()
      log(
        `${index + 1}. ${describe(step)} | ${statusText(screen)} | ${cursorText(screen)}${preedit === '' ? '' : ` | composing ${JSON.stringify(preedit)}`}`,
      )
      for (const miss of misses) {
        log(`   FAIL ${miss}`)
      }
      if (misses.length > 0) {
        failed = true
        break
      }
    }
    const screen = await nullpad.screen()
    writeFileSync(
      join(out, 'screen.json'),
      `${JSON.stringify(screen, null, 2)}\n`,
    )
    await page.screenshot({
      path: join(out, 'final.png'),
      animations: 'disabled',
    })
    log(picture(screen))
    const video = page.video()
    await context.close()
    if (video !== null) {
      await video.saveAs(join(out, 'video.webm'))
      await video.delete()
    }
  } catch (error) {
    failed = true
    log(`ERROR ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await owned.browser?.close()
    stopServer()
    rmSync(scratch, { recursive: true, force: true })
  }
  for (const error of pageErrors) {
    log(`PAGE ERROR ${error}`)
  }
  const ok = !failed && pageErrors.length === 0
  log(`${ok ? 'PASS' : 'FAIL'} evidence in ${out}`)
  return ok ? 0 : 1
}

const main = async (): Promise<number> => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      doctor: { type: 'boolean', default: false },
      out: { type: 'string' },
      dist: { type: 'string' },
      width: { type: 'string', default: '1000' },
      height: { type: 'string', default: '600' },
      video: { type: 'boolean', default: false },
    },
  })
  if (values.doctor) {
    return doctor()
  }
  const [source] = positionals
  if (source === undefined) {
    console.error(
      'usage: node e2e/drive.ts <steps.json | -> [--out dir] [--dist dir] [--width 1000] [--height 600] [--video]\n       node e2e/drive.ts --doctor',
    )
    return 2
  }
  const size = (name: string, raw: string): number => {
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed < 200 || parsed > 4000) {
      throw new Error(`--${name} takes a whole number of pixels, 200 to 4000`)
    }
    return parsed
  }
  const width = size('width', values.width)
  const height = size('height', values.height)
  if (
    values.dist !== undefined &&
    !existsSync(join(resolve(values.dist), 'index.html'))
  ) {
    throw new Error(
      `--dist ${values.dist} holds no index.html; build into it with pnpm exec vite build --outDir <folder>`,
    )
  }
  const steps = parseSteps(readFileSync(source === '-' ? 0 : source, 'utf8'))
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
  return run(steps, {
    out: resolve(values.out ?? join(repo, 'verify-out', stamp)),
    dist: values.dist === undefined ? undefined : resolve(values.dist),
    width,
    height,
    video: values.video,
  })
}

process.exitCode = await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  return 2
})
