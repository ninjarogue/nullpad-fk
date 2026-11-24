import { Array, Match, Option, Schema } from 'effect'

import * as Buffer from './buffer'
import * as Editor from './editor'
import * as Finder from './finder'
import { Input, type Modifiers, type NamedKey } from './input'
import * as Markdown from './markdown'

export type Inline =
  | Readonly<{ _tag: 'Text'; text: string }>
  | Readonly<{ _tag: 'Raw'; text: string }>
  | Readonly<{ _tag: 'Code'; text: string }>
  | Readonly<{ _tag: 'SoftBreak' }>
  | Readonly<{ _tag: 'HardBreak' }>
  | Readonly<{ _tag: 'Emphasis'; children: ReadonlyArray<Inline> }>
  | Readonly<{ _tag: 'Strong'; children: ReadonlyArray<Inline> }>
  | Readonly<{
      _tag: 'Link'
      href: string
      title: Option.Option<string>
      children: ReadonlyArray<Inline>
    }>
  | Readonly<{
      _tag: 'Image'
      src: string
      alt: string
      title: Option.Option<string>
    }>

export const Box = Schema.Struct({
  ...Buffer.Position.fields,
  checked: Schema.Boolean,
})
export type Box = typeof Box.Type

export type Leaf =
  | Readonly<{
      _tag: 'Paragraph' | 'Plain'
      box: Option.Option<Box>
      inlines: ReadonlyArray<Inline>
    }>
  | Readonly<{
      _tag: 'Heading'
      level: 1 | 2 | 3 | 4 | 5 | 6
      inlines: ReadonlyArray<Inline>
    }>
  | Readonly<{ _tag: 'Rule' }>
  | Readonly<{ _tag: 'CodeLine'; text: string }>
  | Readonly<{ _tag: 'RawLine'; text: string }>
  | Readonly<{ _tag: 'Empty' }>

export type Holder =
  | Readonly<{ _tag: 'Quote'; key: string }>
  | Readonly<{ _tag: 'Bullets'; key: string }>
  | Readonly<{ _tag: 'Numbers'; key: string; start: number }>
  | Readonly<{ _tag: 'Item'; key: string; ordinal: number }>
  | Readonly<{ _tag: 'Code'; key: string; info: string }>
  | Readonly<{ _tag: 'Raw'; key: string }>

type Unit = Readonly<{
  fromLine: number
  sourceLine: number
  inside: ReadonlyArray<Holder>
  leaf: Leaf
  rows: number
}>

export type Page = Readonly<{
  units: ReadonlyArray<Unit>
  starts: ReadonlyArray<number>
}>

const browserStrippedFromUrls = /[\t\n\r]/gu

const browserTrimmedFromUrlEnds = /^[\u0000- ]+|[\u0000- ]+$/gu

const schemeOf = (url: string): string =>
  url
    .replace(browserStrippedFromUrls, '')
    .replace(browserTrimmedFromUrlEnds, '')
    .toLowerCase()

const unsafeLinkScheme = /^(?:javascript|vbscript|file|data):/u

const safeImageSource = /^(?:https?:|data:image\/(?:gif|png|jpeg|webp)[;,])/u

const isSafeLink = (destination: string): boolean =>
  !unsafeLinkScheme.test(schemeOf(destination))

const isSafeImage = (destination: string): boolean =>
  safeImageSource.test(schemeOf(destination))

const plainText = (inlines: ReadonlyArray<Markdown.Inline>): string =>
  Array.join(Array.map(inlines, plainTextOf), '')

const plainTextOf: (inline: Markdown.Inline) => string = Match.typeTags<
  Markdown.Inline,
  string
>()({
  Text: ({ text }) => text,
  Escape: ({ text }) => text,
  Entity: ({ text }) => text,
  Html: ({ text }) => text,
  Code: ({ text }) => text,
  Autolink: ({ text }) => text,
  SoftBreak: () => '\n',
  HardBreak: () => '',
  Emphasis: ({ children }) => plainText(children),
  Strong: ({ children }) => plainText(children),
  Link: ({ children }) => plainText(children),
  Image: ({ children }) => plainText(children),
})

const readInlines = (
  inlines: ReadonlyArray<Markdown.Inline>,
): ReadonlyArray<Inline> => Array.flatMap(inlines, readInline)

