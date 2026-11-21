import { Array, Option, Schema } from 'effect'

export const LineId = Schema.Number.pipe(Schema.brand('LineId'))
export type LineId = typeof LineId.Type

/**
 * `joins` are the columns where an erase joined this line and the next, ascending and strictly inside the text.
 * As in a Chrome text field, editing never lets a grapheme span a join: the caret can stop on one,
 * and text typed there goes before it. The screen still draws the line whole.
 */
export const Line = Schema.Struct({
  id: LineId,
  text: Schema.String,
  joins: Schema.Array(Schema.Number),
})
export type Line = typeof Line.Type

/**
 * `column` is a UTF-16 offset into the line, never inside a surrogate pair. After text inserted without a keypress
 * it may sit inside a grapheme, where Chrome leaves its caret; `settle` moves it to the next boundary before any
 * command runs.
 */
export const Position = Schema.Struct({
  line: Schema.Number,
  column: Schema.Number,
})
export type Position = typeof Position.Type

/**
 * The text and the caret. Only the functions in this file build one, and they keep:
 * at least one line, no line break inside a line, the caret inside the text, ids unique and never reused.
 * An edit replaces only the Line objects it touches, so `id` is a stable render key.
 */
export const Buffer = Schema.Struct({
  lines: Schema.NonEmptyArray(Line),
  caret: Position,
  nextLineId: Schema.Number,
})
export type Buffer = typeof Buffer.Type

export const segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
})

type Piece = Readonly<{ from: number; to: number }>

/** The text between the joins around a column. `side` picks the piece before or after a join that sits on it. */
const pieceAt = (
  { text, joins }: Line,
  column: number,
  side: 'Before' | 'After',
): Piece => ({
  from: Option.getOrElse(
    Array.findLast(joins, join =>
      side === 'After' ? join <= column : join < column,
    ),
    () => 0,
  ),
  to: Option.getOrElse(
    Array.findFirst(joins, join =>
      side === 'After' ? join > column : join >= column,
    ),
    () => text.length,
  ),
})

/**
 * The grapheme boundary before `column` inside the piece before it, as Intl.Segmenter finds them: where Backspace
 * starts deleting, so it takes a whole letter, accent, conjunct or jamo syllable, never one code point of it. The
 * piece is segmented from its start, so a flag pair or a long run of marks is read whole.
 */
const boundaryBefore = (line: Line, column: number): number => {
  const { from } = pieceAt(line, column, 'Before')
  const grapheme = segmenter
    .segment(line.text.slice(from, column))
    .containing(column - from - 1)
  return from + (grapheme?.index ?? 0)
}

/**
 * The next grapheme boundary at or after `column` inside its piece, as Intl.Segmenter finds them. Only the text near
 * the column is segmented, so a long line costs nothing.
 */
const boundaryAtOrAfter = (line: Line, column: number): number => {
  const { from, to } = pieceAt(line, column, 'After')
  if (column <= from || column >= to) {
    return column
  }
  const start = Math.max(from, column - 64)
  const end = Math.min(to, column + 64)
  const grapheme = segmenter
    .segment(line.text.slice(start, end))
    .containing(column - start)
  return grapheme === undefined || grapheme.index + start === column
    ? column
    : Math.min(end, start + grapheme.index + grapheme.segment.length)
}

const makeLine = (
  id: LineId,
  text: string,
  joins: ReadonlyArray<number>,
): Line => ({
  id,
  text,
  joins: Array.dedupeAdjacent(
    Array.filter(joins, join => join > 0 && join < text.length),
  ),
})

const splitLines = (text: string): Array.NonEmptyReadonlyArray<string> => {
  const [first = '', ...rest] = text.split(/\r\n|\r|\n/)
  return [first, ...rest]
}

const lineAt = (buffer: Buffer, index: number): Line =>
  buffer.lines[index] ?? buffer.lines[0]

/** Typing replaces one line with one line, so that case copies the line array once instead of three times. */
const replaceLines = (
  buffer: Buffer,
  from: number,
  to: number,
  replacement: Array.NonEmptyReadonlyArray<Line>,
): Array.NonEmptyReadonlyArray<Line> =>
  from === to && replacement.length === 1
    ? Option.getOrElse(
        Array.replace(buffer.lines, from, replacement[0]),
        () => buffer.lines,
      )
    : Array.prependAll(
        Array.appendAll(replacement, buffer.lines.slice(to + 1)),
        buffer.lines.slice(0, from),
      )

export const fromText = (text: string): Buffer => {
  const lines = splitLines(text)
  return {
    lines: Array.map(lines, (text, index) =>
      makeLine(LineId.make(index), text, []),
    ),
    caret: { line: 0, column: 0 },
    nextLineId: lines.length,
  }
}

export const toText = (buffer: Buffer): string =>
  Array.join(
    Array.map(buffer.lines, line => line.text),
    '\n',
  )

/**
 * Inserts at the caret, before a join there. A line break splits the line. The caret ends right after the inserted
 * text, even inside a grapheme it made (🇺 typed before 🇸), as Chrome's does.
 */
export const insert = (buffer: Buffer, text: string): Buffer => {
  const { line, column } = buffer.caret
  const current = lineAt(buffer, line)
  const before = current.text.slice(0, column)
  const after = current.text.slice(column)
  const parts = splitLines(text)
  const lastPart = Array.lastNonEmpty(parts)
  const added = parts.length - 1
  const replacement = Array.map(parts, (part, index) => {
    const head = (index === 0 ? before : '') + part
    return makeLine(
      index === 0 ? current.id : LineId.make(buffer.nextLineId + index - 1),
      head + (index === added ? after : ''),
      [
        ...(index === 0
          ? Array.filter(current.joins, join => join < column)
          : []),
        ...(index === added
          ? Array.map(
              Array.filter(current.joins, join => join >= column),
              join => join - column + head.length,
            )
          : []),
      ],
    )
  })
  return {
    lines: replaceLines(buffer, line, line, replacement),
    caret: {
      line: line + added,
      column: (added === 0 ? column : 0) + lastPart.length,
    },
    nextLineId: buffer.nextLineId + added,
  }
}

