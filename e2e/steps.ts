import { join } from 'node:path'

import { type BrowserContext } from '@playwright/test'

import {
  type ClipboardKind,
  type Input,
  type Nullpad,
  type Point,
  type Screen,
  driver,
  linesOf,
  settle,
} from './nullpad.ts'

type Spot = Readonly<{ row: number; cell: number }>
type Expectation = Readonly<{
  text?: string
  status?: string
  under?: string
  top?: string
  full?: boolean
  title?: string
  finder?: string
  mode?: string
  pending?: string
  keydown?: string
  notice?: string
  prompt?: string
  clipboard?: string
  selection?: string
}>

type ClipboardStep =
  | Readonly<{ allow: ReadonlyArray<ClipboardKind> }>
  | Readonly<{ copy: string }>
  | Readonly<{ hold: boolean }>

type InputStep =
  | Exclude<Input, Readonly<{ click: Point }>>
  | Readonly<{ click: Point | Spot }>

export type Step =
  | InputStep
  | Readonly<{
      burst: ReadonlyArray<ReadonlyArray<InputStep>>
      stall?: number
    }>
  | Readonly<{ clipboard: ClipboardStep }>
  | Readonly<{ drag: Readonly<{ from: Point; to: Point }> }>
  | Readonly<{ scheme: 'light' | 'dark' }>
  | Readonly<{ resize: Readonly<{ width: number; height: number }> }>
  | Readonly<{ shot: string }>
  | Readonly<{ reload: true }>
  | Readonly<{ wait: number }>
  | Readonly<{ caption: string; note?: string }>
  | Readonly<{ expect: Expectation }>

const stepKeys = [
  'type',
  'press',
  'paste',
  'clipboard',
  'compose',
  'commit',
  'click',
  'wheel',
  'burst',
  'drag',
  'scheme',
  'resize',
  'shot',
  'reload',
  'wait',
  'caption',
  'expect',
] as const

const inputKinds = [
  'type',
  'press',
  'paste',
  'compose',
  'commit',
  'click',
  'wheel',
] as const

