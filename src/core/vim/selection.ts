import { Schema } from 'effect'

import type * as Buffer from '../buffer'
import {
  type Spot,
  cellsIn,
  endOf,
  lastLine,
  positionOf,
  spotAt,
} from './motions'
import type { Range } from './targets'

export const Kind = Schema.Literals(['Letters', 'Lines'])
export type Kind = typeof Kind.Type

export type Ends = Readonly<{ kind: Kind; anchor: Spot; cursor: Spot }>

export const endsOf = (
  buffer: Buffer.Buffer,
  kind: Kind,
  anchor: Buffer.Position,
): Ends => ({
  kind,
  anchor: spotAt(
    buffer,
    { ...anchor, line: Math.min(anchor.line, lastLine(buffer)) },
    'LineBreak',
  ),
  cursor: spotAt(buffer, buffer.caret, 'LineBreak'),
})

const isBefore = (a: Spot, b: Spot): boolean =>
  a.line < b.line || (a.line === b.line && a.cell < b.cell)

export const sorted = ({
  anchor,
  cursor,
}: Ends): Readonly<{ first: Spot; last: Spot }> =>
  isBefore(cursor, anchor)
    ? { first: cursor, last: anchor }
    : { first: anchor, last: cursor }

export const isOnLineBreak = (buffer: Buffer.Buffer, spot: Spot): boolean =>
  spot.cell >= cellsIn(buffer, spot.line)

export type Shown = Readonly<{
  kind: Kind
  from: Buffer.Position
  to: Buffer.Position
  lineBreak: boolean
}>

export const shown = (buffer: Buffer.Buffer, ends: Ends): Shown => {
  const { first, last } = sorted(ends)
  if (ends.kind === 'Lines') {
    return {
      kind: 'Lines',
      from: { line: first.line, column: 0 },
      to: positionOf(buffer, {
        line: last.line,
        cell: cellsIn(buffer, last.line),
      }),
      lineBreak: true,
    }
  }
  const lineBreak = isOnLineBreak(buffer, last)
  return {
    kind: 'Letters',
    from: positionOf(buffer, first),
    to: lineBreak ? positionOf(buffer, last) : endOf(buffer, last),
    lineBreak,
  }
}

const linesOf = ({ anchor, cursor }: Ends, last: Spot): Range => {
  const anchorLineStart = { line: anchor.line, cell: 0 }
  return {
    from: isBefore(anchorLineStart, cursor) ? anchorLineStart : cursor,
    to: { line: last.line, cell: 0 },
    kind: 'Linewise',
    inclusive: true,
  }
}

export const rangeOf = (
  buffer: Buffer.Buffer,
  ends: Ends,
  reach: 'AsSelected' | 'WholeLines',
): Range => {
  const { first, last } = sorted(ends)
  if (ends.kind === 'Lines' || reach === 'WholeLines') {
    return linesOf(ends, last)
  }
  if (!isOnLineBreak(buffer, last)) {
    return {
      from: first,
      to: { line: last.line, cell: last.cell + 1 },
      kind: 'Charwise',
      inclusive: true,
    }
  }
  return {
    from: first,
    to: last.line < lastLine(buffer) ? { line: last.line + 1, cell: 0 } : last,
    kind: 'Charwise',
    inclusive: false,
  }
}
