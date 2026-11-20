import { Array, Option, Order, Schema } from 'effect'

import {
  type Buffer,
  type Grapheme,
  type Line,
  type LineId,
  type Position,
  graphemes,
  segmenter,
} from './buffer'
import {
  breaksBefore,
  endsSpacedIdeographicSpace,
  isBreakSpace,
} from './lineBreak'

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
 * `goalCell` is the cell column that vertical motion aims for. As in Chrome, typing, a click or a caret move
 * that lands elsewhere clears it; Backspace, Delete, Enter inside a line and a move that stays put keep it.
 * `caretAtRowEnd` draws a caret that sits where a line wraps at the end of the upper row, as Chrome's
 * upstream caret after End, a click past a row end, or a vertical move onto one. Any other move clears it.
 */
export const View = Schema.Struct({
  size: Size,
  top: Top,
  goalCell: Schema.Option(Schema.Number),
  caretAtRowEnd: Schema.Boolean,
})
export type View = typeof View.Type

/**
 * CaretPastEnd is the caret on the cell after the last character, or at the row's edge when it sits among or after
 * spaces that hang past it, where Chrome draws its caret. It and Preedit are not text of the line.
 */
export const SpanKind = Schema.Literals([
  'Text',
  'Caret',
  'CaretPastEnd',
  'Preedit',
])
export type SpanKind = typeof SpanKind.Type

/**
 * A span with a `box` is one grapheme the shell draws in a box that many cells wide: a grapheme wider than one cell,
 * so a fallback font cannot shift the row, or the first grapheme after a line join, so it is shaped apart from the
 * text before it, the way Chrome hit-tests the two sides of a join. A box of 0 cells holds the spaces that hang past
 * the row's edge, which take no room, as in a Chrome text field.
 */
export type Span = Readonly<{
  text: string
  kind: SpanKind
  box: Option.Option<number>
}>

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

const rgiEmoji = new RegExp('^\\p{RGI_Emoji}$', 'v')

const zwj = '\u200d'

/**
 * Cells a grapheme takes: 2 for East Asian wide characters and emoji, 1 otherwise. A ZWJ sequence that is not
 * a recommended emoji has no single glyph, so it takes the cells of the emoji it is made of, side by side.
 */
const cells = (grapheme: string): number => {
  if (rgiEmoji.test(grapheme)) {
    return 2
  }
  if (grapheme.length > 1 && grapheme.includes(zwj)) {
    return Math.max(
      1,
      Array.reduce(grapheme.split(zwj), 0, (sum, part) =>
        part === '' ? sum : sum + cells(part),
      ),
    )
  }
  const code = grapheme.codePointAt(0) ?? 0
  return emoji.test(grapheme) ||
    Array.some(eastAsianWide, ([from, to]) => code >= from && code <= to)
    ? 2
    : 1
}

/** `opensPiece` marks the first grapheme after a line join. */
type Glyph = Grapheme & Readonly<{ cells: number; opensPiece: boolean }>

/**
 * A line cut into visual rows: row `r` begins at column `starts[r]`, after `counts[r]` graphemes.
 * Rows hold no glyphs, so a long line costs one pass to wrap and its rows are cut only when drawn.
 */
type Layout = Readonly<{
  text: string
  joins: ReadonlyArray<number>
  columns: number
  starts: Array.NonEmptyReadonlyArray<number>
  counts: Array.NonEmptyReadonlyArray<number>
}>

const isAscii = /^[\x00-\x7f]*$/

/** The stretches of `[from, to)` between joins. A grapheme never spans one, on screen as in editing. */
const pieces = (
  joins: ReadonlyArray<number>,
  from: number,
  to: number,
): ReadonlyArray<readonly [number, number]> => {
  const inside = Array.filter(joins, join => join > from && join < to)
  return Array.zip([from, ...inside], [...inside, to])
}

