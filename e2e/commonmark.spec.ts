import {
  type Example,
  exampleCount,
  examples,
  specVersion,
} from './markdown/examples'
import { expect, test } from './pane'

const all = examples()

const sections = [...new Set(all.map(example => example.section))]

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
    for (const example of mine) {
      const shown = await pane.paste(example.markdown)
      if (shown !== example.html) {
        failures.push(report(example, shown))
      }
    }
    expect(
      failures.length,
      `examples of ${section} that differ, of ${mine.length}:\n${failures.join('\n')}\n`,
    ).toBe(0)
  })
}
