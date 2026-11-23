import { Array } from 'effect'

import { lengthWithoutTrailingSpaces } from './lines'
import type { LineSlice, Point, Span } from './tree'

export type Held = Readonly<{ slice: LineSlice; text: string }>

export type Content = Readonly<{
  text: string
  lines: ReadonlyArray<LineSlice>
  starts: ReadonlyArray<number>
  ends: ReadonlyArray<number>
}>

export const heldText = ({ slice, text }: Held): string =>
  ' '.repeat(slice.owedSpaces) + text.slice(slice.from, slice.to)

export const contentOf = (held: ReadonlyArray<Held>): Content => {
  const parts = Array.map(held, ({ slice, text }) =>
    text.slice(slice.from, slice.to),
  )
  const [, starts] = Array.mapAccum(
    parts,
    0,
    (start, part): readonly [number, number] => [
      start + part.length + 1,
      start,
    ],
  )
  return {
    text: Array.join(parts, '\n'),
    lines: Array.map(held, ({ slice }) => slice),
    starts,
    ends: Array.map(parts, (part, index) =>
      index === parts.length - 1
        ? (starts[index] ?? 0) + part.length
        : (starts[index] ?? 0) + lengthWithoutTrailingSpaces(part),
    ),
  }
}

export const pointAt = (
  content: Content,
  line: number,
  offset: number,
): Point => {
  const slice = content.lines[line]
  return slice === undefined
    ? { lineInSection: 0, column: 0 }
    : {
        lineInSection: slice.lineInSection,
        column: slice.from + offset - (content.starts[line] ?? 0),
      }
}

const newlinesIn = (text: string): number => text.split('\n').length - 1

export const lineOf = (
  content: Content,
  line: number,
  from: number,
  offset: number,
): number =>
  offset < (content.starts[line + 1] ?? Infinity)
    ? line
    : line + newlinesIn(content.text.slice(from, offset))

export const spanOf = (
  content: Content,
  line: number,
  from: number,
  to: number,
): Span => ({
  from: pointAt(content, line, from),
  to: pointAt(content, lineOf(content, line, from, to), to),
})
