import { Array, Match, Option, Result } from 'effect'

import { type Matcher, type Node, build } from './matcher'

type Mode = 'VeryMagic' | 'Magic' | 'NoMagic' | 'VeryNoMagic'

type Token =
  | Readonly<{ _tag: 'Letter'; text: string }>
  | Readonly<{
      _tag: 'Magic'
      char: string
      raw: string
      anchorsAnywhere: boolean
    }>
  | Readonly<{ _tag: 'Collection'; body: string; raw: string }>
  | Readonly<{ _tag: 'Brace'; body: string; raw: string }>
  | Readonly<{ _tag: 'Refused'; raw: string }>

type Tokens = Readonly<{
  tokens: ReadonlyArray<Token>
  pattern: string
  rest: Option.Option<string>
}>

export type Split = Readonly<{
  pattern: string
  offset: Option.Option<string>
}>

const escapableToMagic = '^$.*[~()|+?={<>@%&'

const isWordCharacter = /^[0-9A-Za-z_]$/u

const isMagicByDefault = (mode: Mode, c: string): boolean =>
  mode === 'VeryMagic'
    ? !isWordCharacter.test(c)
    : mode === 'Magic'
      ? '^$.*[~'.includes(c)
      : mode === 'NoMagic'
        ? '^$'.includes(c)
        : false

const classified = (
  mode: Mode,
  escaped: boolean,
  char: string,
  raw: string,
): Token => {
  const magic: Token = {
    _tag: 'Magic',
    char,
    raw,
    anchorsAnywhere:
      (char === '^' || char === '$') &&
      (mode === 'VeryMagic' || (mode === 'VeryNoMagic' && escaped)),
  }
  return isWordCharacter.test(char)
    ? escaped
      ? magic
      : { _tag: 'Letter', text: char }
    : isMagicByDefault(mode, char) !== escaped &&
        (!escaped || escapableToMagic.includes(char))
      ? magic
      : { _tag: 'Letter', text: char }
}

const modes: Readonly<Record<string, Mode>> = {
  v: 'VeryMagic',
  m: 'Magic',
  M: 'NoMagic',
  V: 'VeryNoMagic',
}

const closesCollection = (
  chars: ReadonlyArray<string>,
  at: number,
): Option.Option<number> => {
  let index = at + 1
  if (chars[index] === '^') {
    index += 1
  }
  if (chars[index] === ']') {
    index += 1
  }
  while (index < chars.length) {
    const c = chars[index]
    const after = chars[index + 1]
    if (c === ']') {
      return Option.some(index)
    }
    if (c === '\\') {
      index += 2
    } else if (c === '[' && after !== undefined && ':=.'.includes(after)) {
      const end = chars
        .slice(index + 2)
        .findIndex((d, i, rest) => d === after && rest[i + 1] === ']')
      index = end < 0 ? index + 1 : index + 2 + end + 2
    } else {
      index += 1
    }
  }
  return Option.none()
}

const braceAt = (
  chars: ReadonlyArray<string>,
  at: number,
  raw: string,
): Option.Option<Readonly<{ token: Token; to: number }>> => {
  const close = chars.indexOf('}', at)
  return close < 0
    ? Option.none()
    : Option.some({
        token: {
          _tag: 'Brace',
          body: chars.slice(at, close).join('').replace(/\\$/u, ''),
          raw: raw + chars.slice(at, close + 1).join(''),
        },
        to: close + 1,
      })
}

type Read = Readonly<{
  token: Option.Option<Token>
  to: number
  mode: Mode
  swallowsRest?: boolean
}>

const refused = (raw: string, to: number, mode: Mode): Read => ({
  token: Option.some({ _tag: 'Refused', raw }),
  to,
  mode,
})

