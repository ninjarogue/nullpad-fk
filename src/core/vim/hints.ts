import { Array, Option, Order, Record, pipe } from 'effect'

import * as Keymap from './keymap'
import type { Register, Registers } from './operators'

export type Entry = Readonly<{
  key: string
  about: string
  kind: 'Key' | 'Group' | 'Letter'
}>

export type Hints = Readonly<{
  pending: string
  entries: ReadonlyArray<Entry>
  more: number
  rows: number
}>

export type Screen = Readonly<{ rows: number; columns: number }>

export const pends = (pending: Keymap.Pending): boolean =>
  pending.keys.length > 0 || pending.register === '"'

const clamp = (low: number, high: number, value: number): number =>
  Math.min(high, Math.max(low, value))

const keyCells = 9
const gapCells = 2
const wideAbout = 24
const narrowAbout = 14
const maxColumns = 4
const maxRows = 12
const previewUnits = 64

const namedKeys: Readonly<Record<string, string>> = {
  '<Esc>': 'Esc',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Del>': 'Delete',
  ' ': 'Space',
}

export const display = (key: Keymap.Key): string => {
  const named = namedKeys[key]
  if (named !== undefined) {
    return named
  }
  if (!Keymap.isNamedKey(key)) {
    return key
  }
  const inner = key.slice(1, -1)
  const chorded = inner.slice(2)
  return inner.startsWith('C-')
    ? `Ctrl-${chorded.length === 1 ? chorded.toUpperCase() : chorded}`
    : inner
}

const cut = (text: string, width: number): string => {
  const letters = Array.fromIterable(text)
  return letters.length > width
    ? letters.slice(0, width - 1).join('') + '…'
    : text
}

const preview = (register: Register, width: number): string =>
  cut(register.text.slice(0, previewUnits).replaceAll('\n', '↵'), width)

const widthFor = (screen: Screen): number =>
  Math.floor((screen.columns - 2) / (keyCells + wideAbout + gapCells)) >= 2
    ? wideAbout
    : narrowAbout

const columnsFor = (screen: Screen, width: number): number =>
  clamp(
    1,
    maxColumns,
    Math.floor((screen.columns - 2) / (keyCells + width + gapCells)),
  )

const rowsFor = (screen: Screen): number =>
  clamp(3, maxRows, Math.floor(screen.rows / 2) - 2)

const registerEntries = (registers: Registers, width: number): Array<Entry> => {
  const entry = (key: string, about: string): Entry => ({
    key,
    about,
    kind: 'Key',
  })
  const held = pipe(
    Record.toEntries(registers.named),
    Array.filter(([letter]) => /^[a-z]$/u.test(letter)),
    Array.sort(
      Order.mapInput(
        Order.String,
        ([letter]: readonly [string, Register]) => letter,
      ),
    ),
    Array.map(([letter, register]) => entry(letter, preview(register, width))),
  )
  const previewOf = (maybe: Option.Option<Register>, empty: string): string =>
    Option.match(maybe, {
      onNone: () => empty,
      onSome: register => preview(register, width),
    })
  return [
    ...held,
    entry('a-z', 'named'),
    entry('"', previewOf(registers.unnamed, 'unnamed')),
    entry('0', previewOf(registers.yank, 'yank')),
    entry('_', 'black hole'),
    entry('+', 'clipboard'),
  ]
}

const keyEntries = <C>(
  bindings: ReadonlyArray<Keymap.Binding<C>>,
  pending: Keymap.Pending,
  width: number,
): Array<Entry> => {
  const countsFollow =
    pending.keys.length === 1 && Keymap.isOperatorKey(pending.keys[0])
  const next = Array.filter(
    Keymap.following(bindings, pending),
    entry => entry.hint !== '',
  )
  if (next.length === 1 && next[0]?.key === Keymap.anyKey) {
    return [
      {
        key: 'any letter',
        about: cut(next[0].hint, width),
        kind: 'Letter',
      },
    ]
  }
  const plainHints = Array.map(
    Array.filter(next, entry => !Keymap.isNamedKey(entry.key)),
    entry => entry.hint,
  )
  const unaliased = Array.filter(next, (entry, index) => {
    if (!Keymap.isNamedKey(entry.key)) {
      return true
    }
    const earlierNamed = Array.some(
      next.slice(0, index),
      other => Keymap.isNamedKey(other.key) && other.hint === entry.hint,
    )
    return !earlierNamed && !plainHints.includes(entry.hint)
  })
  const entries = Array.map(
    Array.filter(
      unaliased,
      entry => !(countsFollow && /^[0-9]$/u.test(entry.key)),
    ),
    (entry): Entry =>
      entry.leads === 'Keys'
        ? {
            key: display(entry.key),
            about: Keymap.groupHints[entry.key] ?? Keymap.groupHintFallback,
            kind: 'Group',
          }
        : {
            key: display(entry.key),
            about: cut(entry.hint, width),
            kind: 'Key',
          },
  )
  const own =
    pending.keys.length === 1 ? display(pending.keys[0] ?? '') : undefined
  const rank = (entry: Entry): number =>
    entry.key === own && entry.kind === 'Key'
      ? 0
      : entry.kind === 'Group' && entry.key in Keymap.groupHints
        ? 1
        : 2
  return Array.sort(entries, Order.mapInput(Order.Number, rank))
}

export const of = <C>(
  bindings: ReadonlyArray<Keymap.Binding<C>>,
  pending: Keymap.Pending,
  registers: Registers,
  screen: Screen,
): Option.Option<Hints> => {
  const width = widthFor(screen)
  const entries =
    pending.register === '"'
      ? registerEntries(registers, width)
      : keyEntries(bindings, pending, width)
  if (Array.isArrayEmpty(entries)) {
    return Option.none()
  }
  const columns = columnsFor(screen, width)
  const rows = rowsFor(screen)
  const capacity = rows * columns
  const shown = Keymap.shown(pending)
  return Option.some(
    entries.length <= capacity
      ? {
          pending: shown,
          entries,
          more: 0,
          rows: Math.ceil(entries.length / columns),
        }
      : {
          pending: shown,
          entries: entries.slice(0, capacity - 1),
          more: entries.length - (capacity - 1),
          rows,
        },
  )
}
