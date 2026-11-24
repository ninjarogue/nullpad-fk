import { Array, Option, Schema } from 'effect'

import { MotionName } from './motions'

export type Key = string

export const InsertAt = Schema.Literals([
  'Here',
  'After',
  'FirstNonBlank',
  'LineEnd',
  'LineBelow',
  'LineAbove',
])
export type InsertAt = typeof InsertAt.Type

export const Command = Schema.TaggedUnion({
  Move: { motion: MotionName },
  DeleteCells: {},
  Insert: { at: InsertAt },
  Cancel: {},
})
export type Command = typeof Command.Type

export type Binding = Readonly<{
  keys: ReadonlyArray<Key>
  command: Command
  about: string
}>

export const keysOf = (notation: string): ReadonlyArray<Key> =>
  notation.match(/<[^>]+>|./gu) ?? []

const bind = (notation: string, command: Command, about: string): Binding => ({
  keys: keysOf(notation),
  command,
  about,
})

const move = (notation: string, motion: MotionName, about: string): Binding =>
  bind(notation, Command.cases.Move.make({ motion }), about)

const insert = (notation: string, at: InsertAt, about: string): Binding =>
  bind(notation, Command.cases.Insert.make({ at }), about)

export const normal: ReadonlyArray<Binding> = [
  move('h', 'Left', 'left'),
  move('<Left>', 'Left', 'left'),
  move('<BS>', 'LeftAcrossLines', 'left, across lines'),
  move('l', 'Right', 'right'),
  move('<Right>', 'Right', 'right'),
  move(' ', 'RightAcrossLines', 'right, across lines'),
  move('j', 'Down', 'line down'),
  move('<Down>', 'Down', 'line down'),
  move('k', 'Up', 'line up'),
  move('<Up>', 'Up', 'line up'),
  move('w', 'WordForward', 'next word'),
  move('b', 'WordBackward', 'previous word'),
  move('e', 'WordEnd', 'end of word'),
  move('0', 'LineStart', 'line start'),
  move('<Home>', 'LineStart', 'line start'),
  move('^', 'FirstNonBlank', 'first non-blank'),
  move('$', 'LineEnd', 'line end'),
  move('<End>', 'LineEnd', 'line end'),
  move('gg', 'FirstLine', 'first line'),
  move('<C-Home>', 'FirstLine', 'first line'),
  move('G', 'LastLine', 'last line'),
  move('<C-End>', 'LastLineEnd', 'end of last line'),
  bind('x', Command.cases.DeleteCells.make({}), 'delete character'),
  bind('<Del>', Command.cases.DeleteCells.make({}), 'delete character'),
  insert('i', 'Here', 'insert'),
  insert('a', 'After', 'append'),
  insert('I', 'FirstNonBlank', 'insert at line start'),
  insert('A', 'LineEnd', 'append at line end'),
  insert('o', 'LineBelow', 'open line below'),
  insert('O', 'LineAbove', 'open line above'),
  bind('<Esc>', Command.cases.Cancel.make({}), 'cancel'),
  bind('<C-[>', Command.cases.Cancel.make({}), 'cancel'),
]

export const Pending = Schema.Struct({
  count: Schema.String,
  keys: Schema.Array(Schema.String),
})
export type Pending = typeof Pending.Type

export const idle: Pending = { count: '', keys: [] }

export const Advance = Schema.TaggedUnion({
  Run: { command: Command, count: Schema.UndefinedOr(Schema.Int) },
  Wait: { pending: Pending },
  Drop: {},
})
export type Advance = typeof Advance.Type

const maxCountDigits = 7

const startsWith = (
  keys: ReadonlyArray<Key>,
  prefix: ReadonlyArray<Key>,
): boolean => prefix.every((key, index) => keys[index] === key)

const reachable = (
  bindings: ReadonlyArray<Binding>,
  keys: ReadonlyArray<Key>,
): ReadonlyArray<Binding> =>
  Array.filter(bindings, binding => startsWith(binding.keys, keys))

const isCountDigit = (pending: Pending, key: Key): boolean =>
  pending.keys.length === 0 &&
  /^[0-9]$/u.test(key) &&
  (key !== '0' || pending.count !== '')

export const advance = (
  bindings: ReadonlyArray<Binding>,
  pending: Pending,
  key: Key,
): Advance => {
  if (isCountDigit(pending, key)) {
    return Advance.cases.Wait.make({
      pending: {
        count: (pending.count + key).slice(0, maxCountDigits),
        keys: pending.keys,
      },
    })
  }
  const keys = [...pending.keys, key]
  const candidates = reachable(bindings, keys)
  return Option.match(
    Array.findFirst(candidates, binding => binding.keys.length === keys.length),
    {
      onSome: ({ command }) =>
        Advance.cases.Run.make({
          command,
          count: pending.count === '' ? undefined : Number(pending.count),
        }),
      onNone: () =>
        candidates.length > 0
          ? Advance.cases.Wait.make({
              pending: { count: pending.count, keys },
            })
          : Advance.cases.Drop.make({}),
    },
  )
}

export const next = (
  bindings: ReadonlyArray<Binding>,
  pending: Pending,
): ReadonlyArray<Readonly<{ key: Key; about: string }>> =>
  Array.map(reachable(bindings, pending.keys), binding => ({
    key: binding.keys[pending.keys.length] ?? '',
    about: binding.about,
  }))

export const shown = (pending: Pending): string =>
  pending.count + Array.join(pending.keys, '')
