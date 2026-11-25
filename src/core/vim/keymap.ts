import { Array, Option, Schema } from 'effect'

import * as History from '../history'
import { MotionName } from './motions'
import { OperatorName, Side } from './operators'
import { TargetName } from './targets'

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
  Operate: { operator: OperatorName, target: TargetName },
  Put: { side: Side },
  Insert: { at: InsertAt },
  Cancel: {},
  Travel: { way: History.Way },
  Repeat: {},
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

const operate = (
  notation: string,
  operator: OperatorName,
  target: TargetName,
  about: string,
): Binding =>
  bind(notation, Command.cases.Operate.make({ operator, target }), about)

const motionRows: ReadonlyArray<
  readonly [notation: string, motion: MotionName, about: string]
> = [
  ['h', 'Left', 'left'],
  ['<Left>', 'Left', 'left'],
  ['<BS>', 'LeftAcrossLines', 'left, across lines'],
  ['l', 'Right', 'right'],
  ['<Right>', 'Right', 'right'],
  [' ', 'RightAcrossLines', 'right, across lines'],
  ['j', 'Down', 'line down'],
  ['<Down>', 'Down', 'line down'],
  ['k', 'Up', 'line up'],
  ['<Up>', 'Up', 'line up'],
  ['w', 'WordForward', 'next word'],
  ['b', 'WordBackward', 'previous word'],
  ['e', 'WordEnd', 'end of word'],
  ['0', 'LineStart', 'line start'],
  ['<Home>', 'LineStart', 'line start'],
  ['^', 'FirstNonBlank', 'first non-blank'],
  ['$', 'LineEnd', 'line end'],
  ['<End>', 'LineEnd', 'line end'],
  ['gg', 'FirstLine', 'first line'],
  ['<C-Home>', 'FirstLine', 'first line'],
  ['G', 'LastLine', 'last line'],
  ['<C-End>', 'LastLineEnd', 'end of last line'],
]

const objectRows: ReadonlyArray<
  readonly [notation: string, target: TargetName, about: string]
> = [
  ['iw', 'InnerWord', 'inner word'],
  ['aw', 'AWord', 'a word'],
  ['iW', 'InnerBigWord', 'inner WORD'],
  ['aW', 'ABigWord', 'a WORD'],
  ['ip', 'InnerParagraph', 'inner paragraph'],
  ['ap', 'AParagraph', 'a paragraph'],
  ['i"', 'InnerDoubleQuote', 'inside double quotes'],
  ['a"', 'ADoubleQuote', 'double quotes'],
  ["i'", 'InnerSingleQuote', 'inside single quotes'],
  ["a'", 'ASingleQuote', 'single quotes'],
  ['i(', 'InnerParen', 'inside parentheses'],
  ['a(', 'AParen', 'parentheses'],
  ['i)', 'InnerParen', 'inside parentheses'],
  ['a)', 'AParen', 'parentheses'],
  ['ib', 'InnerParen', 'inside parentheses'],
  ['ab', 'AParen', 'parentheses'],
  ['i[', 'InnerBracket', 'inside brackets'],
  ['a[', 'ABracket', 'brackets'],
  ['i]', 'InnerBracket', 'inside brackets'],
  ['a]', 'ABracket', 'brackets'],
  ['i{', 'InnerBrace', 'inside braces'],
  ['a{', 'ABrace', 'braces'],
  ['i}', 'InnerBrace', 'inside braces'],
  ['a}', 'ABrace', 'braces'],
  ['iB', 'InnerBrace', 'inside braces'],
  ['aB', 'ABrace', 'braces'],
]

const operatorKeys: Readonly<Record<OperatorName, Key>> = {
  Delete: 'd',
  Change: 'c',
  Yank: 'y',
}

const verbs: Readonly<Record<OperatorName, string>> = {
  Delete: 'delete',
  Change: 'change',
  Yank: 'yank',
}

const operatorRows = (operator: OperatorName): ReadonlyArray<Binding> => {
  const key = operatorKeys[operator]
  const verb = verbs[operator]
  return [
    ...Array.map(motionRows, ([notation, motion, about]) =>
      operate(key + notation, operator, motion, `${verb} to ${about}`),
    ),
    operate(key + key, operator, 'Lines', `${verb} lines`),
    ...Array.map(objectRows, ([notation, target, about]) =>
      operate(key + notation, operator, target, `${verb} ${about}`),
    ),
  ]
}

