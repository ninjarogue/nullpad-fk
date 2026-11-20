import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, onTestFinished, test } from 'vitest'

import { repo } from './tree'

const check = (kind: string, report: unknown) => {
  const dir = mkdtempSync(join(tmpdir(), 'nullpad-fk-report-'))
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'report.json')
  writeFileSync(path, JSON.stringify(report))
  return spawnSync('node', [join(repo, 'scripts/ran-tests.mjs'), kind, path], {
    encoding: 'utf8',
  })
}

const vitestReport = (passed: number, pending = 0, todo = 0) => ({
  numPassedTests: passed,
  numPendingTests: pending,
  numTodoTests: todo,
})

const e2eReport = (passed: number, skipped = 0) => ({
  run: { summary: { passed, skipped } },
})

const cases = [
  {
    name: 'vitest passes tests',
    kind: 'vitest',
    report: vitestReport(3),
    ok: true,
  },
  {
    name: 'vitest ran no tests',
    kind: 'vitest',
    report: vitestReport(0),
    ok: false,
  },
  {
    name: 'vitest skipped every test',
    kind: 'vitest',
    report: vitestReport(0, 2),
    ok: false,
  },
  {
    name: 'vitest skipped one test',
    kind: 'vitest',
    report: vitestReport(3, 1),
    ok: false,
  },
  {
    name: 'vitest left a todo',
    kind: 'vitest',
    report: vitestReport(3, 0, 1),
    ok: false,
  },
  { name: 'e2e passes a test', kind: 'e2e', report: e2eReport(1), ok: true },
  { name: 'e2e ran no tests', kind: 'e2e', report: e2eReport(0), ok: false },
  {
    name: 'e2e skipped one test',
    kind: 'e2e',
    report: e2eReport(1, 1),
    ok: false,
  },
  {
    name: 'e2e report has no summary',
    kind: 'e2e',
    report: { run: {} },
    ok: false,
  },
]

describe('scripts/ran-tests.mjs', () => {
  test.each(cases)('$name', ({ kind, report, ok }) => {
    const result = check(kind, report)

    expect(result.status === 0).toBe(ok)
  })

  test('fails on a step kind it does not know', () => {
    expect(check('mocha', vitestReport(3)).status).not.toBe(0)
  })

  test('says how many tests passed', () => {
    expect(check('vitest', vitestReport(3)).stdout).toContain('3 tests passed')
  })
})
