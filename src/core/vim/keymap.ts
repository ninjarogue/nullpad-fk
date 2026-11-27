import { Array, Option, Schema } from 'effect'

import * as History from '../history'
import { MotionName } from './motions'
import { ObjectName } from './objects'
import {
  type RegisterName,
  Side,
  defaultRegister,
  registerNamed,
} from './operators'
import { Seek, Way } from './seek'
import { Amount, BlockAmount, Kind as SelectionKind } from './selection'
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

export const SelectionEdge = Schema.Literals(['Start', 'End'])
export type SelectionEdge = typeof SelectionEdge.Type

export const Command = Schema.TaggedUnion({
  Move: { motion: MotionName },
  Seek: { seek: Seek },
  OpenSearch: { way: Way, operator: Schema.Option(OperatorName) },
  OpenCommand: {},
  OpenJump: { operator: Schema.Option(OperatorName) },
  Operate: { operator: OperatorName, target: TargetName },
  OperateSeek: { operator: OperatorName, seek: Seek },
  OperateAmount: { operator: OperatorName, amount: Amount },
  OperateBlock: { operator: OperatorName, amount: BlockAmount },
  ReplaceLetters: { letter: Schema.String },
  ReplaceAmount: { letter: Schema.String, amount: Amount },
  ReplaceBlock: { letter: Schema.String, amount: BlockAmount },
  Put: { side: Side },
  Insert: { at: InsertAt },
  InsertAsSelected: { at: SelectionEdge },
  InsertInBlock: { at: SelectionEdge, amount: BlockAmount },
  Cancel: {},
  Travel: { way: History.Way },
  Repeat: {},
  Select: { kind: SelectionKind },
  Reselect: {},
})
export type Command = typeof Command.Type

export const Reach = Schema.Literals([
  'AsSelected',
  'WholeLines',
  'LinesOrBlock',
  'LinesOrBlockToLineEnds',
])
export type Reach = typeof Reach.Type

export const VisualCommand = Schema.TaggedUnion({
  Move: { motion: MotionName },
  Seek: { seek: Seek },
  OpenSearch: { way: Way },
  OpenJump: {},
  Operate: { operator: OperatorName, reach: Reach },
  Replace: { side: Side },
  ReplaceLetters: { letter: Schema.String },
  Insert: { at: SelectionEdge },
  Pick: { object: ObjectName },
  Swap: {},
  SwapColumns: {},
  Select: { kind: SelectionKind },
  Leave: {},
  Ignore: {},
})
export type VisualCommand = typeof VisualCommand.Type

export type Binding<C> = Readonly<{
  keys: ReadonlyArray<Key>
  about: string
  hint: string
}> &
  (
    | Readonly<{ command: C }>
    | Readonly<{ takes: (argument: Key) => Option.Option<C> }>
  )

export const keysOf = (notation: string): ReadonlyArray<Key> =>
  notation.match(/<[^>]+>|./gu) ?? []

const bind = <C>(
  notation: string,
  command: C,
  about: string,
  hint: string = about,
): Binding<C> => ({
  keys: keysOf(notation),
  command,
  about,
  hint,
})

export const anyKey: Key = '<Any>'

export const longerText: Key = '<Text>'

export const isNamedKey = (key: Key): boolean =>
  key.length > 1 && key.startsWith('<')

const namedLetters: Readonly<Record<Key, string>> = {
  '<Tab>': '\t',
  '<CR>': '\n',
}

export const letterOf = (key: Key): Option.Option<string> =>
  isNamedKey(key) ? Option.fromNullishOr(namedLetters[key]) : Option.some(key)

const takeLetter = <C>(
  notation: string,
  command: (letter: string) => C,
  about: string,
): Binding<C> => ({
  keys: keysOf(notation + anyKey),
  takes: key => Option.map(letterOf(key), command),
  about,
  hint: about,
})

const lifted = <A, B>(
  binding: Binding<A>,
  prefix: string,
  to: (a: A) => B,
  about: string,
): Binding<B> => {
  const keys = [...keysOf(prefix), ...binding.keys]
  return 'command' in binding
    ? { keys, command: to(binding.command), about, hint: binding.hint }
    : {
        keys,
        takes: key => Option.map(binding.takes(key), to),
        about,
        hint: binding.hint,
      }
}

const findRow = (
  notation: string,
  way: Way,
  till: boolean,
  about: string,
): Binding<Seek> =>
  takeLetter(
    notation,
    letter => Seek.cases.Find.make({ way, till, letter }),
    about,
  )

export const jumpKey: Key = 's'

const openRows: ReadonlyArray<Binding<Way>> = [
  bind('/', 'Forward', 'search forward'),
  bind('?', 'Backward', 'search backward'),
]

