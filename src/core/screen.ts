import { Array, Option, Order, Schema } from 'effect'

import { type Buffer, type Grapheme, type LineId, graphemes } from './buffer'

/** The screen is a grid of cells whose size the shell reports, as a terminal does. */
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

/** A line cut into visual rows. `rowStarts` holds the index into `glyphs` of each row's first glyph. */
type Layout = Readonly<{
  text: string
  glyphs: ReadonlyArray<Glyph>
  rowStarts: Array.NonEmptyReadonlyArray<number>
}>

type WrapState = Readonly<{
  rowStarts: Array.NonEmptyReadonlyArray<number>
  width: number
  breakAt: number
  sinceBreak: number
}>

/** Breaks after a space, or inside a word longer than a row. */
const layout = (text: string, columns: number): Layout => {
  const glyphs = Array.map(graphemes(text), grapheme => ({
    ...grapheme,
    cells: cells(grapheme.segment),
  }))
  const initial: WrapState = {
    rowStarts: [0],
    width: 0,
    breakAt: 0,
    sinceBreak: 0,
  }
  const { rowStarts } = Array.reduce(glyphs, initial, (state, glyph, at) => {
    const rowStart = Array.lastNonEmpty(state.rowStarts)
    const overflows = state.width + glyph.cells > columns && at > rowStart
    const softBreak = state.breakAt > rowStart
    const wrapped: WrapState = !overflows
      ? state
      : softBreak
        ? {
            rowStarts: Array.append(state.rowStarts, state.breakAt),
            width: state.sinceBreak,
            breakAt: state.breakAt,
            sinceBreak: state.sinceBreak,
          }
        : {
            rowStarts: Array.append(state.rowStarts, at),
            width: 0,
            breakAt: at,
            sinceBreak: 0,
          }
    const width = wrapped.width + glyph.cells
    return glyph.segment === ' '
      ? { ...wrapped, width, breakAt: at + 1, sinceBreak: 0 }
      : { ...wrapped, width, sinceBreak: wrapped.sinceBreak + glyph.cells }
  })
  return { text, glyphs, rowStarts }
}

const rowCount = (lineLayout: Layout): number => lineLayout.rowStarts.length

const rowGlyphs = (lineLayout: Layout, row: number): ReadonlyArray<Glyph> =>
  lineLayout.glyphs.slice(
    lineLayout.rowStarts[row] ?? lineLayout.glyphs.length,
    lineLayout.rowStarts[row + 1] ?? lineLayout.glyphs.length,
  )

const rowColumn = (lineLayout: Layout, row: number): number =>
  Option.match(
    Option.fromUndefinedOr(
      lineLayout.glyphs[lineLayout.rowStarts[row] ?? lineLayout.glyphs.length],
    ),
    { onNone: () => lineLayout.text.length, onSome: ({ index }) => index },
  )

/** The row of a column. A column on a break belongs to the row it starts. */
const rowOfColumn = (lineLayout: Layout, column: number): number =>
  Option.getOrElse(
    Array.findLastIndex(
      lineLayout.rowStarts,
      (_, row) => rowColumn(lineLayout, row) <= column,
    ),
    () => 0,
  )

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

const layouts =
  (buffer: Buffer, preedit: string, columns: number) =>
  (line: number): Layout =>
    layout(displayText(buffer, line, preedit), columns)

const orderTop: Order.Order<Top> = Order.combine(
  Order.mapInput(Order.Number, (top: Top) => top.line),
  Order.mapInput(Order.Number, (top: Top) => top.row),
)

const walk = (
  buffer: Buffer,
  layoutOf: (line: number) => Layout,
  from: Top,
  delta: number,
): Top => {
  if (delta > 0) {
    const rows = rowCount(layoutOf(from.line))
    const left = rows - 1 - from.row
    if (delta <= left) {
      return { line: from.line, row: from.row + delta }
    }
    return from.line >= buffer.lines.length - 1
      ? { line: from.line, row: rows - 1 }
      : walk(
          buffer,
          layoutOf,
          { line: from.line + 1, row: 0 },
          delta - left - 1,
        )
  }
  if (delta < 0) {
    if (-delta <= from.row) {
      return { line: from.line, row: from.row + delta }
    }
    return from.line === 0
      ? { line: 0, row: 0 }
      : walk(
          buffer,
          layoutOf,
          {
            line: from.line - 1,
            row: rowCount(layoutOf(from.line - 1)) - 1,
          },
          delta + from.row + 1,
        )
  }
  return from
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

const lineRows = (
  buffer: Buffer,
  line: number,
  preedit: string,
  columns: number,
): ReadonlyArray<Row> => {
  const isCaretLine = line === buffer.caret.line
  const caretColumn = buffer.caret.column
  const ghost = isCaretLine ? preedit.length : 0
  const caretAt = isCaretLine ? caretColumn + ghost : -1
  const lineLayout = layout(displayText(buffer, line, preedit), columns)
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
  return Array.map(lineLayout.rowStarts, (_, row) => {
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
  const collect = (
    line: number,
    skip: number,
    collected: ReadonlyArray<Row>,
  ): ReadonlyArray<Row> =>
    collected.length >= view.size.rows || line >= buffer.lines.length
      ? collected
      : collect(
          line + 1,
          0,
          Array.appendAll(
            collected,
            lineRows(buffer, line, preedit, view.size.columns).slice(
              skip,
              skip + view.size.rows - collected.length,
            ),
          ),
        )
  return collect(view.top.line, view.top.row, [])
}

/** The smallest scroll that puts the caret row on screen. Applying it twice changes nothing. */
export const follow = (buffer: Buffer, view: View, preedit: string): View => {
  const layoutOf = layouts(buffer, preedit, view.size.columns)
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
  const layoutOf = layouts(buffer, '', view.size.columns)
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
  const layoutOf = layouts(buffer, '', view.size.columns)
  return {
    ...view,
    top: Order.min(orderTop)(
      clampTop(buffer, layoutOf, view.top),
      lastTop(buffer, layoutOf, view.size),
    ),
  }
}

export const caretCell = (buffer: Buffer, view: View): number => {
  const lineLayout = layout(
    lineText(buffer, buffer.caret.line),
    view.size.columns,
  )
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
  const layoutOf = layouts(buffer, '', view.size.columns)
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
