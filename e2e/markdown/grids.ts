import { entityNames, referenceHtml } from './reference'

export type Sentinel = Readonly<{ markdown: string; html: string }>

export const comment: Sentinel = { markdown: '<!-- -->', html: '<!-- -->\n' }

export type Unit = Readonly<{
  label: string
  preamble: string
  sentinel: Sentinel | undefined
  cases: ReadonlyArray<string>
}>

export type Grid = Readonly<{
  name: string
  rows: number
  runs: 'every push' | 'before a merge'
  units: () => ReadonlyArray<Unit>
}>

export const noteOf = (unit: Unit): string => {
  const { sentinel } = unit
  if (sentinel === undefined) {
    return unit.cases.join('\n')
  }
  return [
    ...(unit.preamble === '' ? [] : [unit.preamble]),
    ...unit.cases.flatMap(each => [each, sentinel.markdown]),
  ].join('\n\n')
}

export const casesPerNote = 3_000

const once = <A>(make: () => A): (() => A) => {
  let made: { value: A } | undefined
  return () => (made ??= { value: make() }).value
}

const stringsOf = (
  alphabet: ReadonlyArray<string>,
  shortest: number,
  longest: number,
): ReadonlyArray<string> => {
  let layer: ReadonlyArray<string> = ['']
  let found: ReadonlyArray<string> = []
  for (let length = 1; length <= longest; length++) {
    layer = layer.flatMap(prefix => alphabet.map(symbol => prefix + symbol))
    if (length >= shortest) {
      found = found.concat(layer)
    }
  }
  return found
}

const edged = (value: string): boolean => value === value.trim()

export const isolated =
  (sentinel: Sentinel) =>
  (markdown: string): boolean => {
    const html = referenceHtml(markdown)
    return (
      !html.includes(sentinel.html) &&
      referenceHtml(`${markdown}\n\n${sentinel.markdown}`) ===
        html + sentinel.html
    )
  }

const definitionOfA = '[a]: /u'

const batched = (
  label: string,
  preamble: string,
  sentinel: Sentinel,
  cases: ReadonlyArray<string>,
): ReadonlyArray<Unit> => {
  const kept = cases.filter(isolated(sentinel))
  const parts = Math.ceil(kept.length / casesPerNote)
  return Array.from({ length: parts }, (_, index) => ({
    label: `${label}, part ${index + 1} of ${parts}`,
    preamble,
    sentinel,
    cases: kept.slice(index * casesPerNote, (index + 1) * casesPerNote),
  }))
}

const alone = (label: string, markdown: string): Unit => ({
  label: `${label}, alone ${JSON.stringify(markdown)}`,
  preamble: '',
  sentinel: undefined,
  cases: [markdown],
})

const batchedOrAlone = (
  label: string,
  notes: ReadonlyArray<string>,
): ReadonlyArray<Unit> => [
  ...batched(label, '', comment, notes),
  ...notes
    .filter(note => !isolated(comment)(note))
    .map(note => alone(label, note)),
]

const withAndWithoutDefinition = (
  label: string,
  cases: ReadonlyArray<string>,
): ReadonlyArray<Unit> => [
  ...batched(`${label}, no definition`, '', comment, cases),
  ...batched(`${label}, [a] defined`, definitionOfA, comment, cases),
]

export const countRows = (units: ReadonlyArray<Unit>): number =>
  units.reduce((sum, unit) => sum + unit.cases.length, 0)

const emphasisAlphabet = ['*', '_', 'a', ' ', '.']

const unicodeEmphasisAlphabet = ['*', '_', 'a', '«', '€', '\u00a0', ' ']

const codeSpanAlphabet = ['`', 'a', ' ', '\\']

const linkAlphabet = ['[', ']', '(', ')', '!', '<', '>', '`', '\\', 'a', ' ']

const linkTokens = [
  '[a',
  ']',
  '(',
  ')',
  '<b>',
  '<b',
  'b',
  '"t"',
  ' ',
  '\\',
  '!',
]

const htmlTokens = [
  '<a',
  '</a',
  '<!--',
  '-->',
  '<?',
  '?>',
  '>',
  '/>',
  ' b',
  '=',
  '"x"',
  "'x'",
  'x',
  '!',
  '--',
]

const rawHtmlCases = (longest: number, shortest = 1): ReadonlyArray<string> =>
  stringsOf(htmlTokens, shortest, longest).map(tokens => `x ${tokens}`)

const lineBreakAlphabet = ['*', 'a', ' ', '\n', '`', '[', ']', '(', ')', '\\']

