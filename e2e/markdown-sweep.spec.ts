import { acceptedDifferences } from './markdown/differences'
import { examples } from './markdown/examples'
import {
  type Grid,
  type Unit,
  countRows,
  grids,
  noteOf,
} from './markdown/grids'
import { referenceHtml } from './markdown/reference'
import { expect, test } from './pane'

const shards = Number(process.env['MARKDOWN_SHARDS'] ?? 4)
const beforeAMerge = process.env['NULLPAD_READY'] !== undefined
const longestReport = 40

test.describe.configure({ mode: 'parallel' })

type Verdict = Readonly<{
  failures: ReadonlyArray<string>
  accepted: ReadonlyMap<string, number>
}>

const acceptedBy = (markdown: string): string | undefined =>
  acceptedDifferences.find(({ covers }) => covers(markdown))?.name

const judge = (unit: Unit, shown: string): Verdict => {
  const note = noteOf(unit)
  const expected = referenceHtml(note)
  const accepted = new Map<string, number>()
  const failures: Array<string> = []
  const excuse = (markdown: string): boolean => {
    const name = acceptedBy(markdown)
    if (name !== undefined) {
      accepted.set(name, (accepted.get(name) ?? 0) + 1)
    }
    return name !== undefined
  }
  if (shown === expected) {
    return { failures, accepted }
  }
  const { sentinel, cases } = unit
  if (sentinel === undefined) {
    if (!excuse(note)) {
      failures.push(
        `${unit.label} | expected ${JSON.stringify(expected)} | shown ${JSON.stringify(shown)}`,
      )
    }
    return { failures, accepted }
  }
  const wanted = expected.split(sentinel.html)
  const got = shown.split(sentinel.html)
  expect(
    wanted.length,
    `${unit.label}: the reference splits the note into one piece per case and a rest`,
  ).toBe(cases.length + 1)
  const shifted = got.length !== wanted.length
  for (const [index, source] of cases.entries()) {
    if (got[index] === wanted[index]) {
      continue
    }
    if (!shifted && excuse(source)) {
      continue
    }
    failures.push(
      `${unit.label} | case ${index + 1} ${JSON.stringify(source)} | expected ${JSON.stringify(wanted[index])} | shown ${JSON.stringify(got[index])}${shifted ? ` | the pieces shift from here: ${got.length - 1} shown, ${cases.length} expected` : ''}`,
    )
    if (shifted) {
      break
    }
  }
  return { failures, accepted }
}

const skipUnlessReady = (grid: Grid): void => {
  test.skip(
    grid.runs === 'before a merge' && !beforeAMerge,
    'runs before a merge, pnpm test:ready',
  )
}

for (const grid of grids) {
  test(`markdown grid: ${grid.name}, holds ${grid.rows} rows`, () => {
    skipUnlessReady(grid)
    const rows = countRows(grid.units())
    expect(
      rows,
      `the grid changed size: set \`rows\` to ${rows} if that is meant`,
    ).toBe(grid.rows)
  })

  for (let shard = 0; shard < shards; shard++) {
    test(`markdown grid: ${grid.name}, shard ${shard + 1} of ${shards}`, async ({
      pane,
    }, testInfo) => {
      skipUnlessReady(grid)
      const mine = grid.units().filter((_, index) => index % shards === shard)
      test.skip(mine.length === 0, 'fewer parts than shards')
      test.setTimeout(60_000 + mine.length * 5_000)
      const failures: Array<string> = []
      const accepted = new Map<string, number>()
      for (const unit of mine) {
        const verdict = judge(unit, await pane.paste(noteOf(unit)))
        failures.push(...verdict.failures)
        for (const [name, count] of verdict.accepted) {
          accepted.set(name, (accepted.get(name) ?? 0) + count)
        }
      }
      const summary = `${countRows(mine)} rows checked, ${failures.length} differ, accepted differences: ${
        [...accepted].map(([name, count]) => `${name}: ${count}`).join(', ') ||
        'none'
      }`
      testInfo.annotations.push({ type: 'markdown grid', description: summary })
      console.log(
        `markdown grid "${grid.name}" shard ${shard + 1} of ${shards}: ${summary}`,
      )
      expect(
        failures.length,
        `${summary}\n${failures.slice(0, longestReport).join('\n')}${failures.length > longestReport ? `\n... and ${failures.length - longestReport} more` : ''}\n`,
      ).toBe(0)
    })
  }
}

for (const difference of acceptedDifferences) {
  test(`accepted difference: ${difference.name}: the reference departs from the spec and the pane follows it`, async ({
    pane,
  }) => {
    const { markdown, html } = difference.example
    expect(
      referenceHtml(markdown),
      'the reference still shows the difference, else delete the entry',
    ).not.toBe(html)
    expect(
      difference.covers(markdown),
      'the entry covers its own example',
    ).toBe(true)
    expect(await pane.paste(markdown), 'the pane shows the spec').toBe(html)
  })
}

test('no accepted difference covers an example of the spec', () => {
  const covered = examples().flatMap(example =>
    acceptedDifferences
      .filter(({ covers }) => covers(example.markdown))
      .map(({ name }) => `example ${example.number} is covered by ${name}`),
  )
  expect(
    covered.slice(0, 10),
    `spec examples an entry would excuse, ${covered.length} in all`,
  ).toEqual([])
})
