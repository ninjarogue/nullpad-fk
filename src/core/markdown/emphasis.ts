import { Array, Iterable, Option } from 'effect'

import * as Stack from './stack'
import { type Inline, type Point, type Span, deepestNesting } from './tree'

export type Delimiters = Readonly<{
  character: string
  length: number
  left: number
  canOpen: boolean
  canClose: boolean
  from: Point
}>

export type Tall = Readonly<{ node: Inline; height: number }>

export type Piece =
  | (Tall & Readonly<{ _tag: 'Node' }>)
  | Readonly<{ _tag: 'Delimiters'; run: Delimiters }>
  | Readonly<{ _tag: 'Bracket'; span: Span; text: string }>

const isWhitespace = (point: string): boolean => /^\s/.test(point)

const isPunctuation = (point: string): boolean => /^[\p{P}\p{S}]/u.test(point)

export const flanking = (
  character: string,
  before: string,
  after: string,
): Readonly<{ canOpen: boolean; canClose: boolean }> => {
  const afterIsWhitespace = isWhitespace(after)
  const afterIsPunctuation = isPunctuation(after)
  const beforeIsWhitespace = isWhitespace(before)
  const beforeIsPunctuation = isPunctuation(before)
  const leftFlanking =
    !afterIsWhitespace &&
    (!afterIsPunctuation || beforeIsWhitespace || beforeIsPunctuation)
  const rightFlanking =
    !beforeIsWhitespace &&
    (!beforeIsPunctuation || afterIsWhitespace || afterIsPunctuation)
  return character === '_'
    ? {
        canOpen: leftFlanking && (!rightFlanking || beforeIsPunctuation),
        canClose: rightFlanking && (!leftFlanking || afterIsPunctuation),
      }
    : { canOpen: leftFlanking, canClose: rightFlanking }
}

const leaf = (node: Inline): Tall => ({ node, height: 0 })

const column = (point: Point, columns: number): Point => ({
  ...point,
  column: point.column + columns,
})

const textOf = (run: Delimiters): Tall =>
  leaf({
    _tag: 'Text',
    span: { from: run.from, to: column(run.from, run.left) },
    text: run.character.repeat(run.left),
  })

type Opener = Readonly<{ run: Delimiters; inside: Stack.Stack<Tall> }>

type Pairing = Readonly<{
  openers: Stack.Stack<Opener>
  ground: Stack.Stack<Tall>
  bottoms: Readonly<Record<string, number>>
}>

const place = (pairing: Pairing, tall: Tall): Pairing =>
  pairing.openers._tag === 'Empty'
    ? { ...pairing, ground: Stack.push(pairing.ground, tall) }
    : {
        ...pairing,
        openers: Stack.push(pairing.openers.under, {
          ...pairing.openers.top,
          inside: Stack.push(pairing.openers.top.inside, tall),
        }),
      }

const asText = (opener: Opener): ReadonlyArray<Tall> => [
  textOf(opener.run),
  ...Stack.toArray(opener.inside),
]

/** Spec section 6.2, rule 9: a run that can both open and close does not pair with one of another length when the two lengths add up to a multiple of three, unless both are multiples of three. */
const pairsAcrossLengths = (opener: Delimiters, closer: Delimiters): boolean =>
  !(
    (closer.canOpen || opener.canClose) &&
    closer.length % 3 !== 0 &&
    (opener.length + closer.length) % 3 === 0
  )

const bottomKey = (closer: Delimiters): string =>
  `${closer.character}${closer.canOpen ? 'both' : 'closes'}${closer.length % 3}`

type Closing = Readonly<{ pairing: Pairing; closer: Delimiters; done: boolean }>

const withBottom = ({ pairing, closer }: Closing, done: boolean): Closing => ({
  pairing: {
    ...pairing,
    bottoms: {
      ...pairing.bottoms,
      [bottomKey(closer)]: Stack.sizeOf(pairing.openers),
    },
  },
  closer,
  done,
})

const closeOnce = (closing: Closing): Option.Option<Closing> => {
  const { pairing, closer } = closing
  if (closing.done || closer.left === 0) {
    return Option.none()
  }
  const bottom = pairing.bottoms[bottomKey(closer)] ?? 0
  const found = Iterable.findFirst(
    Iterable.takeWhile(
      Stack.pushedFromTop(pairing.openers),
      at => at.size > bottom,
    ),
    at =>
      at.top.run.character === closer.character &&
      pairsAcrossLengths(at.top.run, closer),
  )
  if (Option.isNone(found)) {
    return Option.some(withBottom(closing, true))
  }
  const opener = found.value.top
  const above = Stack.since(pairing.openers, found.value.size).pushed
  const children = [
    ...Stack.toArray(opener.inside),
    ...Array.flatMap(above, asText),
  ]
  const height =
    1 + Array.reduce(children, 0, (most, child) => Math.max(most, child.height))
  if (height > deepestNesting) {
    return Option.some(withBottom(closing, true))
  }
  const used = closer.left >= 2 && opener.run.left >= 2 ? 2 : 1
  const wrapped: Tall = {
    node: {
      _tag: used === 2 ? 'Strong' : 'Emphasis',
      span: {
        from: column(opener.run.from, opener.run.left - used),
        to: column(closer.from, used),
      },
      children: Array.map(children, child => child.node),
    },
    height,
  }
  const under = found.value.under
  const remaining = { ...opener.run, left: opener.run.left - used }
  const openers =
    remaining.left > 0
      ? Stack.push(under, {
          run: remaining,
          inside: Stack.push(Stack.empty, wrapped),
        })
      : under
  const lowered = Stack.sizeOf(openers)
  const next: Pairing = {
    openers,
    ground: pairing.ground,
    bottoms: Object.fromEntries(
      Array.map(Object.entries(pairing.bottoms), ([key, height]) => [
        key,
        Math.min(height, lowered),
      ]),
    ),
  }
  return Option.some({
    pairing: remaining.left > 0 ? next : place(next, wrapped),
    closer: {
      ...closer,
      left: closer.left - used,
      from: column(closer.from, used),
    },
    done: false,
  })
}

const meet = (pairing: Pairing, run: Delimiters): Pairing => {
  const closed = run.canClose
    ? Stack.whileSome<Closing>({ pairing, closer: run, done: false }, closeOnce)
    : { pairing, closer: run }
  if (closed.closer.left === 0) {
    return closed.pairing
  }
  return closed.closer.canOpen
    ? {
        ...closed.pairing,
        openers: Stack.push(closed.pairing.openers, {
          run: closed.closer,
          inside: Stack.empty,
        }),
      }
    : place(closed.pairing, textOf(closed.closer))
}

export const pair = (pieces: ReadonlyArray<Piece>): ReadonlyArray<Tall> => {
  const paired = Array.reduce(
    pieces,
    { openers: Stack.empty, ground: Stack.empty, bottoms: {} },
    (pairing: Pairing, piece): Pairing => {
      if (piece._tag === 'Delimiters') {
        return meet(pairing, piece.run)
      }
      return place(
        pairing,
        piece._tag === 'Node'
          ? piece
          : leaf({ _tag: 'Text', span: piece.span, text: piece.text }),
      )
    },
  )
  return [
    ...Stack.toArray(paired.ground),
    ...Array.flatMap(Stack.toArray(paired.openers), asText),
  ]
}