const readEscaped = (
  chars: ReadonlyArray<string>,
  at: number,
  mode: Mode,
  delimiter: Option.Option<string>,
): Read => {
  const c = chars[at + 1]
  const to = at + 2
  const one = (token: Token): Read => ({
    token: Option.some(token),
    to,
    mode,
  })
  if (c === undefined) {
    return one({ _tag: 'Letter', text: '\\' })
  }
  if (c === '/' || Option.contains(delimiter, c)) {
    return one({ _tag: 'Letter', text: c })
  }
  const switched = modes[c]
  if (switched !== undefined) {
    return { token: Option.none(), to, mode: switched }
  }
  if (c === '{') {
    return Option.match(braceAt(chars, to, '\\{'), {
      onNone: () => refused('\\{', to, mode),
      onSome: ({ token, to: end }) => ({
        token: Option.some(token),
        to: end,
        mode,
      }),
    })
  }
  if (c === '%' || c === '_' || c === 'z') {
    const next = chars[to]
    return c === '%' && next === '('
      ? {
          token: Option.some({
            _tag: 'Magic',
            char: '%(',
            raw: '\\%(',
            anchorsAnywhere: false,
          }),
          to: to + 1,
          mode,
        }
      : refused('\\' + c + (next ?? ''), to + 1, mode)
  }
  if (c === '@' && mode !== 'VeryMagic') {
    const follows =
      /^\d*(?:<=|<!|=|!|>)/u.exec(chars.slice(to).join(''))?.[0] ?? ''
    return refused('\\@' + follows, to + follows.length, mode)
  }
  if (c === '[' && !isMagicByDefault(mode, '[')) {
    return readCollection(chars, at, to - 1, mode)
  }
  return one(classified(mode, true, c, '\\' + c))
}

const readCollection = (
  chars: ReadonlyArray<string>,
  at: number,
  open: number,
  mode: Mode,
): Read =>
  Option.match(closesCollection(chars, open), {
    onNone: () => ({
      token: Option.some<Token>({ _tag: 'Letter', text: '[' }),
      to: open + 1,
      mode,
      swallowsRest: true,
    }),
    onSome: close => ({
      token: Option.some<Token>({
        _tag: 'Collection',
        body: chars.slice(open + 1, close).join(''),
        raw: chars.slice(at, close + 1).join(''),
      }),
      to: close + 1,
      mode,
    }),
  })

const readPlain = (
  chars: ReadonlyArray<string>,
  at: number,
  mode: Mode,
): Read => {
  const c = chars[at] ?? ''
  const one = (token: Token): Read => ({
    token: Option.some(token),
    to: at + 1,
    mode,
  })
  if (c === '[' && isMagicByDefault(mode, '[')) {
    return readCollection(chars, at, at, mode)
  }
  if (c === '{' && mode === 'VeryMagic') {
    return Option.match(braceAt(chars, at + 1, '{'), {
      onNone: () => refused('{', at + 1, mode),
      onSome: ({ token, to }) => ({ token: Option.some(token), to, mode }),
    })
  }
  if (c === '%' && mode === 'VeryMagic') {
    const next = chars[at + 1]
    return next === '('
      ? {
          token: Option.some({
            _tag: 'Magic',
            char: '%(',
            raw: '%(',
            anchorsAnywhere: false,
          }),
          to: at + 2,
          mode,
        }
      : refused('%' + (next ?? ''), at + 2, mode)
  }
  return one(classified(mode, false, c, c))
}

const tokenize = (text: string, delimiter: Option.Option<string>): Tokens => {
  const chars = Array.fromIterable(text)
  const tokens: Array<Token> = []
  let mode: Mode = 'Magic'
  let at = 0
  let pattern = ''
  let rest: Option.Option<string> = Option.none()
  let ending = delimiter
  while (at < chars.length) {
    const c = chars[at] ?? ''
    if (Option.contains(ending, c)) {
      rest = Option.some(chars.slice(at + 1).join(''))
      break
    }
    const read: Read =
      c === '\\'
        ? readEscaped(chars, at, mode, ending)
        : readPlain(chars, at, mode)
    if (Option.isSome(read.token)) {
      tokens.push(read.token.value)
    }
    pattern +=
      c === '\\' && chars[at + 1] === '?' && Option.contains(ending, '?')
        ? '?'
        : chars.slice(at, read.to).join('')
    mode = read.mode
    ending = read.swallowsRest === true ? Option.none() : ending
    at = read.to
  }
  return { tokens, pattern, rest }
}

export const split = (text: string, delimiter: '/' | '?'): Split => {
  const { pattern, rest } = tokenize(text, Option.some(delimiter))
  return { pattern, offset: rest }
}

export const noPrevious = 'E35: No previous regular expression'

export const notSupported = (what: string): string =>
  `not supported in a search: ${what}`

const unsupported = (what: string): Result.Result<never, string> =>
  Result.fail(notSupported(what))

type Range = readonly [number, number]

type ClassNode = Extract<Node, { _tag: 'Class' }>

const classOf = (
  ranges: ReadonlyArray<Range>,
  negated = false,
  folds = true,
): ClassNode => ({
  _tag: 'Class',
  ranges,
  negated,
  folds,
})

