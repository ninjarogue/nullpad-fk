import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { availableParallelism, tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parseArgs, stripVTControlCharacters } from 'node:util'

import { type Browser, chromium } from '@playwright/test'

import { type Bug, parseBugs } from './bugs.ts'
import {
  type Catch,
  type Planted,
  type Ran,
  type Verdict,
  leavesAHole,
  table,
} from './catch.ts'
import { type Unit, nameOf, unitsOf } from './unit.ts'

const repo = resolve(import.meta.dirname, '../..')
const bin = (path: string): string => join(repo, 'node_modules', path)

type Options = Readonly<{
  mode: Catch['mode']
  bugs: ReadonlyArray<Bug>
  jobs: number
  ready: boolean
  playwright: ReadonlyArray<string>
  out: string
}>

type Suite = Readonly<{
  title: string
  suites?: ReadonlyArray<Suite>
  specs?: ReadonlyArray<
    Readonly<{
      title: string
      tests: ReadonlyArray<
        Readonly<{
          status: 'expected' | 'unexpected' | 'flaky' | 'skipped'
          annotations: ReadonlyArray<
            Readonly<{ type: string; description?: string }>
          >
          results: ReadonlyArray<Readonly<{ duration: number }>>
        }>
      >
    }>
  >
}>

type Report = Readonly<{
  suites: ReadonlyArray<Suite>
  errors: ReadonlyArray<Readonly<{ message?: string }>>
}>

type Run = Readonly<{ ms: number; units: ReadonlyArray<Unit> }>

const unitsIn = (suite: Suite, above: ReadonlyArray<string>): Array<Unit> => {
  const path = [...above, suite.title]
  return [
    ...(suite.specs ?? []).flatMap(spec =>
      spec.tests
        .filter(test => test.status !== 'skipped')
        .flatMap(test => {
          const parts = unitsOf(test.annotations)
          const whole: Unit = {
            kind: 'scenario',
            path: [...path, spec.title],
            ms: test.results.at(-1)?.duration ?? 0,
            failed: test.status === 'unexpected',
          }
          const passed = parts.map(part => ({ ...part, failed: false }))
          if (parts.length === 0) {
            return [whole]
          }
          if (!whole.failed) {
            return passed
          }
          return parts.some(part => part.failed) ? parts : [...passed, whole]
        }),
    ),
    ...(suite.suites ?? []).flatMap(inner => unitsIn(inner, path)),
  ]
}

const children = new Set<ChildProcess>()

const stopChildren = () => {
  for (const child of children) {
    if (child.pid !== undefined && child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    }
  }
}

const exec = (
  args: ReadonlyArray<string>,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Readonly<{ code: number | null; ms: number; stderr: string }>> =>
  new Promise((done, fail) => {
    const began = Date.now()
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
    })
    children.add(child)
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000)
    })
    child.once('error', fail)
    child.once('close', code => {
      children.delete(child)
      done({
        code,
        ms: Date.now() - began,
        stderr: stripVTControlCharacters(stderr).trim(),
      })
    })
  })

const pool = async <Item, Result>(
  jobs: number,
  items: ReadonlyArray<Item>,
  work: (item: Item) => Promise<Result>,
): Promise<ReadonlyArray<Result>> => {
  const results = new Map<number, Result>()
  const waiting = [...items.entries()]
  const worker = async () => {
    for (let next = waiting.shift(); next; next = waiting.shift()) {
      results.set(next[0], await work(next[1]))
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker))
  return items.flatMap((_, index) => {
    const result = results.get(index)
    return result === undefined ? [] : [result]
  })
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

const sourceFiles = (): ReadonlyArray<string> =>
  execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repo, encoding: 'utf8' },
  )
    .split('\0')
    .filter(file => file !== '' && existsSync(join(repo, file)))

const copyTree = (files: ReadonlyArray<string>, tree: string): void => {
  for (const file of files) {
    mkdirSync(dirname(join(tree, file)), { recursive: true })
    copyFileSync(join(repo, file), join(tree, file))
  }
  symlinkSync(join(repo, 'node_modules'), join(tree, 'node_modules'))
}

