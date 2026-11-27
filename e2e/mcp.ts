import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { preview } from 'vite'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  type Browser,
  type BrowserContext,
  type Page,
  chromium,
} from '@playwright/test'

import {
  modified,
  newestSource,
  readStamp,
  stampOf,
  stampPath,
} from '../scripts/build-stamp.ts'
import { type Nullpad } from './nullpad.ts'
import {
  type Step,
  describe,
  launchOptions,
  openPage,
  parseStep,
  picture,
  play,
  seen,
  stateLine,
} from './steps.ts'

const repo = resolve(import.meta.dirname, '..')
const distElsewhere = process.env['NULLPAD_DIST']
const dist = resolve(distElsewhere ?? join(repo, 'dist'))
const home = join(
  repo,
  'verify-out',
  `mcp-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${process.pid}`,
)
const viewport = { width: 1000, height: 600 }

type Stage = Readonly<{
  browser: Browser
  url: string
  close: () => Promise<void>
}>

type Live = Readonly<{
  context: BrowserContext
  nullpad: Nullpad
  pageErrors: Array<string>
  stamp: string
  file: string
  steps: Array<Step>
}>

const session: {
  stage: Stage | null
  live: Live | null
  loads: number
  shots: number
} = { stage: null, live: null, loads: 0, shots: 0 }

type Say = (line: string) => void
type Args = Readonly<Record<string, unknown>>

const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? ''

