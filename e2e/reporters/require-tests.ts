import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'

/** Fails a run in which no test ran as expected, so a filter or a skip cannot turn the gate green. */
export default class RequireTests implements Reporter {
  private passed = 0

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'skipped' && test.outcome() === 'expected') {
      this.passed++
    }
  }

  async onEnd(result: FullResult) {
    if (this.passed === 0) {
      console.error('No test ran. The e2e gate needs at least one.')
      return { status: 'failed' as const }
    }
    console.log(`${this.passed} tests ran as expected`)
    return { status: result.status }
  }

  printsToStdio() {
    return false
  }
}
