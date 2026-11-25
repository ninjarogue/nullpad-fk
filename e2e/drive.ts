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

import { newestSource } from '../scripts/build-stamp.ts'
import {
  type Cue,
  burnCaptions,
  drawCaptions,
  hasFfmpeg,
  keyByKey,
  pace,
  pauseAfter,
  readingTime,
} from './record.ts'
import {
  type Step,
  describe,
  launchOptions,
  openPage,
  parseSteps,
  picture,
  play,
  stateLine,
} from './steps.ts'

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

const doctor = async (): Promise<number> => {
  const problems: Array<string> = []
  const say = (line: string) => console.log(line)
  say(`node ${process.version}`)
  const browser = await chromium
    .launch(launchOptions)
    .catch((error: unknown) => {
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
    const stale = statSync(dist).mtimeMs < newestSource(repo)
    say(
      `dist/ ${stale ? 'is older than src/; runs build fresh anyway' : 'is current'}`,
    )
  } else {
    say('dist/ absent; runs build fresh anyway')
  }
  say(`ffmpeg ${hasFfmpeg() ? 'yes' : 'no; --record needs it'}`)
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
    record: boolean
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
    owned.browser = await chromium.launch(launchOptions)
    const context = await owned.browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
      ...(options.video || options.record
        ? {
            recordVideo: {
              dir: scratch,
              size: { width: options.width, height: options.height },
            },
          }
        : {}),
    })
    const filmingSince = Date.now()
    const cues: Array<Cue> = []
    const { nullpad } = await openPage(context, url, pageErrors)
    const { page } = nullpad
    log(`nullpad at ${url}, viewport ${options.width}x${options.height}`)
    const playSlowly = async (step: Step): Promise<ReadonlyArray<string>> => {
      if ('caption' in step) {
        const cue = {
          at: Date.now() - filmingSince,
          caption: step.caption,
          note: step.note ?? '',
        }
        cues.push(cue)
        await page.waitForTimeout(readingTime(cue))
        return []
      }
      for (const key of keyByKey(step)) {
        const misses = await play(nullpad, key, out)
        if (misses.length > 0) {
          return misses
        }
        await page.waitForTimeout(pace.betweenKeys)
      }
      await page.waitForTimeout(pauseAfter(step))
      return []
    }
    for (const [index, step] of steps.entries()) {
      const misses = options.record
        ? await playSlowly(step)
        : await play(nullpad, step, out)
      const screen = await nullpad.screen()
      const preedit = await nullpad.preedit()
      log(`${index + 1}. ${describe(step)} | ${stateLine(screen, preedit)}`)
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
    if (options.record) {
      await page.waitForTimeout(pace.atEnd)
    }
    const video = page.video()
    await context.close()
    if (video !== null) {
      await video.saveAs(join(out, 'video.webm'))
      await video.delete()
    }
    if (options.record) {
      burnCaptions({
        video: join(out, 'video.webm'),
        videoWidth: options.width,
        cues,
        images: await drawCaptions(
          owned.browser,
          cues,
          options.width,
          join(scratch, 'captions'),
        ),
        out: join(out, 'recording.mp4'),
      })
      log(`recording ${join(out, 'recording.mp4')}, ${cues.length} captions`)
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
      record: { type: 'boolean', default: false },
    },
  })
  if (values.doctor) {
    return doctor()
  }
  const [source] = positionals
  if (source === undefined) {
    console.error(
      'usage: node e2e/drive.ts <steps.json | -> [--out dir] [--dist dir] [--width 1000] [--height 600] [--video | --record]\n       node e2e/drive.ts --doctor',
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
  if (values.record && !steps.some(step => 'caption' in step)) {
    throw new Error(
      '--record needs caption steps: put {"caption": "what is done", "note": "what to look for"} before each action a person should follow',
    )
  }
  if (values.record && steps.some(step => 'resize' in step)) {
    throw new Error(
      '--record takes no resize step, because a video keeps one size: set the window with --width and --height',
    )
  }
  if (values.record && !hasFfmpeg()) {
    throw new Error(
      '--record needs ffmpeg on the path to draw the captions onto the video',
    )
  }
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
  return run(steps, {
    out: resolve(values.out ?? join(repo, 'verify-out', stamp)),
    dist: values.dist === undefined ? undefined : resolve(values.dist),
    width,
    height,
    video: values.video,
    record: values.record,
  })
}

process.exitCode = await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  return 2
})