const blank: ReadonlyArray<Range> = [
  [9, 9],
  [32, 32],
]
const wordLetters: ReadonlyArray<Range> = [
  [48, 57],
  [65, 90],
  [95, 95],
  [97, 122],
]
const letters: ReadonlyArray<Range> = [
  [65, 90],
  [97, 122],
]
const digits: ReadonlyArray<Range> = [[48, 57]]
const lower: ReadonlyArray<Range> = [[97, 122]]
const upper: ReadonlyArray<Range> = [[65, 90]]
const hexDigits: ReadonlyArray<Range> = [
  [48, 57],
  [65, 70],
  [97, 102],
]
const headLetters: ReadonlyArray<Range> = [
  [65, 90],
  [95, 95],
  [97, 122],
]

const namedClasses: Readonly<Record<string, ClassNode>> = {
  s: classOf(blank),
  S: classOf(blank, true),
  w: classOf(wordLetters),
  W: classOf(wordLetters, true),
  a: classOf(letters),
  A: classOf(letters, true),
  d: classOf(digits),
  D: classOf(digits, true),
  l: classOf(lower, false, false),
  L: classOf(lower, true, false),
  u: classOf(upper, false, false),
  U: classOf(upper, true, false),
  x: classOf(hexDigits),
  X: classOf(hexDigits, true),
  h: classOf(headLetters),
  H: classOf(headLetters, true),
}

type Entry = Readonly<{ code: number; isDash: boolean }>

const collectionEscapes: Readonly<Record<string, number>> = {
  e: 0x1b,
  t: 9,
  r: 13,
  b: 8,
  '\\': 92,
  ']': 93,
  '^': 94,
  '-': 45,
}

const numberEscapes: Readonly<
  Record<string, Readonly<{ digits: RegExp; radix: number; most: number }>>
> = {
  d: { digits: /^\d{1,7}/u, radix: 10, most: 0x10ffff },
  o: { digits: /^[0-7]{1,4}/u, radix: 8, most: 0o377 },
  x: { digits: /^[0-9a-fA-F]{1,2}/u, radix: 16, most: 0xff },
  u: { digits: /^[0-9a-fA-F]{1,4}/u, radix: 16, most: 0xffff },
  U: { digits: /^[0-9a-fA-F]{1,8}/u, radix: 16, most: 0x10ffff },
}

type Escape = Readonly<{ code: number; length: number }>

const numberEscape = (
  chars: ReadonlyArray<string>,
  index: number,
  letter: string,
): Option.Option<Escape> => {
  const kind = numberEscapes[letter]
  const digits = kind?.digits.exec(chars.slice(index + 2).join(''))?.[0]
  if (kind === undefined || digits === undefined) {
    return Option.none()
  }
  const fitting = Array.makeBy(digits.length, count => count + 1)
    .map(count => digits.slice(0, count))
    .filter(prefix => parseInt(prefix, kind.radix) <= kind.most)
  const longest = fitting[fitting.length - 1]
  return longest === undefined
    ? Option.none()
    : Option.some({
        code: parseInt(longest, kind.radix),
        length: 2 + longest.length,
      })
}

const escapeAt = (
  chars: ReadonlyArray<string>,
  index: number,
  letter: string,
): Option.Option<Escape> => {
  const fixed = collectionEscapes[letter]
  return fixed === undefined
    ? numberEscape(chars, index, letter)
    : Option.some({ code: fixed, length: 2 })
}

const entriesOf = (
  chars: ReadonlyArray<string>,
  raw: string,
): Result.Result<ReadonlyArray<Entry>, string> => {
  const entries: Array<Entry> = []
  let index = 0
  while (index < chars.length) {
    const char = chars[index] ?? ''
    const after = chars[index + 1]
    if (char === '[' && after !== undefined && ':=.'.includes(after)) {
      return unsupported(raw)
    }
    if (char === '\\' && after === 'n') {
      return unsupported(raw)
    }
    const escape =
      char === '\\' && after !== undefined
        ? escapeAt(chars, index, after)
        : Option.none<Escape>()
    if (Option.isSome(escape)) {
      entries.push({ code: escape.value.code, isDash: false })
      index += escape.value.length
    } else {
      entries.push({ code: char.codePointAt(0) ?? 0, isDash: char === '-' })
      index += 1
    }
  }
  return Result.succeed(entries)
}

