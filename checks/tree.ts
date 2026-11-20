import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onTestFinished } from 'vitest'

export const repo = fileURLToPath(new URL('..', import.meta.url))

const copied = [
  'src',
  'tsconfig.json',
  'package.json',
  '.dependency-cruiser.cjs',
  '.oxlintrc.json',
]

export const plantedTree = (plants: Record<string, string> = {}): string => {
  const dir = mkdtempSync(join(tmpdir(), 'nullpad-fk-tree-'))
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
  copied.forEach(name =>
    cpSync(join(repo, name), join(dir, name), { recursive: true }),
  )
  symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'))
  Object.entries(plants).forEach(([path, source]) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), source)
  })
  return dir
}

type Violation = Readonly<{ rule: string; from: string; to: string }>

type Cruise = Readonly<{
  status: number | null
  violations: ReadonlyArray<Violation>
  modules: ReadonlyArray<string>
}>

export const cruise = (cwd: string): Cruise => {
  const depcruise = join(repo, 'node_modules/.bin/depcruise')
  const gate = spawnSync(
    depcruise,
    ['src', '--config', '.dependency-cruiser.cjs'],
    {
      cwd,
    },
  )
  const details = spawnSync(
    depcruise,
    ['src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'],
    { cwd, encoding: 'utf8' },
  )
  const report = JSON.parse(details.stdout)
  return {
    status: gate.status,
    violations: report.summary.violations.map(
      (violation: { rule: { name: string }; from: string; to: string }) => ({
        rule: violation.rule.name,
        from: violation.from,
        to: violation.to,
      }),
    ),
    modules: report.modules.map((module: { source: string }) => module.source),
  }
}

type Finding = Readonly<{ code: string; filename: string }>

type Lint = Readonly<{
  status: number | null
  findings: ReadonlyArray<Finding>
}>

export const lint = (cwd: string): Lint => {
  const run = spawnSync(
    join(repo, 'node_modules/.bin/oxlint'),
    ['--format', 'json', '--config', '.oxlintrc.json', 'src'],
    { cwd, encoding: 'utf8' },
  )
  const report = JSON.parse(run.stdout)
  return {
    status: run.status,
    findings: report.diagnostics.map(
      (diagnostic: { code: string; filename: string }) => ({
        code: diagnostic.code,
        filename: diagnostic.filename,
      }),
    ),
  }
}
