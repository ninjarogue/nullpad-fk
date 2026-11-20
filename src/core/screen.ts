import { Array, Option, Order, Schema } from 'effect'

import {
  type Buffer,
  type Grapheme,
  type LineId,
  graphemes,
  segmenter,
} from './buffer'

/** The screen is a grid of cells whose size the shell reports, as a terminal does. The gutter is part of it. */
export const Size = Schema.Struct({
  columns: Schema.Number,
  rows: Schema.Number,
})
export type Size = typeof Size.Type

export const Top = Schema.Struct({ line: Schema.Number, row: Schema.Number })
export type Top = typeof Top.Type

/**
 * `top` names the first row on screen: visual row `row` of line `line`.
 * Anchoring on a line keeps every function here O(size.rows). None of them wraps the whole text.
 * `goalCell` is the cell column that vertical motion aims for. Any other caret move clears it.
 */
export const View = Schema.Struct({
  size: Size,
  top: Top,
  goalCell: Schema.Option(Schema.Number),
})
export type View = typeof View.Type

/** CaretPastEnd is the caret on the cell after the last character. It and Preedit are not text of the line. */
export const SpanKind = Schema.Literals([
  'Text',
  'Caret',
  'CaretPastEnd',
  'Preedit',
])
export type SpanKind = typeof SpanKind.Type

/** A Wide span is one grapheme that takes two cells. The shell boxes it so a fallback font cannot shift the row. */
export const Width = Schema.Literals(['Narrow', 'Wide'])
export type Width = typeof Width.Type

export type Span = Readonly<{ text: string; kind: SpanKind; width: Width }>

/**
 * One visual row. `start` is the column of its first character in line `lineId`.
 * Its Text and Caret spans concatenate to exactly the slice of the line it shows,
 * which is what lets the pointer turn a hit in the row into a column.
 */
export type Row = Readonly<{
  key: string
  lineId: LineId
  start: number
  lineNumber: Option.Option<number>
  spans: ReadonlyArray<Span>
}>

const eastAsianWide: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
]

const emoji = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u

/** Cells a grapheme takes: 2 for East Asian wide characters and emoji, otherwise 1. */
const cells = (grapheme: string): 1 | 2 => {
  const code = grapheme.codePointAt(0) ?? 0
  return emoji.test(grapheme) ||
    Array.some(eastAsianWide, ([from, to]) => code >= from && code <= to)
    ? 2
    : 1
}

type Glyph = Grapheme & Readonly<{ cells: 1 | 2 }>

/**
 * A line cut into visual rows: row `r` begins at column `starts[r]`, after `counts[r]` graphemes.
 * Rows hold no glyphs, so a long line costs one pass to wrap and its rows are cut only when drawn.
 */
type Layout = Readonly<{
  text: string
  columns: number
  starts: Array.NonEmptyReadonlyArray<number>
  counts: Array.NonEmptyReadonlyArray<number>
}>

const isAscii = /^[\x00-\x7f]*$/

/** Calls `place` with each grapheme's column and cells, without building an array of them. */
const eachGlyph = (
  text: string,
  place: (index: number, cells: 1 | 2, isSpace: boolean) => void,
): void => {
  if (isAscii.test(text)) {
    for (let index = 0; index < text.length; index++) {
      place(index, 1, text.charCodeAt(index) === 32)
    }
    return
  }
  for (const { index, segment } of segmenter.segment(text)) {
    place(index, cells(segment), segment === ' ')
  }
}

/**
 * Breaks after a space, or inside a word longer than a row. No row is wider than `columns`
 * unless it holds one glyph, and a row ends at a space only when text precedes that space in it,
 * so a space never sits alone on a row while the text after it could join it.
 */
