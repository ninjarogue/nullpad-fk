import { Array } from 'effect'

import * as Buffer from '../buffer'

type Edges = ReadonlyArray<number> | 'OneUnitEach'

const edgesByLine = new WeakMap<Buffer.Line, Edges>()

const oneUnitEach = /^[^\r\u{80}-\u{10FFFF}]*$/u

const cutEdges = ({ text, joins }: Buffer.Line): Edges => {
  if (oneUnitEach.test(text)) {
    return 'OneUnitEach'
  }
  const cuts = [0, ...joins, text.length]
  return [
    ...Array.flatMap(cuts.slice(1), (to, index) => {
      const from = cuts[index] ?? 0
      return Array.map(
        Array.fromIterable(Buffer.segmenter.segment(text.slice(from, to))),
        ({ index: offset }) => from + offset,
      )
    }),
    text.length,
  ]
}

const edgesOf = (line: Buffer.Line): Edges => {
  const known = edgesByLine.get(line)
  if (known !== undefined) {
    return known
  }
  const edges = cutEdges(line)
  edgesByLine.set(line, edges)
  return edges
}

export const cellCount = (line: Buffer.Line): number => {
  const edges = edgesOf(line)
  return edges === 'OneUnitEach' ? line.text.length : edges.length - 1
}

export const cellStart = (line: Buffer.Line, cell: number): number => {
  const edges = edgesOf(line)
  return edges === 'OneUnitEach'
    ? Math.min(cell, line.text.length)
    : (edges[cell] ?? line.text.length)
}

export const cellEnd = (line: Buffer.Line, cell: number): number =>
  cellStart(line, cell + 1)

export const cellText = (line: Buffer.Line, cell: number): string =>
  line.text.slice(cellStart(line, cell), cellEnd(line, cell))

const firstEdgeAfter = (
  edges: ReadonlyArray<number>,
  column: number,
  low: number,
  high: number,
): number => {
  if (low >= high) {
    return low
  }
  const middle = Math.floor((low + high) / 2)
  return (edges[middle] ?? 0) > column
    ? firstEdgeAfter(edges, column, low, middle)
    : firstEdgeAfter(edges, column, middle + 1, high)
}

export const cellAt = (line: Buffer.Line, column: number): number => {
  const edges = edgesOf(line)
  const last = Math.max(0, cellCount(line) - 1)
  return edges === 'OneUnitEach'
    ? Math.min(Math.max(0, column), last)
    : Math.min(firstEdgeAfter(edges, column, 1, edges.length) - 1, last)
}

const wide =
  /^(?:\p{Emoji_Presentation}|.️|[\u{1100}-\u{115F}\u{2E80}-\u{303E}\u{3041}-\u{33FF}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{A000}-\u{A4CF}\u{A960}-\u{A97F}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE10}-\u{FE19}\u{FE30}-\u{FE6F}\u{FF00}-\u{FF60}\u{FFE0}-\u{FFE6}\u{1B000}-\u{1B2FF}\u{20000}-\u{3FFFD}])/u

const tabStop = 8

const widthAt = (text: string, screenColumn: number): number =>
  text === '\t' ? tabStop - (screenColumn % tabStop) : wide.test(text) ? 2 : 1

export const screenColumnOf = (line: Buffer.Line, cell: number): number => {
  let column = 0
  for (let index = 0; index < Math.min(cell, cellCount(line)); index += 1) {
    column += widthAt(cellText(line, index), column)
  }
  return column
}

export const cellAtScreenColumn = (
  line: Buffer.Line,
  wanted: number,
): number => {
  const cells = cellCount(line)
  let column = 0
  let cell = 0
  while (cell < cells - 1) {
    column += widthAt(cellText(line, cell), column)
    if (column > wanted) {
      return cell
    }
    cell += 1
  }
  return cell
}

export type Kind =
  | 'Blank'
  | 'Word'
  | 'Han'
  | 'Hiragana'
  | 'Katakana'
  | 'Hangul'
  | 'Emoji'
  | 'Other'

const kinds: ReadonlyArray<readonly [Kind, RegExp]> = [
  ['Blank', /^\s/u],
  ['Han', /^\p{Script=Han}/u],
  ['Hiragana', /^\p{Script=Hiragana}/u],
  ['Katakana', /^\p{Script=Katakana}/u],
  ['Hangul', /^\p{Script=Hangul}/u],
  ['Word', /^[\p{L}\p{N}\p{M}_]/u],
  ['Emoji', /^\p{Extended_Pictographic}/u],
]

const kindByText = new Map<string, Kind>()

const readKind = (text: string): Kind =>
  kinds.find(([, shape]) => shape.test(text))?.[0] ?? 'Other'

export const kindOf = (text: string): Kind => {
  const known = kindByText.get(text)
  if (known !== undefined) {
    return known
  }
  const kind = readKind(text)
  if (kindByText.size < 4096) {
    kindByText.set(text, kind)
  }
  return kind
}

export const kindAt = (line: Buffer.Line, cell: number): Kind | 'Empty' =>
  cell >= 0 && cell < cellCount(line) ? kindOf(cellText(line, cell)) : 'Empty'
