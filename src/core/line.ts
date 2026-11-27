import { Array, Option, Schema } from 'effect'

export const Line = Schema.Struct({
  text: Schema.String,
  caret: Schema.Int,
  preedit: Schema.String,
})
export type Line = typeof Line.Type

export const empty: Line = { text: '', caret: 0, preedit: '' }

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

const boundaries = (text: string): ReadonlyArray<number> => [
  0,
  ...Array.map(
    Array.fromIterable(segmenter.segment(text)),
    ({ index, segment }) => index + segment.length,
  ),
]

const boundaryBefore = (text: string, caret: number): number =>
  Option.getOrElse(
    Array.findLast(boundaries(text), boundary => boundary < caret),
    () => 0,
  )

const boundaryAfter = (text: string, caret: number): number =>
  Option.getOrElse(
    Array.findFirst(boundaries(text), boundary => boundary > caret),
    () => text.length,
  )

export const typeText = (line: Line, text: string): Option.Option<Line> =>
  text === ''
    ? Option.none()
    : Option.some({
        ...line,
        text:
          line.text.slice(0, line.caret) + text + line.text.slice(line.caret),
        caret: line.caret + text.length,
      })

export const erase = (
  line: Line,
  fromCaret: number,
  toCaret: number,
): Option.Option<Line> => {
  const { text, caret } = line
  const clamp = (offset: number) => Math.max(0, Math.min(text.length, offset))
  const start = clamp(caret + Math.min(fromCaret, toCaret))
  const end = clamp(caret + Math.max(fromCaret, toCaret))
  return start === end
    ? Option.none()
    : Option.some({
        ...line,
        text: text.slice(0, start) + text.slice(end),
        caret:
          caret <= start ? caret : caret >= end ? caret - (end - start) : start,
      })
}

export const backspace = (line: Line): Option.Option<Line> =>
  erase(line, boundaryBefore(line.text, line.caret) - line.caret, 0)

export const deleteAfter = (line: Line): Option.Option<Line> =>
  erase(line, 0, boundaryAfter(line.text, line.caret) - line.caret)

export const left = (line: Line): Line => ({
  ...line,
  caret: boundaryBefore(line.text, line.caret),
})

export const right = (line: Line): Line => ({
  ...line,
  caret: boundaryAfter(line.text, line.caret),
})

export const home = (line: Line): Line => ({ ...line, caret: 0 })

export const end = (line: Line): Line => ({ ...line, caret: line.text.length })

export const letterUnderCaret = (line: Line): string =>
  line.text.slice(line.caret, boundaryAfter(line.text, line.caret))
