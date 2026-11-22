import { Array, Option } from 'effect'

import type * as Buffer from './buffer'

/** The segmenter runs on the ICU that Chrome ships on every system, so it splits a line as Chrome's text field does. */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

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

const isWordCharacter = (point: string): boolean =>
  point !== '' && !/^[ \t \p{C}]$/u.test(point)

const endsWord = ({ before, after }: Boundary): boolean => {
  if (after === '') {
    return true
  }
  const last = lastPoint(before)
  return isPunctuation(firstPoint(after))
    ? isAlphanumeric(last)
    : isWordCharacter(last)
}

const startsWord = ({ before, after }: Boundary): boolean => {
  const first = firstPoint(after)
  return isPunctuation(first)
    ? !(isPunctuation(firstPoint(before)) && !isAlphanumeric(lastPoint(before)))
    : isWordCharacter(first)
}

const lineText = (buffer: Buffer.Buffer, line: number): string =>
  buffer.lines[line]?.text ?? ''

/**
 * As in Chrome's text field on Linux, from the end of a line Ctrl+Right goes to the start of the next, unless that line
 * starts with a space: then to the end of its first word.
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

export const previousWordStart = (
  buffer: Buffer.Buffer,
): Option.Option<Buffer.Position> => {
  const { line, column } = buffer.caret
  if (column === 0) {
    return line > 0
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
