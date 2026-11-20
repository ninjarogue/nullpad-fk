import { readFileSync } from 'node:fs'

const counts = {
  vitest: report => ({
    passed: report.numPassedTests,
    skipped: report.numPendingTests + report.numTodoTests,
  }),
  e2e: report => ({
    passed: report.run.summary.passed,
    skipped: report.run.summary.skipped,
  }),
}

const [kind, path] = process.argv.slice(2)
const read = counts[kind]
if (read === undefined || path === undefined) {
  console.error(
    `usage: ran-tests.mjs <${Object.keys(counts).join('|')}> <report.json>`,
  )
  process.exit(2)
}

const { passed, skipped } = read(JSON.parse(readFileSync(path, 'utf8')))
if (!(passed > 0) || skipped > 0) {
  console.error(
    `${kind}: ${passed} tests passed and ${skipped} skipped. A step must pass at least one test and skip none.`,
  )
  process.exit(1)
}
console.log(`${kind}: ${passed} tests passed`)
