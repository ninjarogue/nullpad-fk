import { Array, Option, Schema } from 'effect'

export const LineId = Schema.Int.pipe(Schema.brand('LineId'))
export type LineId = typeof LineId.Type

/**
 * As in a Chrome text field, editing never lets a grapheme span a join: the caret can stop on one, and text typed there
 * goes before it.
 */
export const Line = Schema.Struct({
  id: LineId,
  text: Schema.String,
  joins: Schema.Array(Schema.Int),
})
export type Line = typeof Line.Type

export const Position = Schema.Struct({
  line: Schema.Int,
  column: Schema.Int,
})
export type Position = typeof Position.Type

export const Buffer = Schema.Struct({
  lines: Schema.NonEmptyArray(Line),
  caret: Position,
  nextLineId: Schema.Int,
})
export type Buffer = typeof Buffer.Type

export const segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
})

export const graphemeReach = 64

type Piece = Readonly<{ from: number; to: number }>

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

const boundaryBefore = (line: Line, column: number): number => {
  const { from } = pieceAt(line, column, 'Before')
  const grapheme = segmenter
    .segment(line.text.slice(from, column))
    .containing(column - from - 1)
  return from + (grapheme?.index ?? 0)
}

const boundaryAtOrAfter = (line: Line, column: number): number => {
  const { from, to } = pieceAt(line, column, 'After')
  if (column <= from || column >= to) {
    return column
  }
  const start = Math.max(from, column - graphemeReach)
  const end = Math.min(to, column + graphemeReach)
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

export const overwrite = (
  buffer: Buffer,
  { line, column }: Position,
  text: string,
): Buffer => {
  const current = lineAt(buffer, line)
  return {
    ...buffer,
    lines: replaceLines(buffer, line, line, [
      makeLine(
        current.id,
        current.text.slice(0, column) +
          text +
          current.text.slice(column + text.length),
        current.joins,
      ),
    ]),
  }
}

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

export const removeLines = (
  buffer: Buffer,
  first: number,
  last: number,
): Buffer =>
  Array.match(
    [...buffer.lines.slice(0, first), ...buffer.lines.slice(last + 1)],
    {
      onEmpty: () => ({
        lines: [makeLine(LineId.make(buffer.nextLineId), '', [])],
        caret: { line: 0, column: 0 },
        nextLineId: buffer.nextLineId + 1,
      }),
      onNonEmpty: lines => ({
        ...buffer,
        lines,
        caret: { line: Math.min(first, lines.length - 1), column: 0 },
      }),
    },
  )

export const insertLines = (
  buffer: Buffer,
  at: number,
  texts: Array.NonEmptyReadonlyArray<string>,
): Buffer => ({
  lines: Array.prependAll(
    Array.appendAll(
      Array.map(texts, (text, index) =>
        makeLine(LineId.make(buffer.nextLineId + index), text, []),
      ),
      buffer.lines.slice(at),
    ),
    buffer.lines.slice(0, at),
  ),
  caret: { line: at, column: 0 },
  nextLineId: buffer.nextLineId + texts.length,
})

export type Splice = Readonly<{
  at: number
  length: number
  lines: ReadonlyArray<Line>
}>

const argumentsAtOnce = 10_000

const spliceInto = (
  lines: Array<Line>,
  { at, length, lines: into }: Splice,
): Array<Line> => {
  if (into.length > argumentsAtOnce) {
    return [...lines.slice(0, at), ...into, ...lines.slice(at + length)]
  }
  lines.splice(at, length, ...into)
  return lines
}

export const spliceAll = (
  buffer: Buffer,
  splices: ReadonlyArray<Splice>,
): Buffer =>
  Array.match(Array.reduce(splices, buffer.lines.slice(), spliceInto), {
    onEmpty: () => removeLines(buffer, 0, buffer.lines.length - 1),
    onNonEmpty: spliced => ({ ...buffer, lines: spliced }),
  })

export const isBefore = (a: Position, b: Position): boolean =>
  a.line < b.line || (a.line === b.line && a.column < b.column)

/** The caret ends at the earlier position, or after the grapheme the removal joined, as Chrome's does. */
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

export const settle = (buffer: Buffer): Buffer => {
  const { line, column } = buffer.caret
  const settled = boundaryAtOrAfter(lineAt(buffer, line), column)
  return settled === column
    ? buffer
    : { ...buffer, caret: { line, column: settled } }
}

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

export const spanAround = (
  buffer: Buffer,
  fromCaret: number,
  toCaret: number,
): Readonly<{ from: Position; to: Position }> => {
  const { line, column } = buffer.caret
  const { text } = lineAt(buffer, line)
  const clamp = (offset: number) =>
    Math.max(0, Math.min(text.length, column + offset))
  const start = clamp(Math.min(fromCaret, toCaret))
  const end = clamp(Math.max(fromCaret, toCaret))
  return {
    from: {
      line,
      column: start > 0 && isLowSurrogate(text, start) ? start - 1 : start,
    },
    to: { line, column: isLowSurrogate(text, end) ? end + 1 : end },
  }
}

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
 * Chrome holds a caret in the piece before it, or its line's first piece at the line start, and ends an erase in the
 * piece before where it starts, or the line's first piece when it starts at a line start, so Delete on an empty line
 * leaves it. Backspace that joins a line, even an empty one, onto the line above stays in the piece only when that line
 * is empty.
 */
export const keepsCaretPiece = (
  buffer: Buffer,
  from: Position,
  to: Position,
): boolean => {
  const [start, end] = isBefore(to, from) ? [to, from] : [from, to]
  const { caret } = buffer
  if (start.line < caret.line) {
    return start.column === 0
  }
  const held = pieceAt(lineAt(buffer, caret.line), caret.column, 'Before')
  return (
    held.from < start.column ||
    (start.column === 0 && end.line === start.line && end.column < held.to)
  )
}

export const nextLineStart = (buffer: Buffer): Position =>
  buffer.caret.line < buffer.lines.length - 1
    ? { line: buffer.caret.line + 1, column: 0 }
    : buffer.caret

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
