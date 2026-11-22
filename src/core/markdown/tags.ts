import { Iterable, Option } from 'effect'

import { endAt, matchAt } from './lines'

const openTagName = /<[A-Za-z][A-Za-z0-9-]*/y

const attribute =
  /\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|'[^']*'|"[^"]*"))?/gy

const openTagClose = /\s*\/?>/y

const closeTag = /<\/[A-Za-z][A-Za-z0-9-]*\s*>/y

const pastAttributes = (text: string, at: number): number => {
  attribute.lastIndex = at
  return Iterable.reduce(
    text.matchAll(attribute),
    at,
    (_, found) => found.index + found[0].length,
  )
}

const pastMatch = (
  pattern: RegExp,
  text: string,
  at: number,
): Option.Option<number> =>
  Option.map(
    Option.fromNullishOr(matchAt(pattern, text, at)),
    found => at + found[0].length,
  )

export const openTagEnd = (text: string, at: number): Option.Option<number> =>
  Option.flatMap(pastMatch(openTagName, text, at), afterName =>
    pastMatch(openTagClose, text, pastAttributes(text, afterName)),
  )

export const closeTagEnd = (text: string, at: number): Option.Option<number> =>
  pastMatch(closeTag, text, at)

export const tagEnd = (text: string, at: number): Option.Option<number> =>
  Option.orElse(openTagEnd(text, at), () => closeTagEnd(text, at))

export type Terminators = Readonly<{
  commentEnd: number
  instructionEnd: number
  greaterThan: number
  cdataEnd: number
}>

export const lastTerminators = (text: string): Terminators => ({
  commentEnd: text.lastIndexOf('-->'),
  instructionEnd: text.lastIndexOf('?>'),
  greaterThan: text.lastIndexOf('>'),
  cdataEnd: text.lastIndexOf(']]>'),
})

const pastNext = (
  text: string,
  terminator: string,
  from: number,
  last: number,
): Option.Option<number> =>
  from <= last
    ? Option.some(text.indexOf(terminator, from) + terminator.length)
    : Option.none()

const declarationName = /<![A-Za-z]+/y

const commentEnd = (
  text: string,
  last: Terminators,
  at: number,
): Option.Option<number> => {
  if (text.startsWith('<!-->', at)) {
    return Option.some(at + 5)
  }
  if (text.startsWith('<!--->', at)) {
    return Option.some(at + 6)
  }
  return pastNext(text, '-->', at + 4, last.commentEnd)
}

const markupEnd = (
  text: string,
  last: Terminators,
  at: number,
): Option.Option<number> => {
  if (text.startsWith('<!--', at)) {
    return commentEnd(text, last, at)
  }
  if (text.startsWith('<?', at)) {
    return pastNext(text, '?>', at + 2, last.instructionEnd)
  }
  if (text.startsWith('<![CDATA[', at)) {
    return pastNext(text, ']]>', at + 9, last.cdataEnd)
  }
  const afterName = endAt(declarationName, text, at)
  return afterName > at
    ? pastNext(text, '>', afterName, last.greaterThan)
    : Option.none()
}

export const rawHtmlEnd = (
  text: string,
  last: Terminators,
  at: number,
): Option.Option<number> =>
  Option.orElse(tagEnd(text, at), () => markupEnd(text, last, at))