/** Calls `place` with each grapheme from `from` on, until it returns true. */
const eachGlyph = (
  text: string,
  joins: ReadonlyArray<number>,
  from: number,
  place: (index: number, segment: string, cells: number) => boolean,
): boolean => {
  const rest = text.slice(from)
  if (isAscii.test(rest)) {
    for (let index = from; index < text.length; index++) {
      if (place(index, text.charAt(index), 1)) {
        return true
      }
    }
    return false
  }
  for (const [start, end] of pieces(joins, from, text.length)) {
    for (const { index, segment } of segmenter.segment(
      text.slice(start, end),
    )) {
      if (place(start + index, segment, cells(segment))) {
        return true
      }
    }
  }
  return false
}

type Rows = Readonly<{
  starts: Array.NonEmptyReadonlyArray<number>
  counts: Array.NonEmptyReadonlyArray<number>
}>

type Tail = Readonly<{
  starts: ReadonlyArray<number>
  counts: ReadonlyArray<number>
}>

type Placed = Readonly<{ at: number; segment: string; cells: number }>

/**
 * Cuts a line into rows as a Chrome text field does with `white-space: pre-wrap` and `overflow-wrap: break-word`.
 * A row ends at the last place `breaksBefore` allows before the first grapheme that would cross the edge, or inside
 * a word longer than a row. Spaces never cross the edge: they stay on the row they end and hang past it, however
 * many there are, so a row starts with a space only at the start of a line.
 * Graphemes from `context` to `from` are only read, as the rules look two graphemes back. The rules also look two
 * ahead, so each grapheme is placed once the two after it are read.
 * Starts at row start `from`, `before` graphemes in, and stops early once `tailAt` knows the rest.
 */
const wrap = (
  text: string,
  joins: ReadonlyArray<number>,
  columns: number,
  context: number,
  from: number,
  before: number,
  tailAt: (
    start: number,
    count: number,
    previous: number,
  ) => Option.Option<Tail>,
): Rows => {
  const starts: Array.NonEmptyArray<number> = [from]
  const counts: Array.NonEmptyArray<number> = [before]
  let count = before
  let rowStart = from
  let width = 0
  let breakAt = -1
  let breakCount = 0
  let breakPrevious = -1
  let sinceBreak = 0
  let tail: Option.Option<Tail> = Option.none()
  let previous: Placed | undefined
  let twoBefore: string | undefined
  let spacedIdeographicSpace = false
  const startRow = (at: number, graphemesBefore: number, last: number) => {
    starts.push(at)
    counts.push(graphemesBefore)
    rowStart = at
    tail = tailAt(at, graphemesBefore, last)
  }
  const place = (
    glyph: Placed,
    after: string | undefined,
    twoAfter: string | undefined,
  ): boolean => {
    const { at, segment } = glyph
    if (at >= from && previous !== undefined) {
      if (
        at > rowStart &&
        breaksBefore({
          twoBefore,
          before: previous.segment,
          at: segment,
          after,
          twoAfter,
          spacedIdeographicSpace,
        })
      ) {
        breakAt = at
        breakCount = count
        breakPrevious = previous.at
        sinceBreak = 0
      }
      if (
        !isBreakSpace(segment) &&
        width + glyph.cells > columns &&
        at > rowStart
      ) {
        if (breakAt > rowStart) {
          startRow(breakAt, breakCount, breakPrevious)
          width = sinceBreak
        }
        if (
          Option.isNone(tail) &&
          width + glyph.cells > columns &&
          at > rowStart
        ) {
          startRow(at, count, previous.at)
          width = 0
        }
        breakAt = -1
      }
    }
    if (at >= from) {
      width += glyph.cells
      count += 1
      sinceBreak += glyph.cells
    }
    spacedIdeographicSpace = endsSpacedIdeographicSpace(
      segment,
      previous?.segment,
      spacedIdeographicSpace,
    )
    twoBefore = previous?.segment
    previous = glyph
    return Option.isSome(tail)
  }
  const ahead: Array<Placed> = []
  let stopped = eachGlyph(text, joins, context, (at, segment, glyphCells) => {
    ahead.push({ at, segment, cells: glyphCells })
    const next = ahead.length === 3 ? ahead.shift() : undefined
    return (
      next !== undefined && place(next, ahead[0]?.segment, ahead[1]?.segment)
    )
  })
  while (!stopped && ahead.length > 0) {
    const next = ahead.shift()
    stopped =
      next !== undefined && place(next, ahead[0]?.segment, ahead[1]?.segment)
  }
  return Option.match(tail, {
    onNone: () => ({ starts, counts }),
    onSome: rest => ({
      starts: Array.appendAll(starts, rest.starts),
      counts: Array.appendAll(counts, rest.counts),
    }),
  })
}

