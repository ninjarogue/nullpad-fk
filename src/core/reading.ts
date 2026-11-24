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

const spoken = (inlines: ReadonlyArray<Inline>): string =>
  Array.join(Array.map(inlines, spokenOf), '')

const spokenOf: (inline: Inline) => string = Match.typeTags<Inline, string>()({
  Text: ({ text }) => text,
  Raw: ({ text }) => text,
  Code: ({ text }) => text,
  SoftBreak: () => ' ',
  HardBreak: () => ' ',
  Emphasis: ({ children }) => spoken(children),
  Strong: ({ children }) => spoken(children),
  Link: ({ children }) => spoken(children),
  Image: ({ alt }) => alt,
})

export const label = (inlines: ReadonlyArray<Inline>): string =>
  spoken(inlines).trim()

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

type HeadingSet = Readonly<{
  size: number
  leading: number
  above: number
  below: number
  rule: number
}>

export const metrics = {
  measure: 680,
  size: 16.5,
  leading: 27,
  row: 22,
  hairline: 1,
  gap: 16,
  itemGap: 4,
  looseGap: 8,
  quoteIndent: 20,
  quoteGap: 20,
  listIndent: 26,
  codeSize: 13.5,
  codeLeading: 22,
  codePad: 12,
  codeInset: 15,
  ruleGap: 33,
  headings: {
    1: { size: 35, leading: 44, above: 41, below: 21, rule: 11 },
    2: { size: 24, leading: 30, above: 41, below: 14, rule: 7 },
    3: { size: 19, leading: 24, above: 28, below: 8, rule: 0 },
    4: { size: 16.5, leading: 22, above: 25, below: 7, rule: 0 },
    5: { size: 16.5, leading: 22, above: 25, below: 7, rule: 0 },
    6: { size: 16.5, leading: 22, above: 25, below: 7, rule: 0 },
  } satisfies Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, HeadingSet>>,
} as const

const indentOf: Readonly<Record<Holder['_tag'], number>> = {
  Quote: metrics.quoteIndent,
  Bullets: metrics.listIndent,
  Numbers: metrics.listIndent,
  Item: 0,
  Code: 0,
  Raw: 0,
}

const widthInside = (inside: ReadonlyArray<Holder>): number =>
  Math.max(
    metrics.size,
    metrics.measure -
      Array.reduce(inside, 0, (sum, holder) => sum + indentOf[holder._tag]),
  )

const printableAscii = /^[\x20-\x7e]*$/u

const eastAsianWide =
  /^(?:\p{Emoji_Presentation}|.\uFE0F|[\u{1100}-\u{115F}\u{2E80}-\u{303E}\u{3041}-\u{33FF}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{A000}-\u{A4CF}\u{A960}-\u{A97F}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE10}-\u{FE19}\u{FE30}-\u{FE6F}\u{FF00}-\u{FF60}\u{FFE0}-\u{FFE6}\u{1B000}-\u{1B2FF}\u{20000}-\u{3FFFD}])/u