const rangesOf = (
  entries: ReadonlyArray<Entry>,
): Result.Result<ReadonlyArray<Range>, string> => {
  const ranges: Array<Range> = []
  let index = 0
  while (index < entries.length) {
    const from = entries[index]?.code ?? 0
    const dash = entries[index + 1]
    const to = entries[index + 2]
    if (dash?.isDash === true && to !== undefined) {
      if (from > to.code) {
        return Result.fail('E944: Reverse range in character class')
      }
      ranges.push([from, to.code])
      index += 3
    } else {
      ranges.push([from, from])
      index += 1
    }
  }
  return Result.succeed(ranges)
}

const collectionNode = (
  body: string,
  raw: string,
): Result.Result<Node, string> => {
  const chars = Array.fromIterable(body)
  const negated = chars[0] === '^'
  return Result.map(
    Result.flatMap(entriesOf(negated ? chars.slice(1) : chars, raw), rangesOf),
    ranges => classOf(ranges, negated),
  )
}

type Repeating = Readonly<{ min: number; max: number; lazy: boolean }>

const countsOf = (body: string): Option.Option<Repeating> => {
  const found = /^(-?)(\d*)(?:(,)(\d*))?$/u.exec(body)
  if (found === null) {
    return Option.none()
  }
  const low = found[2] ?? ''
  const high = found[4] ?? ''
  const min = low === '' ? 0 : Number(low)
  const max =
    found[3] === ','
      ? high === ''
        ? Infinity
        : Number(high)
      : low === ''
        ? Infinity
        : min
  return Option.some({
    min: Math.min(min, max),
    max: Math.max(min, max),
    lazy: found[1] === '-',
  })
}

type Shape = 'Atom' | 'Group' | 'Repeated' | 'Anchor'

type Item = Readonly<{ node: Node; shape: Shape; atLineStart: boolean }>

type Frame = Readonly<{
  branches: ReadonlyArray<Node>
  items: ReadonlyArray<Item>
  opener: string
}>

type State = Readonly<{
  outer: ReadonlyArray<Frame>
  frame: Frame
  ignoreCase: boolean
  captures: number
}>

const emptyFrame = (opener: string): Frame => ({
  branches: [],
  items: [],
  opener,
})

const itemOf = (
  node: Node,
  shape: Shape = 'Atom',
  atLineStart = false,
): Item => ({
  node,
  shape,
  atLineStart,
})

const withItem = (state: State, item: Item): State => ({
  ...state,
  frame: { ...state.frame, items: [...state.frame.items, item] },
})

const concatenated = (items: ReadonlyArray<Item>): Node =>
  items.length === 1 && items[0] !== undefined
    ? items[0].node
    : { _tag: 'Concat', nodes: items.map(item => item.node) }

const alternation = (frame: Frame): Node => {
  const branches = [...frame.branches, concatenated(frame.items)]
  return branches.length === 1 && branches[0] !== undefined
    ? branches[0]
    : { _tag: 'Alternate', branches }
}

const syntax = (text: string): Result.Result<never, string> => Result.fail(text)

const letterItem = (text: string): Item =>
  itemOf({ _tag: 'Letter', char: text })

const repeated = (
  state: State,
  raw: string,
  how: Repeating,
  starIsLetter: boolean,
): Result.Result<State, string> =>
  Option.match(Array.last(state.frame.items), {
    onNone: () =>
      starIsLetter
        ? Result.succeed(withItem(state, letterItem('*')))
        : syntax(`E64: ${raw} follows nothing`),
    onSome: last => {
      if (last.atLineStart && starIsLetter) {
        return Result.succeed(withItem(state, letterItem('*')))
      }
      if (last.shape === 'Repeated') {
        return syntax(raw === '*' ? 'E61: Nested *' : `E62: Nested ${raw}`)
      }
      return Result.succeed({
        ...state,
        frame: {
          ...state.frame,
          items: [
            ...state.frame.items.slice(0, -1),
            itemOf({ _tag: 'Repeat', node: last.node, ...how }, 'Repeated'),
          ],
        },
      })
    },
  })

const mostCaptures = 9

const opened = (state: State, raw: string): Result.Result<State, string> => {
  const captures = state.captures + (raw.endsWith('%(') ? 0 : 1)
  return captures > mostCaptures
    ? syntax("E872: (NFA regexp) Too many '('")
    : Result.succeed({
        ...state,
        outer: [...state.outer, state.frame],
        frame: emptyFrame(raw),
        captures,
      })
}

const closed = (state: State, raw: string): Result.Result<State, string> =>
  Option.match(Array.last(state.outer), {
    onNone: () => syntax(`E55: Unmatched ${raw}`),
    onSome: outer =>
      Result.succeed(
        withItem(
          { ...state, outer: state.outer.slice(0, -1), frame: outer },
          itemOf({ _tag: 'Group', node: alternation(state.frame) }, 'Group'),
        ),
      ),
  })