const autolinkTokens = ['<', '>', 'ab', ':', '@', '.', ' ', '\\', '&amp;', '-']

const printable = Array.from({ length: 95 }, (_, index) =>
  String.fromCharCode(0x20 + index),
)

const escapeCases: ReadonlyArray<string> = printable.flatMap(character => [
  `\\${character}`,
  `a\\${character}b`,
  `*\\${character}*`,
  `[a](/u\\${character} "t\\${character}")`,
  `\`\\${character}\``,
  `![a\\${character}](/u)`,
])

const numericReferences: ReadonlyArray<string> = [
  '&#0;',
  '&#1;',
  '&#9;',
  '&#10;',
  '&#13;',
  '&#31;',
  '&#32;',
  '&#34;',
  '&#35;',
  '&#38;',
  '&#60;',
  '&#127;',
  ...Array.from({ length: 33 }, (_, index) => `&#${127 + index};`),
  '&#160;',
  '&#255;',
  '&#256;',
  '&#55295;',
  '&#55296;',
  '&#56319;',
  '&#57343;',
  '&#57344;',
  '&#65533;',
  '&#65534;',
  '&#65535;',
  '&#65536;',
  '&#1114111;',
  '&#1114112;',
  '&#9999999;',
  '&#10000000;',
  '&#0000001;',
  '&#00000001;',
  '&#x0;',
  '&#x20;',
  '&#x7f;',
  '&#x80;',
  '&#x9f;',
  '&#xa0;',
  '&#XA0;',
  '&#x10FFFF;',
  '&#x10ffff;',
  '&#x110000;',
  '&#xFFFFFF;',
  '&#x1000000;',
  '&#xD7FF;',
  '&#xD800;',
  '&#xDFFF;',
  '&#xE000;',
  '&#;',
  '&#x;',
  '&#a;',
  '&#xg;',
  '&# 1;',
  '&#1',
  '&#x1',
  '&;',
  '&a;',
  '&amp ;',
  '&&amp;;',
]

const flipCase = (name: string): string =>
  name === name.toLowerCase() ? name.toUpperCase() : name.toLowerCase()

const entityCases = (): ReadonlyArray<string> => [
  ...entityNames().flatMap(name => [
    `&${name};`,
    `&${name}`,
    `&${name}x;`,
    `&${flipCase(name)};`,
    `[a](/u "&${name};")`,
    `[a](/&${name};)`,
    `\`&${name};\``,
  ]),
  ...numericReferences.flatMap(reference => [
    reference,
    `x${reference}y`,
    `[a](/u "${reference}")`,
  ]),
]

const inlinePieces = [
  'a',
  '*a*',
  '**a**',
  '***a***',
  '_a_',
  '__a__',
  '*a **b** c*',
  '`a`',
  '``a`b``',
  '` a `',
  '[a](/u)',
  '[a](/u "t")',
  '[*a*](/u)',
  '![a](/u)',
  '![*a*](/u "t")',
  '<http://a.b>',
  '<b>x</b>',
  '<!-- c -->',
  '&amp;',
  '&#35;',
  '\\*a\\*',
  '[a]',
  '[a][]',
  '[b][a]',
  'a\\',
  'a * b',
  'a_b_c',
  '*a_b*',
]

const containers = [
  '{}',
  '> {}',
  '- {}',
  '1. {}',
  '# {}',
  '> - {}',
  '- > {}',
  '> > {}',
  '{}\n===',
  '{}\n---',
  '*{}*',
  '**{}**',
  '[{}](/u)',
  '`{}`',
  '{}  \nb',
  '{}\\\nb',
  'b\n{}',
  '> b\n{}',
  '- b\n{}',
  '    b\n{}',
]

const containerCases = (): ReadonlyArray<string> =>
  containers.flatMap(container =>
    inlinePieces.map(piece => container.replace('{}', () => piece)),
  )

const markers = ['-', '*', '1.']

const itemShapes: ReadonlyArray<(indent: string) => string> = [
  () => 'a',
  indent => `a\n\n${indent}b`,
  indent => `a\n${indent}- b`,
  indent => `a\n\n${indent}- b`,
]

const gaps = ['\n', '\n\n']

const listCases = (): ReadonlyArray<string> => {
  const items = markers.flatMap(marker =>
    itemShapes.map(
      shape => `${marker} ${shape(' '.repeat(marker.length + 1))}`,
    ),
  )
  const followedByAnItem = (
    lists: ReadonlyArray<string>,
  ): ReadonlyArray<string> =>
    lists.flatMap(list =>
      gaps.flatMap(gap => items.map(item => `${list}${gap}${item}`)),
    )
  const two = followedByAnItem(items)
  return [...items, ...two, ...followedByAnItem(two)]
}

