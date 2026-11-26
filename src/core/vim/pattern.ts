import { Array, Match, Option, Result } from 'effect'

type Mode = 'VeryMagic' | 'Magic' | 'NoMagic' | 'VeryNoMagic'

type Token =
  | Readonly<{ _tag: 'Letter'; text: string }>
  | Readonly<{ _tag: 'Magic'; c: string; raw: string }>
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

const known = '^$.*[~()|+?={<>@%&'

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
  c: string,
  raw: string,
): Token =>
  isWordCharacter.test(c)
    ? escaped
      ? { _tag: 'Magic', c, raw }
      : { _tag: 'Letter', text: c }
    : isMagicByDefault(mode, c) !== escaped && (!escaped || known.includes(c))
      ? { _tag: 'Magic', c, raw }
      : { _tag: 'Letter', text: c }

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

type Read = Readonly<{ token: Option.Option<Token>; to: number; mode: Mode }>

const refused = (raw: string, to: number, mode: Mode): Read => ({
  token: Option.some({ _tag: 'Refused', raw }),
  to,
  mode,
})

const readEscaped = (
  chars: ReadonlyArray<string>,
  at: number,
  mode: Mode,
  delimiter: string,
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
  if (c === '/' || c === delimiter) {
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
          token: Option.some({ _tag: 'Magic', c: '%(', raw: '\\%(' }),
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
          token: Option.some({ _tag: 'Magic', c: '%(', raw: '%(' }),
          to: at + 2,
          mode,
        }
      : refused('%' + (next ?? ''), at + 2, mode)
  }
  return one(classified(mode, false, c, c))
}

const tokenize = (text: string, delimiter: string): Tokens => {
  const chars = Array.fromIterable(text)
  const tokens: Array<Token> = []
  let mode: Mode = 'Magic'
  let at = 0
  let pattern = ''
  let rest: Option.Option<string> = Option.none()
  while (at < chars.length) {
    const c = chars[at] ?? ''
    if (c === delimiter) {
      rest = Option.some(chars.slice(at + 1).join(''))
      break
    }
    const read: Read =
      c === '\\'
        ? readEscaped(chars, at, mode, delimiter)
        : readPlain(chars, at, mode)
    if (Option.isSome(read.token)) {
      tokens.push(read.token.value)
    }
    pattern +=
      c === '\\' && chars[at + 1] === delimiter && delimiter === '?'
        ? '?'
        : chars.slice(at, read.to).join('')
    mode = read.mode
    at = read.to
  }
  return { tokens, pattern, rest }
}

export const split = (text: string, delimiter: '/' | '?'): Split => {
  const { pattern, rest } = tokenize(text, delimiter)
  return { pattern, offset: rest }
}

type Item = Readonly<{
  source: string
  kind: 'Atom' | 'Group' | 'Quantified' | 'Anchor' | 'Alt'
  repeats: boolean
  alternates: boolean
  varies: boolean
  letter: string
  plain: boolean
}>

type Frame = Readonly<{ items: ReadonlyArray<Item>; opener: string }>

type State = Readonly<{
  frames: ReadonlyArray<Frame>
  ignoreCase: boolean
}>

const unsupported = (token: string): Result.Result<never, string> =>
  Result.fail(`not supported in a search: ${token}`)

const syntax = (text: string): Result.Result<never, string> => Result.fail(text)

const escapeLetter = (text: string): string =>
  text.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&')

const word = '[\\p{L}\\p{M}\\p{Nd}_]'

const classes: Readonly<Record<string, string>> = {
  s: '[ \\t]',
  S: '[^ \\t]',
  w: '[0-9A-Za-z_]',
  W: '[^0-9A-Za-z_]',
  a: '[A-Za-z]',
  A: '[^A-Za-z]',
  d: '[0-9]',
  D: '[^0-9]',
  l: '[a-z]',
  L: '[^a-z]',
  u: '[A-Z]',
  U: '[^A-Z]',
  x: '[0-9A-Fa-f]',
  X: '[^0-9A-Fa-f]',
  h: '[A-Za-z_]',
  H: '[^A-Za-z_]',
}

const collectionEscapes: Readonly<Record<string, string>> = {
  e: '\\x1b',
  t: '\\t',
  r: '\\r',
  b: '\\x08',
  '\\': '\\\\',
  ']': '\\]',
  '^': '\\^',
  '-': '\\-',
}

const collectionClass = (
  body: string,
  raw: string,
): Result.Result<string, string> => {
  const chars = Array.fromIterable(body)
  const negated = chars[0] === '^'
  const items = negated ? chars.slice(1) : chars
  let out = ''
  let index = 0
  while (index < items.length) {
    const c = items[index] ?? ''
    const after = items[index + 1]
    if (c === '[' && after !== undefined && ':=.'.includes(after)) {
      return unsupported(raw)
    }
    if (c === '\\' && after !== undefined) {
      const escaped = collectionEscapes[after]
      if (escaped === undefined && /[nodxuU0-9]/u.test(after)) {
        return unsupported(raw)
      }
      out += escaped ?? '\\\\' + escapeLetter(after)
      index += 2
    } else {
      out += c === ']' || c === '\\' ? '\\' + c : c
      index += 1
    }
  }
  return Result.succeed(`[${negated ? '^' : ''}${out}]`)
}