const sharedPrefix = (a: string, b: string): number => {
  const limit = Math.min(a.length, b.length)
  let at = 0
  while (at < limit && a.charCodeAt(at) === b.charCodeAt(at)) {
    at++
  }
  return at
}

const sharedSuffix = (a: string, b: string, prefix: number): number => {
  const limit = Math.min(a.length, b.length) - prefix
  let at = 0
  while (
    at < limit &&
    a.charCodeAt(a.length - 1 - at) === b.charCodeAt(b.length - 1 - at)
  ) {
    at++
  }
  return at
}

/**
 * Wraps `text` again after an edit, reusing the rows of the text before it. A row's end depends only on the
 * graphemes from its start to two past the first one of the next row, so rows that start two rows before the edit
 * keep their starts. From the first row start in the unchanged tail that lines up with an old one, and whose
 * grapheme before it is unchanged too, the old rows repeat, moved by the edit's length.
 */
const rewrap = (
  known: Layout,
  text: string,
  joins: ReadonlyArray<number>,
): Layout => {
  const { columns } = known
  const prefix = sharedPrefix(known.text, text)
  const tailFrom = text.length - sharedSuffix(known.text, text, prefix)
  const shift = text.length - known.text.length
  const resume = Math.max(0, rowOfColumn(known, prefix - 1) - 2)
  const tailAt = (
    start: number,
    count: number,
    previous: number,
  ): Option.Option<Tail> => {
    const row = rowOfColumn(known, start - shift)
    const oldCount = known.counts[row] ?? 0
    return previous >= tailFrom && known.starts[row] === start - shift
      ? Option.some({
          starts: Array.map(known.starts.slice(row + 1), at => at + shift),
          counts: Array.map(
            known.counts.slice(row + 1),
            at => at + count - oldCount,
          ),
        })
      : Option.none()
  }
  const rows = wrap(
    text,
    joins,
    columns,
    rowColumn(known, Math.max(0, resume - 1)),
    rowColumn(known, resume),
    known.counts[resume] ?? 0,
    tailAt,
  )
  return {
    text,
    joins,
    columns,
    starts: Array.prependAll(rows.starts, known.starts.slice(0, resume)),
    counts: Array.prependAll(rows.counts, known.counts.slice(0, resume)),
  }
}

const layouts = new Map<LineId, Layout>()

const sameJoins = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
  a.length === b.length && Array.every(a, (join, index) => join === b[index])

/** The wrap of one line, remembered by line id. An edit wraps again only near the change. */
const layout = (
  id: LineId,
  text: string,
  joins: ReadonlyArray<number>,
  columns: number,
): Layout => {
  if (text.length * 2 <= columns) {
    return { text, joins, columns, starts: [0], counts: [0] }
  }
  const known = layouts.get(id)
  const sameText = known !== undefined && known.text === text
  if (sameText && known.columns === columns && sameJoins(known.joins, joins)) {
    return known
  }
  const wrapped =
    known !== undefined && known.columns === columns && !sameText
      ? rewrap(known, text, joins)
      : {
          text,
          joins,
          columns,
          ...wrap(text, joins, columns, 0, 0, 0, () => Option.none()),
        }
  if (layouts.size >= 256) {
    layouts.clear()
  }
  layouts.set(id, wrapped)
  return wrapped
}