const plant = (tree: string, bug: Bug): number => {
  const path = join(tree, bug.file)
  const source = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const occurrences = source.split(bug.find).length - 1
  if (occurrences === 1) {
    writeFileSync(
      path,
      source.replace(bug.find, () => bug.replace),
    )
  }
  return occurrences
}

const filesUnder = (folder: string): ReadonlyArray<string> =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(folder, join(entry.parentPath, entry.name)))
    .sort()

const fingerprint = (dist: string): string =>
  filesUnder(dist)
    .reduce(
      (hash, file) => hash.update(file).update(readFileSync(join(dist, file))),
      createHash('sha256'),
    )
    .digest('hex')

type Build =
  | Readonly<{ built: true; ms: number; fingerprint: string }>
  | Readonly<{ built: false; verdict: Verdict; ms: number | null }>

const build = async (
  files: ReadonlyArray<string>,
  tree: string,
  dist: string,
  bug: Bug | null,
): Promise<Build> => {
  copyTree(files, tree)
  const occurrences = bug === null ? 1 : plant(tree, bug)
  if (occurrences !== 1) {
    return { built: false, verdict: { status: 'stale', occurrences }, ms: null }
  }
  const { code, ms, stderr } = await exec(
    [
      bin('vite/bin/vite.js'),
      'build',
      '--outDir',
      dist,
      '--emptyOutDir',
      '--logLevel',
      'error',
    ],
    tree,
  )
  rmSync(tree, { recursive: true, force: true })
  return code === 0
    ? { built: true, ms, fingerprint: fingerprint(dist) }
    : {
        built: false,
        verdict: { status: 'build-failed', error: stderr },
        ms,
      }
}

const bootFault = async (
  browser: Browser,
  dist: string,
): Promise<string | null> => {
  const origin = 'http://localhost'
  const context = await browser.newContext()
  const errors: Array<string> = []
  try {
    await context.route(`${origin}/**`, route => {
      const { pathname } = new URL(route.request().url())
      const file = join(dist, pathname === '/' ? 'index.html' : pathname)
      return existsSync(file)
        ? route.fulfill({ path: file })
        : route.fulfill({ status: 404 })
    })
    const page = await context.newPage()
    const logged = new Promise<void>(done => {
      page.on('pageerror', error => {
        errors.push(error.message)
        done()
      })
      page.on('console', message => {
        if (message.type() === 'error') {
          errors.push(message.text())
          done()
        }
      })
    })
    await page.goto(`${origin}/`)
    await Promise.race([
      logged,
      page
        .locator('#caret')
        .waitFor({ timeout: 10_000 })
        .then(() =>
          page.evaluate(() => document.fonts.ready.then(() => undefined)),
        ),
    ])
  } catch (error) {
    errors.push(
      `the editor did not come up: ${stripVTControlCharacters(error instanceof Error ? error.message : String(error))}`,
    )
  } finally {
    await context.close()
  }
  return errors.length === 0 ? null : errors.join('\n')
}

const playwright = async (
  options: Options,
  dist: string,
  folder: string,
  scratch: string,
  stopAtFirstFailure: boolean,
): Promise<Run | string> => {
  const reportFile = join(folder, 'report.json')
  const { ms, stderr } = await exec(
    [
      bin('@playwright/test/cli.js'),
      'test',
      '--reporter=json',
      '--output',
      join(scratch, 'test-results'),
      ...(stopAtFirstFailure ? ['--max-failures=1'] : []),
      ...options.playwright,
    ],
    repo,
    {
      ...process.env,
      NULLPAD_DIST: dist,
      NULLPAD_PORT: String(await freePort()),
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
      ...(options.ready ? { NULLPAD_READY: '1' } : {}),
    },
  )
  if (!existsSync(reportFile)) {
    return `Playwright wrote no report: ${stderr}`
  }
  const report: Report = JSON.parse(readFileSync(reportFile, 'utf8'))
  const units = report.suites.flatMap(suite => unitsIn(suite, []))
  if (units.some(unit => unit.failed)) {
    return { ms, units }
  }
  if (report.errors.length > 0) {
    return report.errors.map(error => error.message ?? '').join('\n')
  }
  return units.length === 0 ? 'no test ran' : { ms, units }
}

