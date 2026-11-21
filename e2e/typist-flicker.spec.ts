import {
  type Step,
  flickerAgainstTextarea,
  keyPress,
  thenType,
  wheelTurns,
} from './flicker'
import { expect, test } from './nullpad'

const isLongRun = Number(process.env['TYPIST_SEQUENCES'] ?? 0) >= 3000

const jumps: ReadonlyArray<Step> = [
  ['wheel turns of 100 px at 60 Hz', wheelTurns(100, 30, 16)],
  ['wheel turns of 300 px at 60 Hz', wheelTurns(300, 30, 16)],
  ['wheel turns of 300 px back up at 60 Hz', wheelTurns(-300, 30, 16)],
  ['wheel turns of 900 px at 60 Hz', wheelTurns(900, 30, 16)],
  ['wheel turns of 900 px every 200 ms', wheelTurns(900, 10, 200)],
  ['wheel turns of 2,000 px at 60 Hz', wheelTurns(2000, 30, 16)],
  ['wheel turns of 2,000 px back up at 60 Hz', wheelTurns(-2000, 30, 16)],
  ['Ctrl+End', keyPress('Control+End')],
  ['Ctrl+Home', keyPress('Control+Home')],
  ['PageDown', keyPress('PageDown')],
  ['one wheel turn of 30,000 px', wheelTurns(30_000, 1, 16)],
]

const steps: ReadonlyArray<Step> = jumps.map(
  ([name, act]) => [`${name}, then typing`, thenType(act)] as const,
)

for (const throttle of [1, 4]) {
  test(`typist: wheel turns, jumps and typing through a 20,000-line note never paint the screen blank or partly drawn where a textarea does not, with the CPU ${throttle}x slower`, async ({
    browser,
    nullpad,
  }) => {
    test.skip(!isLongRun, 'runs in the long typist run, pnpm test:typist:long')
    test.setTimeout(240_000)
    const failures = await flickerAgainstTextarea(
      browser,
      nullpad,
      steps,
      throttle,
    )
    expect(failures, failures.join('\n')).toEqual([])
  })
}
