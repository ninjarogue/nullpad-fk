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
  tokens: ReadonlyArray<Token>
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

type Cursor = Readonly<{
  chars: ReadonlyArray<string>
  at: number
  mode: Mode
  ending: Option.Option<string>
}>

type Read = Readonly<{
  token: Option.Option<Token>
  to: number
  mode: Mode
  ending: Option.Option<string>
  source: string
}>

const reading = (
  { chars, at, mode, ending }: Cursor,
  to: number,
  token: Option.Option<Token>,
  over: Partial<Read> = {},
): Read => ({
  token,
  to,
  mode,
  ending,
  source: chars.slice(at, to).join(''),
  ...over,
})

const refused = (cursor: Cursor, raw: string, to: number): Read =>
  reading(cursor, to, Option.some({ _tag: 'Refused', raw }))

const readBrace = (cursor: Cursor, open: number, escape: string): Read => {
  const { chars } = cursor
  const close = chars.indexOf('}', open + 1)
  return close < 0
    ? refused(cursor, escape + '{', open + 1)
    : reading(
        cursor,
        close + 1,
        Option.some({
          _tag: 'Brace',
          body: chars
            .slice(open + 1, close)
            .join('')
            .replace(/\\$/u, ''),
          raw: escape + chars.slice(open, close + 1).join(''),
        }),
      )
}

const readHeld = (cursor: Cursor, held: number, escape: string): Read => {
  const c = cursor.chars[held] ?? ''
  const next = cursor.chars[held + 1]
  return c === '%' && next === '('
    ? reading(
        cursor,
        held + 2,
        Option.some({
          _tag: 'Magic',
          char: '%(',
          raw: escape + '%(',
          anchorsAnywhere: false,
        }),
      )
    : refused(cursor, escape + c + (next ?? ''), held + 2)
}

const readCollection = (cursor: Cursor, open: number): Read =>
  Option.match(closesCollection(cursor.chars, open), {
    onNone: () =>
      reading(
        cursor,
        open + 1,
        Option.some<Token>({ _tag: 'Letter', text: '[' }),
        {
          ending: Option.none(),
        },
      ),
    onSome: close =>
      reading(
        cursor,
        close + 1,
        Option.some<Token>({
          _tag: 'Collection',
          body: cursor.chars.slice(open + 1, close).join(''),
          raw: cursor.chars.slice(cursor.at, close + 1).join(''),
        }),
      ),
  })

const readEscaped = (cursor: Cursor): Read => {
  const { chars, at, mode, ending } = cursor
  const c = chars[at + 1]
  const to = at + 2
  const one = (token: Token, over: Partial<Read> = {}): Read =>
    reading(cursor, to, Option.some(token), over)
  if (c === undefined) {
    return one({ _tag: 'Letter', text: '\\' })
  }
  if (c === '/' || Option.contains(ending, c)) {
    return c === '?'
      ? reading(cursor, to, Option.some(classified(mode, false, c, c)), {
          source: c,
        })
      : one({ _tag: 'Letter', text: c })
  }
  const switched = modes[c]
  if (switched !== undefined) {
    return reading(cursor, to, Option.none(), { mode: switched })
  }
  if (c === '{') {
    return readBrace(cursor, to - 1, '\\')
  }
  if (c === '%' || c === '_' || c === 'z') {
    return readHeld(cursor, at + 1, '\\')
  }
  if (c === '@' && mode !== 'VeryMagic') {
    const follows =
      /^\d*(?:<=|<!|=|!|>)/u.exec(chars.slice(to).join(''))?.[0] ?? ''
    return refused(cursor, '\\@' + follows, to + follows.length)
  }
  if (c === '[' && !isMagicByDefault(mode, '[')) {
    return readCollection(cursor, to - 1)
  }
  return one(classified(mode, true, c, '\\' + c))
}

const readPlain = (cursor: Cursor): Read => {
  const { chars, at, mode } = cursor
  const c = chars[at] ?? ''
  if (c === '[' && isMagicByDefault(mode, '[')) {
    return readCollection(cursor, at)
  }
  if (c === '{' && mode === 'VeryMagic') {
    return readBrace(cursor, at, '')
  }
  if (c === '%' && mode === 'VeryMagic') {
    return readHeld(cursor, at, '')
  }
  return reading(cursor, at + 1, Option.some(classified(mode, false, c, c)))
}

const tokenize = (text: string, delimiter: Option.Option<string>): Tokens => {
  const chars = Array.fromIterable(text)
  const tokens: Array<Token> = []
  let cursor: Cursor = { chars, at: 0, mode: 'Magic', ending: delimiter }
  let pattern = ''
  let rest: Option.Option<string> = Option.none()
  while (cursor.at < chars.length) {
    const c = chars[cursor.at] ?? ''
    if (Option.contains(cursor.ending, c)) {
      rest = Option.some(chars.slice(cursor.at + 1).join(''))
      break
    }
    const read = c === '\\' ? readEscaped(cursor) : readPlain(cursor)
    if (Option.isSome(read.token)) {
      tokens.push(read.token.value)
    }
    pattern += read.source
    cursor = { ...cursor, at: read.to, mode: read.mode, ending: read.ending }
  }
  return { tokens, pattern, rest }
}