const text = (value: string): Inline => ({ _tag: 'Text', text: value })

const readInline: (inline: Markdown.Inline) => ReadonlyArray<Inline> =
  Match.typeTags<Markdown.Inline, ReadonlyArray<Inline>>()({
    Text: inline => [text(inline.text)],
    Escape: inline => [text(inline.text)],
    Entity: inline => [text(inline.text)],
    Html: inline => [{ _tag: 'Raw', text: inline.text }],
    Code: inline => [{ _tag: 'Code', text: inline.text }],
    SoftBreak: () => [{ _tag: 'SoftBreak' }],
    HardBreak: () => [{ _tag: 'HardBreak' }],
    Emphasis: inline => [
      { _tag: 'Emphasis', children: readInlines(inline.children) },
    ],
    Strong: inline => [
      { _tag: 'Strong', children: readInlines(inline.children) },
    ],
    Autolink: inline =>
      isSafeLink(inline.destination)
        ? [
            {
              _tag: 'Link',
              href: inline.destination,
              title: Option.none(),
              children: [text(inline.text)],
            },
          ]
        : [text(inline.text)],
    Link: inline =>
      isSafeLink(inline.destination)
        ? [
            {
              _tag: 'Link',
              href: inline.destination,
              title: inline.title,
              children: readInlines(inline.children),
            },
          ]
        : readInlines(inline.children),
    Image: inline =>
      isSafeImage(inline.destination)
        ? [
            {
              _tag: 'Image',
              src: inline.destination,
              alt: plainText(inline.children),
              title: inline.title,
            },
          ]
        : [text(plainText(inline.children))],
  })

const textColumns = 70

const indentOf: Readonly<Record<Holder['_tag'], number>> = {
  Quote: 2,
  Bullets: 3,
  Numbers: 3,
  Item: 0,
  Code: 0,
  Raw: 0,
}

const widthInside = (inside: ReadonlyArray<Holder>): number =>
  Math.max(
    1,
    textColumns -
      Array.reduce(inside, 0, (sum, holder) => sum + indentOf[holder._tag]),
  )

const printableAscii = /^[\x20-\x7e]*$/u

const eastAsianWide =
  /^(?:\p{Emoji_Presentation}|.\uFE0F|[\u{1100}-\u{115F}\u{2E80}-\u{303E}\u{3041}-\u{33FF}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{A000}-\u{A4CF}\u{A960}-\u{A97F}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE10}-\u{FE19}\u{FE30}-\u{FE6F}\u{FF00}-\u{FF60}\u{FFE0}-\u{FFE6}\u{1B000}-\u{1B2FF}\u{20000}-\u{3FFFD}])/u

const columnsOf = (value: string): number =>
  printableAscii.test(value)
    ? value.length
    : Array.reduce(
        Array.fromIterable(Buffer.segmenter.segment(value)),
        0,
        (sum, { segment }) => sum + (eastAsianWide.test(segment) ? 2 : 1),
      )

const lengthOf = (inlines: ReadonlyArray<Inline>, width: number): number =>
  Array.reduce(
    inlines,
    0,
    (sum, inline) =>
      sum +
      Match.typeTags<Inline, number>()({
        Text: ({ text }) => columnsOf(text),
        Raw: ({ text }) => columnsOf(text),
        Code: ({ text }) => columnsOf(text),
        SoftBreak: () => 1,
        HardBreak: () => 0,
        Emphasis: ({ children }) => lengthOf(children, width),
        Strong: ({ children }) => lengthOf(children, width),
        Link: ({ children }) => lengthOf(children, width),
        Image: () => width,
      })(inline),
  )

const taskBoxLength = 4

const lowestRows = (leaf: Leaf, inside: ReadonlyArray<Holder>): number => {
  const width = widthInside(inside)
  const wrapped = (length: number) => Math.max(1, Math.ceil(length / width))
  const gap = inside.length === 0 ? 1 : 0
  return Match.typeTags<Leaf, number>()({
    Paragraph: ({ box, inlines }) =>
      wrapped(
        lengthOf(inlines, width) + (Option.isSome(box) ? taskBoxLength : 0),
      ) + gap,
    Plain: ({ box, inlines }) =>
      wrapped(
        lengthOf(inlines, width) + (Option.isSome(box) ? taskBoxLength : 0),
      ),
    Heading: ({ level, inlines }) =>
      wrapped(lengthOf(inlines, width) + level + 1) + gap,
    Rule: () => gap,
    CodeLine: () => 1,
    RawLine: () => 1,
    Empty: () => 1,
  })(leaf)
}