const quantifierOf = (
  token: Token,
): Option.Option<
  Readonly<{ suffix: string; repeating: boolean; raw: string }>
> => {
  if (token._tag === 'Magic') {
    return token.c === '*'
      ? Option.some({ suffix: '*', repeating: true, raw: token.raw })
      : token.c === '+'
        ? Option.some({ suffix: '+', repeating: true, raw: token.raw })
        : token.c === '=' || token.c === '?'
          ? Option.some({ suffix: '?', repeating: false, raw: token.raw })
          : Option.none()
  }
  return Option.none()
}

const countsOf = (
  body: string,
): Option.Option<Readonly<{ suffix: string; repeating: boolean }>> => {
  const found = /^(-?)(\d*)(?:(,)(\d*))?$/u.exec(body)
  if (found === null) {
    return Option.none()
  }
  const lazy = found[1] === '-' ? '?' : ''
  const low = found[2] ?? ''
  const hasComma = found[3] === ','
  const high = found[4] ?? ''
  const min = low === '' ? 0 : Number(low)
  const max = hasComma
    ? high === ''
      ? Infinity
      : Number(high)
    : low === ''
      ? Infinity
      : min
  const [from, to] = min > max ? [max, min] : [min, max]
  const counted =
    from === to
      ? `{${from}}`
      : to === Infinity
        ? `{${from},}`
        : `{${from},${to}}`
  return Option.some({ suffix: counted + lazy, repeating: to > 1 })
}

const lastFrame = (state: State): Frame =>
  state.frames[state.frames.length - 1] ?? { items: [], opener: '' }

const withFrame = (state: State, frame: Frame): State => ({
  ...state,
  frames: [...state.frames.slice(0, -1), frame],
})

const pushed = (state: State, item: Item): State => {
  const frame = lastFrame(state)
  return withFrame(state, { ...frame, items: [...frame.items, item] })
}

const atom = (source: string): Item => ({
  source,
  kind: 'Atom',
  repeats: false,
  alternates: false,
  varies: false,
  letter: '',
  plain: false,
})

const quantified = (
  state: State,
  raw: string,
  suffix: string,
  repeating: boolean,
  literalAtStart: Option.Option<string>,
): Result.Result<State, string> => {
  const frame = lastFrame(state)
  const last = frame.items[frame.items.length - 1]
  if (last === undefined || last.kind === 'Alt' || last.source === '^') {
    return Option.match(literalAtStart, {
      onSome: text => Result.succeed(pushed(state, atom(escapeLetter(text)))),
      onNone: () => syntax(`E64: ${raw} follows nothing`),
    })
  }
  if (last.kind === 'Anchor') {
    return syntax(`E64: ${raw} follows nothing`)
  }
  if (last.kind === 'Quantified') {
    return syntax(raw === '*' ? 'E61: Nested *' : `E62: Nested ${raw}`)
  }
  if (last.kind === 'Group' && repeating && last.alternates && !last.plain) {
    return unsupported('a repeat of a group with \\|')
  }
  if (
    last.kind === 'Group' &&
    repeating &&
    (last.repeats || (last.varies && suffix.startsWith('{')))
  ) {
    return unsupported('a repeat inside a repeated group')
  }
  return Result.succeed(
    withFrame(state, {
      ...frame,
      items: [
        ...frame.items.slice(0, -1),
        {
          source: last.source + suffix,
          kind: 'Quantified',
          repeats: last.repeats || repeating,
          alternates: last.alternates,
          varies: true,
          letter: '',
          plain: false,
        },
      ],
    }),
  )
}

const plainlySplit = (items: ReadonlyArray<Item>): boolean => {
  const firsts: Array<string> = []
  let begins = true
  for (const item of items) {
    if (item.alternates) {
      return false
    }
    if (item.kind === 'Alt') {
      if (begins) {
        return false
      }
      begins = true
    } else if (begins) {
      if (item.kind !== 'Atom' || item.letter === '') {
        return false
      }
      firsts.push(item.letter)
      begins = false
    }
  }
  return !begins && new Set(firsts).size === firsts.length && firsts.length > 1
}

const closed = (state: State, raw: string): Result.Result<State, string> => {
  if (state.frames.length < 2) {
    return syntax(`E55: Unmatched ${raw}`)
  }
  const frame = lastFrame(state)
  const outer = { ...state, frames: state.frames.slice(0, -1) }
  return Result.succeed(
    pushed(outer, {
      source: `(?:${Array.map(frame.items, item => item.source).join('')})`,
      kind: 'Group',
      repeats: Array.some(frame.items, item => item.repeats),
      alternates: Array.some(
        frame.items,
        item => item.alternates || item.kind === 'Alt',
      ),
      varies: Array.some(frame.items, item => item.varies),
      letter: '',
      plain: plainlySplit(frame.items),
    }),
  )
}

