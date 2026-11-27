import { Array, Match, Schema } from 'effect'

const Anchor = Schema.TaggedUnion({
  Cursor: {},
  Last: {},
  Line: { number: Schema.Finite },
})
type Anchor = typeof Anchor.Type

export const Address = Schema.Struct({
  anchor: Anchor,
  offsets: Schema.Array(Schema.Finite),
})
export type Address = typeof Address.Type

export const Command = Schema.TaggedUnion({
  Empty: {},
  Goto: { address: Address },
  Write: {},
  Unsupported: { text: Schema.String },
  Unknown: { text: Schema.String },
})
export type Command = typeof Command.Type

export const Resolved = Schema.TaggedUnion({
  At: { line: Schema.Int },
  Invalid: {},
})
export type Resolved = typeof Resolved.Type

const greatestNumber = 1e15

const numberOf = (digits: string): number =>
  Math.min(Number(digits), greatestNumber)

const tokens = (text: string): ReadonlyArray<RegExpMatchArray> =>
  Array.fromIterable(text.matchAll(/[+-]\d*|\d+|[ \t]+|[^+\-\d \t][^]*/gu))

const isOffsetOrBlank = ([token]: RegExpMatchArray): boolean =>
  /^[+\-\d \t]/u.test(token)

const offsetsOf = ([token]: RegExpMatchArray): ReadonlyArray<number> => {
  const sign = token.startsWith('-') ? -1 : 1
  const digits = token.replace(/^[+-]/u, '')
  return /^[ \t]/u.test(token)
    ? []
    : [sign * (digits === '' ? 1 : numberOf(digits))]
}

const skipped = (text: string): string => text.replace(/^[ \t:]+/u, '')

const writeName = /^w(?:r(?:i(?:t(?:e)?)?)?)?$/u

const commandOf = (text: string): Command => {
  const [, name = '', argument = ''] = /^([A-Za-z]*)([^]*)$/u.exec(text) ?? []
  return writeName.test(name)
    ? argument.trim() === ''
      ? Command.cases.Write.make({})
      : Command.cases.Unsupported.make({ text: text.trim() })
    : Command.cases.Unknown.make({ text })
}

const anchored = (text: string): Readonly<{ anchor: Anchor; rest: string }> => {
  const [, atom = '', rest = ''] = /^(\d+|\.|\$)?([^]*)$/u.exec(text) ?? []
  return {
    rest,
    anchor: atom.startsWith('$')
      ? Anchor.cases.Last.make({})
      : /^\d/u.test(atom)
        ? Anchor.cases.Line.make({ number: numberOf(atom) })
        : Anchor.cases.Cursor.make({}),
  }
}

const hasAddress = (text: string): boolean => /^[\d.$+-]/u.test(text)

export const parse = (line: string): Command => {
  const text = skipped(line)
  if (!hasAddress(text)) {
    return text === '' ? Command.cases.Empty.make({}) : commandOf(text)
  }
  const { anchor, rest } = anchored(text)
  const [offsetTokens, others] = Array.span(tokens(rest), isOffsetOrBlank)
  const remainder = skipped(
    Array.match(others, {
      onEmpty: () => '',
      onNonEmpty: ([first]) => rest.slice(first.index),
    }),
  )
  return remainder === ''
    ? Command.cases.Goto.make({
        address: { anchor, offsets: Array.flatMap(offsetTokens, offsetsOf) },
      })
    : Command.cases.Unknown.make({ text })
}

export const resolve = (
  { anchor, offsets }: Address,
  lineCount: number,
  cursorLine: number,
): Resolved => {
  const base = Match.value(anchor).pipe(
    Match.tagsExhaustive({
      Cursor: () => cursorLine + 1,
      Last: () => lineCount,
      Line: ({ number }) => number,
    }),
  )
  const wanted = Array.reduce(offsets, base, (sum, offset) => sum + offset)
  return wanted < 0
    ? Resolved.cases.Invalid.make({})
    : Resolved.cases.At.make({
        line: Math.max(1, Math.min(lineCount, wanted)) - 1,
      })
}
