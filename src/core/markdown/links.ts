import { Iterable, Option } from 'effect'

import * as Entities from './entities'
import { endAt, matchAt } from './lines'
import * as Stack from './stack'

export const escapable = '[!-/:-@[-`{-~]'

const escapeOrReference = new RegExp(
  `\\\\${escapable}|${Entities.referencePattern}`,
  'g',
)

export const unescaped = (text: string): string =>
  text.includes('\\') || text.includes('&')
    ? text.replace(escapeOrReference, found =>
        found.startsWith('\\')
          ? found.charAt(1)
          : Option.getOrElse(Entities.decode(found), () => found),
      )
    : text

const unsafeInUri =
  /%[0-9a-fA-F]{2}|[\uD800-\uDBFF][\uDC00-\uDFFF]|[^A-Za-z0-9;/?:@&=+$,\-_.!~*'()#]/g

const percentEncoded = (found: string): string => {
  if (found.length === 3) {
    return found
  }
  const unit = found.charCodeAt(0)
  if (found.length === 1 && unit >= 0xd800 && unit <= 0xdfff) {
    return '%EF%BF%BD'
  }
  return unit < 0x80
    ? `%${unit.toString(16).toUpperCase().padStart(2, '0')}`
    : encodeURIComponent(found)
}

export const normalizedUri = (uri: string): string =>
  uri.replace(unsafeInUri, percentEncoded)

/** The spec asks for a Unicode case fold (section 6.3). JavaScript has none, and lower then upper case is what the reference parser uses in its place. */
export const keyOf = (label: string): string =>
  label
    .trim()
    .replace(/[ \t\r\n]+/g, ' ')
    .toLowerCase()
    .toUpperCase()

const labelPattern = /\[(?:[^\\[\]]|\\[^]){0,1000}\]/y

const longestLabel = 1001

export const labelEnd = (text: string, at: number): Option.Option<number> => {
  const length = matchAt(labelPattern, text, at)?.[0].length ?? 0
  return length === 0 || length > longestLabel
    ? Option.none()
    : Option.some(at + length)
}

const spacesAndOneLineEnd = / *(?:\n *)?/y

export const pastSpaces = (text: string, at: number): number =>
  endAt(spacesAndOneLineEnd, text, at)

export type Parentheses = ReadonlyMap<number, number>

const parenthesisOrBreak = new RegExp(
  `\\\\${escapable}|[()]|[ \\t\\n\\v\\f\\r]+`,
  'g',
)

type Pairing = Readonly<{
  open: Stack.Stack<number>
  pairs: Stack.Stack<readonly [number, number]>
}>

export const pairedParentheses = (text: string): Parentheses =>
  new Map(
    Stack.toArray(
      Iterable.reduce(
        text.matchAll(parenthesisOrBreak),
        { open: Stack.empty, pairs: Stack.empty },
        (pairing: Pairing, found): Pairing => {
          if (found[0] === '(') {
            return { ...pairing, open: Stack.push(pairing.open, found.index) }
          }
          if (found[0] !== ')') {
            return found[0].startsWith('\\')
              ? pairing
              : { ...pairing, open: Stack.empty }
          }
          return pairing.open._tag === 'Empty'
            ? pairing
            : {
                open: pairing.open.under,
                pairs: Stack.push(pairing.pairs, [
                  pairing.open.top,
                  found.index,
                ]),
              }
        },
      ).pairs,
    ),
  )

export type Destination = Readonly<{ destination: string; end: number }>

const pointyDestination = /<(?:[^<>\n\\]|\\.)*>/y

const plainRun = new RegExp(
  `(?:[^ \\t\\n\\v\\f\\r()\\\\]|\\\\${escapable}|\\\\)*`,
  'y',
)

type Walk = Readonly<{ at: number; balanced: boolean; done: boolean }>

const plainDestinationEnd = (
  text: string,
  parentheses: Parentheses,
  from: number,
): Option.Option<number> => {
  const walked = Stack.whileSome<Walk>(
    { at: endAt(plainRun, text, from), balanced: true, done: false },
    walk => {
      if (walk.done || text.charAt(walk.at) !== '(') {
        return Option.none()
      }
      const close = parentheses.get(walk.at)
      return Option.some(
        close === undefined
          ? { at: walk.at, balanced: false, done: true }
          : {
              at: endAt(plainRun, text, close + 1),
              balanced: true,
              done: false,
            },
      )
    },
  )
  return walked.balanced && (walked.at > from || text.charAt(walked.at) === ')')
    ? Option.some(walked.at)
    : Option.none()
}

export const destinationAt = (
  text: string,
  parentheses: Parentheses,
  at: number,
): Option.Option<Destination> => {
  const pointy = matchAt(pointyDestination, text, at)
  if (pointy !== null) {
    return Option.some({
      destination: normalizedUri(unescaped(pointy[0].slice(1, -1))),
      end: at + pointy[0].length,
    })
  }
  return text.charAt(at) === '<'
    ? Option.none()
    : Option.map(plainDestinationEnd(text, parentheses, at), end => ({
        destination: normalizedUri(unescaped(text.slice(at, end))),
        end,
      }))
}

export type Title = Readonly<{ title: string; end: number }>

const titlePattern =
  /"(?:\\[^]|[^\\"])*"|'(?:\\[^]|[^\\'])*'|\((?:\\[^]|[^\\()])*\)/y

export const titleAt = (text: string, at: number): Option.Option<Title> =>
  Option.map(Option.fromNullishOr(matchAt(titlePattern, text, at)), found => ({
    title: unescaped(found[0].slice(1, -1)),
    end: at + found[0].length,
  }))
