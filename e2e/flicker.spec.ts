import { flickerAgainstTextarea, wheelTurns } from './flicker'
import { expect, test } from './nullpad'

test('fast wheel turns through a 20,000-line note never paint the screen blank or partly drawn where a textarea does not', async ({
  browser,
  nullpad,
}) => {
  const failures = await flickerAgainstTextarea(
    browser,
    nullpad,
    [
      ['wheel turns of 1,000 px at 60 Hz', wheelTurns(1000, 60, 16)],
      ['wheel turns of 900 px every 200 ms', wheelTurns(900, 10, 200)],
    ],
    1,
  )
  expect(failures, failures.join('\n')).toEqual([])
})
