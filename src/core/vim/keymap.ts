import { Array, Option, Schema } from 'effect'

import * as History from '../history'
import { MotionName } from './motions'
import {
  type RegisterName,
  Side,
  defaultRegister,
  registerNamed,
} from './operators'
import { Amount, Kind as SelectionKind } from './selection'
import { OperatorName, TargetName } from './targets'

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
  OperateAmount: { operator: OperatorName, amount: Amount },
  Put: { side: Side },
  Insert: { at: InsertAt },
  Cancel: {},
  Travel: { way: History.Way },
  Repeat: {},
  Select: { kind: SelectionKind },
  Reselect: {},
})
export type Command = typeof Command.Type

export const Reach = Schema.Literals(['AsSelected', 'WholeLines'])
export type Reach = typeof Reach.Type

export const VisualCommand = Schema.TaggedUnion({
  Move: { motion: MotionName },
  Operate: { operator: OperatorName, reach: Reach },
  Replace: { side: Side },
  Insert: { at: Schema.Literals(['Start', 'End']) },
  Swap: {},
  Select: { kind: SelectionKind },
  Leave: {},
  Ignore: {},
})
export type VisualCommand = typeof VisualCommand.Type

export type Binding<C> = Readonly<{
  keys: ReadonlyArray<Key>
  command: C
  about: string
}>

export const keysOf = (notation: string): ReadonlyArray<Key> =>
  notation.match(/<[^>]+>|./gu) ?? []

const bind = <C>(notation: string, command: C, about: string): Binding<C> => ({
  keys: keysOf(notation),
  command,
  about,
})

const move = (
  notation: string,
  motion: MotionName,
  about: string,
): Binding<Command> =>
  bind(notation, Command.cases.Move.make({ motion }), about)

const insert = (
  notation: string,
  at: InsertAt,
  about: string,
): Binding<Command> => bind(notation, Command.cases.Insert.make({ at }), about)

const operate = (
  notation: string,
  operator: OperatorName,
  target: TargetName,
  about: string,
): Binding<Command> =>
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

