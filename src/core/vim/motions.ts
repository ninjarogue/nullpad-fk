import { Schema } from 'effect'

import type * as Buffer from '../buffer'
import {
  type Kind,
  caretColumnOf,
  cellAt,
  cellAtScreenColumn,
  cellCount,
  cellEnd,
  cellStart,
  kindAt,
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

export const cellsIn = (buffer: Buffer.Buffer, line: number): number =>
  cellCount(lineOf(buffer, line))

const lastCell = (buffer: Buffer.Buffer, line: number): number =>
  Math.max(0, cellsIn(buffer, line) - 1)

export const lastLine = (buffer: Buffer.Buffer): number =>
  buffer.lines.length - 1

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

export const firstFilled = (buffer: Buffer.Buffer, line: number): number => {
  const cells = cellsIn(buffer, line)
  let cell = 0
  while (cell < cells && kindOfSpot(buffer, { line, cell }) === 'Blank') {
    cell += 1
  }
  return cell
}

export const firstNonBlank = (buffer: Buffer.Buffer, line: number): number =>
  Math.min(firstFilled(buffer, line), lastCell(buffer, line))

const vertical =
  (direction: -1 | 1): Motion =>
  (buffer, from, count = 1, want) => {
    const line = Math.max(
      0,
      Math.min(lastLine(buffer), from.line + direction * count),
    )
    const kept =
      want === 'Unset'
        ? caretColumnOf(lineOf(buffer, from.line), from.cell)
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

const lineCounted = (
  buffer: Buffer.Buffer,
  count: number | undefined,
  fallback: 'First' | 'Last',
): number => {
  const wanted =
    count === undefined
      ? fallback === 'First'
        ? 0
        : lastLine(buffer)
      : count - 1
  return Math.max(0, Math.min(lastLine(buffer), wanted))
}

const toLine =
  (fallback: 'First' | 'Last'): Motion =>
  (buffer, _from, count) => {
    const line = lineCounted(buffer, count, fallback)
    return free({ line, cell: firstNonBlank(buffer, line) })
  }

const forwardAcrossLines = (buffer: Buffer.Buffer, from: Spot): Spot =>
  from.cell + 1 < cellsIn(buffer, from.line)
    ? { ...from, cell: from.cell + 1 }
    : from.line < lastLine(buffer)
      ? { line: from.line + 1, cell: 0 }
      : from

const backwardAcrossLines = (buffer: Buffer.Buffer, from: Spot): Spot =>
  from.cell > 0
    ? { ...from, cell: from.cell - 1 }
    : from.line > 0
      ? { line: from.line - 1, cell: lastCell(buffer, from.line - 1) }
      : from

export const MotionName = Schema.Literals([
  'Left',
  'Right',
  'LeftAcrossLines',
  'RightAcrossLines',
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
  'LastLineEnd',
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
  LeftAcrossLines: repeated(backwardAcrossLines),
  RightAcrossLines: repeated(forwardAcrossLines),
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
  LastLineEnd: (buffer, _from, count) => {
    const line = lineCounted(buffer, count, 'Last')
    return { spot: { line, cell: lastCell(buffer, line) }, want: 'End' }
  },
}

export const motionFails = (
  name: MotionName,
  buffer: Buffer.Buffer,
  from: Spot,
  count: number | undefined,
): boolean =>
  name === 'Down'
    ? from.line === lastLine(buffer)
    : name === 'Up'
      ? from.line === 0
      : name === 'LineEnd' && (count ?? 1) > 1 && from.line === lastLine(buffer)

export type Crossing = 'Stuck' | 'InLine' | 'OtherLine' | 'OntoLineEnd'

export type Stepped = Readonly<{ spot: Spot; crossing: Crossing }>

export const inc = (buffer: Buffer.Buffer, { line, cell }: Spot): Stepped => {
  const cells = cellsIn(buffer, line)
  return cell < cells
    ? cell + 1 < cells
      ? { spot: { line, cell: cell + 1 }, crossing: 'InLine' }
      : { spot: { line, cell: cells }, crossing: 'OntoLineEnd' }
    : line < lastLine(buffer)
      ? { spot: { line: line + 1, cell: 0 }, crossing: 'OtherLine' }
      : { spot: { line, cell }, crossing: 'Stuck' }
}

export const dec = (buffer: Buffer.Buffer, { line, cell }: Spot): Stepped =>
  cell > 0
    ? { spot: { line, cell: cell - 1 }, crossing: 'InLine' }
    : line > 0
      ? {
          spot: { line: line - 1, cell: cellsIn(buffer, line - 1) },
          crossing: 'OtherLine',
        }
      : { spot: { line, cell }, crossing: 'Stuck' }

export const incl = (buffer: Buffer.Buffer, spot: Spot): Stepped => {
  const stepped = inc(buffer, spot)
  return stepped.crossing !== 'InLine' &&
    stepped.crossing !== 'Stuck' &&
    stepped.spot.cell > 0
    ? inc(buffer, stepped.spot)
    : stepped
}

export const decl = (buffer: Buffer.Buffer, spot: Spot): Stepped => {
  const stepped = dec(buffer, spot)
  return stepped.crossing === 'OtherLine' && stepped.spot.cell > 0
    ? dec(buffer, stepped.spot)
    : stepped
}

export type WordClass = Kind | 'Filled'

export const classAt = (
  buffer: Buffer.Buffer,
  spot: Spot,
  big: boolean,
): WordClass => {
  const kind = kindOfSpot(buffer, spot)
  return kind === 'Empty' || kind === 'Blank' ? 'Blank' : big ? 'Filled' : kind
}

const isEmptyLineStart = (buffer: Buffer.Buffer, spot: Spot): boolean =>
  spot.cell === 0 && cellsIn(buffer, spot.line) === 0

export type Walked = Readonly<{ spot: Spot; failed: boolean }>

export const forwardWordStoppingAtLineEnd = (
  buffer: Buffer.Buffer,
  from: Spot,
  count: number,
  big: boolean,
): Walked => {
  let spot = from
  const crossed = (stepped: Stepped) => stepped.crossing !== 'InLine'
  for (let left = count; left > 0; left -= 1) {
    const isLast = left === 1
    const startClass = classAt(buffer, spot, big)
    const onLastLine = spot.line === lastLine(buffer)
    let stepped = inc(buffer, spot)
    spot = stepped.spot
    if (stepped.crossing === 'Stuck' || (crossed(stepped) && onLastLine)) {
      return { spot, failed: true }
    }
    if (crossed(stepped) && isLast) {
      return { spot, failed: false }
    }
    if (startClass !== 'Blank') {
      while (classAt(buffer, spot, big) === startClass) {
        stepped = inc(buffer, spot)
        spot = stepped.spot
        if (stepped.crossing === 'Stuck' || (crossed(stepped) && isLast)) {
          return { spot, failed: false }
        }
      }
    }
    while (
      classAt(buffer, spot, big) === 'Blank' &&
      !isEmptyLineStart(buffer, spot)
    ) {
      stepped = inc(buffer, spot)
      spot = stepped.spot
      if (stepped.crossing === 'Stuck' || (crossed(stepped) && onLastLine)) {
        return { spot, failed: true }
      }
      if (crossed(stepped) && isLast) {
        return { spot, failed: false }
      }
    }
  }
  return { spot, failed: false }
}

export const endOfWord = (
  buffer: Buffer.Buffer,
  from: Spot,
  count: number,
  options: Readonly<{
    stayOnEnd: boolean
    stopAtEmptyLine: boolean
    big: boolean
  }>,
): Walked => {
  let spot = from
  let stayOnEnd = options.stayOnEnd
  const classHere = () => classAt(buffer, spot, options.big)
  const step = (): boolean => {
    const stepped = inc(buffer, spot)
    spot = stepped.spot
    return stepped.crossing !== 'Stuck'
  }
  const skip = (wordClass: WordClass): boolean => {
    while (classHere() === wordClass) {
      if (!step()) {
        return false
      }
    }
    return true
  }
  const failed = () => ({ spot, failed: true })
  for (let left = count; left > 0; left -= 1) {
    const startClass = classHere()
    if (!step()) {
      return failed()
    }
    if (classHere() === startClass && startClass !== 'Blank') {
      if (!skip(startClass)) {
        return failed()
      }
    } else if (!stayOnEnd || startClass === 'Blank') {
      while (
        classHere() === 'Blank' &&
        !(options.stopAtEmptyLine && isEmptyLineStart(buffer, spot))
      ) {
        if (!step()) {
          return failed()
        }
      }
      if (classHere() === 'Blank') {
        stayOnEnd = false
        continue
      }
      if (!skip(classHere())) {
        return failed()
      }
    }
    spot = dec(buffer, spot).spot
    stayOnEnd = false
  }
  return { spot, failed: false }
}
