import { referenceHtml } from './markdown/reference'
import { slowInputs } from './markdown/slow'
import { expect, test } from './pane'

const runs = 3
const growth = 4
const slowestGrowth = 8
const floorMilliseconds = 200

test.describe.configure({ mode: 'parallel' })

for (const input of slowInputs) {
  test(`slow input: ${input.name}, grows in line with its size, from n=${input.n} to n=${growth * input.n}`, async ({
    pane,
  }) => {
    test.setTimeout(240_000)
    const shares: Array<number> = []
    for (const n of [input.n, growth * input.n]) {
      const note = input.make(n)
      const withPane: Array<number> = []
      const without: Array<number> = []
      let shown = ''
      for (let run = 0; run < runs; run++) {
        const timed = await pane.timedPaste(note)
        withPane.push(timed.milliseconds)
        shown = timed.shown
        without.push((await pane.timedPaste(note, 'none')).milliseconds)
      }
      shares.push(Math.max(0, Math.min(...withPane) - Math.min(...without)))
      if (!input.nested && (input.referenceAtLargest || n === input.n)) {
        expect(shown, `the pane at n=${n} shows the reference's HTML`).toBe(
          referenceHtml(note),
        )
      } else {
        expect(shown.length, `the pane at n=${n} shows HTML`).toBeGreaterThan(0)
      }
    }
    const [small = 0, large = 0] = shares
    const allowed = slowestGrowth * Math.max(small, floorMilliseconds)
    console.log(
      `slow input "${input.name}": the parser's share is ${Math.round(small)} ms at n=${input.n} and ${Math.round(large)} ms at n=${growth * input.n}, allowed ${allowed} ms`,
    )
    expect(
      large,
      `the share of the time that the pane adds (pane page less the same paste on a page with no pane) at n=${growth * input.n} is under ${slowestGrowth} times its share at n=${input.n}, or ${slowestGrowth} times ${floorMilliseconds} ms`,
    ).toBeLessThan(allowed)
  })
}
