import { expect, test } from './pane'

const countOf = (shown: string, tag: string): number =>
  shown.split(tag).length - 1

const headings = [
  { note: 'Foo\n===', end: '2:3' },
  { note: 'Foo\n===   ', end: '2:3' },
  { note: 'Foo\n---\t', end: '2:3' },
  { note: 'Foo\n--  ', end: '2:2' },
  { note: 'Foo\n=  ', end: '2:1' },
  { note: 'Foo\nbar\n===   ', end: '3:3' },
]

test('a setext heading ends where its underline ends, not at the spaces after it', async ({
  pane,
}) => {
  const failures: Array<string> = []
  for (const { note, end } of headings) {
    const row = (await pane.paste(note, 'outline')).split('\n')[0]
    if (row !== `Heading 1:0-${end}`) {
      failures.push(
        `${JSON.stringify(note)} | expected Heading 1:0-${end} | shown ${row}`,
      )
    }
  }
  expect(
    failures,
    'section 4.3 lets spaces and tabs follow the underline, they are no part of it, and AGENTS.md ends a setext heading at its underline, so the end is the underline width on the last line',
  ).toEqual([])
})

const nestedLists = (lists: number, quoted: boolean): string =>
  Array.from(
    { length: lists },
    (_, level) => `${quoted ? '> ' : ''}${'  '.repeat(level)}- x`,
  ).join('\n')

const listCases = [
  { quoted: true, lists: 49, allowed: 49 },
  { quoted: true, lists: 50, allowed: 49 },
  { quoted: true, lists: 60, allowed: 49 },
  { quoted: false, lists: 50, allowed: 50 },
  { quoted: false, lists: 51, allowed: 50 },
]

test('the nesting limit of 100 levels counts a quote, a list and an item as one level each', async ({
  pane,
}) => {
  const failures: Array<string> = []
  for (const { quoted, lists, allowed } of listCases) {
    const shown = await pane.paste(nestedLists(lists, quoted))
    const found = {
      lists: countOf(shown, '<ul>'),
      quotes: countOf(shown, '<blockquote>'),
      markerLeftAsText: shown.includes('x\n- x</li>'),
    }
    const wanted = {
      lists: allowed,
      quotes: quoted ? 1 : 0,
      markerLeftAsText: lists > allowed,
    }
    if (JSON.stringify(found) !== JSON.stringify(wanted)) {
      failures.push(
        `${lists} nested lists${quoted ? ' in a quote' : ''} | expected ${JSON.stringify(wanted)} | shown ${JSON.stringify(found)}`,
      )
    }
  }
  for (const quotes of [99, 100, 101, 150]) {
    const past = Math.max(0, quotes - 100)
    const shown = await pane.paste(`${'>'.repeat(quotes)} a`)
    const text = `<p>${past === 0 ? '' : `${'&gt;'.repeat(past)} `}a</p>`
    if (
      countOf(shown, '<blockquote>') !== quotes - past ||
      !shown.includes(text)
    ) {
      failures.push(
        `${quotes} quote markers on one line | expected ${quotes - past} quotes and ${text} | shown ${countOf(shown, '<blockquote>')} quotes`,
      )
    }
  }
  expect(
    failures,
    'a quote is 1 level, a list and its item 2 more, and a marker that would open level 101 stays text: a quote and 49 lists make 1 + 2 * 49 = 99 levels, 50 lists alone make 100, and 100 quotes make 100',
  ).toEqual([])
})

const schemes = [
  { scheme: 'a', link: false },
  { scheme: 'ab', link: true },
  { scheme: 'a1+.-', link: true },
  { scheme: 'a'.repeat(31), link: true },
  { scheme: 'a'.repeat(32), link: true },
  { scheme: 'a'.repeat(33), link: false },
  { scheme: 'a'.repeat(40), link: false },
  { scheme: '1ab', link: false },
  { scheme: '-ab', link: false },
  { scheme: 'ab_c', link: false },
]

test('an autolink scheme is 2 to 32 characters, a letter and then letters, digits, +, . or -', async ({
  pane,
}) => {
  const failures: Array<string> = []
  for (const { scheme, link } of schemes) {
    const wanted = link
      ? `<p><a href="${scheme}:x">${scheme}:x</a></p>\n`
      : `<p>&lt;${scheme}:x&gt;</p>\n`
    const shown = await pane.paste(`<${scheme}:x>`)
    if (shown !== wanted) {
      failures.push(
        `scheme of ${scheme.length} ${JSON.stringify(scheme.slice(0, 8))} | expected ${JSON.stringify(wanted)} | shown ${JSON.stringify(shown)}`,
      )
    }
  }
  expect(failures, 'section 6.5 defines the scheme, rows that differ').toEqual(
    [],
  )
})