const rowCount = (lineLayout: Layout): number => lineLayout.starts.length

const rowColumn = (lineLayout: Layout, row: number): number =>
  lineLayout.starts[row] ?? lineLayout.text.length

const rowGlyphs = (lineLayout: Layout, row: number): ReadonlyArray<Glyph> =>
  Array.flatMap(
    pieces(
      lineLayout.joins,
      rowColumn(lineLayout, row),
      rowColumn(lineLayout, row + 1),
    ),
    ([start, end]) =>
      Array.map(graphemes(lineLayout.text, start, end), grapheme => ({
        ...grapheme,
        cells: cells(grapheme.segment),
        opensPiece:
          grapheme.index === start && lineLayout.joins.includes(start),
      })),
  )

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

const textColumns = (buffer: Buffer, size: Size): number =>
  Math.max(1, Math.min(maxTextColumns, size.columns - gutterWidth(buffer)))

const lineAt = (buffer: Buffer, line: number): Line =>
  buffer.lines[line] ?? buffer.lines[0]

/** The caret line shows the preedit at the caret, so it wraps with it inside, before a join there. */
const lineLayouts =
  (buffer: Buffer, preedit: string, columns: number) =>
  (line: number): Layout => {
    const { id, text, joins } = lineAt(buffer, line)
    const { column } = buffer.caret
    return line === buffer.caret.line && preedit !== ''
      ? layout(
          id,
          text.slice(0, column) + preedit + text.slice(column),
          Array.map(joins, join =>
            join >= column ? join + preedit.length : join,
          ),
          columns,
        )
      : layout(id, text, joins, columns)
  }

const orderTop: Order.Order<Top> = Order.combine(
  Order.mapInput(Order.Number, (top: Top) => top.line),
  Order.mapInput(Order.Number, (top: Top) => top.row),
)

/** The row `delta` rows from `from`, stopped at the first or last row, and how many rows short of `delta` it is. */
const walkBy = (
  buffer: Buffer,
  layoutOf: (line: number) => Layout,
  from: Top,
  delta: number,
): Readonly<{ top: Top; short: number }> => {
  let { line, row } = from
  let left = delta
  while (left > 0) {
    const last = rowCount(layoutOf(line)) - 1
    if (left <= last - row) {
      return { top: { line, row: row + left }, short: 0 }
    }
    if (line >= buffer.lines.length - 1) {
      return { top: { line, row: last }, short: left - (last - row) }
    }
    left -= last - row + 1
    line += 1
    row = 0
  }
  while (left < 0) {
    if (-left <= row) {
      return { top: { line, row: row + left }, short: 0 }
    }
    if (line === 0) {
      return { top: { line: 0, row: 0 }, short: -left - row }
    }
    left += row + 1
    line -= 1
    row = rowCount(layoutOf(line)) - 1
  }
  return { top: { line, row }, short: 0 }
}

const walk = (
  buffer: Buffer,
  layoutOf: (line: number) => Layout,
  from: Top,
  delta: number,
): Top => walkBy(buffer, layoutOf, from, delta).top

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

/** The caret's row. A caret on a wrap that `atRowEnd` puts at the end of the upper row belongs to that row. */
const caretRow = (
  lineLayout: Layout,
  column: number,
  atRowEnd: boolean,
): number => {
  const row = rowOfColumn(lineLayout, column)
  return atRowEnd && row > 0 && rowColumn(lineLayout, row) === column
    ? row - 1
    : row
}