const ran = ({ kind, path, ms }: Unit): Ran => ({ kind, path, ms })

const run = async (options: Options): Promise<number> => {
  const scratch = join(
    tmpdir(),
    `nullpad-plant-${randomBytes(4).toString('hex')}`,
  )
  const owned: { browser: Browser | null } = { browser: null }
  const interrupted = (signal: NodeJS.Signals) => {
    stopChildren()
    rmSync(scratch, { recursive: true, force: true })
    console.log(
      `${signal}: stopped, and catch.json holds the bugs judged before it`,
    )
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  process.once('SIGHUP', interrupted)
  try {
    for (const stale of ['baseline', 'bugs', 'catch.json']) {
      rmSync(join(options.out, stale), { recursive: true, force: true })
    }
    const folderOf = (bug: Bug | null): string =>
      bug === null
        ? join(options.out, 'baseline')
        : join(options.out, 'bugs', bug.id)
    const files = sourceFiles()
    const [baselineBuild, ...builds] = await pool(
      options.jobs,
      [null, ...options.bugs],
      bug => {
        mkdirSync(folderOf(bug), { recursive: true })
        return build(
          files,
          bug === null
            ? join(scratch, 'baseline')
            : join(scratch, 'bugs', bug.id),
          join(folderOf(bug), 'dist'),
          bug,
        )
      },
    )
    if (baselineBuild === undefined || !baselineBuild.built) {
      console.log(
        `The working tree does not build, so no bug was planted.\n${baselineBuild?.verdict.status === 'build-failed' ? baselineBuild.verdict.error : ''}`,
      )
      return 1
    }
    console.log(
      `built the working tree and ${builds.filter(({ built }) => built).length} of ${options.bugs.length} planted bugs`,
    )
    const browser = await chromium.launch()
    owned.browser = browser
    const baselineDist = join(folderOf(null), 'dist')
    const baselineBootFault = await bootFault(browser, baselineDist)
    if (baselineBootFault !== null) {
      console.log(
        `The working tree does not boot, so the table would mean nothing.\n${baselineBootFault}`,
      )
      return 1
    }
    console.log('running the tests on the working tree')
    const baseline = await playwright(
      options,
      baselineDist,
      folderOf(null),
      scratch,
      true,
    )
    if (typeof baseline === 'string') {
      console.log(`The run on the working tree failed.\n${baseline}`)
      return 1
    }
    const red = baseline.units.filter(unit => unit.failed)
    if (red.length > 0) {
      console.log(
        `The tests fail without any planted bug, so the table would mean nothing. Failing:\n${red.map(unit => `  ${unit.kind}: ${nameOf(unit)}`).join('\n')}`,
      )
      return 1
    }
    const names = baseline.units.map(nameOf)
    const twice = names.filter((name, index) => names.indexOf(name) < index)
    if (twice.length > 0) {
      console.log(
        `Two units share a name, so a catch could not be told apart:\n${[...new Set(twice)].map(name => `  ${name}`).join('\n')}`,
      )
      return 1
    }
    console.log(
      `the working tree passes, ${baseline.units.length} units in ${(baseline.ms / 1000).toFixed(1)} s`,
    )
    const judge = async (bug: Bug, built: Build): Promise<Verdict> => {
      if (!built.built) {
        return built.verdict
      }
      if (built.fingerprint === baselineBuild.fingerprint) {
        return { status: 'inert' }
      }
      const dist = join(folderOf(bug), 'dist')
      const fault = await bootFault(browser, dist)
      if (fault !== null) {
        return { status: 'boots-dead', error: fault }
      }
      const result = await playwright(
        options,
        dist,
        folderOf(bug),
        scratch,
        options.mode === 'quick',
      )
      if (typeof result === 'string') {
        return { status: 'run-failed', error: result }
      }
      const failed = result.units.filter(unit => unit.failed).map(ran)
      return failed.length === 0
        ? { status: 'missed', ms: result.ms }
        : { status: 'caught', ms: result.ms, failed }
    }
    const planted: Array<Planted> = []
    const caughtSoFar = (): Catch => ({
      mode: options.mode,
      ready: options.ready,
      playwright: options.playwright,
      baseline: { ms: baseline.ms, units: baseline.units.map(ran) },
      bugs: planted,
    })
    for (const [index, bug] of options.bugs.entries()) {
      const built = builds[index]
      if (built === undefined) {
        continue
      }
      const verdict = await judge(bug, built)
      planted.push({
        set: bug.set,
        id: bug.id,
        kind: bug.kind,
        heldOut: bug.heldOut,
        buildMs: built.ms,
        ...verdict,
      })
      writeFileSync(
        join(options.out, 'catch.json'),
        `${JSON.stringify(caughtSoFar(), null, 2)}\n`,
      )
      console.log(
        `${index + 1}/${options.bugs.length} ${verdict.status} ${bug.id}${'ms' in verdict ? ` in ${(verdict.ms / 1000).toFixed(1)} s` : ''}`,
      )
    }
    console.log(
      `\n${table(caughtSoFar())}\n\n${join(options.out, 'catch.json')}`,
    )
    return planted.some(leavesAHole) ? 1 : 0
  } finally {
    await owned.browser?.close()
    stopChildren()
    rmSync(scratch, { recursive: true, force: true })
  }
}

const sets = { blind: 'bugs.json', reverts: 'reverts.json' } as const

const usage = `usage: node e2e/plant/run.ts --quick | --matrix [--set ${Object.keys(sets).join(' | ')} | all | file.json] [--only id,...] [--jobs N] [--ready] [--out dir] [-- playwright arguments]`

const bugsOf = (set: string): ReadonlyArray<Bug> => {
  const named = Object.entries(sets).filter(
    ([name]) => set === name || set === 'all',
  )
  if (named.length === 0 && !set.endsWith('.json')) {
    throw new Error(
      `--set takes ${Object.keys(sets).join(', ')}, all or a .json file`,
    )
  }
  const bugs = (
    named.length > 0
      ? named.map(([name, file]) => ({
          name,
          file: join(import.meta.dirname, file),
        }))
      : [{ name: basename(set, '.json'), file: resolve(set) }]
  ).flatMap(({ name, file }) => parseBugs(name, readFileSync(file, 'utf8')))
  const shared = bugs.filter(
    (bug, index) => bugs.findIndex(other => other.id === bug.id) < index,
  )
  if (shared.length > 0) {
    throw new Error(
      `two sets hold a bug named ${shared.map(bug => bug.id).join(', ')}`,
    )
  }
  return bugs
}

const main = async (): Promise<number> => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      quick: { type: 'boolean', default: false },
      matrix: { type: 'boolean', default: false },
      set: { type: 'string', default: 'all' },
      only: { type: 'string' },
      jobs: { type: 'string', default: String(availableParallelism()) },
      ready: { type: 'boolean', default: false },
      out: { type: 'string', default: join(repo, 'plant-out') },
    },
  })
  if (values.quick === values.matrix) {
    console.error(usage)
    return 2
  }
  const jobs = Number(values.jobs)
  if (!Number.isInteger(jobs) || jobs < 1) {
    throw new Error('--jobs takes a whole number above 0')
  }
  const every = bugsOf(values.set)
  const only = values.only?.split(',') ?? every.map(bug => bug.id)
  const unknown = only.filter(id => !every.some(bug => bug.id === id))
  if (unknown.length > 0) {
    throw new Error(`--only names no bug ${unknown.join(', ')}`)
  }
  return run({
    mode: values.quick ? 'quick' : 'matrix',
    bugs: every.filter(bug => only.includes(bug.id)),
    jobs,
    ready: values.ready,
    playwright: positionals,
    out: resolve(values.out),
  })
}

process.exitCode = await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  return 2
})
