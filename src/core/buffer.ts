import { Array, Option, Schema } from 'effect'

export const LineId = Schema.Number.pipe(Schema.brand('LineId'))
export type LineId = typeof LineId.Type

export const Line = Schema.Struct({ id: LineId, text: Schema.String })
export type Line = typeof Line.Type

/** `column` is a UTF-16 offset into the line and always sits on a grapheme boundary. */
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

/** Motions that need no screen. Moving by visual row needs the wrap width, so it lives in screen.ts. */
export const Motion = Schema.Literals([
  'Left',
  'Right',
  'LineStart',
  'LineEnd',
  'DocumentStart',
  'DocumentEnd',
])
export type Motion = typeof Motion.Type

export type Grapheme = Readonly<{ index: number; segment: string }>

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export const graphemes = (text: string): ReadonlyArray<Grapheme> =>
  Array.map(
    Array.fromIterable(segmenter.segment(text)),
    ({ index, segment }) => ({
      index,
      segment,
    }),
  )

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
  Array.prependAll(
    Array.appendAll(replacement, buffer.lines.slice(to + 1)),
    buffer.lines.slice(0, from),
  )

export const fromText = (text: string): Buffer => {
  const lines = splitLines(text)
  return {
    lines: Array.map(lines, (text, index) => ({
      id: LineId.make(index),
      text,
    })),
    caret: { line: 0, column: 0 },
    nextLineId: lines.length,
  }
}

export const toText = (buffer: Buffer): string =>
  Array.join(
    Array.map(buffer.lines, line => line.text),
    '\n',
  )

/** Inserts at the caret. A line break splits the line. The caret ends after the inserted text. */
export const insert = (buffer: Buffer, text: string): Buffer => {
  const { line, column } = buffer.caret
  const current = lineAt(buffer, line)
  const before = current.text.slice(0, column)
  const after = current.text.slice(column)
  const parts = splitLines(text)
  const lastPart = Array.lastNonEmpty(parts)
  const added = parts.length - 1
  const replacement = Array.map(parts, (part, index) => ({
    id: index === 0 ? current.id : LineId.make(buffer.nextLineId + index - 1),
    text: (index === 0 ? before : '') + part + (index === added ? after : ''),
  }))
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

/** Removes the text between two positions, in either order. The caret ends at the earlier one. */
export const erase = (buffer: Buffer, from: Position, to: Position): Buffer => {
  const [start, end] = isBefore(to, from) ? [to, from] : [from, to]
  const first = lineAt(buffer, start.line)
  const joined = {
    id: first.id,
    text:
      first.text.slice(0, start.column) +
      lineAt(buffer, end.line).text.slice(end.column),
  }
  return {
    ...buffer,
    lines: replaceLines(buffer, start.line, end.line, [joined]),
    caret: start,
  }
}

const boundaries = (text: string): ReadonlyArray<number> =>
  Array.append(
    Array.map(graphemes(text), ({ index }) => index),
    text.length,
  )

const previousBoundary = (text: string, column: number): number =>
  Option.getOrElse(
    Array.findLast(boundaries(text), at => at < column),
    () => 0,
  )

const nextBoundary = (text: string, column: number): number =>
  Option.getOrElse(
    Array.findFirst(boundaries(text), at => at > column),
    () => text.length,
  )

const boundaryAtOrBefore = (text: string, column: number): number =>
  Option.getOrElse(
    Array.findLast(boundaries(text), at => at <= column),
    () => 0,
  )

type MotionContext = Readonly<{
  buffer: Buffer
  line: number
  column: number
  text: string
  lastLine: number
}>

const motions: Readonly<Record<Motion, (context: MotionContext) => Position>> =
  {
    Left: ({ buffer, line, column, text }) => {
      if (column > 0) {
        return { line, column: previousBoundary(text, column) }
      }
      return line > 0
        ? { line: line - 1, column: lineAt(buffer, line - 1).text.length }
        : buffer.caret
    },
    Right: ({ buffer, line, column, text, lastLine }) => {
      if (column < text.length) {
        return { line, column: nextBoundary(text, column) }
      }
      return line < lastLine ? { line: line + 1, column: 0 } : buffer.caret
    },
    LineStart: ({ line }) => ({ line, column: 0 }),
    LineEnd: ({ line, text }) => ({ line, column: text.length }),
    DocumentStart: () => ({ line: 0, column: 0 }),
    DocumentEnd: ({ buffer, lastLine }) => ({
      line: lastLine,
      column: lineAt(buffer, lastLine).text.length,
    }),
  }

/** Where a motion lands from the caret. Backspace is `erase(target(b, 'Left'), b.caret)`; vim's `d{motion}` is the same call. */
export const target = (buffer: Buffer, motion: Motion): Position =>
  motions[motion]({
    buffer,
    ...buffer.caret,
    text: lineAt(buffer, buffer.caret.line).text,
    lastLine: buffer.lines.length - 1,
  })

/** Moves the caret, clamped into the text and onto a grapheme boundary. */
export const moveTo = (buffer: Buffer, position: Position): Buffer => {
  const line = Math.max(0, Math.min(buffer.lines.length - 1, position.line))
  const text = lineAt(buffer, line).text
  const column = boundaryAtOrBefore(
    text,
    Math.max(0, Math.min(text.length, position.column)),
  )
  return { ...buffer, caret: { line, column } }
}

/** The index of the line with this id. None when the id is unknown or no longer in the text. */
export const indexOf = (
  buffer: Buffer,
  lineId: number,
): Option.Option<number> =>
  Array.findFirstIndex(buffer.lines, line => line.id === lineId)