const wrap = (text: string, columns: number): Layout => {
  const starts: Array.NonEmptyArray<number> = [0]
  const counts: Array.NonEmptyArray<number> = [0]
  let count = 0
  let rowStart = 0
  let width = 0
  let hasText = false
  let breakAt = -1
  let breakCount = 0
  let sinceBreak = 0
  const startRow = (at: number, before: number) => {
    starts.push(at)
    counts.push(before)
    rowStart = at
  }
  eachGlyph(text, (at, glyphCells, isSpace) => {
    if (width + glyphCells > columns && at > rowStart) {
      if (breakAt > rowStart) {
        startRow(breakAt, breakCount)
        width = sinceBreak
        hasText = sinceBreak > 0
      }
      if (width + glyphCells > columns && at > rowStart) {
        startRow(at, count)
        width = 0
        hasText = false
      }
      breakAt = -1
    }
    width += glyphCells
    count += 1
    if (isSpace && hasText) {
      breakAt = at + 1
      breakCount = count
      sinceBreak = 0
    } else {
      hasText ||= !isSpace
      sinceBreak += glyphCells
    }
  })
  return { text, columns, starts, counts }
}

const layouts = new Map<LineId, Layout>()

/** The wrap of one line, remembered by line id while its text and the width stay the same. */
const layout = (id: LineId, text: string, columns: number): Layout => {
  if (text.length * 2 <= columns) {
    return { text, columns, starts: [0], counts: [0] }
  }
  const known = layouts.get(id)
  if (known !== undefined && known.text === text && known.columns === columns) {
    return known
  }
  const wrapped = wrap(text, columns)
  if (layouts.size >= 256) {
    layouts.clear()
  }
  layouts.set(id, wrapped)
  return wrapped
}

const rowCount = (lineLayout: Layout): number => lineLayout.starts.length

const rowColumn = (lineLayout: Layout, row: number): number =>
  lineLayout.starts[row] ?? lineLayout.text.length

const rowGlyphs = (lineLayout: Layout, row: number): ReadonlyArray<Glyph> => {
  const start = rowColumn(lineLayout, row)
  return Array.map(
    graphemes(lineLayout.text.slice(start, rowColumn(lineLayout, row + 1))),
    ({ index, segment }) => ({
      index: start + index,
      segment,
      cells: cells(segment),
    }),
  )
}

/** The row of a column. A column on a break belongs to the row it starts. */
const rowOfColumn = (lineLayout: Layout, column: number): number => {
  let low = 0
  let high = lineLayout.starts.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (rowColumn(lineLayout, middle) <= column) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return low
}

/** Cells left of the text: the largest line number, at least four digits, then two blank cells. */
export const gutterWidth = (buffer: Buffer): number =>
  Math.max(4, String(buffer.lines.length).length) + 2

const maxTextColumns = 76

/** The wrap width: what the gutter leaves of the screen, at most a comfortable reading width. */
const textColumns = (buffer: Buffer, size: Size): number =>
  Math.max(1, Math.min(maxTextColumns, size.columns - gutterWidth(buffer)))

const lineText = (buffer: Buffer, line: number): string =>
  buffer.lines[line]?.text ?? ''

/** The caret line shows the preedit at the caret, so it wraps with it inside. */
const displayText = (buffer: Buffer, line: number, preedit: string): string => {
  const text = lineText(buffer, line)
  const { column } = buffer.caret
  return line === buffer.caret.line
    ? text.slice(0, column) + preedit + text.slice(column)
    : text
}

const lineLayouts =
  (buffer: Buffer, preedit: string, columns: number) =>
  (line: number): Layout =>
    layout(
      buffer.lines[line]?.id ?? buffer.lines[0].id,
      displayText(buffer, line, preedit),
      columns,
    )

const orderTop: Order.Order<Top> = Order.combine(
  Order.mapInput(Order.Number, (top: Top) => top.line),
  Order.mapInput(Order.Number, (top: Top) => top.row),
)

/** Moves `delta` visual rows from `from`, stopping at the first and last row of the text. */
const walk = (
  buffer: Buffer,
  layoutOf: (line: number) => Layout,
  from: Top,
  delta: number,
): Top => {
  let { line, row } = from
  let left = delta
  while (left > 0) {
    const last = rowCount(layoutOf(line)) - 1
    if (left <= last - row) {
      return { line, row: row + left }
    }
    if (line >= buffer.lines.length - 1) {
      return { line, row: last }
    }
    left -= last - row + 1
    line += 1
    row = 0
  }
  while (left < 0) {
    if (-left <= row) {
      return { line, row: row + left }
    }
    if (line === 0) {
      return { line: 0, row: 0 }
    }
    left += row + 1
    line -= 1
    row = rowCount(layoutOf(line)) - 1
  }
  return { line, row }
}