const lead = (
  inlines: ReadonlyArray<Markdown.Inline>,
  isTight: boolean,
  box: Option.Option<Box>,
): Leaf => ({
  _tag: isTight ? 'Plain' : 'Paragraph',
  box,
  inlines: readInlines(inlines),
})

const taskMark = /^\[([ xX])\][ \t]/u

const markAt = (
  lines: ReadonlyArray<Markdown.SourceLine>,
  { line, column }: Buffer.Position,
): Option.Option<boolean> =>
  Option.map(
    Option.flatMapNullishOr(Array.get(lines, line), ({ text }) =>
      taskMark.exec(text.slice(column)),
    ),
    ([, state]) => state !== ' ',
  )

const after = (
  inlines: ReadonlyArray<Markdown.Inline>,
  cut: Markdown.Point,
): ReadonlyArray<Markdown.Inline> =>
  Array.flatMap(inlines, inline => {
    const { from, to } = inline.span
    if (to.lineInSection === cut.lineInSection && to.column <= cut.column) {
      return []
    }
    return inline._tag === 'Text' &&
      from.lineInSection === cut.lineInSection &&
      from.column < cut.column
      ? [{ ...inline, text: inline.text.slice(cut.column - from.column) }]
      : [inline]
  })

type Source = Readonly<{
  lines: ReadonlyArray<Markdown.SourceLine>
  placed: Markdown.Placed
}>

type Inside = ReadonlyArray<Holder>

const positionAt = (source: Source, point: Markdown.Point): Buffer.Position =>
  Markdown.positionOf(source.placed, point)

const keyAt = (source: Source, point: Markdown.Point): string => {
  const { line, column } = positionAt(source, point)
  return `${line}:${column}`
}

const unitAt = (
  source: Source,
  point: Markdown.Point,
  inside: Inside,
  leaf: Leaf,
): Unit => {
  const sourceLine = positionAt(source, point).line + 1
  return {
    fromLine: sourceLine,
    sourceLine,
    inside,
    leaf,
    rows: lowestRows(leaf, inside),
  }
}

const orEmpty = (
  units: ReadonlyArray<Unit>,
  source: Source,
  point: Markdown.Point,
  inside: Inside,
): ReadonlyArray<Unit> =>
  units.length === 0
    ? [unitAt(source, point, inside, { _tag: 'Empty' })]
    : units

const textLines = (text: string): ReadonlyArray<string> => {
  const lines = text.split('\n')
  return lines.length > 1 && lines[lines.length - 1] === ''
    ? lines.slice(0, -1)
    : lines
}

const lineUnits = (
  source: Source,
  from: Markdown.Point,
  skipped: number,
  inside: Inside,
  holder: Holder,
  text: string,
  toLeaf: (line: string) => Leaf,
): ReadonlyArray<Unit> => {
  const first = positionAt(source, from).line + 1 + skipped
  const lines = textLines(text)
  const gap = inside.length === 0 ? 1 : 0
  return Array.map(lines, (line, index) => ({
    fromLine: first + index,
    sourceLine: first + index,
    inside: [...inside, holder],
    leaf: toLeaf(line),
    rows: index === lines.length - 1 ? 1 + gap : 1,
  }))
}

const readItem = (
  item: Markdown.Item<Markdown.Phrasing>,
  isTight: boolean,
  source: Source,
  inside: Inside,
): ReadonlyArray<Unit> => {
  const [first, ...rest] = item.children
  const plain = () =>
    orEmpty(
      readBlocks(item.children, isTight, source, inside),
      source,
      item.span.from,
      inside,
    )
  if (first?._tag !== 'Paragraph') {
    return plain()
  }
  const start = positionAt(source, first.span.from)
  return Option.match(markAt(source.lines, start), {
    onNone: plain,
    onSome: checked => [
      unitAt(
        source,
        first.span.from,
        inside,
        lead(
          after(first.content.inlines, {
            lineInSection: first.span.from.lineInSection,
            column: first.span.from.column + taskBoxLength,
          }),
          isTight,
          Option.some({ ...start, checked }),
        ),
      ),
      ...readBlocks(rest, isTight, source, inside),
    ],
  })
}

