import { Array, Match, Option, Result, Schema } from 'effect'

import type * as Buffer from '../buffer'
import { cellAt, cellCount, cellLengthAt, cellStart } from './cells'
import {
  type Matcher,
  type Span,
  blankClass,
  classOfCodePoint,
  isWordClass,
  punctuationClass,
} from './matcher'
import { type Spot, decl, incl, positionOf, spotAt } from './motions'
import { notSupported } from './pattern'

export const Way = Schema.Literals(['Forward', 'Backward'])
export type Way = typeof Way.Type

export const Offset = Schema.Struct({
  kind: Schema.Literals(['Line', 'Start', 'End']),
  by: Schema.Int,
})
export type Offset = typeof Offset.Type

export const noOffset: Offset = { kind: 'Start', by: 0 }

const byOf = (token: string | undefined): number =>
  token === undefined || token === ''
    ? 0
    : token === '+'
      ? 1
      : token === '-'
        ? -1
        : Number(token)

export const parseOffset = (text: string): Result.Result<Offset, string> => {
  const line = /^(?:[+-]\d*|\d+)/u.exec(text)
  const letter = /^([esb])((?:[+-]\d*|\d+)?)/u.exec(text)
  const used = line?.[0] ?? letter?.[0] ?? ''
  const offset: Offset =
    line !== null
      ? { kind: 'Line', by: byOf(line[0]) }
      : letter !== null
        ? { kind: letter[1] === 'e' ? 'End' : 'Start', by: byOf(letter[2]) }
        : noOffset
  return text.slice(used.length).startsWith(';')
    ? Result.fail(notSupported(';'))
    : Result.succeed(offset)
}

type Place = Readonly<{ line: number; column: number }>

type Start =
  | Readonly<{ _tag: 'At'; place: Place }>
  | Readonly<{ _tag: 'BeforeNote' }>
  | Readonly<{ _tag: 'AfterNote' }>

const at = (place: Place): Start => ({ _tag: 'At', place })

const advanced = (text: string, { start, end }: Span): number =>
  end > start || end >= text.length
    ? end
    : end + String.fromCodePoint(text.codePointAt(end) ?? 0).length

const clampedToLetter = (text: string, start: number): number =>
  start === text.length ? start - 1 : start

const firstAfter = (
  matcher: Matcher,
  text: string,
  column: number,
  cursorCellWidth: number,
  landsOnEnd: boolean,
): Option.Option<Span> => {
  let from = 0
  for (;;) {
    const found = matcher.find(text, from)
    if (Option.isNone(found)) {
      return found
    }
    const { start, end } = found.value
    const rejected = landsOnEnd
      ? end - 1 < column + cursorCellWidth
      : clampedToLetter(text, start) < column + cursorCellWidth
    if (!rejected) {
      return found
    }
    from = advanced(text, found.value)
    if (from >= text.length) {
      return Option.none()
    }
  }
}

const lastBefore = (
  matcher: Matcher,
  text: string,
  column: number,
  landsOnEnd: boolean,
): Option.Option<Span> => {
  let from = 0
  let best: Option.Option<Span> = Option.none()
  for (;;) {
    const found = matcher.find(text, from)
    if (Option.isNone(found)) {
      return best
    }
    const { start, end } = found.value
    if (!(landsOnEnd ? end - 1 < column : start < column)) {
      return best
    }
    best = found
    from = advanced(text, found.value)
    if (from >= text.length) {
      return best
    }
  }
}

type Hit = Readonly<{ line: number; match: Span }>

type Probe = (text: string, line: number) => Option.Option<Span>

const memoized = (probe: Probe): Probe => {
  const known: Array<Option.Option<Span>> = []
  return (text, line) => {
    const hit = known[line]
    if (hit !== undefined) {
      return hit
    }
    const found = probe(text, line)
    known[line] = found
    return found
  }
}

type Stepped = Option.Option<Readonly<{ hit: Hit; wrapped: boolean }>>

const textOf = (buffer: Buffer.Buffer, line: number): string =>
  buffer.lines[line]?.text ?? ''

const scanned = (
  buffer: Buffer.Buffer,
  forward: boolean,
  from: number,
  to: number,
  wrapped: boolean,
  probe: Probe,
): Stepped => {
  for (
    let line = from;
    forward ? line <= to : line >= to;
    line += forward ? 1 : -1
  ) {
    const found = probe(textOf(buffer, line), line)
    if (Option.isSome(found)) {
      return Option.some({ hit: { line, match: found.value }, wrapped })
    }
  }
  return Option.none()
}