const captionLimit = 60
const noteLimit = 90

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseStep = (
  value: unknown,
  index: number,
  accepted: ReadonlyArray<(typeof stepKeys)[number]> = stepKeys,
): Step => {
  const fail = (why: string): never => {
    throw new Error(`step ${index + 1} ${JSON.stringify(value)}: ${why}`)
  }
  if (!isRecord(value)) {
    return fail('is not an object')
  }
  const kinds = accepted.filter(key => key in value)
  const [kind] = kinds
  if (kinds.length !== 1 || kind === undefined) {
    return fail(`needs exactly one of ${accepted.join(', ')}`)
  }
  const allowed: ReadonlyArray<string> = [
    kind,
    ...(kind === 'press' ? ['times'] : []),
    ...(kind === 'compose' ? ['replacing'] : []),
    ...(kind === 'caption' ? ['note'] : []),
    ...(kind === 'burst' ? ['stall'] : []),
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
    case 'clipboard': {
      const shape =
        'clipboard takes { allow: ["read", "write"] }, { copy: "text" } or { hold: true }'
      if (!isRecord(body) || Object.keys(body).length !== 1) {
        return fail(shape)
      }
      const { allow, copy, hold } = body
      if (
        Array.isArray(allow) &&
        allow.every(kind => kind === 'read' || kind === 'write')
      ) {
        return { clipboard: { allow } }
      }
      if (typeof copy === 'string') {
        return { clipboard: { copy } }
      }
      return typeof hold === 'boolean' ? { clipboard: { hold } } : fail(shape)
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
    case 'burst': {
      const shape =
        'burst takes a list of frames, each a list of input steps, such as [[{"press":"End"},{"type":"x"}]]'
      const frames = Array.isArray(body)
        ? body.map((frame: unknown) =>
            Array.isArray(frame) && frame.length > 0
              ? frame.map((each: unknown) => parseInputStep(each, index))
              : fail(shape),
          )
        : []
      if (frames.length === 0) {
        return fail(shape)
      }
      const stall = value['stall']
      if (stall === undefined) {
        return { burst: frames }
      }
      const milliseconds = number(stall, 'stall')
      return milliseconds > 0 && milliseconds <= 10_000
        ? { burst: frames, stall: milliseconds }
        : fail('stall takes milliseconds from 1 to 10000')
    }
    case 'drag': {
      const shape = 'drag takes { from: { x, y }, to: { x, y } }'
      if (!isRecord(body)) {
        return fail(shape)
      }
      only(body, ['from', 'to'])
      const { from, to } = body
      if (!isRecord(from) || !isRecord(to)) {
        return fail(shape)
      }
      only(from, ['x', 'y'])
      only(to, ['x', 'y'])
      return {
        drag: {
          from: {
            x: number(from['x'], 'drag.from.x'),
            y: number(from['y'], 'drag.from.y'),
          },
          to: {
            x: number(to['x'], 'drag.to.x'),
            y: number(to['y'], 'drag.to.y'),
          },
        },
      }
    }
    case 'scheme':
      return body === 'light' || body === 'dark'
        ? { scheme: body }
        : fail('scheme takes "light" or "dark"')
    case 'reload':
      return body === true ? { reload: true } : fail('reload takes true')
    case 'wait':
      return number(body, 'wait') > 0 && number(body, 'wait') <= 10_000
        ? { wait: number(body, 'wait') }
        : fail('wait takes milliseconds from 1 to 10000')
    case 'caption': {
      const line = (field: unknown, name: string, limit: number): string =>
        typeof field === 'string' &&
        field.length > 0 &&
        field.length <= limit &&
        !/[\n\r]/u.test(field)
          ? field
          : fail(`${name} takes one line of 1 to ${limit} characters`)
      const caption = line(body, 'caption', captionLimit)
      const note = value['note']
      return note === undefined
        ? { caption }
        : { caption, note: line(note, 'note', noteLimit) }
    }
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
        return fail(
          'expect takes { text?, status?, under?, top?, full?, title?, finder?, mode?, pending?, keydown?, notice?, prompt?, clipboard?, selection? }',
        )
      }
      const fields = [
        'text',
        'status',
        'under',
        'top',
        'title',
        'finder',
        'mode',
        'pending',
        'keydown',
        'notice',
        'prompt',
        'clipboard',
        'selection',
      ] as const
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

const parseInputStep = (value: unknown, index: number) =>
  parseStep(value, index, inputKinds) as InputStep

export const parseSteps = (json: string): ReadonlyArray<Step> => {
  const value: unknown = JSON.parse(json)
  if (!Array.isArray(value)) {
    throw new Error('steps must be a JSON array')
  }
  if (value.length === 0) {
    throw new Error('steps is empty: nothing to prove')
  }
  return value.map((step: unknown, index) => parseStep(step, index))
}

export const statusText = ({ status }: Screen): string =>
  `${status.line}:${status.column} ${status.lineCount}L`

const cursorText = ({ cursor }: Screen): string =>
  cursor === null
    ? 'cursor off screen'
    : `cursor row ${cursor.row} cell ${cursor.cell} on ${JSON.stringify(cursor.char)}`

export const picture = (screen: Screen): string => {
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

export const describe = (step: Step): string => {
  const json = JSON.stringify(step)
  return json.length <= 100
    ? json
    : `${json.slice(0, 80)}… (${json.length} chars, full step in steps.json)`
}

type Page = Nullpad['page']

const finderText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const finder = document.querySelector('.finder')
    if (finder === null) {
      return 'closed'
    }
    const prompt = finder.querySelector('.pl')?.textContent ?? ''
    const rows = Array.from(
      finder.querySelectorAll('.row'),
      row =>
        `${row.classList.contains('sel') ? '> ' : '  '}${Array.from(
          row.children,
          cell => cell.textContent ?? '',
        ).join(' | ')}`,
    )
    return [`prompt ${prompt}`, ...rows].join('\n')
  })

const promptText = (page: Page): Promise<string> =>
  page.evaluate(
    () => document.querySelector('.status .prompt')?.textContent ?? 'closed',
  )

const lastKeydowns = new WeakMap<Page, string>()

type AnotherApp = Awaited<ReturnType<Nullpad['outside']>>

const otherApps = new WeakMap<Page, Promise<AnotherApp>>()

const otherApp = (nullpad: Nullpad): Promise<AnotherApp> => {
  const open = otherApps.get(nullpad.page) ?? nullpad.outside()
  otherApps.set(nullpad.page, open)
  return open
}

const playClipboard = async (
  nullpad: Nullpad,
  step: ClipboardStep,
): Promise<void> => {
  if ('allow' in step) {
    await nullpad.allowClipboard(step.allow)
  } else if ('copy' in step) {
    await (await otherApp(nullpad)).copy(step.copy)
  } else if (step.hold) {
    await nullpad.holdClipboardReads()
  } else {
    await nullpad.releaseClipboardReads()
  }
}

const checkThroughDriver = async (
  nullpad: Nullpad,
  expectation: Expectation,
): Promise<Array<string>> => {
  const misses: Array<string> = []
  if (expectation.notice !== undefined) {
    const notice = await nullpad.notice()
    if (notice !== expectation.notice) {
      misses.push(
        `notice shows ${JSON.stringify(notice)}, expected ${JSON.stringify(expectation.notice)}`,
      )
    }
  }
  if (expectation.prompt !== undefined) {
    const prompt = await promptText(nullpad.page)
    if (prompt !== expectation.prompt) {
      misses.push(
        `prompt shows ${JSON.stringify(prompt)}, expected ${JSON.stringify(expectation.prompt)}`,
      )
    }
  }
  if (expectation.selection !== undefined) {
    const selection = await nullpad.selection()
    if (selection !== expectation.selection) {
      misses.push(
        `the selection is ${JSON.stringify(selection)}, expected ${JSON.stringify(expectation.selection)}`,
      )
    }
  }
  if (expectation.clipboard !== undefined) {
    const copied = await (await otherApp(nullpad)).copied()
    if (copied !== expectation.clipboard) {
      misses.push(
        `another app would paste ${JSON.stringify(copied)}, expected ${JSON.stringify(expectation.clipboard)}`,
      )
    }
  }
  return misses
}

const checkPage = async (
  page: Page,
  expectation: Expectation,
): Promise<Array<string>> => {
  const misses: Array<string> = []
  const keydown = lastKeydowns.get(page) ?? 'none'
  if (expectation.keydown !== undefined && keydown !== expectation.keydown) {
    misses.push(
      `the last keydown was ${JSON.stringify(keydown)}, expected ${JSON.stringify(expectation.keydown)}`,
    )
  }
  const title = await page.title()
  if (expectation.title !== undefined && title !== expectation.title) {
    misses.push(`title is "${title}", expected "${expectation.title}"`)
  }
  if (expectation.finder !== undefined) {
    const finder = await finderText(page)
    if (finder !== expectation.finder) {
      misses.push(
        `finder shows ${JSON.stringify(finder)}, expected ${JSON.stringify(expectation.finder)}`,
      )
    }
  }
  for (const name of ['mode', 'pending'] as const) {
    const wanted = expectation[name]
    if (wanted !== undefined) {
      const shown = await page
        .locator(`.status .${name}`)
        .evaluateAll(found =>
          found.map(element => element.textContent).join(''),
        )
      if (shown !== wanted) {
        misses.push(
          `${name} shows ${JSON.stringify(shown)}, expected ${JSON.stringify(wanted)}`,
        )
      }
    }
  }
  return misses
}

export const seen = (screen: Screen) => ({
  text: linesOf(screen).join('\n'),
  status: statusText(screen),
  under: screen.cursor?.char,
  top: screen.rows.find(row => row.number !== null)?.number,
})

const check = (screen: Screen, expectation: Expectation): Array<string> => {
  const misses: Array<string> = []
  const { text, status, under, top } = seen(screen)
  if (expectation.text !== undefined && text !== expectation.text) {
    misses.push(
      `text is ${JSON.stringify(text)}, expected ${JSON.stringify(expectation.text)}`,
    )
  }
  if (expectation.status !== undefined && status !== expectation.status) {
    misses.push(`status is "${status}", expected "${expectation.status}"`)
  }
  if (expectation.under !== undefined && under !== expectation.under) {
    misses.push(
      `cursor is on ${JSON.stringify(under ?? null)}, expected ${JSON.stringify(expectation.under)}`,
    )
  }
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

const dragMoves = 30

const drag = async (nullpad: Nullpad, from: Point, to: Point) => {
  const { page } = nullpad
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await Array.from({ length: dragMoves }, (_, index) => index + 1).reduce(
    (moved, index) =>
      moved.then(async () => {
        await page.mouse.move(
          from.x + ((to.x - from.x) * index) / dragMoves,
          from.y + ((to.y - from.y) * index) / dragMoves,
        )
        await page.waitForTimeout(30)
      }),
    Promise.resolve(),
  )
  await page.waitForTimeout(500)
  await page.mouse.up()
  await settle(page)
  await settle(page)
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

export const play = async (
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
  } else if ('clipboard' in step) {
    await playClipboard(nullpad, step.clipboard)
  } else if ('compose' in step) {
    await nullpad.compose(step.compose, step.replacing)
  } else if ('commit' in step) {
    await nullpad.commit(step.commit)
  } else if ('click' in step) {
    const point = clickPoint(await nullpad.screen(), step.click)
    await nullpad.click(point.x, point.y)
  } else if ('wheel' in step) {
    await nullpad.wheel(step.wheel)
  } else if ('burst' in step) {
    const screen = await nullpad.screen()
    await nullpad.burst(
      step.burst.map(frame =>
        frame.map(input =>
          'click' in input ? { click: clickPoint(screen, input.click) } : input,
        ),
      ),
      step.stall === undefined ? {} : { stall: step.stall },
    )
  } else if ('drag' in step) {
    await drag(nullpad, step.drag.from, step.drag.to)
  } else if ('scheme' in step) {
    await nullpad.page.emulateMedia({ colorScheme: step.scheme })
  } else if ('resize' in step) {
    await nullpad.resize(step.resize.width, step.resize.height)
  } else if ('shot' in step) {
    await nullpad.page.screenshot({
      path: join(out, `${step.shot}.png`),
      animations: 'disabled',
    })
  } else if ('reload' in step) {
    await nullpad.page.reload()
    await nullpad.page.locator('#caret').waitFor({ timeout: 10_000 })
    await nullpad.page.evaluate(() =>
      document.fonts.ready.then(() => undefined),
    )
  } else if ('wait' in step) {
    await nullpad.page.waitForTimeout(step.wait)
  } else if ('caption' in step) {
    return []
  } else {
    return [
      ...check(await nullpad.screen(), step.expect),
      ...(await checkPage(nullpad.page, step.expect)),
      ...(await checkThroughDriver(nullpad, step.expect)),
    ]
  }
  return []
}

export const stateLine = (screen: Screen, preedit: string): string =>
  `${statusText(screen)} | ${cursorText(screen)}${preedit === '' ? '' : ` | composing ${JSON.stringify(preedit)}`}`

export const launchOptions = { ignoreDefaultArgs: ['--hide-scrollbars'] }

export const openPage = async (
  context: BrowserContext,
  url: string,
  pageErrors: Array<string>,
) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await page.exposeFunction(
    'nullpadDriveKeydown',
    (key: string, cancelled: boolean) => {
      lastKeydowns.set(page, `${key} ${cancelled ? 'cancelled' : 'passed'}`)
    },
  )
  await page.addInitScript(() => {
    addEventListener('keydown', event => {
      const report: unknown = Reflect.get(globalThis, 'nullpadDriveKeydown')
      if (typeof report === 'function') {
        report(event.key, event.defaultPrevented)
      }
    })
  })
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') {
      pageErrors.push(message.text())
    }
  })
  const response = await page.goto(url)
  if (response === null) {
    throw new Error(`${url} gave no response`)
  }
  await page.locator('#caret').waitFor({ timeout: 10_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  return {
    nullpad: driver(page, await context.newCDPSession(page)),
    indexHtml: await response.body(),
  }
}