const openedAt = (
  source: Source,
  point: Markdown.Point,
  units: ReadonlyArray<Unit>,
): ReadonlyArray<Unit> => {
  const [first, ...rest] = units
  return first === undefined
    ? units
    : [{ ...first, fromLine: positionAt(source, point).line + 1 }, ...rest]
}

const readBlock = (
  block: Markdown.Block,
  isTight: boolean,
  source: Source,
  inside: Inside,
): ReadonlyArray<Unit> =>
  Match.typeTags<Markdown.Block, ReadonlyArray<Unit>>()({
    Paragraph: paragraph => [
      unitAt(
        source,
        paragraph.span.from,
        inside,
        lead(paragraph.content.inlines, isTight, Option.none()),
      ),
    ],
    Heading: heading => [
      unitAt(source, heading.span.from, inside, {
        _tag: 'Heading',
        level: heading.level,
        inlines: readInlines(heading.content.inlines),
      }),
    ],
    ThematicBreak: rule => [
      unitAt(source, rule.span.from, inside, { _tag: 'Rule' }),
    ],
    CodeBlock: code =>
      lineUnits(
        source,
        code.span.from,
        code.style._tag === 'Fenced' ? 1 : 0,
        inside,
        {
          _tag: 'Code',
          key: keyAt(source, code.span.from),
          info: code.style._tag === 'Fenced' ? code.style.info : '',
        },
        code.text,
        line => ({ _tag: 'CodeLine', text: line }),
      ),
    HtmlBlock: html =>
      lineUnits(
        source,
        html.span.from,
        0,
        inside,
        { _tag: 'Raw', key: keyAt(source, html.span.from) },
        html.text,
        line => ({ _tag: 'RawLine', text: line }),
      ),
    Definition: () => [],
    Quote: quote => {
      const within: Inside = [
        ...inside,
        { _tag: 'Quote', key: keyAt(source, quote.span.from) },
      ]
      return orEmpty(
        readBlocks(quote.children, false, source, within),
        source,
        quote.span.from,
        within,
      )
    },
    List: list => {
      const key = keyAt(source, list.span.from)
      const within: Inside = [
        ...inside,
        list.kind._tag === 'Ordered'
          ? { _tag: 'Numbers', key, start: list.kind.start }
          : { _tag: 'Bullets', key },
      ]
      return Array.flatMap(list.items, (item, ordinal) =>
        openedAt(
          source,
          item.span.from,
          readItem(item, list.tight, source, [
            ...within,
            { _tag: 'Item', key: keyAt(source, item.span.from), ordinal },
          ]),
        ),
      )
    },
  })(block)

const readBlocks = (
  blocks: ReadonlyArray<Markdown.Block>,
  isTight: boolean,
  source: Source,
  inside: Inside,
): ReadonlyArray<Unit> =>
  Array.flatMap(blocks, block =>
    openedAt(
      source,
      block.span.from,
      readBlock(block, isTight, source, inside),
    ),
  )

const pageOf = (units: ReadonlyArray<Unit>): Page => ({
  units,
  starts: Array.scan(units, 0, (sum, unit) => sum + unit.rows),
})

const readPage = (lines: ReadonlyArray<Markdown.SourceLine>): Page =>
  pageOf(
    Array.flatMap(Markdown.parse(lines).sections, section =>
      readBlocks(section.section.blocks, false, { lines, placed: section }, []),
    ),
  )

const pagesByLines = new WeakMap<ReadonlyArray<Markdown.SourceLine>, Page>()

export const page = (lines: ReadonlyArray<Markdown.SourceLine>): Page => {
  const known = pagesByLines.get(lines)
  if (known !== undefined) {
    return known
  }
  const read = readPage(lines)
  pagesByLines.set(lines, read)
  return read
}