const alternated = (state: State): Result.Result<State, string> =>
  Result.succeed({
    ...state,
    frame: {
      ...state.frame,
      branches: [...state.frame.branches, concatenated(state.frame.items)],
      items: [],
    },
  })

const anchored = (
  state: State,
  kind: 'LineStart' | 'LineEnd' | 'WordStart' | 'WordEnd',
): Result.Result<State, string> =>
  Result.succeed(
    withItem(
      state,
      itemOf({ _tag: 'Assert', kind }, 'Anchor', kind === 'LineStart'),
    ),
  )

const closesPattern = (tokens: ReadonlyArray<Token>, from: number): boolean => {
  const at = tokens.findIndex(
    (token, index) =>
      index >= from &&
      !(token._tag === 'Magic' && (token.char === 'c' || token.char === 'C')),
  )
  const next = tokens[at]
  return (
    at < 0 ||
    (next?._tag === 'Magic' && (next.char === ')' || next.char === '|'))
  )
}

const quantifiers: Readonly<Record<string, Repeating>> = {
  '*': { min: 0, max: Infinity, lazy: false },
  '+': { min: 1, max: Infinity, lazy: false },
  '=': { min: 0, max: 1, lazy: false },
  '?': { min: 0, max: 1, lazy: false },
}

const magic = (
  state: State,
  token: Extract<Token, { _tag: 'Magic' }>,
  tokens: ReadonlyArray<Token>,
  index: number,
): Result.Result<State, string> => {
  const { char, raw } = token
  const quantifier = quantifiers[char]
  if (quantifier !== undefined) {
    return repeated(state, raw, quantifier, char === '*')
  }
  const named = namedClasses[char]
  if (named !== undefined) {
    return Result.succeed(withItem(state, itemOf(named)))
  }
  switch (char) {
    case '^':
      return state.frame.items.length === 0 || token.anchorsAnywhere
        ? anchored(state, 'LineStart')
        : Result.succeed(withItem(state, letterItem('^')))
    case '$':
      return closesPattern(tokens, index + 1) || token.anchorsAnywhere
        ? anchored(state, 'LineEnd')
        : Result.succeed(withItem(state, letterItem('$')))
    case '.':
      return Result.succeed(withItem(state, itemOf({ _tag: 'Any' })))
    case '(':
    case '%(':
      return opened(state, raw)
    case ')':
      return closed(state, raw)
    case '|':
      return alternated(state)
    case '<':
      return anchored(state, 'WordStart')
    case '>':
      return anchored(state, 'WordEnd')
    case 'c':
      return Result.succeed({ ...state, ignoreCase: true })
    case 'C':
      return Result.succeed(state)
    case 't':
      return Result.succeed(withItem(state, letterItem('\t')))
    default:
      return unsupported(raw)
  }
}

const translated = (
  state: State,
  token: Token,
  tokens: ReadonlyArray<Token>,
  index: number,
): Result.Result<State, string> =>
  Match.value(token).pipe(
    Match.tagsExhaustive({
      Letter: letter =>
        Result.succeed(withItem(state, letterItem(letter.text))),
      Magic: magical => magic(state, magical, tokens, index),
      Refused: refused => unsupported(refused.raw),
      Collection: collection =>
        Result.map(collectionNode(collection.body, collection.raw), node =>
          withItem(state, itemOf(node)),
        ),
      Brace: brace =>
        Option.match(countsOf(brace.body), {
          onNone: () => syntax('E554: Syntax error in \\{...}'),
          onSome: how => repeated(state, '\\{', how, false),
        }),
    }),
  )

export const compile = (pattern: string): Result.Result<Matcher, string> => {
  const { tokens } = tokenize(pattern, Option.none())
  const initial: Result.Result<State, string> = Result.succeed({
    outer: [],
    frame: emptyFrame(''),
    ignoreCase: false,
    captures: 0,
  })
  const folded = Array.reduce(tokens, initial, (state, token, index) =>
    Result.flatMap(state, current => translated(current, token, tokens, index)),
  )
  return Result.flatMap(folded, state => {
    const { opener } = state.frame
    if (state.outer.length > 0) {
      return syntax(
        opener.endsWith('%(')
          ? `E53: Unmatched ${opener.replace('%(', '')}%(`
          : `E54: Unmatched ${opener}`,
      )
    }
    return build(alternation(state.frame), state.ignoreCase)
  })
}
