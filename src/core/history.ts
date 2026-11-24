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
  'Compose',
  'Stay',
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
  joins: boolean
  holds: boolean
  began: Option.Option<Buffer.Position>
}>

export type Way = 'Undo' | 'Redo'

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

const trimmed = (history: History): History => {
  const [oldest] = history.past
  return oldest !== undefined &&
    history.past.length > 1 &&
    (history.past.length + history.future.length > maxChanges ||
      history.units > maxUnits)
    ? trimmed({
        ...history,
        past: history.past.slice(1),
        units: history.units - oldest.units,
      })
    : history
}

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
  const kept = withoutFuture(history)
  return trimmed({
    past: [...kept.past, change],
    future: [],
    base: lines,
    open: Option.none(),
    units: kept.units + change.units,
  })
}

const continues = (history: History, edit: Edit): boolean =>
  edit.joins && Option.exists(history.open, ({ kind }) => kind === edit.kind)

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
  const kept = continues(caughtUp, edit)
    ? caughtUp
    : close(caughtUp, before.lines, before.caret)
  const grown =
    after.lines === before.lines
      ? kept
      : {
          ...withoutFuture(kept),
          open: Option.some({
            kind: edit.kind,
            before: Option.match(kept.open, {
              onNone: () => Option.getOrElse(edit.began, () => before.caret),
              onSome: open => open.before,
            }),
            caret: after.caret,
          }),
        }
  return edit.holds ? grown : close(grown, after.lines, after.caret)
}

const firstChanged = (
  now: ReadonlyArray<Buffer.Line>,
  was: ReadonlyArray<Buffer.Line>,
): number => {
  const shared = Math.min(now.length, was.length)
  const index = Option.getOrElse(
    Array.findFirstIndex(
      now.slice(0, shared),
      (line, index) => line.text !== was[index]?.text,
    ),
    () => shared,
  )
  return index < now.length ? index : 0
}

const replaced = (
  buffer: Buffer.Buffer,
  change: Change,
  out: ReadonlyArray<Buffer.Line>,
  into: ReadonlyArray<Buffer.Line>,
): Buffer.Buffer => Buffer.splice(buffer, change.at, out.length, into)

export const undo = (
  history: History,
  buffer: Buffer.Buffer,
): Option.Option<Stepped> => {
  const closed = close(history, buffer.lines, buffer.caret)
  return Option.map(Array.last(closed.past), change => {
    const next = replaced(buffer, change, change.added, change.removed)
    return {
      history: {
        ...closed,
        past: closed.past.slice(0, -1),
        future: [...closed.future, change],
        base: next.lines,
      },
      buffer: next,
      change,
      size: change.removed.length,
      changed: change.at + firstChanged(change.removed, change.added),
    }
  })
}

export const redo = (
  history: History,
  buffer: Buffer.Buffer,
): Option.Option<Stepped> => {
  const closed = close(history, buffer.lines, buffer.caret)
  return Option.map(Array.last(closed.future), change => {
    const next = replaced(buffer, change, change.removed, change.added)
    return {
      history: {
        ...closed,
        past: [...closed.past, change],
        future: closed.future.slice(0, -1),
        base: next.lines,
      },
      buffer: next,
      change,
      size: change.added.length,
      changed: change.at + firstChanged(change.added, change.removed),
    }
  })
}

const reach = (history: History, way: Way): number =>
  way === 'Undo'
    ? history.past.length + (Option.isSome(history.open) ? 1 : 0)
    : history.future.length

export const travel = (
  history: History,
  buffer: Buffer.Buffer,
  way: Way,
  count: number,
): Option.Option<Stepped> => {
  const step = way === 'Undo' ? undo : redo
  const onward = (from: Stepped, left: number): Stepped =>
    left <= 0
      ? from
      : Option.match(step(from.history, from.buffer), {
          onNone: () => from,
          onSome: next => onward(next, left - 1),
        })
  return Option.map(step(history, buffer), first =>
    onward(first, Math.min(count, reach(history, way)) - 1),
  )
}
