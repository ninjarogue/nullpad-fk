import { Schema } from 'effect'

import * as Buffer from '../buffer'
import {
  caretColumnOf,
  cellAtScreenColumn,
  lastScreenColumnOf,
  screenColumnOf,
} from './cells'
import {
  type Spot,
  type Want,
  cellsIn,
  endOf,
  lastLine,
  positionOf,
  spotAt,
} from './motions'
import type { OperatorName, Range } from './targets'

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

const textOf = (buffer: Buffer.Buffer, line: number): Buffer.Line =>
  buffer.lines[line] ?? buffer.lines[0]

const isBefore = (a: Spot, b: Spot): boolean =>
  a.line < b.line || (a.line === b.line && a.cell < b.cell)

export const sorted = ({
  anchor,
  cursor,
}: Ends): Readonly<{ first: Spot; last: Spot }> =>
  isBefore(cursor, anchor)
    ? { first: cursor, last: anchor }
    : { first: anchor, last: cursor }

export const wantBefore = (buffer: Buffer.Buffer, want: Want): Want => {
  const { line, cell } = spotAt(buffer, buffer.caret, 'LastLetter')
  return want === 'Unset' ? caretColumnOf(textOf(buffer, line), cell) : want
}

export const wantOf = (
  buffer: Buffer.Buffer,
  { anchor, cursor }: Ends,
  want: Want,
): Want =>
  want === 'Unset' && !isBefore(anchor, cursor)
    ? screenColumnOf(textOf(buffer, cursor.line), cursor.cell)
    : want

export const Column = Schema.Literals(['AsInNormal', 'AsInVisual'])
export type Column = typeof Column.Type

export const columnOf = (
  buffer: Buffer.Buffer,
  { anchor, cursor }: Ends,
  column: Column,
): number => {
  const text = textOf(buffer, cursor.line)
  return column === 'AsInNormal' || isBefore(anchor, cursor)
    ? caretColumnOf(text, cursor.cell)
    : screenColumnOf(text, cursor.cell)
}

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

export const Mark = Schema.Struct({
  id: Buffer.LineId,
  line: Schema.Int,
  column: Schema.Int,
})
export type Mark = typeof Mark.Type

const noLine = Buffer.LineId.make(-1)

export const markAt = (
  buffer: Buffer.Buffer,
  { line, column }: Buffer.Position,
): Mark => ({ id: buffer.lines[line]?.id ?? noLine, line, column })

const lineOf = ({ lines }: Buffer.Buffer, mark: Mark): number => {
  if (mark.id === noLine) {
    return Number.POSITIVE_INFINITY
  }
  if (lines[mark.line]?.id === mark.id) {
    return mark.line
  }
  const moved = lines.findIndex(line => line.id === mark.id)
  return moved < 0 ? mark.line : moved
}

export const marked = (
  buffer: Buffer.Buffer,
  mark: Mark,
  pastEnd: 'LastLine' | 'Nowhere',
): Buffer.Position | undefined => {
  const found = lineOf(buffer, mark)
  const line =
    pastEnd === 'LastLine' ? Math.min(found, lastLine(buffer)) : found
  const text = buffer.lines[line]
  return text === undefined
    ? undefined
    : { line, column: Math.min(mark.column, text.text.length) }
}

export const movedBy = (
  operator: OperatorName,
  range: Range,
  from: Buffer.Position,
  mark: Buffer.Position,
): Buffer.Position => {
  if (operator === 'Yank' || mark.line <= from.line) {
    return mark
  }
  if (range.kind === 'Charwise') {
    return { line: from.line, column: from.column + mark.column }
  }
  return { ...mark, line: operator === 'Delete' ? from.line : from.line + 1 }
}

export const Amount = Schema.TaggedUnion({
  Lines: { lines: Schema.Int },
  Width: { columns: Schema.Int },
  Through: { lines: Schema.Int, column: Schema.Int },
  ToLineEnd: { lines: Schema.Int },
})
export type Amount = typeof Amount.Type

export const amountOf = (
  buffer: Buffer.Buffer,
  ends: Ends,
  reach: 'AsSelected' | 'WholeLines',
  want: Want,
): Amount => {
  const { first, last } = sorted(ends)
  const lines = last.line - first.line + 1
  if (ends.kind === 'Lines' || reach === 'WholeLines') {
    return { _tag: 'Lines', lines }
  }
  if (want === 'End') {
    return { _tag: 'ToLineEnd', lines }
  }
  const column = lastScreenColumnOf(textOf(buffer, last.line), last.cell)
  return lines === 1
    ? {
        _tag: 'Width',
        columns:
          column - screenColumnOf(textOf(buffer, first.line), first.cell) + 1,
      }
    : { _tag: 'Through', lines, column }
}

export const rangeFrom = (
  buffer: Buffer.Buffer,
  cursor: Spot,
  amount: Amount,
): Range => {
  const reached = (lines: number): number =>
    Math.min(lastLine(buffer), cursor.line + lines - 1)
  const through = (line: number, column: number): Spot => ({
    line,
    cell: cellAtScreenColumn(
      textOf(buffer, line),
      column,
      cellsIn(buffer, line),
    ),
  })
  const end = Amount.match(amount, {
    Lines: ({ lines }) => ({ line: reached(lines), cell: cursor.cell }),
    Width: ({ columns }) =>
      through(
        cursor.line,
        caretColumnOf(textOf(buffer, cursor.line), cursor.cell) + columns - 1,
      ),
    Through: ({ lines, column }) => through(reached(lines), column),
    ToLineEnd: ({ lines }) => ({
      line: reached(lines),
      cell: cellsIn(buffer, reached(lines)),
    }),
  })
  return amount._tag === 'Lines'
    ? {
        from: cursor,
        to: { line: end.line, cell: 0 },
        kind: 'Linewise',
        inclusive: true,
      }
    : rangeOf(
        buffer,
        { kind: 'Letters', anchor: cursor, cursor: end },
        'AsSelected',
      )
}

export const insertAt = (buffer: Buffer.Buffer, ends: Ends): Buffer.Position =>
  positionOf(buffer, rangeOf(buffer, ends, 'WholeLines').from)

export const appendAt = (
  buffer: Buffer.Buffer,
  ends: Ends,
): Buffer.Position => {
  const { anchor, cursor } = ends
  const end = isBefore({ line: anchor.line, cell: 0 }, cursor) ? cursor : anchor
  return isOnLineBreak(buffer, end)
    ? positionOf(buffer, { line: end.line, cell: cellsIn(buffer, end.line) })
    : endOf(buffer, end)
}