const narrowInInter = /[ !'(),.:;I[\]fijlrt|]/gu

const broadInInter = /[A-HJ-Z@%mw]/gu

const fittedEms = {
  narrow: 0.31,
  usual: 0.59,
  broad: 0.72,
  wide: 1,
  mono: 0.6,
  codeSpan: 0.86,
  codeSpanPadding: 0.7,
  strong: 1.05,
  heading: 0.99,
}

const matchCount = (value: string, pattern: RegExp): number =>
  value.length - value.replace(pattern, '').length

const emsOf = (value: string): number => {
  if (printableAscii.test(value)) {
    const narrows = matchCount(value, narrowInInter)
    const broads = matchCount(value, broadInInter)
    return (
      narrows * fittedEms.narrow +
      broads * fittedEms.broad +
      (value.length - narrows - broads) * fittedEms.usual
    )
  }
  return Array.reduce(
    Array.fromIterable(Buffer.segmenter.segment(value)),
    0,
    (sum, { segment }) =>
      sum + (eastAsianWide.test(segment) ? fittedEms.wide : fittedEms.usual),
  )
}

const lengthOf = (inlines: ReadonlyArray<Inline>, width: number): number =>
  Array.reduce(
    inlines,
    0,
    (sum, inline) =>
      sum +
      Match.typeTags<Inline, number>()({
        Text: ({ text }) => emsOf(text),
        Raw: ({ text }) => emsOf(text),
        Code: ({ text }) =>
          text.length * fittedEms.mono * fittedEms.codeSpan +
          fittedEms.codeSpanPadding,
        SoftBreak: () => fittedEms.narrow,
        HardBreak: () => 0,
        Emphasis: ({ children }) => lengthOf(children, width),
        Strong: ({ children }) => lengthOf(children, width) * fittedEms.strong,
        Link: ({ children }) => lengthOf(children, width),
        Image: () => width,
      })(inline),
  )

const linesOf = (length: number, width: number): number =>
  Math.max(1, Math.ceil(length / width))

const textHeight = (
  inlines: ReadonlyArray<Inline>,
  inside: ReadonlyArray<Holder>,
  size: number,
  leading: number,
  scale: number,
): number => {
  const width = widthInside(inside) / size
  return linesOf(lengthOf(inlines, width) * scale, width) * leading
}

const drawnHeight = ({ leaf, inside }: Unit): number =>
  Match.typeTags<Leaf, number>()({
    Paragraph: ({ inlines }) =>
      textHeight(inlines, inside, metrics.size, metrics.leading, 1),
    Plain: ({ inlines }) =>
      textHeight(inlines, inside, metrics.size, metrics.leading, 1),
    Heading: ({ level, inlines }) => {
      const { size, leading, rule } = metrics.headings[level]
      return (
        textHeight(inlines, inside, size, leading, fittedEms.heading) + rule
      )
    },
    Rule: () => metrics.hairline,
    CodeLine: () => metrics.codeLeading,
    RawLine: ({ text }) =>
      linesOf(
        (text.length * fittedEms.mono * metrics.codeSize) / metrics.size,
        widthInside(inside) / metrics.size,
      ) * metrics.codeLeading,
    Empty: () => metrics.row,
  })(leaf)

type Margins = Readonly<{ top: number; bottom: number }>

const margins = (top: number, bottom: number): Margins => ({ top, bottom })

const topLevelMargins = (leaf: Leaf): Margins =>
  leaf._tag === 'Heading'
    ? margins(
        metrics.headings[leaf.level].above,
        metrics.headings[leaf.level].below,
      )
    : leaf._tag === 'Rule'
      ? margins(metrics.ruleGap, metrics.ruleGap)
      : margins(0, metrics.gap)

const leafMargins = (unit: Unit, isLast: boolean): Margins => {
  const parent = unit.inside[unit.inside.length - 1]
  if (parent === undefined) {
    return topLevelMargins(unit.leaf)
  }
  if (parent._tag === 'Code' || parent._tag === 'Raw') {
    return margins(0, 0)
  }
  if (parent._tag === 'Item' && unit.leaf._tag === 'Plain') {
    return margins(0, 0)
  }
  if (parent._tag === 'Item' && unit.leaf._tag === 'Paragraph' && isLast) {
    return margins(0, metrics.looseGap)
  }
  return margins(0, isLast ? 0 : metrics.gap)
}

const holderMargins = (
  inside: ReadonlyArray<Holder>,
  depth: number,
  isLast: boolean,
): Margins => {
  const holder = inside[depth]
  if (holder?._tag === 'Item') {
    return margins(metrics.itemGap, metrics.itemGap)
  }
  if (depth === 0) {
    return holder?._tag === 'Quote'
      ? margins(metrics.quoteGap, metrics.quoteGap)
      : margins(0, metrics.gap)
  }
  return margins(0, isLast ? 0 : metrics.gap)
}

const sharedDepth = (unit: Unit, next: Unit): number => {
  const depth = Array.findFirstIndex(
    unit.inside,
    (holder, index) => holder.key !== next.inside[index]?.key,
  )
  return Option.getOrElse(depth, () => unit.inside.length)
}

const panelEdge = metrics.codePad + metrics.hairline

const isPanel = (inside: ReadonlyArray<Holder>, from: number): boolean =>
  Array.some(inside.slice(from), holder => holder._tag === 'Code')

const gapAfter = (unit: Unit, next: Unit | undefined): number => {
  if (next === undefined) {
    return isPanel(unit.inside, 0) ? panelEdge : 0
  }
  const depth = sharedDepth(unit, next)
  const deeper = (inside: ReadonlyArray<Holder>) =>
    Array.filter(
      Array.map(inside, (_, at) => at),
      at => at >= depth,
    )
  const closing = deeper(unit.inside)
  const opening = deeper(next.inside)
  const collapsed = Math.max(
    0,
    leafMargins(unit, depth < unit.inside.length).bottom,
    ...Array.map(
      closing,
      at => holderMargins(unit.inside, at, depth < at).bottom,
    ),
    ...Array.map(opening, at => holderMargins(next.inside, at, false).top),
    leafMargins(next, false).top,
  )
  return (
    collapsed +
    (isPanel(unit.inside, depth) ? panelEdge : 0) +
    (isPanel(next.inside, depth) ? panelEdge : 0)
  )
}

const taskBoxLength = 4

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
  return Array.map(lines, (line, index) => ({
    fromLine: first + index,
    sourceLine: first + index,
    inside: [...inside, holder],
    leaf: toLeaf(line),
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
  starts: Array.scan(
    Array.map(
      units,
      (unit, index) => drawnHeight(unit) + gapAfter(unit, units[index + 1]),
    ),
    0,
    (sum, height) => Math.round(sum + height),
  ),
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

const unitAtHeight = (read: Page, height: number): number =>
  lastAtOrBelow(
    read.units.length,
    height,
    index => read.starts[index] ?? Infinity,
  )

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
  InSpacer: { from: Schema.Int, pixelsPast: Schema.Int },
})
export type At = typeof At.Type

export const Reveal = Schema.TaggedUnion({
  Start: {},
  Unit: { unit: Schema.Int },
  End: {},
})
export type Reveal = typeof Reveal.Type

export const revealUnit = (unit: number): Reveal =>
  unit === 0 ? Reveal.cases.Start.make({}) : Reveal.cases.Unit.make({ unit })

export type Landing = Readonly<{ top: number; reveal: Option.Option<Reveal> }>

export const landing = (read: Page, at: At, screenRows: number): Landing =>
  At.match(at, {
    OnUnit: ({ unit }) => ({ top: unit, reveal: Option.none() }),
    InSpacer: ({ from, pixelsPast }) => {
      const viewTop = (read.starts[from] ?? 0) + pixelsPast
      if (
        viewTop + screenRows * metrics.row >=
        (read.starts[read.units.length] ?? 0)
      ) {
        return {
          top: lastUnit(read),
          reveal: Option.some(Reveal.cases.End.make({})),
        }
      }
      const top = Math.min(
        lastUnit(read),
        Math.max(0, unitAtHeight(read, viewTop)),
      )
      return { top, reveal: Option.some(revealUnit(top)) }
    },
  })

export type Node =
  | Readonly<{ _tag: 'Leaf'; index: number; sourceLine: number; leaf: Leaf }>
  | Readonly<{
      _tag: 'Held'
      holder: Holder
      isContinued: boolean
      children: ReadonlyArray<Node>
    }>

export type Spacer = Readonly<{ from: number; height: number }>

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
  const startOf = (index: number) => read.starts[index] ?? 0
  return {
    above: { from: 0, height: startOf(from) },
    nodes: nest(
      read,
      from,
      Array.map(read.units.slice(from, to), (unit, offset) => ({
        index: from + offset,
        unit,
      })),
      0,
    ),
    below: { from: to, height: startOf(count) - startOf(to) },
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