export const split = (text: string, delimiter: '/' | '?'): Split => {
  const { tokens, pattern, rest } = tokenize(text, Option.some(delimiter))
  return { pattern, offset: rest, tokens }
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

type Items =
  | Readonly<{ _tag: 'NoItems' }>
  | Readonly<{ _tag: 'Newest'; item: Item; earlier: Items }>

const noItems: Items = { _tag: 'NoItems' }

const withNewest = (earlier: Items, item: Item): Items => ({
  _tag: 'Newest',
  item,
  earlier,
})

const inOrder = (items: Items): ReadonlyArray<Item> => {
  const ordered: Array<Item> = []
  let at = items
  while (at._tag === 'Newest') {
    ordered.push(at.item)
    at = at.earlier
  }
  return ordered.reverse()
}

type Frame = Readonly<{
  branches: ReadonlyArray<Node>
  items: Items
  opener: Opener
}>

type Enclosing =
  | Readonly<{ _tag: 'Top' }>
  | Readonly<{ _tag: 'Inside'; frame: Frame; rest: Enclosing }>

type Opener = Readonly<{ raw: string; captures: boolean }>

type State = Readonly<{
  outer: Enclosing
  frame: Frame
  ignoreCase: boolean
  captures: number
}>

const noOpener: Opener = { raw: '', captures: false }

const emptyFrame = (opener: Opener): Frame => ({
  branches: [],
  items: noItems,
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
  frame: { ...state.frame, items: withNewest(state.frame.items, item) },
})

const concatenated = (items: Items): Node => {
  const ordered = inOrder(items)
  return ordered.length === 1 && ordered[0] !== undefined
    ? ordered[0].node
    : { _tag: 'Concat', nodes: ordered.map(item => item.node) }
}

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
  Match.value(state.frame.items).pipe(
    Match.tagsExhaustive({
      NoItems: () =>
        starIsLetter
          ? Result.succeed(withItem(state, letterItem('*')))
          : syntax(`E64: ${raw} follows nothing`),
      Newest: ({ item: last, earlier }) => {
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
            items: withNewest(
              earlier,
              itemOf({ _tag: 'Repeat', node: last.node, ...how }, 'Repeated'),
            ),
          },
        })
      },
    }),
  )

const mostCaptures = 9

const opened = (
  state: State,
  { char, raw }: Extract<Token, { _tag: 'Magic' }>,
): Result.Result<State, string> => {
  const opener: Opener = { raw, captures: char === '(' }
  const captures = state.captures + (opener.captures ? 1 : 0)
  return captures > mostCaptures
    ? syntax("E872: (NFA regexp) Too many '('")
    : Result.succeed({
        ...state,
        outer: { _tag: 'Inside', frame: state.frame, rest: state.outer },
        frame: emptyFrame(opener),
        captures,
      })
}

const closed = (state: State, raw: string): Result.Result<State, string> =>
  state.outer._tag === 'Top'
    ? syntax(`E55: Unmatched ${raw}`)
    : Result.succeed(
        withItem(
          { ...state, outer: state.outer.rest, frame: state.outer.frame },
          itemOf({ _tag: 'Group', node: alternation(state.frame) }, 'Group'),
        ),
      )

const alternated = (state: State): Result.Result<State, string> =>
  Result.succeed({
    ...state,
    frame: {
      ...state.frame,
      branches: [...state.frame.branches, concatenated(state.frame.items)],
      items: noItems,
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

const isCaseFlag = (token: Token | undefined): boolean =>
  token?._tag === 'Magic' && (token.char === 'c' || token.char === 'C')

const closesPattern = (tokens: ReadonlyArray<Token>, from: number): boolean => {
  let at = from
  while (isCaseFlag(tokens[at])) {
    at += 1
  }
  const next = tokens[at]
  return (
    next === undefined ||
    (next._tag === 'Magic' && (next.char === ')' || next.char === '|'))
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
      return state.frame.items._tag === 'NoItems' || token.anchorsAnywhere
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
      return opened(state, token)
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

export const compile = (pattern: string): Result.Result<Matcher, string> =>
  compileTokens(tokenize(pattern, Option.none()).tokens)

export const compileTokens = (
  tokens: ReadonlyArray<Token>,
): Result.Result<Matcher, string> => {
  const initial: Result.Result<State, string> = Result.succeed({
    outer: { _tag: 'Top' },
    frame: emptyFrame(noOpener),
    ignoreCase: false,
    captures: 0,
  })
  const folded = Array.reduce(tokens, initial, (state, token, index) =>
    Result.flatMap(state, current => translated(current, token, tokens, index)),
  )
  return Result.flatMap(folded, state => {
    const { opener } = state.frame
    if (state.outer._tag === 'Inside') {
      return syntax(
        `${opener.captures ? 'E54' : 'E53'}: Unmatched ${opener.raw}`,
      )
    }
    return build(alternation(state.frame), state.ignoreCase)
  })
}
