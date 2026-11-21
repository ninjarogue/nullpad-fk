import { Array, Option } from 'effect'

import type * as Buffer from './buffer'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

/**
 * Where two of a line's word segments meet, as Intl.Segmenter splits the line, with the segment on each side. The
 * segmenter runs on the ICU that Chrome ships on every system, so it splits a line as Chrome's text field does. `after`
 * is empty at the line end.
 */
type Boundary = Readonly<{ column: number; before: string; after: string }>

const boundariesOf = (text: string): ReadonlyArray<Boundary> => {
  const segments = Array.fromIterable(segmenter.segment(text))
  return Array.map(segments, ({ index, segment }, at) => ({
    column: index + segment.length,
    before: segment,
    after: segments[at + 1]?.segment ?? '',
  }))
}

const firstPoint = (text: string): string => Array.fromIterable(text)[0] ?? ''

const lastPoint = (text: string): string =>
  Array.fromIterable(text).at(-1) ?? ''

const isAlphanumeric = (point: string): boolean =>
  /^[\p{L}\p{Nd}]$/u.test(point)

const isPunctuation = (point: string): boolean => /^[\p{P}\p{S}]$/u.test(point)

/** Anything drawn but a space, a tab or a no-break space. Chrome reads a control or format character as a space. */
const isWordCharacter = (point: string): boolean =>
  point !== '' && !/^[ \t \p{C}]$/u.test(point)

/**
 * Ctrl+Right stops at the line end, after a word before punctuation, and after anything but a space before a space or
 * a word. A run of punctuation and emoji is one word.
 */
const endsWord = ({ before, after }: Boundary): boolean => {
  if (after === '') {
    return true
  }
  const last = lastPoint(before)
  return isPunctuation(firstPoint(after))
    ? isAlphanumeric(last)
    : isWordCharacter(last)
}

/**
 * Ctrl+Left stops before a word, and before punctuation unless the segment before it starts with punctuation and does
 * not end in a letter or digit, as `_x_` does.
 */
const startsWord = ({ before, after }: Boundary): boolean => {
  const first = firstPoint(after)
  return isPunctuation(first)
    ? !(isPunctuation(firstPoint(before)) && !isAlphanumeric(lastPoint(before)))
    : isWordCharacter(first)
}

const lineText = (buffer: Buffer.Buffer, line: number): string =>
  buffer.lines[line]?.text ?? ''

/**
 * Where Ctrl+Right takes the caret, as in Chrome's text field on Linux: the end of the word, or the end of the line.
 * From the end of a line it goes to the start of the next, unless that line starts with a space: then to the end of its
 * first word. None at the end of the text.
 */
export const nextWordEnd = (
  buffer: Buffer.Buffer,
): Option.Option<Buffer.Position> => {
  const { line, column } = buffer.caret
  const text = lineText(buffer, line)
  const endIn = (index: number, from: number) =>
    Option.map(
      Array.findFirst(
        boundariesOf(lineText(buffer, index)),
        boundary => boundary.column > from && endsWord(boundary),
      ),
      boundary => ({ line: index, column: boundary.column }),
    )
  if (column < text.length) {
    return endIn(line, column)
  }
  if (line === buffer.lines.length - 1) {
    return Option.none()
  }
  const next = lineText(buffer, line + 1)
  return next === '' || isWordCharacter(firstPoint(next))
    ? Option.some({ line: line + 1, column: 0 })
    : endIn(line + 1, 0)
}

/**
 * Where Ctrl+Left takes the caret, as in Chrome's text field on Linux: the start of the word, or the start of the line.
 * Chrome stays at the start of a line, unless the line is empty: then it goes to the end of the line above. None where
 * it stays.
 */
export const previousWordStart = (
  buffer: Buffer.Buffer,
): Option.Option<Buffer.Position> => {
  const { line, column } = buffer.caret
  if (column === 0) {
    return line > 0 && lineText(buffer, line) === ''
      ? Option.some({
          line: line - 1,
          column: lineText(buffer, line - 1).length,
        })
      : Option.none()
  }
  return Option.some({
    line,
    column: Option.match(
      Array.findLast(
        boundariesOf(lineText(buffer, line)),
        boundary => boundary.column < column && startsWord(boundary),
      ),
      { onNone: () => 0, onSome: boundary => boundary.column },
    ),
  })
}