const lastAtOrBelow = (
  count: number,
  value: number,
  valueAt: (index: number) => number,
): number => {
  const search = (low: number, high: number): number => {
    if (low >= high) {
      return low - 1
    }
    const middle = (low + high) >> 1
    return valueAt(middle) <= value
      ? search(middle + 1, high)
      : search(low, middle)
  }
  return search(0, count)
}

const unitOfSourceLine = (read: Page, sourceLine: number): number =>
  lastAtOrBelow(
    read.units.length,
    sourceLine,
    index => read.units[index]?.sourceLine ?? Infinity,
  )

const unitOfRow = (read: Page, row: number): number =>
  lastAtOrBelow(read.units.length, row, index => read.starts[index] ?? Infinity)

export const unitOfLine = (read: Page, line: number): number =>
  Math.max(
    0,
    lastAtOrBelow(
      read.units.length,
      line + 1,
      index => read.units[index]?.fromLine ?? Infinity,
    ),
  )

export const lastUnit = (read: Page): number =>
  Math.max(0, read.units.length - 1)

export const At = Schema.TaggedUnion({
  OnUnit: { unit: Schema.Int },
  InSpacer: { from: Schema.Int, rowsPast: Schema.Int },
})
export type At = typeof At.Type

export type Landing = Readonly<{ top: number; isPinned: boolean }>

export const landing = (read: Page, at: At): Landing =>
  At.match(at, {
    OnUnit: ({ unit }) => ({ top: unit, isPinned: false }),
    InSpacer: ({ from, rowsPast }) => ({
      top: Math.min(
        lastUnit(read),
        Math.max(0, unitOfRow(read, (read.starts[from] ?? 0) + rowsPast)),
      ),
      isPinned: true,
    }),
  })

export type Node =
  | Readonly<{ _tag: 'Leaf'; index: number; sourceLine: number; leaf: Leaf }>
  | Readonly<{
      _tag: 'Held'
      holder: Holder
      isContinued: boolean
      children: ReadonlyArray<Node>
    }>

export type Spacer = Readonly<{ from: number; rows: number }>

export type Drawn = Readonly<{
  above: Spacer
  nodes: ReadonlyArray<Node>
  below: Spacer
}>

type Indexed = Readonly<{ index: number; unit: Unit }>

const holderKeyAt = (unit: Unit | undefined, depth: number) =>
  unit?.inside[depth]?.key

const runsAt = (
  slice: ReadonlyArray<Indexed>,
  depth: number,
): ReadonlyArray<ReadonlyArray<Indexed>> => {
  const runStarts = Array.flatMap(slice, (here, index) => {
    const key = holderKeyAt(here.unit, depth)
    return index === 0 ||
      key === undefined ||
      key !== holderKeyAt(slice[index - 1]?.unit, depth)
      ? [index]
      : []
  })
  return Array.map(runStarts, (start, run) =>
    slice.slice(start, runStarts[run + 1] ?? slice.length),
  )
}

const firstOrdinal = (children: ReadonlyArray<Node>): number => {
  const [first] = children
  return first?._tag === 'Held' && first.holder._tag === 'Item'
    ? first.holder.ordinal
    : 0
}

const nest = (
  read: Page,
  from: number,
  slice: ReadonlyArray<Indexed>,
  depth: number,
): ReadonlyArray<Node> =>
  Array.flatMap(runsAt(slice, depth), (run): ReadonlyArray<Node> => {
    const [first] = run
    if (first === undefined) {
      return []
    }
    const holder = first.unit.inside[depth]
    if (holder === undefined) {
      return [
        {
          _tag: 'Leaf',
          index: first.index,
          sourceLine: first.unit.sourceLine,
          leaf: first.unit.leaf,
        },
      ]
    }
    const children = nest(read, from, run, depth + 1)
    return [
      {
        _tag: 'Held',
        holder:
          holder._tag === 'Numbers'
            ? { ...holder, start: holder.start + firstOrdinal(children) }
            : holder,
        isContinued:
          first.index === from &&
          holderKeyAt(read.units[from - 1], depth) === holder.key,
        children,
      },
    ]
  })

const minUnitsDrawnPastScreen = 125