const orElse = (first: Stepped, second: () => Stepped): Stepped =>
  Option.isSome(first) ? first : second()

const forwardStep = (
  buffer: Buffer.Buffer,
  matcher: Matcher,
  start: Start,
  landsOnEnd: boolean,
  firstOfCount: boolean,
  earliest: Probe,
): Stepped => {
  const last = buffer.lines.length - 1
  return Match.value(start).pipe(
    Match.tagsExhaustive({
      BeforeNote: () => scanned(buffer, true, 0, last, false, earliest),
      AfterNote: () => scanned(buffer, true, 0, last, true, earliest),
      At: ({ place }) => {
        const row = buffer.lines[place.line]
        const cursorCellWidth =
          row === undefined ? 1 : cellLengthAt(row, place.column)
        const here = firstAfter(
          matcher,
          textOf(buffer, place.line),
          place.column,
          cursorCellWidth,
          landsOnEnd && firstOfCount,
        )
        return orElse(
          Option.map(here, match => ({
            hit: { line: place.line, match },
            wrapped: false,
          })),
          () =>
            orElse(
              scanned(buffer, true, place.line + 1, last, false, earliest),
              () => scanned(buffer, true, 0, place.line, true, earliest),
            ),
        )
      },
    }),
  )
}

const backwardStep = (
  buffer: Buffer.Buffer,
  matcher: Matcher,
  start: Start,
  landsOnEnd: boolean,
  latest: Probe,
): Stepped => {
  const last = buffer.lines.length - 1
  return Match.value(start).pipe(
    Match.tagsExhaustive({
      BeforeNote: () => scanned(buffer, false, last, 0, true, latest),
      AfterNote: () => scanned(buffer, false, last, 0, false, latest),
      At: ({ place }) => {
        const here =
          place.column === 0
            ? Option.none()
            : lastBefore(
                matcher,
                textOf(buffer, place.line),
                place.column,
                landsOnEnd,
              )
        return orElse(
          Option.map(here, match => ({
            hit: { line: place.line, match },
            wrapped: false,
          })),
          () =>
            orElse(
              scanned(buffer, false, place.line - 1, 0, false, latest),
              () => scanned(buffer, false, last, place.line, true, latest),
            ),
        )
      },
    }),
  )
}

const placeOfHit = (
  buffer: Buffer.Buffer,
  { line, match }: Hit,
  landsOnEnd: boolean,
): Place => {
  if (!landsOnEnd || match.end === match.start) {
    return { line, column: match.start }
  }
  const row = buffer.lines[line]
  return {
    line,
    column:
      row === undefined
        ? 0
        : cellStart(
            row,
            cellAt(row, Math.min(match.end - 1, row.text.length - 1)),
          ),
  }
}

export type Found = Readonly<{
  spot: Spot
  reach: 'Exclusive' | 'Inclusive' | 'Linewise'
  wrapped: boolean
}>

const times = <A>(count: number, start: A, step: (a: A) => A): A => {
  let value = start
  for (let left = count; left > 0; left -= 1) {
    value = step(value)
  }
  return value
}

const undone = (buffer: Buffer.Buffer, from: Spot, offset: Offset): Start => {
  if (offset.kind === 'Line' || offset.by === 0) {
    return at(positionOf(buffer, from))
  }
  const walk = offset.by > 0 ? decl : incl
  const moved = times(Math.abs(offset.by), Option.some(from), spot =>
    Option.flatMap(spot, current => {
      const stepped = walk(buffer, current)
      return stepped.crossing === 'Stuck'
        ? Option.none()
        : Option.some(stepped.spot)
    }),
  )
  return Option.match(moved, {
    onNone: (): Start =>
      offset.by > 0 ? { _tag: 'BeforeNote' } : { _tag: 'AfterNote' },
    onSome: spot => at(positionOf(buffer, spot)),
  })
}

const withOffset = (
  buffer: Buffer.Buffer,
  place: Place,
  offset: Offset,
): Pick<Found, 'spot' | 'reach'> => {
  if (offset.kind === 'Line') {
    return {
      spot: {
        line: Math.max(
          0,
          Math.min(buffer.lines.length - 1, place.line + offset.by),
        ),
        cell: 0,
      },
      reach: 'Linewise',
    }
  }
  const start = spotAt(buffer, place, 'LineBreak')
  const walk = offset.by > 0 ? incl : decl
  const spot = times(
    Math.abs(offset.by),
    start,
    current => walk(buffer, current).spot,
  )
  return { spot, reach: offset.kind === 'End' ? 'Inclusive' : 'Exclusive' }
}

