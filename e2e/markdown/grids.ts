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

const linkOpeners = ['[a](', '![a](']

const linkDestinations = [
  '',
  'b',
  '<b>',
  '<b',
  '<>',
  'b c',
  '<b c>',
  'b(c)',
  'b\\)',
]

const linkGaps = ['', ' ', '\t', '\n', ' \n ']

const linkTitles = ['', '"t"', "'t'", '(t)', '"t', '"t" x']

const linkEnds = ['', ' ', '\n']

const linkCases = (): ReadonlyArray<string> => [
  ...new Set(
    linkOpeners.flatMap(opener =>
      linkDestinations.flatMap(destination =>
        linkGaps.flatMap(gap =>
          linkTitles.flatMap(title =>
            linkEnds.map(end => `${opener}${destination}${gap}${title}${end})`),
          ),
        ),
      ),
    ),
  ),
]

const lineShapes: ReadonlyArray<string> = [
  'a',
  '',
  '\tt',
  ' \tt',
  '-\tt',
  '> \tt',
  '1.\tt',
  '> q',
  '- i',
  '  d',
  '1. n',
  '0. n',
  '2. n',
  '---',
  '===',
  '[a]: /u',
]

export const grids: ReadonlyArray<Grid> = [
  {
    name: 'every string of up to 3 raw HTML parts after a letter and a space reads as the reference does',
    rows: 3615,
    units: once(() => batched('raw HTML', '', comment, rawHtmlCases(3))),
  },
  {
    name: 'every HTML5 entity name, spelt with and without its semicolon, and numeric references at the edges decode as the reference does',
    rows: 15145,
    units: once(() => batched('entities', '', comment, entityCases())),
  },
  {
    name: 'any one to three lines of 16 definition parts and neighbours make the blocks and links the reference makes',
    rows: 4368,
    units: once(() =>
      batchedOrAlone('definitions', stackNotes(definitionShapes, [1, 2, 3])),
    ),
  },
  {
    name: 'any one to three lines of 16 shapes, with tabs and with ordered markers of any start, make the blocks the reference makes',
    rows: 4368,
    units: once(() =>
      stackNotes(lineShapes, [1, 2, 3]).map(note => alone('line shapes', note)),
    ),
  },
  {
    name: 'a link or an image with each destination, gap, title and end reads as the reference does, with and without a definition of [a]',
    rows: 3168,
    units: once(() => withAndWithoutDefinition('link parts', linkCases())),
  },
]
