import { Option, Schema } from 'effect'

import * as Buffer from '../buffer'
import {
  type Stop,
  caretColumnOf,
  cellAtScreenColumn,
  cellStart,
  cellText,
  lastScreenColumnOf,
  screenColumnOf,
  screenWidthOf,
  stopAtScreenColumn,
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
import { type OperatorName, type Range, byKind } from './targets'

export const Kind = Schema.Literals(['Letters', 'Lines', 'Block'])
export type Kind = typeof Kind.Type

export type Stretch = Readonly<{
  kind: Exclude<Kind, 'Block'>
  anchor: Spot
  cursor: Spot
}>

export type Corners = Readonly<{ kind: 'Block'; anchor: Spot; cursor: Spot }>

export type Ends = Stretch | Corners

export const byShape = <A>(
  ends: Ends,
  cases: Readonly<{
    Stretch: (stretch: Stretch) => A
    Block: (corners: Corners) => A
  }>,
): A => (ends.kind === 'Block' ? cases.Block(ends) : cases.Stretch(ends))

export const asLines = ({ anchor, cursor }: Ends): Stretch => ({
  kind: 'Lines',
  anchor,
  cursor,
})

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
}: Readonly<{ anchor: Spot; cursor: Spot }>): Readonly<{
  first: Spot
  last: Spot
}> =>
  isBefore(cursor, anchor)
    ? { first: cursor, last: anchor }
    : { first: anchor, last: cursor }

export const wantBefore = (buffer: Buffer.Buffer, want: Want): Want => {
  const { line, cell } = spotAt(buffer, buffer.caret, 'LastLetter')
  return want === 'Unset' ? caretColumnOf(textOf(buffer, line), cell) : want
}

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

export const wantOf = (
  buffer: Buffer.Buffer,
  ends: Ends,
  want: Want,
  column: Column,
): Want =>
  want === 'Unset' && !isBefore(ends.anchor, ends.cursor)
    ? columnOf(buffer, ends, column)
    : want

export const isOnLineBreak = (buffer: Buffer.Buffer, spot: Spot): boolean =>
  spot.cell >= cellsIn(buffer, spot.line)

export type Reach = 'AsSelected' | 'WholeLines'

export type Shown = Readonly<{
  kind: Stretch['kind']
  from: Buffer.Position
  to: Buffer.Position
  lineBreak: boolean
}>

const coversWholeLines: Readonly<
  Record<Stretch['kind'], Readonly<Record<Reach, boolean>>>
> = {
  Letters: { AsSelected: false, WholeLines: true },
  Lines: { AsSelected: true, WholeLines: true },
}