const seekRows: ReadonlyArray<Binding<Seek>> = [
  findRow('f', 'Forward', false, 'to the letter'),
  findRow('F', 'Backward', false, 'back to the letter'),
  findRow('t', 'Forward', true, 'to before the letter'),
  findRow('T', 'Backward', true, 'back to after the letter'),
  bind(';', Seek.cases.Again.make({ reverse: false }), 'the last find again'),
  bind(
    ',',
    Seek.cases.Again.make({ reverse: true }),
    'the last find the other way',
  ),
  bind('n', Seek.cases.Next.make({ reverse: false }), 'the last search again'),
  bind(
    'N',
    Seek.cases.Next.make({ reverse: true }),
    'the last search the other way',
  ),
  bind(
    '*',
    Seek.cases.Word.make({ way: 'Forward' }),
    'search the word forward',
  ),
  bind(
    '#',
    Seek.cases.Word.make({ way: 'Backward' }),
    'search the word backward',
  ),
]

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
  hint: string = about,
): Binding<Command> =>
  bind(notation, Command.cases.Operate.make({ operator, target }), about, hint)

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
  ['<Home>', 'FirstColumn', 'line start'],
  ['^', 'FirstNonBlank', 'first non-blank'],
  ['$', 'LineEnd', 'line end'],
  ['<End>', 'LineEnd', 'line end'],
  ['gg', 'FirstLine', 'first line'],
  ['<C-Home>', 'FirstLine', 'first line'],
  ['G', 'LastLine', 'last line'],
  ['<C-End>', 'LastLineEnd', 'end of last line'],
]

const objectRows: ReadonlyArray<
  readonly [notation: string, target: ObjectName, about: string]
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
  ['i<', 'InnerAngle', 'inside angle brackets'],
  ['a<', 'AAngle', 'angle brackets'],
  ['i>', 'InnerAngle', 'inside angle brackets'],
  ['a>', 'AAngle', 'angle brackets'],
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
      operate(key + notation, operator, motion, `${verb} to ${about}`, about),
    ),
    ...Array.map(seekRows, row =>
      lifted(
        row,
        key,
        seek => Command.cases.OperateSeek.make({ operator, seek }),
        `${verb} ${row.about}`,
      ),
    ),
    ...Array.map(openRows, row =>
      lifted(
        row,
        key,
        way =>
          Command.cases.OpenSearch.make({
            way,
            operator: Option.some(operator),
          }),
        `${verb} ${row.about}`,
      ),
    ),
    bind(
      key + jumpKey,
      Command.cases.OpenJump.make({ operator: Option.some(operator) }),
      `${verb} to a match on screen`,
      'to a match on screen',
    ),
    operate(key + key, operator, 'Lines', `${verb} lines`, 'lines'),
    ...Array.map(objectRows, ([notation, target, about]) =>
      operate(key + notation, operator, target, `${verb} ${about}`, about),
    ),
  ]
}

export const normal: ReadonlyArray<Binding<Command>> = [
  ...Array.map(motionRows, ([notation, motion, about]) =>
    move(notation, motion, about),
  ),
  ...Array.map(seekRows, row =>
    lifted(row, '', seek => Command.cases.Seek.make({ seek }), row.about),
  ),
  ...Array.map(openRows, row =>
    lifted(
      row,
      '',
      way => Command.cases.OpenSearch.make({ way, operator: Option.none() }),
      row.about,
    ),
  ),
  bind(':', Command.cases.OpenCommand.make({}), 'command line'),
  ...Array.flatMap(OperatorName.literals, operatorRows),
  operate('x', 'Delete', 'Right', 'delete character'),
  operate('<Del>', 'Delete', 'Right', 'delete character'),
  operate('X', 'Delete', 'Left', 'delete character before'),
  operate('D', 'Delete', 'LineEnd', 'delete to line end'),
  operate('C', 'Change', 'LineEnd', 'change to line end'),
  bind(
    jumpKey,
    Command.cases.OpenJump.make({ operator: Option.none() }),
    'jump to a match on screen',
  ),
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
  takeLetter(
    'r',
    letter => Command.cases.ReplaceLetters.make({ letter }),
    'replace letters',
  ),
  bind('u', Command.cases.Travel.make({ way: 'Undo' }), 'undo'),
  bind('<C-r>', Command.cases.Travel.make({ way: 'Redo' }), 'redo'),
  bind('.', Command.cases.Repeat.make({}), 'repeat last change'),
  bind('v', Command.cases.Select.make({ kind: 'Letters' }), 'select letters'),
  bind('V', Command.cases.Select.make({ kind: 'Lines' }), 'select lines'),
  bind('<C-v>', Command.cases.Select.make({ kind: 'Block' }), 'select a block'),
  bind('gv', Command.cases.Reselect.make({}), 'select the last selection'),
  bind('<Esc>', Command.cases.Cancel.make({}), 'cancel'),
  bind('<C-[>', Command.cases.Cancel.make({}), 'cancel'),
]

