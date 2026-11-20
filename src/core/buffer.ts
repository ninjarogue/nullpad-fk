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

/** `column` is a UTF-16 offset into the line and always sits on a grapheme boundary or a join. */
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

/**
 * Motions that need no screen. Moving by visual row needs the wrap width, so it lives in screen.ts.
 * BackspaceStart is Left, except that a combining mark before the caret goes alone, as in Chrome.
 */
export const Motion = Schema.Literals([
  'Left',
  'BackspaceStart',
  'Right',
  'LineStart',
  'LineEnd',
  'DocumentStart',
  'DocumentEnd',
])
export type Motion = typeof Motion.Type

export type Grapheme = Readonly<{ index: number; segment: string }>

export const segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
})

export const graphemes = (text: string): ReadonlyArray<Grapheme> =>
  Array.map(
    Array.fromIterable(segmenter.segment(text)),
    ({ index, segment }) => ({
      index,
      segment,
    }),
  )

/** The grapheme around a column, found by segmenting only the text between the joins around it. None at the end of the text. */
const graphemeAt = (
  { text, joins }: Line,
  column: number,
): Option.Option<Grapheme> => {
  const start = Option.getOrElse(
    Array.findLast(joins, join => join <= column),
    () => 0,
  )
  const end = Option.getOrElse(
    Array.findFirst(joins, join => join > column),
    () => text.length,
  )
  return Option.map(
    Option.fromUndefinedOr(
      segmenter.segment(text.slice(start, end)).containing(column - start),
    ),
    ({ index, segment }) => ({ index: start + index, segment }),
  )
}

const previousBoundary = (line: Line, column: number): number =>
  column <= 0
    ? 0
    : Option.match(graphemeAt(line, column - 1), {
        onNone: () => line.text.length,
        onSome: ({ index }) => index,
      })

const nextBoundary = (line: Line, column: number): number =>
  Option.match(graphemeAt(line, column), {
    onNone: () => line.text.length,
    onSome: ({ index, segment }) => index + segment.length,
  })

const boundaryAtOrBefore = (line: Line, column: number): number =>
  Option.match(graphemeAt(line, column), {
    onNone: () => line.text.length,
    onSome: ({ index }) => index,
  })

const boundaryAtOrAfter = (line: Line, column: number): number =>
  Option.match(graphemeAt(line, column), {
    onNone: () => line.text.length,
    onSome: ({ index, segment }) =>
      index === column ? column : index + segment.length,
  })

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
 * Inserts at the caret, before a join there. A line break splits the line. The caret ends after the inserted text,
 * or after the grapheme it joined with (🇺 typed before 🇸 makes one flag).
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
      column: boundaryAtOrAfter(
        Array.lastNonEmpty(replacement),
        (added === 0 ? column : 0) + lastPart.length,
      ),
    },
    nextLineId: buffer.nextLineId + added,
  }
}

const isBefore = (a: Position, b: Position): boolean =>
  a.line < b.line || (a.line === b.line && a.column < b.column)

/**
 * Removes the text between two positions, in either order. Removing a line break leaves a join where it was.
 * The caret ends at the earlier position, or after the grapheme the removal joined.
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

type MotionContext = Readonly<{
  buffer: Buffer
  line: number
  column: number
  current: Line
  lastLine: number
}>

const combiningMarkOutsideEmoji =
  /(?![\u20e3\ufe00-\ufe0f\u{e0100}-\u{e01ef}])\p{M}$/u

const left = ({ buffer, line, column, current }: MotionContext): Position => {
  if (column > 0) {
    return { line, column: previousBoundary(current, column) }
  }
  return line > 0
    ? { line: line - 1, column: lineAt(buffer, line - 1).text.length }
    : buffer.caret
}

const motions: Readonly<Record<Motion, (context: MotionContext) => Position>> =
  {
    Left: left,
    BackspaceStart: context => {
      const { line, column, current } = context
      const mark = combiningMarkOutsideEmoji.exec(
        current.text.slice(Math.max(0, column - 2), column),
      )
      return mark === null
        ? left(context)
        : { line, column: column - mark[0].length }
    },
    Right: ({ buffer, line, column, current, lastLine }) => {
      if (column < current.text.length) {
        return { line, column: nextBoundary(current, column) }
      }
      return line < lastLine ? { line: line + 1, column: 0 } : buffer.caret
    },
    LineStart: ({ line }) => ({ line, column: 0 }),
    LineEnd: ({ line, current }) => ({ line, column: current.text.length }),
    DocumentStart: () => ({ line: 0, column: 0 }),
    DocumentEnd: ({ buffer, lastLine }) => ({
      line: lastLine,
      column: lineAt(buffer, lastLine).text.length,
    }),
  }

/** Where a motion lands from the caret. Backspace is `erase(target(b, 'BackspaceStart'), b.caret)`; vim's `d{motion}` is the same call. */
export const target = (buffer: Buffer, motion: Motion): Position =>
  motions[motion]({
    buffer,
    ...buffer.caret,
    current: lineAt(buffer, buffer.caret.line),
    lastLine: buffer.lines.length - 1,
  })

/** Moves the caret, clamped into the text and onto a grapheme boundary. */
export const moveTo = (buffer: Buffer, position: Position): Buffer => {
  const line = Math.max(0, Math.min(buffer.lines.length - 1, position.line))
  const current = lineAt(buffer, line)
  const column = boundaryAtOrBefore(
    current,
    Math.max(0, Math.min(current.text.length, position.column)),
  )
  return { ...buffer, caret: { line, column } }
}

/** The index of the line with this id. None when the id is unknown or no longer in the text. */
export const indexOf = (
  buffer: Buffer,
  lineId: number,
): Option.Option<number> =>
  Array.findFirstIndex(buffer.lines, line => line.id === lineId)
