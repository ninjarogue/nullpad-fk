import {
  type Example,
  exampleCount,
  examples,
  specVersion,
} from './markdown/examples'
import { comment, isolated } from './markdown/grids'
import { referenceHtml } from './markdown/reference'
import { expect, test } from './pane'

const all = examples()

const sections = [...new Set(all.map(example => example.section))]

const examplesPerNote = 40

const noteOf = (batch: ReadonlyArray<Example>): string =>
  batch.map(example => `${example.markdown}\n${comment.markdown}`).join('\n\n')

const keepsApart = (batch: ReadonlyArray<Example>): boolean =>
  referenceHtml(noteOf(batch)) ===
  batch.map(example => referenceHtml(example.markdown) + comment.html).join('')

const batchesOf = (
  mine: ReadonlyArray<Example>,
): ReadonlyArray<ReadonlyArray<Example>> =>
  mine
    .reduce<Array<Array<Example>>>((batches, example) => {
      const last = batches.at(-1)
      if (!isolated(comment)(example.markdown)) {
        batches.push([example], [])
      } else if (
        last !== undefined &&
        last.length < examplesPerNote &&
        keepsApart([...last, example])
      ) {
        last.push(example)
      } else {
        batches.push([example])
      }
      return batches
    }, [])
    .filter(batch => batch.length > 0)

const report = (example: Example, shown: string): string =>
  [
    `example ${example.number} | ${example.section}`,
    `  markdown ${JSON.stringify(example.markdown)}`,
    `  expected ${JSON.stringify(example.html)}`,
    `  shown    ${JSON.stringify(shown)}`,
  ].join('\n')

test(`the spec of CommonMark ${specVersion} holds ${exampleCount} examples`, () => {
  expect(all.length, 'examples found in spec.txt').toBe(exampleCount)
  expect(
    all.map(example => example.number),
    'examples are numbered from 1 in order',
  ).toEqual(Array.from({ length: exampleCount }, (_, index) => index + 1))
})

for (const section of sections) {
  const mine = all.filter(example => example.section === section)
  test(`${section}: the pane shows the HTML of each of its ${mine.length} examples`, async ({
    pane,
  }) => {
    test.setTimeout(60_000 + mine.length * 2_000)
    const failures: Array<string> = []
    for (const batch of batchesOf(mine)) {
      const [alone] = batch
      const pieces =
        batch.length === 1 && alone !== undefined
          ? [await pane.paste(alone.markdown)]
          : (await pane.paste(noteOf(batch))).split(comment.html)
      batch.forEach((example, index) => {
        const shown = pieces[index] ?? ''
        if (shown !== example.html) {
          failures.push(report(example, shown))
        }
      })
    }
    expect(
      failures.length,
      `examples of ${section} that differ, of ${mine.length}:\n${failures.join('\n')}\n`,
    ).toBe(0)
  })
}