const finishedBuild = async (): Promise<string> => {
  if (!existsSync(dist)) {
    throw new Error(`${dist} does not exist: run pnpm build`)
  }
  const deadline = Date.now() + 10_000
  for (;;) {
    const stamp = readStamp(dist)
    if (stamp !== null) {
      return stamp
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${dist} holds no build-stamp, so no finished build: run pnpm build. A build made before the stamp existed has none; replay on it with node e2e/drive.ts <steps.json> --dist ${dist}`,
      )
    }
    await new Promise(done => setTimeout(done, 50))
  }
}

const startStage = async (): Promise<Stage> => {
  const server = await preview({
    configFile: false,
    root: repo,
    logLevel: 'silent',
    build: { outDir: dist },
    preview: { host: '127.0.0.1', port: 0 },
  })
  const url = server.resolvedUrls?.local[0]
  const browser = await chromium.launch(launchOptions).catch(() => null)
  if (url === undefined || browser === null) {
    await browser?.close()
    await server.close()
    throw new Error(
      url === undefined
        ? 'vite preview gave no URL: run node e2e/drive.ts --doctor'
        : 'chromium does not launch: run pnpm exec playwright install chromium, then node e2e/drive.ts --doctor',
    )
  }
  return {
    browser,
    url,
    close: async () => {
      await browser.close()
      await server.close()
    },
  }
}

const forgetNotes = async (page: Page, url: string): Promise<void> => {
  await page.goto('about:blank')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Storage.clearDataForOrigin', {
    origin: new URL(url).origin,
    storageTypes: 'indexeddb,local_storage',
  })
  await cdp.detach()
  await page.close()
}

const load = async (
  options: Readonly<{ wipe: boolean; file?: string }>,
): Promise<Live> => {
  const previous = session.live
  session.live = null
  if (session.stage?.browser.isConnected() === false) {
    await session.stage.close().catch(() => undefined)
    session.stage = null
  }
  session.stage ??= await startStage()
  const { browser, url } = session.stage
  const reusable =
    previous !== null &&
    !options.wipe &&
    previous.context.browser()?.isConnected() === true &&
    !previous.nullpad.page.isClosed()
      ? previous
      : null
  if (reusable === null) {
    await previous?.context.close().catch(() => undefined)
  } else {
    await forgetNotes(reusable.nullpad.page, url)
  }
  const context =
    reusable?.context ??
    (await browser.newContext({ viewport, deviceScaleFactor: 1 }))
  const pageErrors: Array<string> = []
  const opened = await openPage(context, url, pageErrors).catch(
    async (error: unknown) => {
      await context.close().catch(() => undefined)
      throw new Error(
        [
          `nullpad did not come up from ${dist}: ${reasonOf(error)}`,
          ...pageErrors.map(pageError => `PAGE ERROR ${pageError}`),
          'A build may have been running: call again. If it repeats, run node e2e/drive.ts --doctor',
        ].join('\n'),
      )
    },
  )
  session.loads += 1
  session.live = {
    context,
    nullpad: opened.nullpad,
    pageErrors,
    stamp: stampOf(opened.indexHtml),
    file: resolve(
      repo,
      options.file ?? join(home, String(session.loads), 'steps.json'),
    ),
    steps: [],
  }
  return session.live
}

const kept = ({ file, steps }: Live): string =>
  steps.length === 0
    ? ''
    : ` ${file} keeps the ${steps.length === 1 ? 'step' : `${steps.length} steps`} played before it.`

const ready = async (say: Say): Promise<Live> => {
  const newest = await finishedBuild()
  const { live } = session
  if (live === null) {
    const first = await load({ wipe: false })
    say(`opened build ${first.stamp}, recording to ${first.file}`)
    return first
  }
  if (live.nullpad.page.isClosed() || !live.context.browser()?.isConnected()) {
    const next = await load({ wipe: false })
    say(
      `reopened: the page was gone. The editor is empty and the recording starts over in ${next.file}.${kept(live)}`,
    )
    return next
  }
  if (live.stamp !== newest) {
    const next = await load({ wipe: false })
    say(
      `reloaded: build ${live.stamp} became ${next.stamp}. The editor is empty and the recording starts over in ${next.file}.${kept(live)}`,
    )
    return next
  }
  return live
}

const record = (live: Live, step: Step): void => {
  live.steps.push(step)
  mkdirSync(dirname(live.file), { recursive: true })
  writeFileSync(live.file, `${JSON.stringify(live.steps, null, 2)}\n`)
}

const fixFor = (step: Step, reason: string): string =>
  'press' in step && reason.includes('Unknown key')
    ? ' Use a Playwright key name, such as ArrowUp, Enter, Backspace or Control+Home.'
    : 'click' in step && 'row' in step.click
      ? ' Call screen to see the rows.'
      : ''

const show = async (
  { nullpad }: Live,
  detail: boolean,
  say: Say,
): Promise<void> => {
  const screen = await nullpad.screen()
  const preedit = await nullpad.preedit()
  if (detail) {
    say(picture(screen))
    if (preedit !== '') {
      say(`composing ${JSON.stringify(preedit)}`)
    }
  } else {
    say(stateLine(screen, preedit))
  }
}

const playAll = async (
  steps: ReadonlyArray<Step>,
  detail: boolean,
  say: Say,
): Promise<boolean> => {
  const live = await ready(say)
  const out = dirname(live.file)
  for (const [index, step] of steps.entries()) {
    const misses = await play(live.nullpad, step, out).catch(
      (error: unknown) => {
        const reason = reasonOf(error)
        throw new Error(
          `step ${index + 1} ${describe(step)} threw: ${reason}.${fixFor(step, reason)} It is not recorded.${index > 0 ? ` Steps 1 to ${index} played and are recorded.` : ''}`,
        )
      },
    )
    if (misses.length > 0) {
      for (const miss of misses) {
        say(`FAIL step ${index + 1} ${describe(step)}: ${miss}`)
      }
      say(
        'Stopped at the failed expect, which is not recorded. The steps before it are.',
      )
      await show(live, detail, say)
      return false
    }
    record(live, step)
    if ('shot' in step) {
      say(`saved ${join(out, `${step.shot}.png`)}`)
    }
    if (detail && steps.length > 1) {
      const screen = await live.nullpad.screen()
      say(
        `${index + 1}. ${describe(step)} | ${stateLine(screen, await live.nullpad.preedit())}`,
      )
    }
  }
  await show(live, detail, say)
  return true
}

const checkpointFields = ['text', 'status', 'under', 'top'] as const
type CheckpointField = (typeof checkpointFields)[number]

const isCheckpointField = (value: unknown): value is CheckpointField =>
  checkpointFields.some(field => field === value)

const checkpoint = async (args: Args, say: Say): Promise<boolean> => {
  const fields = args['fields'] ?? ['text', 'status']
  if (
    !Array.isArray(fields) ||
    fields.length === 0 ||
    !fields.every(isCheckpointField)
  ) {
    throw new Error(
      `checkpoint fields takes a list of ${checkpointFields.join(', ')}, such as ["text","status","under"]`,
    )
  }
  const live = await ready(say)
  const now = seen(await live.nullpad.screen())
  const blank = fields.filter(field => now[field] === undefined)
  if (blank.length > 0) {
    throw new Error(
      `checkpoint cannot read ${blank.join(', ')}: ${blank.includes('under') ? 'the cursor is off screen' : 'no numbered line is on screen'}. Leave that field out or scroll to the cursor`,
    )
  }
  const step = parseStep(
    { expect: Object.fromEntries(fields.map(field => [field, now[field]])) },
    live.steps.length,
  )
  const misses = await play(live.nullpad, step, dirname(live.file))
  if (misses.length > 0) {
    throw new Error(
      `the screen changed while checkpoint read it (${misses.join('; ')}): call checkpoint again`,
    )
  }
  record(live, step)
  say(
    `step ${live.steps.length} ${args['detail'] === true ? JSON.stringify(step) : describe(step)}`,
  )
  say(`replay: node e2e/drive.ts ${live.file}`)
  return true
}

const reset = async (args: Args, say: Say): Promise<boolean> => {
  const file = args['steps_file']
  if (file !== undefined && (typeof file !== 'string' || file === '')) {
    throw new Error(
      'reset steps_file takes a path, such as "verify-out/caret-fix/steps.json"',
    )
  }
  await finishedBuild()
  const previous = session.live
  const wipe = args['wipe'] === true
  const live = await load({ wipe, ...(file === undefined ? {} : { file }) })
  say(
    `reset: a fresh page of build ${live.stamp}${wipe ? ' in a fresh browser profile' : ''}, with no saved notes, recording to ${live.file}.${previous === null ? '' : kept(previous)}`,
  )
  await show(live, args['detail'] === true, say)
  return true
}

type Tool = Readonly<{
  name: string
  description: string
  properties: Readonly<Record<string, object>>
  required: ReadonlyArray<string>
  run: (args: Args, say: Say) => Promise<boolean>
}>

const detail = {
  type: 'boolean',
  description: 'true also prints the drawn rows',
}
const text = { type: 'string' }
const number = { type: 'number' }

const stepTool = (
  name: string,
  description: string,
  properties: Readonly<Record<string, object>>,
  required: ReadonlyArray<string>,
  example: string,
  toStep: (args: Args) => unknown,
): Tool => ({
  name,
  description,
  properties: { ...properties, detail },
  required,
  run: (args, say) => {
    const step = (() => {
      try {
        const missing = required.filter(field => args[field] === undefined)
        if (missing.length > 0) {
          throw new Error(`${name} needs ${missing.join(' and ')}`)
        }
        const raw: unknown = JSON.parse(JSON.stringify(toStep(args)))
        return parseStep(raw, 0)
      } catch (error) {
        throw new Error(`${reasonOf(error)}. Call ${name} with ${example}`)
      }
    })()
    return playAll([step], args['detail'] === true, say)
  },
})

const tools: ReadonlyArray<Tool> = [
  stepTool(
    'type',
    'Type text into nullpad, one key press for each character.',
    { text },
    ['text'],
    '{"text":"abc"}',
    args => ({ type: args['text'] }),
  ),
  stepTool(
    'press',
    'Press a key or a chord by its Playwright name: ArrowUp, Enter, Backspace, Control+Home.',
    {
      key: text,
      times: {
        type: 'integer',
        minimum: 1,
        description: 'presses, 1 if left out',
      },
    },
    ['key'],
    '{"key":"ArrowUp","times":3}',
    args => ({ press: args['key'], times: args['times'] }),
  ),
  stepTool(
    'paste',
    'Paste text from the clipboard with Ctrl+V.',
    { text },
    ['text'],
    '{"text":"a\\nb"}',
    args => ({ paste: args['text'] }),
  ),
  stepTool(
    'compose',
    'Show IME preedit text, as an IME does while the user picks a word. Follow it with commit.',
    {
      text,
      replacing: {
        type: 'object',
        description:
          'the range of the EditContext text the preedit replaces, in UTF-16 units',
        properties: { start: number, end: number },
        required: ['start', 'end'],
      },
    },
    ['text'],
    '{"text":"に"} or {"text":"に","replacing":{"start":0,"end":1}}',
    args => ({ compose: args['text'], replacing: args['replacing'] }),
  ),
  stepTool(
    'commit',
    'End the IME composition and insert text.',
    { text },
    ['text'],
    '{"text":"日"}',
    args => ({ commit: args['text'] }),
  ),
  stepTool(
    'click',
    'Click a drawn row and cell as screen prints them (row 0 is the top row on screen, a wide character is 2 cells), or a page pixel x, y for a click off the text.',
    { row: number, cell: number, x: number, y: number },
    [],
    '{"row":2,"cell":5} or {"x":120,"y":400}',
    args => ({
      click: {
        row: args['row'],
        cell: args['cell'],
        x: args['x'],
        y: args['y'],
      },
    }),
  ),
  stepTool(
    'wheel',
    'Turn the mouse wheel over the text by pixels, down when positive, and wait for the scroll to end.',
    { pixels: number },
    ['pixels'],
    '{"pixels":300}',
    args => ({ wheel: args['pixels'] }),
  ),
  stepTool(
    'resize',
    'Resize the window. A fresh page is 1000 by 600.',
    { width: number, height: number },
    ['width', 'height'],
    '{"width":600,"height":400}',
    args => ({ resize: { width: args['width'], height: args['height'] } }),
  ),
  stepTool(
    'screenshot',
    'Save a PNG of the window beside the recording and print its path.',
    {
      name: {
        type: 'string',
        description: 'file name without .png: letters, digits, - and _',
      },
    },
    [],
    '{"name":"before-fix"}',
    args => {
      session.shots += 1
      return { shot: args['name'] ?? `shot-${session.shots}` }
    },
  ),
  {
    name: 'batch',
    description:
      'Play a list of drive.ts steps in one call and stop at the first failed expect. A step is one of {"type":"abc"}, {"press":"ArrowUp","times":3}, {"paste":"a\\nb"}, {"compose":"に"}, {"commit":"日"}, {"click":{"row":2,"cell":5}}, {"wheel":300}, {"burst":[[{"press":"End"},{"type":"x"}],[{"type":"y"}]],"stall":300} (each inner list lands in one frame, the next in the frame after; a wheel turn is checked for being held, not for its frame), {"resize":{"width":600,"height":400}}, {"shot":"name"}, {"caption":"what is done","note":"what to look for"}, {"expect":{"text":"…","status":"2:4 3L","under":"o","top":"40","full":true}}.',
    properties: {
      steps: { type: 'array', items: { type: 'object' }, minItems: 1 },
      detail: {
        type: 'boolean',
        description: 'true prints a line for each step, then the drawn rows',
      },
    },
    required: ['steps'],
    run: (args, say) => {
      const steps = args['steps']
      if (!Array.isArray(steps) || steps.length === 0) {
        throw new Error(
          'batch steps takes a list of steps, such as [{"type":"abc"},{"press":"Enter"}]',
        )
      }
      return playAll(
        steps.map((step, index) => parseStep(step, index)),
        args['detail'] === true,
        say,
      )
    },
  },
  {
    name: 'screen',
    description:
      'Print what is on screen: the status line (line:column lineCount L), the cursor, IME preedit, and each drawn row with its row index and line number.',
    properties: {
      detail: {
        type: 'boolean',
        description:
          'true adds the pixel boxes of the rows, the cursor and the text area as JSON',
      },
    },
    required: [],
    run: async (args, say) => {
      const live = await ready(say)
      await show(live, true, say)
      if (args['detail'] === true) {
        say(JSON.stringify(await live.nullpad.screen()))
      }
      return true
    },
  },
  {
    name: 'checkpoint',
    description:
      'Append an expect step of the current screen to the recording, so that a replay checks it. Judge the values it prints: a checkpoint proves only that a replay shows the same screen.',
    properties: {
      fields: {
        type: 'array',
        items: { enum: checkpointFields },
        description:
          'what to pin, ["text","status"] if left out. under is the character under the cursor, top the first line number on screen',
      },
      detail: { type: 'boolean', description: 'true prints the whole step' },
    },
    required: [],
    run: checkpoint,
  },
  {
    name: 'reset',
    description:
      'Open a fresh page with an empty editor at 1000 by 600 and start a new recording.',
    properties: {
      wipe: {
        type: 'boolean',
        description:
          'true also starts a fresh browser profile. Every reset clears saved notes either way.',
      },
      steps_file: {
        type: 'string',
        description:
          'where to write the recording, in place of the path under verify-out/. A path with no leading / starts at the repo root',
      },
      detail,
    },
    required: [],
    run: reset,
  },
]

const builtFromOldSource = (): boolean =>
  distElsewhere === undefined && modified(stampPath(dist)) < newestSource(repo)

const call = async (
  name: string,
  args: Args,
): Promise<Readonly<{ text: string; failed: boolean }>> => {
  const lines: Array<string> = []
  const say: Say = line => lines.push(line)
  const passed = await (async () => {
    const tool = tools.find(candidate => candidate.name === name)
    if (tool === undefined) {
      throw new Error(
        `no tool ${name}: the tools are ${tools.map(each => each.name).join(', ')}`,
      )
    }
    return tool.run(args, say)
  })().catch((error: unknown) => {
    say(`ERROR ${error instanceof Error ? error.message : String(error)}`)
    return false
  })
  const pageErrors = session.live?.pageErrors.splice(0) ?? []
  for (const pageError of pageErrors) {
    say(`PAGE ERROR ${pageError}`)
  }
  if (pageErrors.length > 0) {
    say(
      'The page logged an error, so a drive.ts replay of this recording fails.',
    )
  }
  if (builtFromOldSource()) {
    say(
      'stale: src changed after this build. Run pnpm build to test the change.',
    )
  }
  return { text: lines.join('\n'), failed: !passed || pageErrors.length > 0 }
}

const queue: { last: Promise<unknown> } = { last: Promise.resolve() }
const oneAtATime = <A>(job: () => Promise<A>): Promise<A> => {
  const next = queue.last.then(job)
  queue.last = next.catch(() => undefined)
  return next
}

const server = new Server(
  { name: 'nullpad', version: '0.1.0' },
  {
    capabilities: { tools: {} },
    instructions:
      'Drives the built nullpad in a warm headless Chromium the way a person does. Each input tool prints the status line (line:column lineCount L) and the cursor; pass detail: true or call screen for the drawn rows. Every input, screenshot and checkpoint is appended as a drive.ts step to the recording, and node e2e/drive.ts <recording> replays it on a fresh build as the proof. After pnpm build, the next call reloads the page and says so.',
  },
)

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: tools.map(({ name, description, properties, required }) => ({
    name,
    description,
    inputSchema: {
      type: 'object' as const,
      properties,
      required: [...required],
    },
  })),
}))

server.setRequestHandler(CallToolRequestSchema, request =>
  oneAtATime(async () => {
    const { text, failed } = await call(
      request.params.name,
      request.params.arguments ?? {},
    )
    return { content: [{ type: 'text', text }], isError: failed }
  }),
)

const leaving = { started: false }
const leave = (): void => {
  if (leaving.started) {
    return
  }
  leaving.started = true
  void (session.stage?.close() ?? Promise.resolve())
    .catch(() => undefined)
    .finally(() => process.exit(0))
}
process.stdin.once('close', leave)
process.once('SIGINT', leave)
process.once('SIGTERM', leave)
process.once('SIGHUP', leave)

await server.connect(new StdioServerTransport())