const isBefore = (a: Position, b: Position): boolean =>
  a.line < b.line || (a.line === b.line && a.column < b.column)

/**
 * Removes the text between two positions, in either order. Removing a line break leaves a join where it was.
 * The caret ends at the earlier position, or after the grapheme the removal joined, as Chrome's does.
 */
export const erase = (buffer: Buffer, from: Position, to: Position): Buffer => {
  const [start, end] = isBefore(to, from) ? [to, from] : [from, to]
  const first = lineAt(buffer, start.line)
  const last = lineAt(buffer, end.line)
  const joined = makeLine(
    first.id,
    first.text.slice(0, start.column) + last.text.slice(end.column),
    [
      ...Array.filter(first.joins, join => join <= start.column),
      ...(start.line < end.line ? [start.column] : []),
      ...Array.map(
        Array.filter(last.joins, join => join >= end.column),
        join => join - end.column + start.column,
      ),
    ],
  )
  return {
    ...buffer,
    lines: replaceLines(buffer, start.line, end.line, [joined]),
    caret: {
      line: start.line,
      column: boundaryAtOrAfter(joined, start.column),
    },
  }
}

/** The caret moved to the next boundary at or after it, where Chrome starts every command. */
export const settle = (buffer: Buffer): Buffer => {
  const { line, column } = buffer.caret
  const settled = boundaryAtOrAfter(lineAt(buffer, line), column)
  return settled === column
    ? buffer
    : { ...buffer, caret: { line, column: settled } }
}

/** Moves the caret, clamped into the text. */
export const moveTo = (buffer: Buffer, position: Position): Buffer => {
  const line = Math.max(0, Math.min(buffer.lines.length - 1, position.line))
  const column = Math.max(
    0,
    Math.min(lineAt(buffer, line).text.length, position.column),
  )
  return { ...buffer, caret: { line, column } }
}

const isLowSurrogate = (text: string, index: number): boolean => {
  const unit = text.charCodeAt(index)
  return unit >= 0xdc00 && unit <= 0xdfff
}

/**
 * The span of the caret's line from `from` to `to` UTF-16 units away from the caret, negative before it, clamped to
 * the line and widened so it never cuts a surrogate pair.
 */
export const spanAround = (
  buffer: Buffer,
  from: number,
  to: number,
): Readonly<{ from: Position; to: Position }> => {
  const { line, column } = buffer.caret
  const { text } = lineAt(buffer, line)
  const clamp = (offset: number) =>
    Math.max(0, Math.min(text.length, column + offset))
  const start = clamp(Math.min(from, to))
  const end = clamp(Math.max(from, to))
  return {
    from: {
      line,
      column: start > 0 && isLowSurrogate(text, start) ? start - 1 : start,
    },
    to: { line, column: isLowSurrogate(text, end) ? end + 1 : end },
  }
}

/** Where Backspace starts deleting from the caret: the start of the letter before it, or the end of the line above. */
export const backspaceTarget = (buffer: Buffer): Position => {
  const { line, column } = buffer.caret
  if (column > 0) {
    return { line, column: boundaryBefore(lineAt(buffer, line), column) }
  }
  return line > 0
    ? { line: line - 1, column: lineAt(buffer, line - 1).text.length }
    : buffer.caret
}

/**
 * Whether erasing from `from` to `to` leaves the caret in the piece that holds it. Chrome holds a caret in the piece
 * before it, or its line's first piece at the line start, and in none on an empty line, and ends an erase in the piece
 * before where it starts, or the line's first piece when it starts at a line start.
 */
export const keepsCaretPiece = (
  buffer: Buffer,
  from: Position,
  to: Position,
): boolean => {
  const [start, end] = isBefore(to, from) ? [to, from] : [from, to]
  const { caret } = buffer
  const line = lineAt(buffer, caret.line)
  if (line.text.length === 0) {
    return false
  }
  if (start.line < caret.line) {
    return start.column === 0
  }
  const held = pieceAt(line, caret.column, 'Before')
  return (
    held.from < start.column ||
    (start.column === 0 && end.line === start.line && end.column < held.to)
  )
}

/** The start of the next line, where Delete at a line end erases to, or the caret itself on the last line. */
export const nextLineStart = (buffer: Buffer): Position =>
  buffer.caret.line < buffer.lines.length - 1
    ? { line: buffer.caret.line + 1, column: 0 }
    : buffer.caret

/** Whether the caret sits strictly inside a piece of its line: not at the line's start or end, nor on a join. */
export const isInsidePiece = (buffer: Buffer): boolean => {
  const { line, column } = buffer.caret
  const { text, joins } = lineAt(buffer, line)
  return column > 0 && column < text.length && !joins.includes(column)
}

export const lineEnd = (buffer: Buffer, line: number): number =>
  lineAt(buffer, line).text.length

export const documentEnd = (buffer: Buffer): Position => {
  const line = buffer.lines.length - 1
  return { line, column: lineEnd(buffer, line) }
}

/** The line's text split at its joins, each piece drawn as its own text node so the browser keeps them apart. */
export const pieces = ({ text, joins }: Line): ReadonlyArray<string> =>
  Array.map(Array.zip([0, ...joins], [...joins, text.length]), ([from, to]) =>
    text.slice(from, to),
  )