const caretTop = (
  buffer: Buffer,
  layoutOf: (line: number) => Layout,
  preedit: string,
  atRowEnd: boolean,
): Top => ({
  line: buffer.caret.line,
  row: caretRow(
    layoutOf(buffer.caret.line),
    buffer.caret.column + preedit.length,
    atRowEnd && preedit === '',
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
      ((Option.isNone(previous.box) && Option.isNone(span.box)) ||
        (Option.contains(previous.box, 0) && Option.contains(span.box, 0)))
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
  atRowEnd: boolean,
  lineLayout: Layout,
  from: number,
  to: number,
): ReadonlyArray<Row> => {
  const isCaretLine = line === buffer.caret.line
  const caretColumn = buffer.caret.column
  const ghost = isCaretLine ? preedit.length : 0
  const lastRow = rowCount(lineLayout) - 1
  const caretAtRowEnd =
    isCaretLine &&
    caretRow(lineLayout, caretColumn + ghost, atRowEnd && ghost === 0) !==
      rowOfColumn(lineLayout, caretColumn + ghost)
  const caretAt = isCaretLine && !caretAtRowEnd ? caretColumn + ghost : -1
  const endsWithCaret = (row: number): boolean =>
    caretAtRowEnd
      ? rowColumn(lineLayout, row + 1) === caretColumn
      : row === lastRow && caretAt === lineLayout.text.length
  const lineColumn = (at: number): number =>
    at <= caretColumn ? at : at < caretColumn + ghost ? caretColumn : at - ghost
  const kindOf = ({ index, segment }: Glyph): SpanKind =>
    isCaretLine && index >= caretColumn && index < caretColumn + ghost
      ? 'Preedit'
      : index <= caretAt && caretAt < index + segment.length
        ? 'Caret'
        : 'Text'
  const id = buffer.lines[line]?.id ?? buffer.lines[0].id
  const noSpans: Readonly<{ spans: ReadonlyArray<Span>; width: number }> = {
    spans: [],
    width: 0,
  }
  const ghostCaret: Span = {
    text: ' ',
    kind: 'CaretPastEnd',
    box: Option.none(),
  }
  return Array.map(Array.range(from, Math.min(to, lastRow + 1) - 1), row => {
    const { spans } = Array.reduce(
      rowGlyphs(lineLayout, row),
      noSpans,
      ({ spans, width }, glyph) => {
        const kind = kindOf(glyph)
        const hangs = width >= lineLayout.columns
        const span: Span = {
          text: glyph.segment,
          kind: kind === 'Caret' && hangs ? 'Text' : kind,
          box: hangs
            ? Option.some(0)
            : glyph.cells > 1 || glyph.opensPiece
              ? Option.some(glyph.cells)
              : Option.none(),
        }
        return {
          spans: mergeInto(
            kind === 'Caret' && hangs ? mergeInto(spans, ghostCaret) : spans,
            span,
          ),
          width: width + glyph.cells,
        }
      },
    )
    return {
      key: `${id}:${row}`,
      lineId: id,
      start: isCaretLine
        ? lineColumn(rowColumn(lineLayout, row))
        : rowColumn(lineLayout, row),
      lineNumber: row === 0 ? Option.some(line + 1) : Option.none(),
      spans: endsWithCaret(row) ? Array.append(spans, ghostCaret) : spans,
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
        view.caretAtRowEnd,
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
  const caret = caretTop(buffer, layoutOf, preedit, view.caretAtRowEnd)
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

/**
 * Graphemes before the caret on its line, as Intl.Segmenter counts the line's text, joins or not. Counted from the
 * line's layout rather than the whole line, unless a join could make the layout's graphemes differ.
 */
export const caretGrapheme = (
  buffer: Buffer,
  view: View,
  preedit: string,
): number => {
  const { line, column } = buffer.caret
  const { text, joins } = lineAt(buffer, line)
  if (joins.length > 0) {
    return graphemes(text, 0, column).length
  }
  const lineLayout = lineLayouts(
    buffer,
    preedit,
    textColumns(buffer, view.size),
  )(line)
  const row = rowOfColumn(lineLayout, column)
  return (
    (lineLayout.counts[row] ?? 0) +
    Array.filter(rowGlyphs(lineLayout, row), glyph => glyph.index < column)
      .length
  )
}

const caretLayout = (buffer: Buffer, view: View): Layout =>
  lineLayouts(buffer, '', textColumns(buffer, view.size))(buffer.caret.line)

/** The caret's cell on its row. A caret among or after spaces that hang past the edge is at the edge. */
export const caretCell = (buffer: Buffer, view: View): number => {
  const lineLayout = caretLayout(buffer, view)
  return Math.min(
    lineLayout.columns,
    Array.reduce(
      rowGlyphs(
        lineLayout,
        caretRow(lineLayout, buffer.caret.column, view.caretAtRowEnd),
      ),
      0,
      (sum, glyph) =>
        glyph.index < buffer.caret.column ? sum + glyph.cells : sum,
    ),
  )
}

/** A caret position and whether it shows at the end of the upper row when it sits where the line wraps. */
export type Landing = Readonly<{ caret: Position; atRowEnd: boolean }>

/** The end of a row: the line end on its last row, else where the next row starts, shown at this row's end. */
const rowEnd = (lineLayout: Layout, line: number, row: number): Landing =>
  row === rowCount(lineLayout) - 1
    ? { caret: { line, column: lineLayout.text.length }, atRowEnd: false }
    : {
        caret: { line, column: rowColumn(lineLayout, row + 1) },
        atRowEnd: true,
      }

/** Home and End: the start or the end of the row the caret is on. */
export const rowEdge = (
  buffer: Buffer,
  view: View,
  edge: 'Start' | 'End',
): Landing => {
  const lineLayout = caretLayout(buffer, view)
  const { line, column } = buffer.caret
  const row = caretRow(lineLayout, column, view.caretAtRowEnd)
  return edge === 'Start'
    ? { caret: { line, column: rowColumn(lineLayout, row) }, atRowEnd: false }
    : rowEnd(lineLayout, line, row)
}

type CellSearch = Readonly<{ width: number; found: Option.Option<number> }>

/** Where a caret aiming at `goal` cells lands on a row: before the first grapheme that ends past it, else the row end. */
const atCell = (
  lineLayout: Layout,
  line: number,
  row: number,
  goal: number,
): Landing => {
  const initial: CellSearch = { width: 0, found: Option.none() }
  const { found } = Array.reduce(
    rowGlyphs(lineLayout, row),
    initial,
    (search, glyph) =>
      Option.isSome(search.found) || search.width + glyph.cells <= goal
        ? { ...search, width: search.width + glyph.cells }
        : { ...search, found: Option.some(glyph.index) },
  )
  return Option.match(found, {
    onNone: () => rowEnd(lineLayout, line, row),
    onSome: column => ({ caret: { line, column }, atRowEnd: false }),
  })
}

/** The start of the text, or its end. */
const textEdge = (buffer: Buffer, edge: 'Start' | 'End'): Landing => {
  const lastLine = buffer.lines.length - 1
  return {
    caret:
      edge === 'Start'
        ? { line: 0, column: 0 }
        : { line: lastLine, column: lineAt(buffer, lastLine).text.length },
    atRowEnd: false,
  }
}

/**
 * Where the caret lands `rows` visual rows away, holding `goalCell`. Past the first row it lands at the text start,
 * past the last at the text end. A goal past a row's text lands at the row end.
 */
export const rowTarget = (
  buffer: Buffer,
  view: View,
  rows: number,
): Landing => {
  const layoutOf = lineLayouts(buffer, '', textColumns(buffer, view.size))
  const from = caretTop(buffer, layoutOf, '', view.caretAtRowEnd)
  const to = walk(buffer, layoutOf, from, rows)
  if (orderTop(from, to) === 0) {
    return textEdge(buffer, rows < 0 ? 'Start' : 'End')
  }
  const goal = Option.getOrElse(view.goalCell, () => caretCell(buffer, view))
  return atCell(layoutOf(to.line), to.line, to.row, goal)
}

/** Rows a page moves: seven eighths of the screen, as Chrome pages a text field, and at least one. */
export const pageRows = (size: Size): number =>
  Math.max(1, Math.floor((size.rows * 7) / 8))

/**
 * Page Up and Page Down, as in a Chrome text field: the caret moves a page of rows at the cell it is drawn on,
 * whatever the goal cell, and when fewer rows than a page are left it goes to the start or the end of the text.
 */
export const pageTarget = (
  buffer: Buffer,
  view: View,
  direction: -1 | 1,
): Landing => {
  const layoutOf = lineLayouts(buffer, '', textColumns(buffer, view.size))
  const from = caretTop(buffer, layoutOf, '', view.caretAtRowEnd)
  const { top: to, short } = walkBy(
    buffer,
    layoutOf,
    from,
    direction * pageRows(view.size),
  )
  return short > 0
    ? textEdge(buffer, direction < 0 ? 'Start' : 'End')
    : atCell(layoutOf(to.line), to.line, to.row, caretCell(buffer, view))
}

/** Scrolls so the caret row is the first row on screen, or as near it as the end of the text allows. */
export const caretRowFirst = (buffer: Buffer, view: View): View => {
  const layoutOf = lineLayouts(buffer, '', textColumns(buffer, view.size))
  return {
    ...view,
    top: Order.min(orderTop)(
      caretTop(buffer, layoutOf, '', view.caretAtRowEnd),
      lastTop(buffer, layoutOf, view.size),
    ),
  }
}

/** The grapheme boundary nearest `cell` on a row, or the row end past its text. Spaces that hang take no room. */
const nearestOnRow = (
  lineLayout: Layout,
  line: number,
  row: number,
  cell: number,
): Landing => {
  const initial: CellSearch = { width: 0, found: Option.none() }
  const { found } = Array.reduce(
    rowGlyphs(lineLayout, row),
    initial,
    (search, glyph) => {
      const glyphCells = search.width >= lineLayout.columns ? 0 : glyph.cells
      return Option.isSome(search.found) ||
        cell >= search.width + glyphCells / 2
        ? { ...search, width: search.width + glyphCells }
        : { ...search, found: Option.some(glyph.index) }
    },
  )
  return Option.match(found, {
    onNone: () => rowEnd(lineLayout, line, row),
    onSome: column => ({ caret: { line, column }, atRowEnd: false }),
  })
}

/**
 * The place a click lands on: `row` rows down the screen and `cell` cells from the left of the gutter, both measured
 * by the shell. It is read against the text and scroll the editor has when the click is applied, after every input
 * before it, as Chrome hit-tests a click against the layout of every keystroke before it. Left of the text is the
 * row start, past its end the row end, and below the text, when it ends on screen, the text end.
 */
export const pointAt = (
  buffer: Buffer,
  view: View,
  preedit: string,
  row: number,
  cell: number,
): Landing => {
  const layoutOf = lineLayouts(buffer, preedit, textColumns(buffer, view.size))
  const top = clampTop(buffer, layoutOf, view.top)
  const { top: to, short } = walkBy(
    buffer,
    layoutOf,
    top,
    Math.max(0, Math.min(view.size.rows - 1, Math.floor(row))),
  )
  if (short > 0) {
    return textEdge(buffer, 'End')
  }
  const landing = nearestOnRow(
    layoutOf(to.line),
    to.line,
    to.row,
    cell - gutterWidth(buffer),
  )
  const { line, column } = buffer.caret
  const inPreedit = landing.caret.line === line && preedit !== ''
  return inPreedit && landing.caret.column > column
    ? {
        caret: {
          line,
          column: Math.max(column, landing.caret.column - preedit.length),
        },
        atRowEnd: landing.atRowEnd,
      }
    : landing
}