const keysWithAnArgument: ReadonlyArray<Key> = [
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

export const screenKeys: ReadonlyArray<Key> = ['<C-e>', '<C-p>']

const reachAbouts: Readonly<Record<Reach, string>> = {
  AsSelected: 'the selection',
  WholeLines: 'the lines',
  LinesOrBlock: 'the lines, or the block',
  LinesOrBlockToLineEnds: 'the lines, or the block to each line end',
}

const operateOn = (
  notation: string,
  operator: OperatorName,
  reach: Reach,
): Binding<VisualCommand> =>
  bind(
    notation,
    VisualCommand.cases.Operate.make({ operator, reach }),
    `${verbs[operator]} ${reachAbouts[reach]}`,
  )

export const visual: ReadonlyArray<Binding<VisualCommand>> = [
  ...Array.map(motionRows, ([notation, motion, about]) =>
    bind(notation, VisualCommand.cases.Move.make({ motion }), about),
  ),
  ...Array.map(seekRows, row =>
    lifted(row, '', seek => VisualCommand.cases.Seek.make({ seek }), row.about),
  ),
  ...Array.map(openRows, row =>
    lifted(
      row,
      '',
      way => VisualCommand.cases.OpenSearch.make({ way }),
      row.about,
    ),
  ),
  ...Array.map(objectRows, ([notation, object, about]) =>
    bind(
      notation,
      VisualCommand.cases.Pick.make({ object }),
      `select ${about}`,
      about,
    ),
  ),
  bind('o', VisualCommand.cases.Swap.make({}), 'go to the other end'),
  bind(
    'O',
    VisualCommand.cases.SwapColumns.make({}),
    'go to the other end, or the other corner of the line',
  ),
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
  bind(
    '<C-v>',
    VisualCommand.cases.Select.make({ kind: 'Block' }),
    'select a block, or leave',
  ),
  operateOn('d', 'Delete', 'AsSelected'),
  operateOn('x', 'Delete', 'AsSelected'),
  operateOn('<Del>', 'Delete', 'AsSelected'),
  operateOn('y', 'Yank', 'AsSelected'),
  operateOn('c', 'Change', 'AsSelected'),
  bind(
    jumpKey,
    VisualCommand.cases.OpenJump.make({}),
    'move the cursor end to a match on screen',
  ),
  operateOn('X', 'Delete', 'LinesOrBlock'),
  operateOn('D', 'Delete', 'LinesOrBlockToLineEnds'),
  operateOn('Y', 'Yank', 'LinesOrBlock'),
  operateOn('C', 'Change', 'LinesOrBlockToLineEnds'),
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
  takeLetter(
    'r',
    letter => VisualCommand.cases.ReplaceLetters.make({ letter }),
    'replace every letter of the selection',
  ),
  bind('<Esc>', leave, 'leave'),
  bind('<C-[>', leave, 'leave'),
  bind('<C-c>', leave, 'leave'),
  ...Array.map(screenKeys, key => bind(key, leave, 'leave')),
  ...Array.map(keysWithAnArgument, key =>
    bind(key + anyKey, VisualCommand.cases.Ignore.make({}), 'not built', ''),
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

export const isOperatorKey = (key: Key | undefined): boolean =>
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
          onSome: (binding): Advance<C> =>
            Option.match(
              'command' in binding
                ? Option.some(binding.command)
                : binding.takes(key),
              {
                onNone: () => drop,
                onSome: (command): Advance<C> => ({
                  _tag: 'Run',
                  command,
                  count: countOf(pending),
                  register: registerOf(pending),
                }),
              },
            ),
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
  if (screenKeys.includes(key)) {
    return advanceKeys(bindings, idle, key)
  }
  if (awaitsRegisterName(pending)) {
    return namesRegister(pending, key)
  }
  return key === registerPrefix && pending.keys.length === 0
    ? startsRegister(pending)
    : advanceKeys(bindings, pending, key)
}

export const awaitsArgument = <C>(
  bindings: ReadonlyArray<Binding<C>>,
  pending: Pending,
): boolean =>
  !awaitsRegisterName(pending) &&
  reachable(bindings, pending.keys).some(
    binding => binding.keys[pending.keys.length] === anyKey,
  )

export type Following = Readonly<{
  key: Key
  hint: string
  leads: 'Nowhere' | 'Keys'
}>

export const groupHints: Readonly<Record<Key, string>> = {
  i: 'inside',
  a: 'around',
}

export const groupHintFallback = 'more'

export const following = <C>(
  bindings: ReadonlyArray<Binding<C>>,
  pending: Pending,
): ReadonlyArray<Following> => {
  const depth = pending.keys.length
  const rows = Array.filter(
    reachable(bindings, pending.keys),
    row => row.keys.length > depth,
  )
  return Array.map(
    Array.filter(
      rows,
      (row, index) =>
        rows.findIndex(other => other.keys[depth] === row.keys[depth]) ===
        index,
    ),
    (row): Following => ({
      key: row.keys[depth] ?? '',
      hint: row.hint,
      leads: Array.some(
        rows,
        other =>
          other.keys[depth] === row.keys[depth] &&
          other.keys.length > depth + 1 &&
          other.keys[depth + 1] !== anyKey,
      )
        ? 'Keys'
        : 'Nowhere',
    }),
  )
}

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
