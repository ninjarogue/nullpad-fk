import { Schema } from 'effect'

import type * as Buffer from '../buffer'
import {
  cellAt,
  cellAtScreenColumn,
  cellCount,
  cellEnd,
  cellStart,
  kindAt,
  screenColumnOf,
} from './cells'

export const Want = Schema.Union([
  Schema.Int,
  Schema.Literals(['End', 'Unset']),
])
export type Want = typeof Want.Type

export type Spot = Readonly<{ line: number; cell: number }>

export type Moved = Readonly<{ spot: Spot; want: Want }>

export type Motion = (
  buffer: Buffer.Buffer,
  from: Spot,
  count: number | undefined,
  want: Want,
) => Moved

const lineOf = (buffer: Buffer.Buffer, line: number): Buffer.Line =>
  buffer.lines[line] ?? buffer.lines[0]

const cellsIn = (buffer: Buffer.Buffer, line: number): number =>
  cellCount(lineOf(buffer, line))

const lastCell = (buffer: Buffer.Buffer, line: number): number =>
  Math.max(0, cellsIn(buffer, line) - 1)

const lastLine = (buffer: Buffer.Buffer): number => buffer.lines.length - 1

const kindOfSpot = (buffer: Buffer.Buffer, { line, cell }: Spot) =>
  kindAt(lineOf(buffer, line), cell)

export const spotOf = (buffer: Buffer.Buffer): Spot => ({
  line: buffer.caret.line,
  cell: cellAt(lineOf(buffer, buffer.caret.line), buffer.caret.column),
})

export const positionOf = (
  buffer: Buffer.Buffer,
  spot: Spot,
): Buffer.Position => ({
  line: spot.line,
  column: cellStart(lineOf(buffer, spot.line), spot.cell),
})

export const endOf = (buffer: Buffer.Buffer, spot: Spot): Buffer.Position => ({
  line: spot.line,
  column: cellEnd(lineOf(buffer, spot.line), spot.cell),
})

const free = (spot: Spot): Moved => ({ spot, want: 'Unset' })

const firstNonBlank = (buffer: Buffer.Buffer, line: number): number => {
  const cells = cellsIn(buffer, line)
  let cell = 0
  while (cell < cells && kindOfSpot(buffer, { line, cell }) === 'Blank') {
    cell += 1
  }
  return Math.min(cell, lastCell(buffer, line))
}

const vertical =
  (direction: -1 | 1): Motion =>
  (buffer, from, count = 1, want) => {
    const line = Math.max(
      0,
      Math.min(lastLine(buffer), from.line + direction * count),
    )
    const kept =
      want === 'Unset'
        ? screenColumnOf(lineOf(buffer, from.line), from.cell)
        : want
    return {
      spot: {
        line,
        cell:
          kept === 'End'
            ? lastCell(buffer, line)
            : cellAtScreenColumn(lineOf(buffer, line), kept),
      },
      want: kept,
    }
  }

const repeated =
  (once: (buffer: Buffer.Buffer, from: Spot) => Spot): Motion =>
  (buffer, from, count = 1) => {
    let spot = from
    for (let left = count; left > 0; left -= 1) {
      const next = once(buffer, spot)
      if (next.line === spot.line && next.cell === spot.cell) {
        break
      }
      spot = next
    }
    return free(spot)
  }

const wordForward = (buffer: Buffer.Buffer, from: Spot): Spot => {
  const kind = kindOfSpot(buffer, from)
  let { line, cell } = from
  if (kind === 'Empty') {
    cell = 1
  } else if (kind !== 'Blank') {
    while (kindOfSpot(buffer, { line, cell }) === kind) {
      cell += 1
    }
  }
  for (;;) {
    if (cell >= cellsIn(buffer, line)) {
      if (line === lastLine(buffer)) {
        return { line, cell: lastCell(buffer, line) }
      }
      line += 1
      cell = 0
      if (cellsIn(buffer, line) === 0) {
        return { line, cell }
      }
    } else if (kindOfSpot(buffer, { line, cell }) === 'Blank') {
      cell += 1
    } else {
      return { line, cell }
    }
  }
}

const wordEnd = (buffer: Buffer.Buffer, from: Spot): Spot => {
  let { line, cell } = from
  cell += 1
  for (;;) {
    if (cell >= cellsIn(buffer, line)) {
      if (line === lastLine(buffer)) {
        return { line, cell: lastCell(buffer, line) }
      }
      line += 1
      cell = 0
    } else if (kindOfSpot(buffer, { line, cell }) === 'Blank') {
      cell += 1
    } else {
      break
    }
  }
  const kind = kindOfSpot(buffer, { line, cell })
  while (kindOfSpot(buffer, { line, cell: cell + 1 }) === kind) {
    cell += 1
  }
  return { line, cell }
}

const wordBackward = (buffer: Buffer.Buffer, from: Spot): Spot => {
  let { line, cell } = from
  cell -= 1
  for (;;) {
    if (cell < 0) {
      if (line === 0) {
        return { line, cell: 0 }
      }
      line -= 1
      cell = cellsIn(buffer, line) - 1
      if (cell < 0) {
        return { line, cell: 0 }
      }
    } else if (kindOfSpot(buffer, { line, cell }) === 'Blank') {
      cell -= 1
    } else {
      break
    }
  }
  const kind = kindOfSpot(buffer, { line, cell })
  while (cell > 0 && kindOfSpot(buffer, { line, cell: cell - 1 }) === kind) {
    cell -= 1
  }
  return { line, cell }
}

const toLine =
  (fallback: 'First' | 'Last'): Motion =>
  (buffer, _from, count) => {
    const wanted =
      count === undefined
        ? fallback === 'First'
          ? 0
          : lastLine(buffer)
        : count - 1
    const line = Math.max(0, Math.min(lastLine(buffer), wanted))
    return free({ line, cell: firstNonBlank(buffer, line) })
  }

export const MotionName = Schema.Literals([
  'Left',
  'Right',
  'Down',
  'Up',
  'WordForward',
  'WordBackward',
  'WordEnd',
  'LineStart',
  'FirstNonBlank',
  'LineEnd',
  'FirstLine',
  'LastLine',
])
export type MotionName = typeof MotionName.Type

export const motions: Readonly<Record<MotionName, Motion>> = {
  Left: (_buffer, from, count = 1) =>
    free({ ...from, cell: Math.max(0, from.cell - count) }),
  Right: (buffer, from, count = 1) =>
    free({
      ...from,
      cell: Math.min(lastCell(buffer, from.line), from.cell + count),
    }),
  Down: vertical(1),
  Up: vertical(-1),
  WordForward: repeated(wordForward),
  WordBackward: repeated(wordBackward),
  WordEnd: repeated(wordEnd),
  LineStart: (_buffer, from) => free({ ...from, cell: 0 }),
  FirstNonBlank: (buffer, from) =>
    free({ ...from, cell: firstNonBlank(buffer, from.line) }),
  LineEnd: (buffer, from, count = 1) => {
    const line = Math.min(lastLine(buffer), from.line + count - 1)
    return { spot: { line, cell: lastCell(buffer, line) }, want: 'End' }
  },
  FirstLine: toLine('First'),
  LastLine: toLine('Last'),
}