export const normal: ReadonlyArray<Binding> = [
  ...Array.map(motionRows, ([notation, motion, about]) =>
    move(notation, motion, about),
  ),
  ...Array.flatMap(OperatorName.literals, operatorRows),
  operate('x', 'Delete', 'Right', 'delete character'),
  operate('<Del>', 'Delete', 'Right', 'delete character'),
  operate('X', 'Delete', 'Left', 'delete character before'),
  operate('D', 'Delete', 'LineEnd', 'delete to line end'),
  operate('C', 'Change', 'LineEnd', 'change to line end'),
  operate('s', 'Change', 'Right', 'change character'),
  operate('S', 'Change', 'Lines', 'change line'),
  operate('Y', 'Yank', 'Lines', 'yank line'),
  bind('p', Command.cases.Put.make({ side: 'After' }), 'put after'),
  bind('P', Command.cases.Put.make({ side: 'Before' }), 'put before'),
  insert('i', 'Here', 'insert'),
  insert('a', 'After', 'append'),
  insert('I', 'FirstNonBlank', 'insert at line start'),
  insert('A', 'LineEnd', 'append at line end'),
  insert('o', 'LineBelow', 'open line below'),
  insert('O', 'LineAbove', 'open line above'),
  bind('u', Command.cases.Travel.make({ way: 'Undo' }), 'undo'),
  bind('<C-r>', Command.cases.Travel.make({ way: 'Redo' }), 'redo'),
  bind('.', Command.cases.Repeat.make({}), 'repeat last change'),
  bind('<Esc>', Command.cases.Cancel.make({}), 'cancel'),
  bind('<C-[>', Command.cases.Cancel.make({}), 'cancel'),
]

export const Pending = Schema.Struct({
  count: Schema.String,
  keys: Schema.Array(Schema.String),
  innerCount: Schema.String,
})
export type Pending = typeof Pending.Type

export const idle: Pending = { count: '', keys: [], innerCount: '' }

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

const isOperatorKey = (key: Key | undefined): boolean =>
  Object.values(operatorKeys).includes(key ?? '')

const countSlot = (
  pending: Pending,
  key: Key,
): Option.Option<'count' | 'innerCount'> => {
  const slot =
    pending.keys.length === 0
      ? 'count'
      : pending.keys.length === 1 && isOperatorKey(pending.keys[0])
        ? 'innerCount'
        : undefined
  return slot !== undefined &&
    /^[0-9]$/u.test(key) &&
    (key !== '0' || pending[slot] !== '')
    ? Option.some(slot)
    : Option.none()
}

const countOf = (pending: Pending): number | undefined =>
  pending.count === '' && pending.innerCount === ''
    ? undefined
    : Number(pending.count || '1') * Number(pending.innerCount || '1')

export const advance = (
  bindings: ReadonlyArray<Binding>,
  pending: Pending,
  key: Key,
): Advance =>
  Option.match(countSlot(pending, key), {
    onSome: slot =>
      Advance.cases.Wait.make({
        pending: {
          ...pending,
          [slot]: (pending[slot] + key).slice(0, maxCountDigits),
        },
      }),
    onNone: () => {
      const keys = [...pending.keys, key]
      const candidates = reachable(bindings, keys)
      return Option.match(
        Array.findFirst(
          candidates,
          binding => binding.keys.length === keys.length,
        ),
        {
          onSome: ({ command }) =>
            Advance.cases.Run.make({ command, count: countOf(pending) }),
          onNone: () =>
            candidates.length > 0
              ? Advance.cases.Wait.make({ pending: { ...pending, keys } })
              : Advance.cases.Drop.make({}),
        },
      )
    },
  })

export const next = (
  bindings: ReadonlyArray<Binding>,
  pending: Pending,
): ReadonlyArray<Readonly<{ key: Key; about: string }>> =>
  Array.map(reachable(bindings, pending.keys), binding => ({
    key: binding.keys[pending.keys.length] ?? '',
    about: binding.about,
  }))

export const shown = ({ count, keys, innerCount }: Pending): string =>
  count +
  Array.join(keys.slice(0, 1), '') +
  innerCount +
  Array.join(keys.slice(1), '')