/** Puts a top that edits left behind back inside the text. */
const clampTop = (
  buffer: Buffer,
  layoutOf: (line: number) => Layout,
  top: Top,
): Top => {
  const line = Math.max(0, Math.min(buffer.lines.length - 1, top.line))
  return {
    line,
    row: Math.max(0, Math.min(rowCount(layoutOf(line)) - 1, top.row)),
  }
}

const caretTop = (
  buffer: Buffer,
  layoutOf: (line: number) => Layout,
  preedit: string,
): Top => ({
  line: buffer.caret.line,
  row: rowOfColumn(
    layoutOf(buffer.caret.line),
    buffer.caret.column + preedit.length,
  ),
})

const lastTop = (
  buffer: Buffer,
  layoutOf: (line: number) => Layout,
  size: Size,
): Top => {
  const lastLine = buffer.lines.length - 1
  return walk(
    buffer,
    layoutOf,
    { line: lastLine, row: rowCount(layoutOf(lastLine)) - 1 },
    -(size.rows - 1),
  )
}

const mergeInto = (
  spans: ReadonlyArray<Span>,
  span: Span,
): ReadonlyArray<Span> =>
  Option.match(Array.last(spans), {
    onNone: () => [span],
    onSome: previous =>
      previous.kind === span.kind &&
      span.kind !== 'Caret' &&
      previous.width === 'Narrow' &&
      span.width === 'Narrow'
        ? Array.append(spans.slice(0, -1), {
            ...previous,
            text: previous.text + span.text,
          })
        : Array.append(spans, span),
  })

/** Rows `from` up to `to` of one line, cut from its layout only for those rows. */
const lineRows = (
  buffer: Buffer,
  line: number,
  preedit: string,
  lineLayout: Layout,
  from: number,
  to: number,
): ReadonlyArray<Row> => {
  const isCaretLine = line === buffer.caret.line
  const caretColumn = buffer.caret.column
  const ghost = isCaretLine ? preedit.length : 0
  const caretAt = isCaretLine ? caretColumn + ghost : -1
  const lastRow = rowCount(lineLayout) - 1
  const lineColumn = (at: number): number =>
    at <= caretColumn ? at : at < caretColumn + ghost ? caretColumn : at - ghost
  const kindOf = ({ index, segment }: Glyph): SpanKind =>
    isCaretLine && index >= caretColumn && index < caretColumn + ghost
      ? 'Preedit'
      : index <= caretAt && caretAt < index + segment.length
        ? 'Caret'
        : 'Text'
  const id = buffer.lines[line]?.id ?? buffer.lines[0].id
  return Array.map(Array.range(from, Math.min(to, lastRow + 1) - 1), row => {
    const spans = Array.reduce(
      rowGlyphs(lineLayout, row),
      Array.empty<Span>(),
      (spans: ReadonlyArray<Span>, glyph) =>
        mergeInto(spans, {
          text: glyph.segment,
          kind: kindOf(glyph),
          width: glyph.cells === 2 ? 'Wide' : 'Narrow',
        }),
    )
    const caretPastEnd = row === lastRow && caretAt === lineLayout.text.length
    return {
      key: `${id}:${row}`,
      lineId: id,
      start: isCaretLine
        ? lineColumn(rowColumn(lineLayout, row))
        : rowColumn(lineLayout, row),
      lineNumber: row === 0 ? Option.some(line + 1) : Option.none(),
      spans: caretPastEnd
        ? Array.append(spans, {
            text: ' ',
            kind: 'CaretPastEnd',
            width: 'Narrow',
          })
        : spans,
    }
  })
}

/** The rows on screen, at most `view.size.rows`. The caret line wraps with the preedit inside it. */
export const rows = (
  buffer: Buffer,
  view: View,
  preedit: string,
): ReadonlyArray<Row> => {
  const layoutOf = lineLayouts(buffer, preedit, textColumns(buffer, view.size))
  const screen: Array<Row> = []
  let skip = view.top.row
  for (
    let line = view.top.line;
    screen.length < view.size.rows && line < buffer.lines.length;
    line++
  ) {
    screen.push(
      ...lineRows(
        buffer,
        line,
        preedit,
        layoutOf(line),
        skip,
        skip + view.size.rows - screen.length,
      ),
    )
    skip = 0
  }
  return screen
}

