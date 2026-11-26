import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'

export type Outcome =
  | 'passed'
  | 'failed'
  | 'timedOut'
  | 'skipped'
  | 'interrupted'
  | 'flaky'

export type GateRun = {
  at: string
  commit: string
  dirty: boolean
  workers: number
  wallSeconds: number
  status: string
  leftOut: ReadonlyArray<string>
  tests: ReadonlyArray<
    readonly [file: string, title: string, seconds: number, outcome: Outcome]
  >
}

const git = (cwd: string, ...args: ReadonlyArray<string>): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

export const historyDir = (cwd: string): string =>
  resolve(
    cwd,
    process.env['NULLPAD_GATE_HISTORY'] ??
      join(
        git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
        'nullpad-gate-history',
      ),
  )

const outcomeOf = (test: TestCase, result: TestResult): Outcome => {
  switch (test.outcome()) {
    case 'flaky':
      return 'flaky'
    case 'skipped':
      return 'skipped'
    case 'expected':
      return 'passed'
    case 'unexpected':
      return result.status === 'passed' ? 'failed' : result.status
  }
}

const cliGrepInverts = (): ReadonlyArray<string> => {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { 'grep-invert': { type: 'string', short: 'G', multiple: true } },
    strict: false,
    allowPositionals: true,
  })
  return (values['grep-invert'] ?? []).filter(v => typeof v === 'string')
}

const sourcesOf = (grep: RegExp | ReadonlyArray<RegExp> | null) =>
  grep === null ? [] : [grep].flat().map(re => re.source)

export default class GateHistory implements Reporter {
  private config!: FullConfig
  private suite!: Suite

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config
    this.suite = suite
  }

  onEnd(result: FullResult) {
    if (process.env['NULLPAD_GATE_RUN'] !== '1') {
      return
    }
    try {
      const config = this.config
      const root = git(config.rootDir, 'rev-parse', '--show-toplevel')
      const commit = git(root, 'rev-parse', 'HEAD')
      const tests = this.suite.allTests().flatMap(test => {
        const last = test.results.at(-1)
        if (last === undefined) {
          return []
        }
        const seconds = test.results.reduce((sum, r) => sum + r.duration, 0)
        return [
          [
            relative(root, test.location.file),
            test.titlePath().slice(3).join(' › '),
            Math.round(seconds) / 1000,
            outcomeOf(test, last),
          ] as const,
        ]
      })
      const run: GateRun = {
        at: result.startTime.toISOString(),
        commit,
        dirty: git(root, 'status', '--porcelain') !== '',
        workers: config.workers,
        wallSeconds: Math.round(result.duration) / 1000,
        status: result.status,
        leftOut: [
          ...new Set([
            ...config.projects.flatMap(p => sourcesOf(p.grepInvert)),
            ...cliGrepInverts(),
          ]),
        ],
        tests,
      }
      const dir = historyDir(root)
      if (!existsSync(dir)) {
        mkdirSync(dir)
      }
      const file = join(
        dir,
        `${run.at.replaceAll(':', '-')}-${commit.slice(0, 7)}.json`,
      )
      writeFileSync(file, JSON.stringify(run))
      console.log(`gate history: saved ${file}`)
    } catch (error) {
      console.log(`gate history: not saved: ${String(error).split('\n')[0]}`)
    }
  }
}