export const drawn = (read: Page, top: number, screenRows: number): Drawn => {
  const count = read.units.length
  const past = Math.max(screenRows, minUnitsDrawnPastScreen)
  const at = Math.max(0, Math.min(count - 1, top))
  const from = Math.max(0, at - past)
  const to = Math.min(count, at + screenRows + past)
  const rowAt = (index: number) => read.starts[index] ?? 0
  return {
    above: { from: 0, rows: rowAt(from) },
    nodes: nest(
      read,
      from,
      Array.map(read.units.slice(from, to), (unit, offset) => ({
        index: from + offset,
        unit,
      })),
      0,
    ),
    below: { from: to, rows: rowAt(count) - rowAt(to) },
  }
}

export const Scroll = Schema.Literals([
  'LineUp',
  'LineDown',
  'PageUp',
  'PageDown',
  'Start',
  'End',
])
export type Scroll = typeof Scroll.Type

export const Act = Schema.TaggedUnion({
  Close: {},
  OpenFinder: {},
  Scroll: { to: Scroll },
  Flip: { box: Box },
  Ignore: {},
})
export type Act = typeof Act.Type

const close = Act.cases.Close.make({})

const ignore = Act.cases.Ignore.make({})

const scroll = (to: Scroll): Act => Act.cases.Scroll.make({ to })

const keys: Readonly<Record<NamedKey, (modifiers: Modifiers) => Act>> = {
  Escape: () => close,
  Enter: () => ignore,
  Tab: () => ignore,
  Backspace: () => ignore,
  Delete: () => ignore,
  ArrowLeft: () => ignore,
  ArrowRight: () => ignore,
  ArrowUp: () => scroll('LineUp'),
  ArrowDown: () => scroll('LineDown'),
  Home: ({ ctrl }) => (ctrl ? scroll('Start') : ignore),
  End: ({ ctrl }) => (ctrl ? scroll('End') : ignore),
  PageUp: () => scroll('PageUp'),
  PageDown: () => scroll('PageDown'),
}

const toggleChar = 'e'

export const toggle: Input = Input.cases.Chord.make({
  char: toggleChar,
  modifiers: { ctrl: true, alt: false, meta: false, shift: false },
})

export const togglesReading = (input: Input): boolean =>
  input._tag === 'Chord' && input.char.toLowerCase() === toggleChar

export const act = (input: Input): Act => {
  if (togglesReading(input)) {
    return close
  }
  if (Finder.opensFinder(input)) {
    return Act.cases.OpenFinder.make({})
  }
  return input._tag === 'Key' ? keys[input.key](input.modifiers) : ignore
}

const sameBox = (a: Box, b: Box): boolean =>
  a.line === b.line && a.column === b.column && a.checked === b.checked

const boxOf = (leaf: Leaf): Option.Option<Box> =>
  leaf._tag === 'Paragraph' || leaf._tag === 'Plain' ? leaf.box : Option.none()

const boxUnit = (read: Page, box: Box): Option.Option<number> => {
  const index = unitOfSourceLine(read, box.line + 1)
  return Option.exists(
    Option.flatMapNullishOr(Array.get(read.units, index), unit =>
      Option.getOrUndefined(boxOf(unit.leaf)),
    ),
    drawnBox => sameBox(drawnBox, box),
  )
    ? Option.some(index)
    : Option.none()
}

export const click = (
  lines: ReadonlyArray<Markdown.SourceLine>,
  box: Box,
): Act =>
  Option.isSome(boxUnit(page(lines), box))
    ? Act.cases.Flip.make({ box })
    : ignore

const flipped = (read: Page, index: number, box: Box): Page => ({
  units: Array.map(read.units, (unit, at) =>
    at === index &&
    (unit.leaf._tag === 'Paragraph' || unit.leaf._tag === 'Plain')
      ? {
          ...unit,
          leaf: {
            ...unit.leaf,
            box: Option.some({ ...box, checked: !box.checked }),
          },
        }
      : unit,
  ),
  starts: read.starts,
})

export const flip = (editor: Editor.Editor, box: Box): Editor.Outcome => {
  const outcome = Editor.overwrite(
    editor,
    { line: box.line, column: box.column + 1 },
    box.checked ? ' ' : 'x',
  )
  const read = page(editor.buffer.lines)
  Option.map(boxUnit(read, box), index =>
    pagesByLines.set(outcome.editor.buffer.lines, flipped(read, index, box)),
  )
  return outcome
}