const generalShapes: ReadonlyArray<string> = [
  'a [a]',
  '',
  '    b',
  '> q',
  '- i',
  '  d',
  '1. n',
  '2. m',
  '---',
  '===',
  '# h',
  '```',
  '<div>',
  '[a]: /u',
  '\tt',
  '* * *',
]

const htmlBlockShapes: ReadonlyArray<string> = [
  '<div>',
  '</div>',
  '<pre>',
  '</pre>',
  '<!--',
  '-->',
  '<?',
  '?>',
  '<!A',
  '>',
  '<![CDATA[',
  ']]>',
  '<a>',
  '</a>',
  '<a href="x">',
  '<style>',
  'a',
  '',
  '   <div>',
  '    <div>',
]

const fenceShapes: ReadonlyArray<string> = [
  '```',
  '~~~',
  '````',
  '~~~~',
  '``` a',
  '```a`',
  '~~~ a`',
  '  ```',
  '    ```',
  'a',
  '',
  '> ```',
  '- ```',
  '  b',
  '    c',
  '``` `',
]

const definitionShapes: ReadonlyArray<string> = [
  '[a]: /u',
  '[a]:',
  '/u',
  '<u>',
  '"t"',
  "'t'",
  '(t)',
  '"t',
  't"',
  '[a]: /u "t"',
  '[a]',
  'a',
  '',
  '  [a]: /u',
  '    [a]: /u',
  '> [a]: /u',
]

const stackNotes = (
  shapes: ReadonlyArray<string>,
  heights: ReadonlyArray<number>,
): ReadonlyArray<string> => {
  const stack = (
    rows: ReadonlyArray<string>,
    height: number,
  ): ReadonlyArray<string> =>
    rows.length === height
      ? [rows.join('\n')]
      : shapes.flatMap(shape => stack([...rows, shape], height))
  return heights.flatMap(height => stack([], height))
}

const stacksAlone = (height: number): ReadonlyArray<Unit> =>
  stackNotes(generalShapes, [height]).map(note => alone('general', note))

const everyPush = 'every push'

const beforeAMerge = 'before a merge'

const longestLinkString = (longest: number, shortest = 1) =>
  stringsOf(linkAlphabet, shortest, longest).filter(edged)

const longestTokenString = (longest: number, shortest = 1) =>
  stringsOf(linkTokens, shortest, longest).filter(edged)