const anchored = (state: State, source: string): Result.Result<State, string> =>
  Result.succeed(
    pushed(state, {
      source,
      kind: 'Anchor',
      repeats: false,
      alternates: false,
      varies: false,
      letter: '',
      plain: false,
    }),
  )

const endsHere = (next: Token | undefined): boolean =>
  next === undefined ||
  (next._tag === 'Magic' && (next.c === ')' || next.c === '|'))

const startsHere = (state: State): boolean => {
  const last = lastFrame(state).items[lastFrame(state).items.length - 1]
  return last === undefined || last.kind === 'Alt'
}

const magic = (
  state: State,
  { c, raw }: Extract<Token, { _tag: 'Magic' }>,
  next: Token | undefined,
): Result.Result<State, string> => {
  const quantifier = quantifierOf({ _tag: 'Magic', c, raw })
  if (Option.isSome(quantifier)) {
    return quantified(
      state,
      quantifier.value.raw,
      quantifier.value.suffix,
      quantifier.value.repeating,
      c === '*' ? Option.some('*') : Option.none(),
    )
  }
  const simple: Readonly<Record<string, () => Result.Result<State, string>>> = {
    '^': () =>
      startsHere(state)
        ? anchored(state, '^')
        : Result.succeed(pushed(state, atom('\\^'))),
    $: () =>
      endsHere(next)
        ? anchored(state, '$')
        : Result.succeed(pushed(state, atom('\\$'))),
    '.': () => Result.succeed(pushed(state, atom('.'))),
    '(': () =>
      Result.succeed({
        ...state,
        frames: [...state.frames, { items: [], opener: raw }],
      }),
    '%(': () =>
      Result.succeed({
        ...state,
        frames: [...state.frames, { items: [], opener: raw }],
      }),
    ')': () => closed(state, raw),
    '|': () =>
      Result.succeed(
        pushed(state, {
          source: '|',
          kind: 'Alt',
          repeats: false,
          alternates: false,
          varies: false,
          letter: '',
          plain: false,
        }),
      ),
    '<': () => anchored(state, `(?<!${word})(?=${word})`),
    '>': () => anchored(state, `(?<=${word})(?!${word})`),
    c: () => Result.succeed({ ...state, ignoreCase: true }),
    C: () => Result.succeed(state),
    t: () => Result.succeed(pushed(state, atom('\\t'))),
  }
  const handler = simple[c]
  if (handler !== undefined) {
    return handler()
  }
  const set = classes[c]
  return set === undefined
    ? unsupported(raw)
    : Result.succeed(pushed(state, atom(set)))
}

const translated = (
  state: State,
  token: Token,
  next: Token | undefined,
): Result.Result<State, string> => {
  return Match.value(token).pipe(
    Match.tagsExhaustive({
      Letter: letter =>
        Result.succeed(
          pushed(state, {
            ...atom(escapeLetter(letter.text)),
            letter: letter.text.toLowerCase(),
          }),
        ),
      Magic: magical => magic(state, magical, next),
      Refused: refused => unsupported(refused.raw),
      Collection: collection =>
        Result.map(collectionClass(collection.body, collection.raw), source =>
          pushed(state, atom(source)),
        ),
      Brace: brace =>
        Option.match(countsOf(brace.body), {
          onNone: () => syntax('E554: Syntax error in \\{...}'),
          onSome: ({ suffix, repeating }) =>
            quantified(state, '\\{', suffix, repeating, Option.none()),
        }),
    }),
  )
}

const compiled = (pattern: string): Result.Result<RegExp, string> => {
  const { tokens } = tokenize(pattern, '')
  const initial: Result.Result<State, string> = Result.succeed({
    frames: [{ items: [], opener: '' }],
    ignoreCase: false,
  })
  const folded = Array.reduce(tokens, initial, (state, token, index) =>
    Result.flatMap(state, current =>
      translated(current, token, tokens[index + 1]),
    ),
  )
  return Result.flatMap(folded, state => {
    if (state.frames.length > 1) {
      const opener = lastFrame(state).opener
      return syntax(
        opener.endsWith('%(')
          ? `E53: Unmatched ${opener.replace('%(', '')}%(`
          : `E54: Unmatched ${opener}`,
      )
    }
    const source = Array.map(
      state.frames[0]?.items ?? [],
      item => item.source,
    ).join('')
    try {
      return Result.succeed(
        new RegExp(source, state.ignoreCase ? 'gsui' : 'gsu'),
      )
    } catch (error) {
      return syntax(
        error instanceof Error && /out of order/u.test(error.message)
          ? 'E944: Reverse range in character class'
          : `E383: Invalid search string: ${pattern}`,
      )
    }
  })
}

const last: { pattern: string; result: Result.Result<RegExp, string> } = {
  pattern: '',
  result: Result.fail('E35: No previous regular expression'),
}

export const compile = (pattern: string): Result.Result<RegExp, string> => {
  if (last.pattern !== pattern || Result.isFailure(last.result)) {
    last.pattern = pattern
    last.result = compiled(pattern)
  }
  return last.result
}

export const wordCharacter = new RegExp(`^${word}$`, 'u')