/** The smallest scroll that puts the caret row on screen. Applying it twice changes nothing. */
export const follow = (buffer: Buffer, view: View, preedit: string): View => {
  const layoutOf = lineLayouts(buffer, preedit, textColumns(buffer, view.size))
  const top = clampTop(buffer, layoutOf, view.top)
  const caret = caretTop(buffer, layoutOf, preedit)
  const bottom = walk(buffer, layoutOf, top, view.size.rows - 1)
  const nextTop = Order.isLessThan(orderTop)(caret, top)
    ? caret
    : Order.isGreaterThan(orderTop)(caret, bottom)
      ? walk(buffer, layoutOf, caret, -(view.size.rows - 1))
      : top
  return { ...view, top: nextTop }
}

/** Scrolls by whole rows and stops where the last row of the text reaches the bottom. The caret stays where it is. */
export const scroll = (buffer: Buffer, view: View, rows: number): View => {
  const layoutOf = lineLayouts(buffer, '', textColumns(buffer, view.size))
  const top = clampTop(buffer, layoutOf, view.top)
  const moved = walk(buffer, layoutOf, top, rows)
  const limit = Order.max(orderTop)(top, lastTop(buffer, layoutOf, view.size))
  return {
    ...view,
    top: rows > 0 ? Order.min(orderTop)(moved, limit) : moved,
  }
}

/** Keeps the screen full after a resize shrank the text's height. */
export const settle = (buffer: Buffer, view: View): View => {
  const layoutOf = lineLayouts(buffer, '', textColumns(buffer, view.size))
  return {
    ...view,
    top: Order.min(orderTop)(
      clampTop(buffer, layoutOf, view.top),
      lastTop(buffer, layoutOf, view.size),
    ),
  }
}

/** Graphemes before the caret on its line, counted from the line's layout rather than the whole line. */
export const caretGrapheme = (
  buffer: Buffer,
  view: View,
  preedit: string,
): number => {
  const lineLayout = lineLayouts(
    buffer,
    preedit,
    textColumns(buffer, view.size),
  )(buffer.caret.line)
  const row = rowOfColumn(lineLayout, buffer.caret.column)
  return (
    (lineLayout.counts[row] ?? 0) +
    Array.filter(
      rowGlyphs(lineLayout, row),
      glyph => glyph.index < buffer.caret.column,
    ).length
  )
}

export const caretCell = (buffer: Buffer, view: View): number => {
  const lineLayout = lineLayouts(
    buffer,
    '',
    textColumns(buffer, view.size),
  )(buffer.caret.line)
  return Array.reduce(
    rowGlyphs(lineLayout, rowOfColumn(lineLayout, buffer.caret.column)),
    0,
    (sum, glyph) =>
      glyph.index < buffer.caret.column ? sum + glyph.cells : sum,
  )
}

type CellSearch = Readonly<{ width: number; found: Option.Option<number> }>

/** Where the caret lands `rows` visual rows away, holding `goalCell`. */
export const rowTarget = (
  buffer: Buffer,
  view: View,
  rows: number,
): Buffer['caret'] => {
  const layoutOf = lineLayouts(buffer, '', textColumns(buffer, view.size))
  const from = caretTop(buffer, layoutOf, '')
  const to = walk(buffer, layoutOf, from, rows)
  if (orderTop(from, to) === 0) {
    return buffer.caret
  }
  const goal = Option.getOrElse(view.goalCell, () => caretCell(buffer, view))
  const lineLayout = layoutOf(to.line)
  const glyphs = rowGlyphs(lineLayout, to.row)
  const initial: CellSearch = { width: 0, found: Option.none() }
  const { found } = Array.reduce(glyphs, initial, (search, glyph) =>
    Option.isSome(search.found) || search.width + glyph.cells <= goal
      ? { ...search, width: search.width + glyph.cells }
      : { ...search, found: Option.some(glyph.index) },
  )
  const rowEnd = Option.match(Array.last(glyphs), {
    onNone: () => rowColumn(lineLayout, to.row),
    onSome: ({ index }) => index,
  })
  return {
    line: to.line,
    column: Option.getOrElse(found, () =>
      to.row === rowCount(lineLayout) - 1 ? lineLayout.text.length : rowEnd,
    ),
  }
}
