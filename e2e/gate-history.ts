import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { type GateRun, historyDir } from './reporters/gate-history.ts'

const { values } = parseArgs({
  options: { last: { type: 'string', default: '20' } },
})
const last = Number(values.last)
if (!Number.isInteger(last) || last < 1) {
  console.error('--last takes a whole number of runs, 1 or more')
  process.exit(1)
}

const dir = historyDir(process.cwd())
const names = existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
  : []
const parsed = names.flatMap(name => {
  try {
    return [JSON.parse(readFileSync(join(dir, name), 'utf8')) as GateRun]
  } catch {
    console.log(`skipped ${name}: not JSON`)
    return []
  }
})
const runs = parsed.toSorted((a, b) => a.at.localeCompare(b.at)).slice(-last)
if (runs.length === 0) {
  console.log(`No gate runs in ${dir}`)
  process.exit(0)
}

const median = (xs: ReadonlyArray<number>): number => {
  const sorted = xs.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}
const seconds = (s: number) => `${s.toFixed(1)} s`.padStart(9)

const ran = runs.flatMap((run, index) =>
  run.tests.flatMap(([file, title, time, outcome]) =>
    outcome === 'skipped' ? [] : [{ index, run, file, title, time, outcome }],
  ),
)
const groupBy = <T>(xs: ReadonlyArray<T>, key: (x: T) => string) => {
  const groups = new Map<string, Array<T>>()
  xs.forEach(x => {
    const group = groups.get(key(x))
    if (group === undefined) {
      groups.set(key(x), [x])
    } else {
      group.push(x)
    }
  })
  return groups
}

console.log(`${runs.length} runs from ${dir}`)
console.log(`${runs[0]!.at} to ${runs.at(-1)!.at}`)
console.log(
  `median wall time ${median(runs.map(r => r.wallSeconds)).toFixed(1)} s`,
)

console.log('\nSlowest tests, median over the runs they ran in')
const byTest = groupBy(ran, t => `${t.file}\u0000${t.title}`)
const slowest = [...byTest.values()]
  .map(ts => ({ ...ts[0]!, median: median(ts.map(t => t.time)) }))
  .toSorted((a, b) => b.median - a.median)
  .slice(0, 15)
slowest.forEach(t => console.log(`${seconds(t.median)}  ${t.file}  ${t.title}`))

console.log('\nSeconds per spec file, median of the per-run sums')
const byFile = [...groupBy(ran, t => t.file)]
  .map(([file, ts]) => ({
    file,
    median: median(
      [...groupBy(ts, t => String(t.index)).values()].map(perRun =>
        perRun.reduce((sum, t) => sum + t.time, 0),
      ),
    ),
  }))
  .toSorted((a, b) => b.median - a.median)
byFile.forEach(f => console.log(`${seconds(f.median)}  ${f.file}`))

console.log('\nTests that did not pass in some run')
const isFail = (outcome: string) =>
  outcome === 'failed' || outcome === 'timedOut'
const unpassed = [...byTest.values()].filter(ts =>
  ts.some(t => t.outcome !== 'passed'),
)
if (unpassed.length === 0) {
  console.log('none')
}
unpassed.forEach(ts => {
  const clean = groupBy(
    ts.filter(t => !t.run.dirty),
    t => t.run.commit,
  )
  const flaky =
    ts.some(t => t.outcome === 'flaky') ||
    [...clean.values()].some(
      same =>
        same.some(t => t.outcome === 'passed') &&
        same.some(t => isFail(t.outcome)),
    )
  const failed = ts.filter(t => t.outcome !== 'passed').length
  console.log(
    `${failed} of ${ts.length} runs did not pass${flaky ? ', FLAKY' : ''}  ${ts[0]!.file}  ${ts[0]!.title}`,
  )
})
