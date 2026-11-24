import { Array, Option, Schema } from 'effect'

import * as Buffer from './buffer'

export const Change = Schema.Struct({
  at: Schema.Int,
  removed: Schema.Array(Buffer.Line),
  added: Schema.Array(Buffer.Line),
  before: Buffer.Position,
  after: Buffer.Position,
  units: Schema.Int,
})
export type Change = typeof Change.Type

export const Kind = Schema.Literals([
  'Typing',
  'Backward',
  'Forward',
  'Replace',
  'Compose',
  'InsertStay',
  'Command',
])
export type Kind = typeof Kind.Type

const Open = Schema.Struct({
  kind: Kind,
  before: Buffer.Position,
  caret: Buffer.Position,
})

export const History = Schema.Struct({
  past: Schema.Array(Change),
  future: Schema.Array(Change),
  base: Schema.NonEmptyArray(Buffer.Line),
  open: Schema.Option(Open),
  units: Schema.Int,
})
export type History = typeof History.Type

export type Edit = Readonly<{
  kind: Kind
  joinsOnto: ReadonlyArray<Kind>
  staysOpen: boolean
  began: Option.Option<Buffer.Position>
}>

export const Way = Schema.Literals(['Undo', 'Redo'])
export type Way = typeof Way.Type

export type Stepped = Readonly<{
  history: History
  buffer: Buffer.Buffer
  change: Change
  size: number
  changed: number
}>

export const maxChanges = 1000

export const maxUnits = 64_000_000

const unitsPerLine = 32

export const empty = (buffer: Buffer.Buffer): History => ({
  past: [],
  future: [],
  base: buffer.lines,
  open: Option.none(),
  units: 0,
})

const unitsOf = (lines: ReadonlyArray<Buffer.Line>): number =>
  Array.reduce(lines, 0, (sum, line) => sum + line.text.length + unitsPerLine)

const withoutFuture = (history: History): History =>
  history.future.length === 0
    ? history
    : {
        ...history,
        future: [],
        units:
          history.units -
          Array.reduce(history.future, 0, (sum, { units }) => sum + units),
      }

const isOverBounds = (history: History): boolean =>
  history.past.length + history.future.length > maxChanges ||
  history.units > maxUnits

const trimmed = (history: History): History =>
  Array.matchLeft(history.past, {
    onEmpty: () => history,
    onNonEmpty: (oldest, newer) =>
      Array.isReadonlyArrayNonEmpty(newer) && isOverBounds(history)
        ? trimmed({
            ...history,
            past: newer,
            units: history.units - oldest.units,
          })
        : history,
  })

const changeBetween = (
  base: ReadonlyArray<Buffer.Line>,
  lines: ReadonlyArray<Buffer.Line>,
  before: Buffer.Position,
  after: Buffer.Position,
): Change => {
  const prefix = Option.getOrElse(
    Array.findFirstIndex(lines, (line, index) => line !== base[index]),
    () => lines.length,
  )
  const shift = base.length - lines.length
  const lastKept = Option.getOrElse(
    Array.findLastIndex(
      lines,
      (line, index) =>
        index < prefix ||
        index + shift < prefix ||
        line !== base[index + shift],
    ),
    () => prefix - 1,
  )
  const removed = base.slice(prefix, lastKept + 1 + shift)
  const added = lines.slice(prefix, lastKept + 1)
  return {
    at: prefix,
    removed,
    added,
    before,
    after,
    units: unitsOf(removed) + unitsOf(added),
  }
}

const isSameLine = (a: Buffer.Line, b: Buffer.Line): boolean =>
  a.text === b.text &&
  a.joins.length === b.joins.length &&
  Array.every(a.joins, (join, index) => join === b.joins[index])

const changesNothing = ({ removed, added }: Change): boolean =>
  removed.length === added.length &&
  Array.every(removed, (line, index) => {
    const twin = added[index]
    return twin !== undefined && isSameLine(line, twin)
  })

const close = (
  history: History,
  lines: Array.NonEmptyReadonlyArray<Buffer.Line>,
  caret: Buffer.Position,
): History => {
  if (lines === history.base) {
    return Option.isNone(history.open)
      ? history
      : { ...history, open: Option.none() }
  }
  const change = Option.match(history.open, {
    onNone: () => changeBetween(history.base, lines, caret, caret),
    onSome: open => changeBetween(history.base, lines, open.before, open.caret),
  })
  const isInsertStay = Option.exists(
    history.open,
    ({ kind }) => kind === 'InsertStay',
  )
  if (changesNothing(change) && !isInsertStay) {
    return { ...history, base: lines, open: Option.none() }
  }
  const kept = withoutFuture(history)
  return trimmed({
    past: [...kept.past, change],
    future: [],
    base: lines,
    open: Option.none(),
    units: kept.units + change.units,
  })
}

const joinsOpen = (history: History, edit: Edit): boolean =>
  Option.exists(history.open, ({ kind }) => edit.joinsOnto.includes(kind))

export const record = (
  history: History,
  before: Buffer.Buffer,
  after: Buffer.Buffer,
  edit: Edit,
): History => {
  const caughtUp =
    Option.isNone(history.open) && before.lines !== history.base
      ? close(history, before.lines, before.caret)
      : history
  const kept = joinsOpen(caughtUp, edit)
    ? caughtUp
    : close(caughtUp, before.lines, before.caret)
  const grown =
    after.lines === before.lines
      ? kept
      : {
          ...kept,
          open: Option.some({
            kind: edit.kind,
            before: Option.match(kept.open, {
              onNone: () => Option.getOrElse(edit.began, () => before.caret),
              onSome: open => open.before,
            }),
            caret: after.caret,
          }),
        }
  return edit.staysOpen ? grown : close(grown, after.lines, after.caret)
}

const firstChanged = (
  now: ReadonlyArray<Buffer.Line>,
  was: ReadonlyArray<Buffer.Line>,
): number =>
  Option.getOrElse(
    Array.findFirstIndex(now, (line, index) => line.text !== was[index]?.text),
    () => 0,
  )

export const travel = (
  history: History,
  buffer: Buffer.Buffer,
  way: Way,
  count: number,
): Option.Option<Stepped> => {
  const closed = close(history, buffer.lines, buffer.caret)
  const from = way === 'Undo' ? closed.past : closed.future
  const kept = from.slice(0, Math.max(0, from.length - count))
  const taken = Array.reverse(from.slice(kept.length))
  const toUndo = way === 'Undo'
  return Option.map(Array.last(taken), change => {
    const next = Buffer.spliceAll(
      buffer,
      Array.map(taken, ({ at, removed, added }) =>
        toUndo
          ? { at, length: added.length, lines: removed }
          : { at, length: removed.length, lines: added },
      ),
    )
    const [now, was] = toUndo
      ? [change.removed, change.added]
      : [change.added, change.removed]
    return {
      history: {
        ...closed,
        past: toUndo ? kept : [...closed.past, ...taken],
        future: toUndo ? [...closed.future, ...taken] : kept,
        base: next.lines,
      },
      buffer: next,
      change,
      size: now.length,
      changed: change.at + firstChanged(now, was),
    }
  })
}
