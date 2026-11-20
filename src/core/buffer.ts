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

/** Motions that need no screen. Moving by visual row, Home and End need the wrap width, so they live in screen.ts. */
export const Motion = Schema.Literals([
  'Left',
  'BackspaceStart',
  'Right',
  'DocumentStart',
  'DocumentEnd',
])
export type Motion = typeof Motion.Type

export type Grapheme = Readonly<{ index: number; segment: string }>

export const segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
})

/** The graphemes of `text[from, to)`, as Intl.Segmenter draws them, with indexes into `text`. */
export const graphemes = (
  text: string,
  from = 0,
  to = text.length,
): ReadonlyArray<Grapheme> =>
  Array.map(
    Array.fromIterable(segmenter.segment(text.slice(from, to))),
    ({ index, segment }) => ({
      index: from + index,
      segment,
    }),
  )

const isHighSurrogate = (unit: number): boolean =>
  unit >= 0xd800 && unit <= 0xdbff

const isLowSurrogate = (unit: number): boolean =>
  unit >= 0xdc00 && unit <= 0xdfff

const isInsidePair = (text: string, at: number): boolean =>
  isLowSurrogate(text.charCodeAt(at)) &&
  isHighSurrogate(text.charCodeAt(at - 1))

const codePointBefore = (text: string, at: number): string =>
  text.slice(isInsidePair(text, at - 1) ? at - 2 : at - 1, at)

const codePointFrom = (text: string, at: number): string =>
  text.slice(at, isHighSurrogate(text.charCodeAt(at)) ? at + 2 : at + 1)

/** Characters with Indic_Syllabic_Category Virama that Chrome joins to a following letter, found by probing Chrome. */
const viramas: ReadonlySet<number> = new Set([
  0x94d, 0x9cd, 0xa4d, 0xacd, 0xb4d, 0xc4d, 0xccd, 0xd4d, 0xdca, 0x1b44, 0xa8c4,
  0xa9c0, 0x11046, 0x110b9, 0x111c0, 0x11235, 0x1134d, 0x11442, 0x114c2,
  0x115bf, 0x1163f, 0x116b6, 0x11c3f,
])

const zwj = '\u200d'
const isEmoji = /^\p{Emoji}$/u
const isOtherLetter = /^\p{Lo}$/u
const isRegionalIndicator = /^\p{Regional_Indicator}$/u
const isVariationSelector = /^[\ufe00-\ufe0f\u{e0100}-\u{e01ef}]$/u
const isNonSpacingMark = /^\p{Mn}$/u
const isEmojiModifier = /^\p{Emoji_Modifier}$/u
const isEmojiModifierBase = /^\p{Emoji_Modifier_Base}$/u
const isKeycapBase = /^[0-9#*]$/
const isTag = /^[\u{e0020}-\u{e007e}]$/u
const cancelTag = '\u{e007f}'
const keycap = '\u20e3'

const pairs = new Map<string, boolean>()

/** Whether Intl.Segmenter keeps two code points, alone in a string, in one grapheme. */
const segmenterJoins = (before: string, after: string): boolean => {
  const pair = before + after
  const known = pairs.get(pair)
  if (known !== undefined) {
    return known
  }
  const joins = segmenter.segment(pair).containing(before.length)?.index === 0
  if (pairs.size >= 4096) {
    pairs.clear()
  }
  pairs.set(pair, joins)
  return joins
}

/**
 * Chrome's editing rule for one pair of code points: Unicode's rules seen two code points at a time, plus
 * ZWJ before any emoji and a virama before any letter, whatever comes before them.
 */
const chromeJoins = (before: string, after: string): boolean =>
  (before === zwj && isEmoji.test(after)) ||
  (viramas.has(before.codePointAt(0) ?? 0) && isOtherLetter.test(after)) ||
  segmenterJoins(before, after)

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

const regionalIndicatorsBefore = (
  text: string,
  from: number,
  at: number,
): number => {
  let count = 0
  let cursor = at
  while (
    cursor > from &&
    isRegionalIndicator.test(codePointBefore(text, cursor))
  ) {
    count += 1
    cursor -= 2
  }
  return count
}

/** Chrome's grapheme boundaries for editing: they never span a join, and a pair of flag letters counts from the piece start. */
const isBoundary = (line: Line, column: number): boolean => {
  const { from, to } = pieceAt(line, column, 'After')
  if (column <= from || column >= to) {
    return true
  }
  const { text } = line
  if (isInsidePair(text, column)) {
    return false
  }
  const before = codePointBefore(text, column)
  const after = codePointFrom(text, column)
  return isRegionalIndicator.test(before) && isRegionalIndicator.test(after)
    ? regionalIndicatorsBefore(text, from, column) % 2 === 0
    : !chromeJoins(before, after)
}

const nextBoundary = (line: Line, column: number): number => {
  let at = column
  do {
    at += codePointFrom(line.text, at).length || 1
  } while (at < line.text.length && !isBoundary(line, at))
  return Math.min(at, line.text.length)
}

const previousBoundary = (line: Line, column: number): number => {
  let at = column
  do {
    at -= codePointBefore(line.text, at).length || 1
  } while (at > 0 && !isBoundary(line, at))
  return Math.max(at, 0)
}

const boundaryAtOrBefore = (line: Line, column: number): number =>
  isBoundary(line, column) ? column : previousBoundary(line, column)

const boundaryAtOrAfter = (line: Line, column: number): number =>
  isBoundary(line, column) ? column : nextBoundary(line, column)

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

/**
 * Where Backspace starts deleting: one grapheme back, or, when that grapheme is longer than one UTF-16 unit,
 * what the state machine reads back inside the piece before the caret.
 */
const backspaceStart = (line: Line, column: number): number => {
  const previous = previousBoundary(line, column)
  return column - previous > 1
    ? column -
        backspaceUnits(line.text, pieceAt(line, column, 'Before').from, column)
    : previous
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

type MotionContext = Readonly<{
  buffer: Buffer
  line: number
  column: number
  current: Line
  lastLine: number
}>

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
    BackspaceStart: context =>
      context.column > 0
        ? {
            line: context.line,
            column: backspaceStart(context.current, context.column),
          }
        : left(context),
    Right: ({ buffer, line, column, current, lastLine }) => {
      if (column < current.text.length) {
        return { line, column: nextBoundary(current, column) }
      }
      return line < lastLine ? { line: line + 1, column: 0 } : buffer.caret
    },
    DocumentStart: () => ({ line: 0, column: 0 }),
    DocumentEnd: ({ buffer, lastLine }) => ({
      line: lastLine,
      column: lineAt(buffer, lastLine).text.length,
    }),
  }

/**
 * Where a motion lands from a settled caret. Backspace is `erase(target(b, 'BackspaceStart'), b.caret)`;
 * vim's `d{motion}` is the same call.
 */
export const target = (buffer: Buffer, motion: Motion): Position =>
  motions[motion]({
    buffer,
    ...buffer.caret,
    current: lineAt(buffer, buffer.caret.line),
    lastLine: buffer.lines.length - 1,
  })

/** The caret moved to the next boundary at or after it, where Chrome starts every command. */
export const settle = (buffer: Buffer): Buffer => {
  const { line, column } = buffer.caret
  const settled = boundaryAtOrAfter(lineAt(buffer, line), column)
  return settled === column
    ? buffer
    : { ...buffer, caret: { line, column: settled } }
}

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
