import { Array, Match, Option, Schema } from 'effect'

import * as Buffer from './buffer'
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

type Lead =
  | Readonly<{ _tag: 'Paragraph'; inlines: ReadonlyArray<Inline> }>
  | Readonly<{ _tag: 'Plain'; inlines: ReadonlyArray<Inline> }>

export const Box = Schema.Struct({
  ...Buffer.Position.fields,
  checked: Schema.Boolean,
})
export type Box = typeof Box.Type

export type Item =
  | Readonly<{ _tag: 'Item'; blocks: ReadonlyArray<Block> }>
  | Readonly<{
      _tag: 'Task'
      box: Box
      lead: Lead
      rest: ReadonlyArray<Block>
    }>

export type Block =
  | Lead
  | Readonly<{
      _tag: 'Heading'
      level: 1 | 2 | 3 | 4 | 5 | 6
      inlines: ReadonlyArray<Inline>
    }>
  | Readonly<{ _tag: 'Rule' }>
  | Readonly<{ _tag: 'Code'; info: string; text: string }>
  | Readonly<{ _tag: 'Raw'; text: string }>
  | Readonly<{ _tag: 'Quote'; children: ReadonlyArray<Block> }>
  | Readonly<{ _tag: 'BulletList'; items: ReadonlyArray<Item> }>
  | Readonly<{
      _tag: 'OrderedList'
      start: number
      items: ReadonlyArray<Item>
    }>

export type Shown = Readonly<{
  sourceLine: number
  lineCount: number
  block: Block
}>

export type Page = ReadonlyArray<Shown>

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

const single = (block: Block): ReadonlyArray<Block> => [block]

const lead = (
  inlines: ReadonlyArray<Markdown.Inline>,
  isTight: boolean,
): Lead => ({
  _tag: isTight ? 'Plain' : 'Paragraph',
  inlines: readInlines(inlines),
})

const taskMark = /^\[([ xX])\][ \t]/u

const taskMarkLength = 4

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

const plainItem = (
  item: Markdown.Item<Markdown.Phrasing>,
  isTight: boolean,
  source: Source,
): Item => ({
  _tag: 'Item',
  blocks: readBlocks(item.children, isTight, source),
})

const readItem = (
  item: Markdown.Item<Markdown.Phrasing>,
  isTight: boolean,
  source: Source,
): Item => {
  const [first, ...rest] = item.children
  if (first?._tag !== 'Paragraph') {
    return plainItem(item, isTight, source)
  }
  const at = Markdown.positionOf(source.placed, first.span.from)
  return Option.match(markAt(source.lines, at), {
    onNone: () => plainItem(item, isTight, source),
    onSome: checked => ({
      _tag: 'Task',
      box: { ...at, checked },
      lead: lead(
        after(first.content.inlines, {
          lineInSection: first.span.from.lineInSection,
          column: first.span.from.column + taskMarkLength,
        }),
        isTight,
      ),
      rest: readBlocks(rest, isTight, source),
    }),
  })
}

const readBlock = (
  block: Markdown.Block,
  isTight: boolean,
  source: Source,
): ReadonlyArray<Block> =>
  Match.typeTags<Markdown.Block, ReadonlyArray<Block>>()({
    Paragraph: paragraph => single(lead(paragraph.content.inlines, isTight)),
    Heading: heading =>
      single({
        _tag: 'Heading',
        level: heading.level,
        inlines: readInlines(heading.content.inlines),
      }),
    ThematicBreak: () => single({ _tag: 'Rule' }),
    CodeBlock: code =>
      single({
        _tag: 'Code',
        info: code.style._tag === 'Fenced' ? code.style.info : '',
        text: code.text,
      }),
    HtmlBlock: html => single({ _tag: 'Raw', text: html.text }),
    Definition: () => [],
    Quote: quote =>
      single({
        _tag: 'Quote',
        children: readBlocks(quote.children, false, source),
      }),
    List: list => {
      const items = Array.map(list.items, item =>
        readItem(item, list.tight, source),
      )
      return single(
        list.kind._tag === 'Ordered'
          ? { _tag: 'OrderedList', start: list.kind.start, items }
          : { _tag: 'BulletList', items },
      )
    },
  })(block)

const readBlocks = (
  blocks: ReadonlyArray<Markdown.Block>,
  isTight: boolean,
  source: Source,
): ReadonlyArray<Block> =>
  Array.flatMap(blocks, block => readBlock(block, isTight, source))