const operatorRows = (
  operator: OperatorName,
): ReadonlyArray<Binding<Command>> => {
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

export const normal: ReadonlyArray<Binding<Command>> = [
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
  bind('v', Command.cases.Select.make({ kind: 'Letters' }), 'select letters'),
  bind('V', Command.cases.Select.make({ kind: 'Lines' }), 'select lines'),
  bind('gv', Command.cases.Reselect.make({}), 'select the last selection'),
  bind('<Esc>', Command.cases.Cancel.make({}), 'cancel'),
  bind('<C-[>', Command.cases.Cancel.make({}), 'cancel'),
]

const anyKey: Key = '<Any>'

const keysWithAnArgument: ReadonlyArray<Key> = [
  'r',
  'f',
  'F',
  't',
  'T',
  'm',
  "'",
  '`',
  '@',
  'q',
  'z',
  '[',
  ']',
  '<C-w>',
]

const leave = VisualCommand.cases.Leave.make({})

const operateOn = (
  notation: string,
  operator: OperatorName,
  reach: Reach,
): Binding<VisualCommand> =>
  bind(
    notation,
    VisualCommand.cases.Operate.make({ operator, reach }),
    `${verbs[operator]} ${reach === 'WholeLines' ? 'the lines' : 'the selection'}`,
  )

export const visual: ReadonlyArray<Binding<VisualCommand>> = [
  ...Array.map(motionRows, ([notation, motion, about]) =>
    bind(notation, VisualCommand.cases.Move.make({ motion }), about),
  ),
  bind('o', VisualCommand.cases.Swap.make({}), 'go to the other end'),
  bind(
    'v',
    VisualCommand.cases.Select.make({ kind: 'Letters' }),
    'select letters, or leave',
  ),
  bind(
    'V',
    VisualCommand.cases.Select.make({ kind: 'Lines' }),
    'select lines, or leave',
  ),
  operateOn('d', 'Delete', 'AsSelected'),
  operateOn('x', 'Delete', 'AsSelected'),
  operateOn('<Del>', 'Delete', 'AsSelected'),
  operateOn('y', 'Yank', 'AsSelected'),
  operateOn('c', 'Change', 'AsSelected'),
  operateOn('s', 'Change', 'AsSelected'),
  operateOn('X', 'Delete', 'WholeLines'),
  operateOn('D', 'Delete', 'WholeLines'),
  operateOn('Y', 'Yank', 'WholeLines'),
  operateOn('C', 'Change', 'WholeLines'),
  operateOn('S', 'Change', 'WholeLines'),
  operateOn('R', 'Change', 'WholeLines'),
  bind(
    'p',
    VisualCommand.cases.Replace.make({ side: 'After' }),
    'put over the selection, and keep what it held',
  ),
  bind(
    'P',
    VisualCommand.cases.Replace.make({ side: 'Before' }),
    'put over the selection',
  ),
  bind(
    'I',
    VisualCommand.cases.Insert.make({ at: 'Start' }),
    'insert at the start of the first line',
  ),
  bind(
    'A',
    VisualCommand.cases.Insert.make({ at: 'End' }),
    'append after the cursor end',
  ),
  bind('<Esc>', leave, 'leave'),
  bind('<C-[>', leave, 'leave'),
  bind('<C-e>', leave, 'leave'),
  bind('<C-p>', leave, 'leave'),
  ...Array.map(keysWithAnArgument, key =>
    bind(key + anyKey, VisualCommand.cases.Ignore.make({}), 'not built'),
  ),
]

export const Pending = Schema.Struct({
  outerCount: Schema.String,
  register: Schema.String,
  count: Schema.String,
  keys: Schema.Array(Schema.String),
  innerCount: Schema.String,
})
export type Pending = typeof Pending.Type

export const idle: Pending = {
  outerCount: '',
  register: '',
  count: '',
  keys: [],
  innerCount: '',
}

export type Advance<C> =
  | Readonly<{
      _tag: 'Run'
      command: C
      count: number | undefined
      register: RegisterName
    }>
  | Readonly<{ _tag: 'Wait'; pending: Pending }>
  | Readonly<{ _tag: 'Drop' }>

const drop: Advance<never> = { _tag: 'Drop' }

const wait = (pending: Pending): Advance<never> => ({ _tag: 'Wait', pending })

const maxCountDigits = 7

const registerPrefix = '"'

const startsWith = (
  keys: ReadonlyArray<Key>,
  prefix: ReadonlyArray<Key>,
): boolean =>
  prefix.every((key, index) => keys[index] === key || keys[index] === anyKey)

const reachable = <C>(
  bindings: ReadonlyArray<Binding<C>>,
  keys: ReadonlyArray<Key>,
): ReadonlyArray<Binding<C>> =>
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

const product = (counts: ReadonlyArray<string>): string => {
  const typed = Array.filter(counts, count => count !== '')
  return Array.isArrayEmpty(typed)
    ? ''
    : String(
        Math.min(
          Number.MAX_SAFE_INTEGER,
          Array.reduce(typed, 1, (sum, count) => sum * Number(count)),
        ),
      )
}

const countOf = ({
  outerCount,
  count,
  innerCount,
}: Pending): number | undefined => {
  const all = product([outerCount, count, innerCount])
  return all === '' ? undefined : Number(all)
}

const registerOf = ({ register }: Pending): RegisterName =>
  Option.getOrElse(registerNamed(register.slice(1)), () => defaultRegister)

const awaitsRegisterName = (pending: Pending): boolean =>
  pending.register === registerPrefix

const namesRegister = (pending: Pending, key: Key): Advance<never> =>
  Option.match(registerNamed(key), {
    onNone: () => drop,
    onSome: () => wait({ ...pending, register: registerPrefix + key }),
  })

const startsRegister = (pending: Pending): Advance<never> =>
  wait({
    ...pending,
    outerCount: product([pending.outerCount, pending.count]),
    register: registerPrefix,
    count: '',
  })

const advanceKeys = <C>(
  bindings: ReadonlyArray<Binding<C>>,
  pending: Pending,
  key: Key,
): Advance<C> =>
  Option.match(countSlot(pending, key), {
    onSome: (slot): Advance<C> =>
      wait({
        ...pending,
        [slot]: (pending[slot] + key).slice(0, maxCountDigits),
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
          onSome: ({ command }): Advance<C> => ({
            _tag: 'Run',
            command,
            count: countOf(pending),
            register: registerOf(pending),
          }),
          onNone: () =>
            candidates.length > 0 ? wait({ ...pending, keys }) : drop,
        },
      )
    },
  })

export const advance = <C>(
  bindings: ReadonlyArray<Binding<C>>,
  pending: Pending,
  key: Key,
): Advance<C> => {
  if (awaitsRegisterName(pending)) {
    return namesRegister(pending, key)
  }
  return key === registerPrefix && pending.keys.length === 0
    ? startsRegister(pending)
    : advanceKeys(bindings, pending, key)
}

export const next = <C>(
  bindings: ReadonlyArray<Binding<C>>,
  pending: Pending,
): ReadonlyArray<Readonly<{ key: Key; about: string }>> =>
  Array.map(reachable(bindings, pending.keys), binding => ({
    key: binding.keys[pending.keys.length] ?? '',
    about: binding.about,
  }))

export const shown = ({
  outerCount,
  register,
  count,
  keys,
  innerCount,
}: Pending): string =>
  outerCount +
  register +
  count +
  Array.join(keys.slice(0, 1), '') +
  innerCount +
  Array.join(keys.slice(1), '')