export const shown = (buffer: Buffer.Buffer, ends: Stretch): Shown => {
  const { first, last } = sorted(ends)
  if (coversWholeLines[ends.kind].AsSelected) {
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

const linesOf = ({ anchor, cursor }: Stretch, last: Spot): Range => {
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
  ends: Stretch,
  reach: Reach,
): Range => {
  const { first, last } = sorted(ends)
  if (coversWholeLines[ends.kind][reach]) {
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

const Place = Schema.Struct({
  id: Buffer.LineId,
  line: Schema.Int,
  column: Schema.Int,
})
type Place = typeof Place.Type

export const Mark = Schema.Struct({
  ...Place.fields,
  removed: Schema.Option(Place),
})
export type Mark = typeof Mark.Type

const noLine = Buffer.LineId.make(-1)

const placeAt = (
  buffer: Buffer.Buffer,
  { line, column }: Buffer.Position,
): Place => ({ id: buffer.lines[line]?.id ?? noLine, line, column })

export const markAt = (
  before: Buffer.Buffer,
  after: Buffer.Buffer,
  was: Buffer.Position,
  now: Buffer.Position,
): Mark => {
  const held = placeAt(before, was)
  const shifted = was.line + after.lines.length - before.lines.length
  return {
    ...placeAt(after, now),
    removed:
      held.id === noLine ||
      after.lines[was.line]?.id === held.id ||
      after.lines[shifted]?.id === held.id
        ? Option.none()
        : Option.some(held),
  }
}

const whereIs = ({ lines }: Buffer.Buffer, place: Place): number =>
  lines[place.line]?.id === place.id
    ? place.line
    : lines.findIndex(line => line.id === place.id)

const lineOf = (buffer: Buffer.Buffer, mark: Mark): number => {
  if (mark.id === noLine) {
    return Number.POSITIVE_INFINITY
  }
  const moved = whereIs(buffer, mark)
  return moved < 0 ? mark.line : moved
}

const broughtBack = (
  buffer: Buffer.Buffer,
  mark: Mark,
): Option.Option<Buffer.Position> =>
  Option.filter(
    Option.map(mark.removed, place => ({
      line: whereIs(buffer, place),
      column: place.column,
    })),
    ({ line }) => line >= 0,
  )

export const marked = (
  buffer: Buffer.Buffer,
  mark: Mark,
  pastEnd: 'LastLine' | 'Nowhere',
): Buffer.Position | undefined => {
  const found = Option.getOrElse(broughtBack(buffer, mark), () => ({
    line: lineOf(buffer, mark),
    column: mark.column,
  }))
  const line =
    pastEnd === 'LastLine' ? Math.min(found.line, lastLine(buffer)) : found.line
  return buffer.lines[line] === undefined
    ? undefined
    : positionOf(
        buffer,
        spotAt(buffer, { line, column: found.column }, 'LineBreak'),
      )
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
  return byKind(range, {
    Charwise: () => ({ line: from.line, column: from.column + mark.column }),
    Linewise: () => ({
      ...mark,
      line: operator === 'Delete' ? from.line : from.line + 1,
    }),
  })
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
  ends: Stretch,
  reach: Reach,
  want: Want,
): Amount => {
  const { first, last } = sorted(ends)
  const lines = last.line - first.line + 1
  if (coversWholeLines[ends.kind][reach]) {
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
  const letters = (): Range =>
    rangeOf(
      buffer,
      { kind: 'Letters', anchor: cursor, cursor: end },
      'AsSelected',
    )
  return Amount.match(amount, {
    Lines: (): Range => ({
      from: cursor,
      to: { line: end.line, cell: 0 },
      kind: 'Linewise',
      inclusive: true,
    }),
    Width: letters,
    Through: letters,
    ToLineEnd: letters,
  })
}

export const insertAt = (
  buffer: Buffer.Buffer,
  ends: Stretch,
): Buffer.Position =>
  positionOf(buffer, rangeOf(buffer, ends, 'WholeLines').from)

export const appendAt = (
  buffer: Buffer.Buffer,
  ends: Stretch,
): Buffer.Position => {
  const { anchor, cursor } = ends
  const end = isBefore({ line: anchor.line, cell: 0 }, cursor) ? cursor : anchor
  return isOnLineBreak(buffer, end)
    ? positionOf(buffer, { line: end.line, cell: cellsIn(buffer, end.line) })
    : endOf(buffer, end)
}

export const Block = Schema.Struct({
  first: Schema.Int,
  last: Schema.Int,
  left: Schema.Int,
  right: Schema.Int,
  toLineEnds: Schema.Boolean,
})
export type Block = typeof Block.Type

type Edges = Readonly<{ left: number; right: number }>

const edgesOf = (buffer: Buffer.Buffer, { anchor, cursor }: Corners): Edges => {
  const anchorText = textOf(buffer, anchor.line)
  const cursorText = textOf(buffer, cursor.line)
  return {
    left: Math.min(
      screenColumnOf(anchorText, anchor.cell),
      screenColumnOf(cursorText, cursor.cell),
    ),
    right: Math.max(
      lastScreenColumnOf(anchorText, anchor.cell),
      lastScreenColumnOf(cursorText, cursor.cell),
    ),
  }
}

const widestBetween = (
  buffer: Buffer.Buffer,
  first: number,
  last: number,
): number => {
  let widest = 0
  for (let line = first; line <= last; line += 1) {
    widest = Math.max(widest, screenWidthOf(textOf(buffer, line)))
  }
  return widest
}

export const blockOf = (
  buffer: Buffer.Buffer,
  corners: Corners,
  toLineEnds: boolean,
): Block => {
  const first = Math.min(corners.anchor.line, corners.cursor.line)
  const last = Math.max(corners.anchor.line, corners.cursor.line)
  const { left, right } = edgesOf(buffer, corners)
  return {
    first,
    last,
    left,
    right: toLineEnds ? widestBetween(buffer, first, last) : right,
    toLineEnds,
  }
}

export const widthOf = ({ left, right, toLineEnds }: Block): number =>
  toLineEnds ? Math.max(1, right - left) : right - left + 1

export type CutLetter = Readonly<{
  from: number
  to: number
  isTab: boolean
  outside: number
  inside: number
}>

export type Cut = Readonly<{
  reaches: boolean
  ends: boolean
  pad: number
  start: number
  end: number
  spaces: number
  edge: number
  row: string
  left: CutLetter | undefined
  right: CutLetter | undefined
}>

const cutLetter = (
  line: Buffer.Line,
  cell: number,
  outside: number,
  inside: number,
): CutLetter => ({
  from: cellStart(line, cell),
  to: cellStart(line, cell + 1),
  isTab: cellText(line, cell) === '\t',
  outside,
  inside,
})

const rowOf = (
  line: Buffer.Line,
  { left, right }: Block,
  head: Stop,
  tail: Stop,
  cutLeft: number,
  cutRight: number,
): string => {
  if (head.column < left || (cutLeft > 0 && head.column > right)) {
    return ' '.repeat(right - left + 1)
  }
  return (
    ' '.repeat(cutLeft) +
    line.text.slice(
      cellStart(line, head.cell),
      cellStart(line, cutRight > 0 ? tail.cell - 1 : tail.cell),
    ) +
    ' '.repeat(cutRight > 0 ? tail.stepped - cutRight : 0)
  )
}

export const cutOf = (line: Buffer.Line, block: Block): Cut => {
  const { left, right } = block
  const head = stopAtScreenColumn(line, left)
  const tail = stopAtScreenColumn(line, right + 1, head)
  const reaches = head.column >= left
  const cutLeft = Math.max(0, head.column - left)
  const cutRight = reaches ? Math.max(0, tail.column - right - 1) : 0
  const leftLetter =
    cutLeft > 0
      ? cutLetter(line, head.cell - 1, head.stepped - cutLeft, cutLeft)
      : undefined
  const ends = tail.column <= right
  return {
    reaches,
    ends,
    pad: ends ? right - tail.column + 1 : 0,
    start: leftLetter?.from ?? cellStart(line, head.cell),
    end: cellStart(line, tail.cell),
    spaces: (leftLetter?.outside ?? 0) + cutRight,
    edge:
      (leftLetter?.from ?? cellStart(line, head.cell)) +
      (leftLetter?.outside ?? 0),
    row: rowOf(line, block, head, tail, cutLeft, cutRight),
    left: leftLetter,
    right:
      cutRight > 0
        ? cutLetter(line, tail.cell - 1, cutRight, tail.stepped - cutRight)
        : undefined,
  }
}

export const cutsOf = (
  buffer: Buffer.Buffer,
  block: Block,
): ReadonlyArray<Cut> => {
  const cuts: Array<Cut> = []
  for (let line = block.first; line <= block.last; line += 1) {
    cuts.push(cutOf(textOf(buffer, line), block))
  }
  return cuts
}

export type Span = Readonly<{ line: number; from: number; to: number }>

export const spansOf = (
  buffer: Buffer.Buffer,
  corners: Corners,
  toLineEnds: boolean,
  drawn: Readonly<{ first: number; last: number }>,
): ReadonlyArray<Span> => {
  const { left, right } = edgesOf(buffer, corners)
  const first = Math.max(
    drawn.first,
    Math.min(corners.anchor.line, corners.cursor.line),
  )
  const last = Math.min(
    drawn.last,
    Math.max(corners.anchor.line, corners.cursor.line),
  )
  const spans: Array<Span> = []
  for (let line = first; line <= last; line += 1) {
    const text = textOf(buffer, line)
    const head = stopAtScreenColumn(text, left)
    const from =
      head.column > left
        ? cellStart(text, head.cell - 1)
        : cellStart(text, head.cell)
    const to = toLineEnds
      ? text.text.length
      : cellStart(text, stopAtScreenColumn(text, right + 1, head).cell)
    spans.push({ line, from, to: Math.max(from, to) })
  }
  return spans
}

export const BlockAmount = Schema.TaggedUnion({
  Columns: { lines: Schema.Int, columns: Schema.Int },
  ToLineEnds: { lines: Schema.Int },
})
export type BlockAmount = typeof BlockAmount.Type

export const blockAmountOf = (block: Block): BlockAmount => {
  const lines = block.last - block.first + 1
  return block.toLineEnds
    ? { _tag: 'ToLineEnds', lines }
    : { _tag: 'Columns', lines, columns: block.right - block.left + 1 }
}

export const blockFrom = (
  buffer: Buffer.Buffer,
  cursor: Spot,
  amount: BlockAmount,
  want: Want,
): Block => {
  const first = cursor.line
  const last = Math.min(lastLine(buffer), first + amount.lines - 1)
  const left = screenColumnOf(textOf(buffer, first), cursor.cell)
  const toLineEnds: Block = {
    first,
    last,
    left,
    right: widestBetween(buffer, first, last),
    toLineEnds: true,
  }
  return BlockAmount.match(amount, {
    Columns: ({ columns }) =>
      want === 'End'
        ? toLineEnds
        : { first, last, left, right: left + columns - 1, toLineEnds: false },
    ToLineEnds: () => toLineEnds,
  })
}

export const wantAfterYank = (
  buffer: Buffer.Buffer,
  block: Block,
  asSelected: Want,
): Want => {
  const top = textOf(buffer, block.first)
  const head = stopAtScreenColumn(top, block.left)
  if (head.column !== block.left || cellText(top, head.cell) !== '\t') {
    return 'Unset'
  }
  const bottom = textOf(buffer, block.last)
  const tail = stopAtScreenColumn(bottom, block.right)
  if (tail.column !== block.right) {
    return 'Unset'
  }
  return cellText(bottom, tail.cell) === '\t' ? asSelected : block.right
}

export const otherColumns = (
  buffer: Buffer.Buffer,
  corners: Corners,
): Readonly<{ anchor: Spot; cursor: Spot; want: number }> => {
  const { left, right } = edgesOf(buffer, corners)
  const at = (line: number, column: number): Spot => ({
    line,
    cell: cellAtScreenColumn(
      textOf(buffer, line),
      column,
      cellsIn(buffer, line),
    ),
  })
  const { anchor, cursor } = corners
  const rightward = at(cursor.line, right)
  return rightward.cell === cursor.cell
    ? {
        anchor: at(anchor.line, right),
        cursor: at(cursor.line, left),
        want: left,
      }
    : { anchor: at(anchor.line, left), cursor: rightward, want: right }
}