const readPage = (lines: ReadonlyArray<Markdown.SourceLine>): Page => {
  const placed = Array.flatMap(Markdown.parse(lines).sections, section =>
    Array.flatMap(section.section.blocks, block =>
      Array.map(readBlock(block, false, { lines, placed: section }), shown => ({
        sourceLine: Markdown.positionOf(section, block.span.from).line + 1,
        block: shown,
      })),
    ),
  )
  return Array.map(placed, (shown, index) => ({
    ...shown,
    lineCount:
      (placed[index + 1]?.sourceLine ?? lines.length + 1) - shown.sourceLine,
  }))
}

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

export const sourceLineAt = (read: Page, line: number): Option.Option<number> =>
  Option.map(
    Option.orElse(
      Array.findLast(read, shown => shown.sourceLine <= line + 1),
      () => Array.head(read),
    ),
    shown => shown.sourceLine,
  )

const startOf = (shown: Shown): number => shown.sourceLine

const endOf = (shown: Shown): number => shown.sourceLine + shown.lineCount

export const firstSourceLine = (read: Page): number =>
  Option.match(Array.head(read), { onNone: () => 1, onSome: startOf })

export const lastSourceLine = (read: Page): number =>
  Option.match(Array.last(read), { onNone: () => 1, onSome: startOf })

export type Drawn = Readonly<{
  above: number
  shown: ReadonlyArray<Shown>
  below: number
}>

const minLinesDrawnPastScreen = 125

export const drawn = (
  read: Page,
  topLine: number,
  screenRows: number,
): Drawn => {
  const past = Math.max(screenRows, minLinesDrawnPastScreen)
  const top = Math.min(
    lastSourceLine(read),
    Math.max(firstSourceLine(read), topLine),
  )
  const shown = Array.filter(
    read,
    block =>
      endOf(block) > top - past && startOf(block) <= top + screenRows + past,
  )
  const start = (blocks: ReadonlyArray<Shown>) =>
    Option.match(Array.head(blocks), { onNone: () => 0, onSome: startOf })
  const end = (blocks: ReadonlyArray<Shown>) =>
    Option.match(Array.last(blocks), { onNone: () => 0, onSome: endOf })
  return {
    above: start(shown) - start(read),
    shown,
    below: end(read) - end(shown),
  }
}

const drawnSpan = (shown: ReadonlyArray<Shown>) =>
  Option.zipWith(Array.head(shown), Array.last(shown), (first, last) => ({
    from: startOf(first),
    to: endOf(last),
  }))

export const pinnedAfterScroll = (
  read: Page,
  drawnTop: number,
  top: number,
  screenRows: number,
): Option.Option<number> =>
  Option.exists(
    drawnSpan(drawn(read, drawnTop, screenRows).shown),
    ({ from, to }) => top >= from && top < to,
  )
    ? Option.none()
    : sourceLineAt(read, top - 1)

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
  Overwrite: { at: Buffer.Position, text: Schema.String },
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

const boxesIn = (block: Block): ReadonlyArray<Box> =>
  Match.value(block).pipe(
    Match.tags({
      Quote: ({ children }) => Array.flatMap(children, boxesIn),
      BulletList: ({ items }) => Array.flatMap(items, boxesInItem),
      OrderedList: ({ items }) => Array.flatMap(items, boxesInItem),
    }),
    Match.orElse(() => []),
  )

const boxesInItem = (item: Item): ReadonlyArray<Box> =>
  item._tag === 'Task'
    ? [item.box, ...Array.flatMap(item.rest, boxesIn)]
    : Array.flatMap(item.blocks, boxesIn)

const sameBox = (a: Box, b: Box): boolean =>
  a.line === b.line && a.column === b.column && a.checked === b.checked

export const click = (
  lines: ReadonlyArray<Markdown.SourceLine>,
  box: Box,
): Act =>
  Option.exists(
    Array.findLast(page(lines), shown => shown.sourceLine <= box.line + 1),
    shown => Array.some(boxesIn(shown.block), drawn => sameBox(drawn, box)),
  )
    ? Act.cases.Overwrite.make({
        at: { line: box.line, column: box.column + 1 },
        text: box.checked ? ' ' : 'x',
      })
    : ignore