type Progress = Readonly<{ place: Place; wrapped: boolean }>

export const find = (
  buffer: Buffer.Buffer,
  from: Spot,
  matcher: Matcher,
  way: Way,
  count: number,
  offset: Offset,
): Option.Option<Found> => {
  const landsOnEnd = offset.kind === 'End'
  const raw: Probe =
    way === 'Forward'
      ? text => matcher.find(text, 0)
      : text => lastBefore(matcher, text, Infinity, false)
  const probe = count > 1 ? memoized(raw) : raw
  const stepFrom = (start: Start, firstOfCount: boolean) =>
    Option.map(
      way === 'Forward'
        ? forwardStep(buffer, matcher, start, landsOnEnd, firstOfCount, probe)
        : backwardStep(buffer, matcher, start, landsOnEnd, probe),
      ({ hit, wrapped }): Progress => ({
        place: placeOfHit(buffer, hit, landsOnEnd),
        wrapped,
      }),
    )
  const counted = (first: Progress): Option.Option<Progress> => {
    const visited = new Map<number, Map<number, number>>()
    const visitedAt = ({ line, column }: Place): number | undefined =>
      visited.get(line)?.get(column)
    const visit = ({ line, column }: Place, index: number): void => {
      const row = visited.get(line)
      if (row === undefined) {
        visited.set(line, new Map([[column, index]]))
      } else {
        row.set(column, index)
      }
    }
    visit(first.place, 0)
    const places: Array<Place> = [first.place]
    let current = first
    for (let index = 1; index < count; index += 1) {
      const next = stepFrom(at(current.place), false)
      if (Option.isNone(next)) {
        return next
      }
      const wrapped = current.wrapped || next.value.wrapped
      const seen = visitedAt(next.value.place)
      if (seen !== undefined) {
        const length = index - seen
        const place = places[seen + ((count - 1 - seen) % length)]
        return Option.some({
          place: place ?? next.value.place,
          wrapped: true,
        })
      }
      visit(next.value.place, index)
      places.push(next.value.place)
      current = { place: next.value.place, wrapped }
    }
    return Option.some(current)
  }
  return Option.map(
    Option.flatMap(stepFrom(undone(buffer, from, offset), true), counted),
    ({ place, wrapped }) => ({ ...withOffset(buffer, place, offset), wrapped }),
  )
}

type Under = Readonly<{ start: Spot; pattern: string }>

const escapedForSearch = (text: string): string =>
  text.replace(/[/.*~[^$\\]/gu, '\\$&')

export const wordUnder = (
  buffer: Buffer.Buffer,
  { line, cell }: Spot,
): Option.Option<Under> => {
  const row = buffer.lines[line]
  const cells = row === undefined ? 0 : cellCount(row)
  if (row === undefined || cells === 0) {
    return Option.none()
  }
  const kinds = Array.makeBy(cells, index =>
    classOfCodePoint(row.text.codePointAt(cellStart(row, index)) ?? -1),
  )
  const runStart = (at: number): number =>
    at >= cells
      ? at
      : Array.findLastIndex(
          kinds.slice(0, at),
          kind => kind !== kinds[at],
        ).pipe(Option.match({ onNone: () => 0, onSome: index => index + 1 }))
  const firstAtOrAfter = (anyNonBlank: boolean): number =>
    Array.findFirstIndex(
      kinds,
      (kind, index) =>
        index >= cell &&
        kind !== blankClass &&
        (anyNonBlank || kind !== punctuationClass),
    ).pipe(Option.getOrElse(() => cells))
  const wordFirst = runStart(firstAtOrAfter(false))
  const start = isWordClass(kinds[wordFirst] ?? blankClass)
    ? wordFirst
    : runStart(firstAtOrAfter(true))
  if (start >= cells) {
    return Option.none()
  }
  const kind = kinds[start] ?? blankClass
  const isWord = isWordClass(kind)
  const end = Array.findFirstIndex(
    kinds,
    (next, index) =>
      index >= start && (isWord ? next !== kind : next === blankClass),
  ).pipe(Option.getOrElse(() => cells))
  const text = row.text.slice(cellStart(row, start), cellStart(row, end))
  const lastIsWord = isWordClass(kinds[end - 1] ?? blankClass)
  return Option.some({
    start: { line, cell: start },
    pattern: `${isWord ? '\\<' : ''}${escapedForSearch(text)}${lastIsWord ? '\\>' : ''}`,
  })
}