export const grids: ReadonlyArray<Grid> = [
  {
    name: 'every string of up to 6 of * _ a space and . breaks into emphasis as the reference does',
    rows: 12500,
    runs: everyPush,
    units: once(() =>
      batched(
        'emphasis',
        '',
        comment,
        stringsOf(emphasisAlphabet, 1, 6).filter(edged),
      ),
    ),
  },
  {
    name: 'every string of 7 of * _ a space and . breaks into emphasis as the reference does',
    rows: 50000,
    runs: beforeAMerge,
    units: once(() =>
      batched(
        'emphasis',
        '',
        comment,
        stringsOf(emphasisAlphabet, 7, 7).filter(edged),
      ),
    ),
  },
  {
    name: 'every string of up to 5 of * _ a « € no-break space and space flanks as the reference does',
    rows: 10005,
    runs: everyPush,
    units: once(() =>
      batched(
        'unicode emphasis',
        '',
        comment,
        stringsOf(unicodeEmphasisAlphabet, 1, 5).filter(edged),
      ),
    ),
  },
  {
    name: 'every string of up to 7 of backtick, a, space and backslash forms code spans as the reference does',
    rows: 12167,
    runs: everyPush,
    units: once(() =>
      batched(
        'code spans',
        '',
        comment,
        stringsOf(codeSpanAlphabet, 1, 7).filter(edged),
      ),
    ),
  },
  {
    name: 'every string of up to 4 of [ ] ( ) ! < > backtick backslash a and space reads as links and images as the reference does, with and without a definition of [a]',
    rows: 26578,
    runs: everyPush,
    units: once(() =>
      withAndWithoutDefinition('link characters', longestLinkString(4)),
    ),
  },
  {
    name: 'every string of 5 of [ ] ( ) ! < > backtick backslash a and space reads as links and images as the reference does, with and without a definition of [a]',
    rows: 265820,
    runs: beforeAMerge,
    units: once(() =>
      withAndWithoutDefinition('link characters', longestLinkString(5, 5)),
    ),
  },
  {
    name: 'every string of up to 4 link parts (a bracket, destinations, a title, parentheses) reads as the reference does, with and without a definition of [a]',
    rows: 26620,
    runs: everyPush,
    units: once(() =>
      withAndWithoutDefinition('link parts', longestTokenString(4)),
    ),
  },
  {
    name: 'every string of up to 3 raw HTML parts after a letter and a space reads as the reference does',
    rows: 3615,
    runs: everyPush,
    units: once(() => batched('raw HTML', '', comment, rawHtmlCases(3))),
  },
  {
    name: 'every string of 4 raw HTML parts after a letter and a space reads as the reference does',
    rows: 50625,
    runs: beforeAMerge,
    units: once(() => batched('raw HTML', '', comment, rawHtmlCases(4, 4))),
  },
  {
    name: 'every HTML5 entity name, spelt with and without its semicolon, and numeric references at the edges decode as the reference does',
    rows: 15145,
    runs: everyPush,
    units: once(() => batched('entities', '', comment, entityCases())),
  },
  {
    name: 'a backslash before each printable ASCII character escapes as the reference does, in text, emphasis, a link, a code span and an image',
    rows: 570,
    runs: everyPush,
    units: once(() => batched('escapes', definitionOfA, comment, escapeCases)),
  },
  {
    name: 'each inline construct reads the same in a paragraph, a quote, a list item, a heading, emphasis, link text, a code span and beside a line break',
    rows: 560,
    runs: everyPush,
    units: once(() =>
      batched('containers', definitionOfA, comment, containerCases()),
    ),
  },
  {
    name: 'lists of one to three items, any markers, a blank line or none between them and any item content are tight or loose as the reference says',
    rows: 7212,
    runs: everyPush,
    units: once(() => batched('lists', '', comment, listCases())),
  },
  {
    name: 'every string of up to 4 of * a space, a line end, backtick, brackets, parentheses and backslash reads as the reference does',
    rows: 7112,
    runs: everyPush,
    units: once(() =>
      batchedOrAlone(
        'line ends',
        stringsOf(lineBreakAlphabet, 1, 4).filter(edged),
      ),
    ),
  },
  {
    name: 'every string of 5 of * a space, a line end, backtick, brackets, parentheses and backslash reads as the reference does',
    rows: 64000,
    runs: beforeAMerge,
    units: once(() =>
      batchedOrAlone(
        'line ends',
        stringsOf(lineBreakAlphabet, 5, 5).filter(edged),
      ),
    ),
  },
  {
    name: 'every string of up to 4 autolink parts (angle brackets, a scheme, a colon, an at sign, dots, dashes, spaces) reads as the reference does',
    rows: 9000,
    runs: everyPush,
    units: once(() =>
      batched(
        'autolinks',
        '',
        comment,
        stringsOf(autolinkTokens, 1, 4).filter(edged),
      ),
    ),
  },
  {
    name: 'every string of 5 autolink parts reads as the reference does',
    rows: 81000,
    runs: beforeAMerge,
    units: once(() =>
      batched(
        'autolinks',
        '',
        comment,
        stringsOf(autolinkTokens, 5, 5).filter(edged),
      ),
    ),
  },
  {
    name: 'any two lines of 16 shapes, one under the other, make the blocks the reference makes',
    rows: 256,
    runs: everyPush,
    units: once(() => stacksAlone(2)),
  },
  {
    name: 'any three lines of 16 shapes, one under the other, make the blocks the reference makes',
    rows: 4096,
    runs: beforeAMerge,
    units: once(() => stacksAlone(3)),
  },
  {
    name: 'any one to three lines of 20 HTML block starts, ends and neighbours make the blocks the reference makes',
    rows: 8420,
    runs: beforeAMerge,
    units: once(() =>
      batchedOrAlone('HTML blocks', stackNotes(htmlBlockShapes, [1, 2, 3])),
    ),
  },
  {
    name: 'any one to three lines of 16 fence openers, closers and neighbours make the blocks the reference makes',
    rows: 4368,
    runs: beforeAMerge,
    units: once(() =>
      batchedOrAlone('fences', stackNotes(fenceShapes, [1, 2, 3])),
    ),
  },
  {
    name: 'any one to three lines of 16 definition parts and neighbours make the blocks and links the reference makes',
    rows: 4368,
    runs: beforeAMerge,
    units: once(() =>
      batchedOrAlone('definitions', stackNotes(definitionShapes, [1, 2, 3])),
    ),
  },
]
