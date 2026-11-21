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

const isHighSurrogate = (unit: number): boolean =>
  unit >= 0xd800 && unit <= 0xdbff

const isLowSurrogate = (unit: number): boolean =>
  unit >= 0xdc00 && unit <= 0xdfff

const isInsidePair = (text: string, at: number): boolean =>
  isLowSurrogate(text.charCodeAt(at)) &&
  isHighSurrogate(text.charCodeAt(at - 1))

const codePointBefore = (text: string, at: number): string =>
  text.slice(isInsidePair(text, at - 1) ? at - 2 : at - 1, at)

const zwj = '\u200d'
const isEmoji = /^\p{Emoji}$/u
const isRegionalIndicator = /^\p{Regional_Indicator}$/u
const isVariationSelector = /^[\ufe00-\ufe0f\u{e0100}-\u{e01ef}]$/u
const isNonSpacingMark = /^\p{Mn}$/u
const isEmojiModifier = /^\p{Emoji_Modifier}$/u
const isEmojiModifierBase = /^\p{Emoji_Modifier_Base}$/u
const isKeycapBase = /^[0-9#*]$/
const isTag = /^[\u{e0020}-\u{e007e}]$/u
const cancelTag = '\u{e007f}'
const keycap = '\u20e3'

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

type BackspaceState =
  | 'Start'
  | 'BeforeKeycap'
  | 'BeforeVariationAndKeycap'
  | 'BeforeModifier'
  | 'BeforeVariationAndModifier'
  | 'BeforeVariation'
  | 'BeforeEmoji'
  | 'BeforeZwj'
  | 'BeforeVariationAndZwj'
  | 'OddFlagLetters'
  | 'EvenFlagLetters'
  | 'BeforeCancelTag'
  | 'Done'

type BackspaceStep = Readonly<{
  state: BackspaceState
  units: number
  variation: number
}>

/**
 * Chrome's Backspace state machine: what it deletes, read one code point at a time backwards from the caret.
 * Most code points go alone. Emoji sequences (keycaps, skin tones, variation selectors, ZWJ chains,
 * flag pairs, tag sequences) go whole, but only as far as their parts are well formed.
 */
const backspaceSteps: Readonly<
  Record<BackspaceState, (step: BackspaceStep, point: string) => BackspaceStep>
> = {
  Start: (step, point) => {
    const units = point.length
    const next = (state: BackspaceState): BackspaceStep => ({
      ...step,
      state,
      units,
    })
    return isVariationSelector.test(point)
      ? next('BeforeVariation')
      : isRegionalIndicator.test(point)
        ? next('OddFlagLetters')
        : isEmojiModifier.test(point)
          ? next('BeforeModifier')
          : isEmoji.test(point)
            ? next('BeforeEmoji')
            : point === keycap
              ? next('BeforeKeycap')
              : point === cancelTag
                ? next('BeforeCancelTag')
                : next('Done')
  },
  BeforeKeycap: (step, point) =>
    isVariationSelector.test(point)
      ? { ...step, state: 'BeforeVariationAndKeycap', variation: point.length }
      : {
          ...step,
          state: 'Done',
          units: step.units + (isKeycapBase.test(point) ? point.length : 0),
        },
  BeforeVariationAndKeycap: (step, point) => ({
    ...step,
    state: 'Done',
    units:
      step.units +
      (isKeycapBase.test(point) ? step.variation + point.length : 0),
  }),
  BeforeModifier: (step, point) =>
    isVariationSelector.test(point)
      ? {
          ...step,
          state: 'BeforeVariationAndModifier',
          variation: point.length,
        }
      : isEmojiModifierBase.test(point)
        ? { ...step, state: 'BeforeEmoji', units: step.units + point.length }
        : { ...step, state: 'Done' },
  BeforeVariationAndModifier: (step, point) => ({
    ...step,
    state: 'Done',
    units:
      step.units +
      (isEmojiModifierBase.test(point) ? step.variation + point.length : 0),
  }),
  BeforeVariation: (step, point) =>
    isEmoji.test(point)
      ? { ...step, state: 'BeforeEmoji', units: step.units + point.length }
      : {
          ...step,
          state: 'Done',
          units:
            step.units +
            (isVariationSelector.test(point) || isNonSpacingMark.test(point)
              ? 0
              : point.length),
        },
  BeforeEmoji: (step, point) => ({
    ...step,
    state: point === zwj ? 'BeforeZwj' : 'Done',
  }),
  BeforeZwj: (step, point) =>
    isEmoji.test(point)
      ? {
          ...step,
          state: isEmojiModifier.test(point) ? 'BeforeModifier' : 'BeforeEmoji',
          units: step.units + point.length + zwj.length,
        }
      : isVariationSelector.test(point)
        ? { ...step, state: 'BeforeVariationAndZwj', variation: point.length }
        : { ...step, state: 'Done' },
  BeforeVariationAndZwj: (step, point) =>
    isEmoji.test(point)
      ? {
          state: 'BeforeEmoji',
          units: step.units + point.length + zwj.length + step.variation,
          variation: 0,
        }
      : { ...step, state: 'Done' },
  OddFlagLetters: (step, point) =>
    isRegionalIndicator.test(point)
      ? { ...step, state: 'EvenFlagLetters', units: step.units + point.length }
      : { ...step, state: 'Done' },
  EvenFlagLetters: (step, point) =>
    isRegionalIndicator.test(point)
      ? { ...step, state: 'OddFlagLetters', units: step.units - point.length }
      : { ...step, state: 'Done' },
  BeforeCancelTag: (step, point) =>
    isTag.test(point)
      ? { ...step, units: step.units + point.length }
      : {
          ...step,
          state: 'Done',
          units: step.units + (isEmoji.test(point) ? point.length : 0),
        },
  Done: step => step,
}

/** UTF-16 units Backspace deletes before `at`, reading back no further than `from`. */
const backspaceUnits = (text: string, from: number, at: number): number => {
  let step: BackspaceStep = { state: 'Start', units: 0, variation: 0 }
  let cursor = at
  while (cursor > from && step.state !== 'Done') {
    const point = codePointBefore(text, cursor)
    step = backspaceSteps[step.state](step, point)
    cursor -= point.length
  }
  return step.units
}

/** Where Backspace starts deleting, as Chrome decides it for a text box: what the state machine reads back inside the piece before the caret. */
const backspaceStart = (line: Line, column: number): number =>
  column -
  backspaceUnits(line.text, pieceAt(line, column, 'Before').from, column)

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

/** Where Backspace starts deleting from the caret: back inside the line, or the end of the line above. */
export const backspaceTarget = (buffer: Buffer): Position => {
  const { line, column } = buffer.caret
  if (column > 0) {
    return { line, column: backspaceStart(lineAt(buffer, line), column) }
  }
  return line > 0
    ? { line: line - 1, column: lineAt(buffer, line - 1).text.length }
    : buffer.caret
}

/** The start of the next line, where Delete at a line end erases to, or the caret itself on the last line. */
export const nextLineStart = (buffer: Buffer): Position =>
  buffer.caret.line < buffer.lines.length - 1
    ? { line: buffer.caret.line + 1, column: 0 }
    : buffer.caret

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
