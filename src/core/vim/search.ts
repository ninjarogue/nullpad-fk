import { Option, Result, Schema } from 'effect'

import type * as Buffer from '../buffer'
import { cellAt, cellCount, cellEnd, cellStart, cellText } from './cells'
import { type Spot, decl, incl, positionOf, spotAt } from './motions'
import { wordCharacter } from './pattern'

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
    ? Result.fail('not supported in a search: ;')
    : Result.succeed(offset)
}

type Match = Readonly<{ start: number; end: number }>

type Place = Readonly<{ line: number; column: number }>

const matchAt = (
  regex: RegExp,
  text: string,
  at: number,
): Option.Option<Match> => {
  regex.lastIndex = at
  const found = regex.exec(text)
  return found === null
    ? Option.none()
    : Option.some({ start: found.index, end: found.index + found[0].length })
}

const nextColumn = (text: string, { start, end }: Match): number =>
  end > start || end >= text.length
    ? end
    : end + String.fromCodePoint(text.codePointAt(end) ?? 0).length

const firstAfter = (
  regex: RegExp,
  text: string,
  column: number,
  extra: number,
  usesEnd: boolean,
): Option.Option<Match> => {
  let from = 0
  while (from <= text.length) {
    const found = matchAt(regex, text, from)
    if (Option.isNone(found)) {
      return found
    }
    const { start, end } = found.value
    const rejected = usesEnd
      ? end - 1 < column + extra
      : start - (start === text.length ? 1 : 0) < column + extra
    if (!rejected) {
      return found
    }
    from = nextColumn(text, found.value)
    if (from >= text.length) {
      return Option.none()
    }
  }
  return Option.none()
}

const lastBefore = (
  regex: RegExp,
  text: string,
  column: number,
  usesEnd: boolean,
): Option.Option<Match> => {
  let from = 0
  let best: Option.Option<Match> = Option.none()
  while (from <= text.length) {
    const found = matchAt(regex, text, from)
    if (Option.isNone(found)) {
      break
    }
    const { start, end } = found.value
    if (!(usesEnd ? end - 1 < column : start < column)) {
      break
    }
    best = found
    from = nextColumn(text, found.value)
    if (from >= text.length) {
      break
    }
  }
  return best
}

const lastIn = (regex: RegExp, text: string): Option.Option<Match> =>
  lastBefore(regex, text, Infinity, false)

type Hit = Readonly<{ line: number; match: Match }>

type Stepped = Option.Option<Readonly<{ hit: Hit; wrapped: boolean }>>

const textOf = (buffer: Buffer.Buffer, line: number): string =>
  buffer.lines[line]?.text ?? ''

const forwardStep = (
  buffer: Buffer.Buffer,
  regex: RegExp,
  from: Place,
  usesEnd: boolean,
  firstOfCount: boolean,
): Stepped => {
  const count = buffer.lines.length
  const line = buffer.lines[from.line]
  const cell = line === undefined ? 0 : cellAt(line, from.column)
  const extra =
    line === undefined
      ? 1
      : Math.max(1, cellEnd(line, cell) - cellStart(line, cell))
  const here =
    from.line < 0
      ? Option.none()
      : firstAfter(
          regex,
          textOf(buffer, from.line),
          from.column,
          extra,
          usesEnd && firstOfCount,
        )
  if (Option.isSome(here)) {
    return Option.some({
      hit: { line: from.line, match: here.value },
      wrapped: false,
    })
  }
  const scanned = (first: number, last: number, wrapped: boolean): Stepped => {
    for (let index = first; index <= last; index += 1) {
      const found = matchAt(regex, textOf(buffer, index), 0)
      if (Option.isSome(found)) {
        return Option.some({
          hit: { line: index, match: found.value },
          wrapped,
        })
      }
    }
    return Option.none()
  }
  const below = scanned(from.line + 1, count - 1, false)
  return Option.isSome(below) ? below : scanned(0, from.line, true)
}

const backwardStep = (
  buffer: Buffer.Buffer,
  regex: RegExp,
  from: Place,
  usesEnd: boolean,
): Stepped => {
  const here =
    from.column === 0 || from.line >= buffer.lines.length
      ? Option.none()
      : lastBefore(regex, textOf(buffer, from.line), from.column, usesEnd)
  if (Option.isSome(here)) {
    return Option.some({
      hit: { line: from.line, match: here.value },
      wrapped: false,
    })
  }
  const scanned = (first: number, last: number, wrapped: boolean): Stepped => {
    for (let index = first; index >= last; index -= 1) {
      const found = lastIn(regex, textOf(buffer, index))
      if (Option.isSome(found)) {
        return Option.some({
          hit: { line: index, match: found.value },
          wrapped,
        })
      }
    }
    return Option.none()
  }
  const above = scanned(from.line - 1, 0, false)
  return Option.isSome(above)
    ? above
    : scanned(buffer.lines.length - 1, from.line, true)
}

const placeOfHit = (
  buffer: Buffer.Buffer,
  { line, match }: Hit,
  usesEnd: boolean,
): Place => {
  if (!usesEnd) {
    return { line, column: match.start }
  }
  if (match.end === match.start) {
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

const undone = (buffer: Buffer.Buffer, from: Spot, offset: Offset): Place => {
  if (offset.kind === 'Line' || offset.by === 0) {
    return positionOf(buffer, from)
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
    onNone: () => ({
      line: offset.by > 0 ? -1 : buffer.lines.length,
      column: 0,
    }),
    onSome: spot => positionOf(buffer, spot),
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
  const spot = times(Math.abs(offset.by), start, current => {
    const stepped = walk(buffer, current)
    return stepped.crossing === 'Stuck' ? current : stepped.spot
  })
  return { spot, reach: offset.kind === 'End' ? 'Inclusive' : 'Exclusive' }
}

export const find = (
  buffer: Buffer.Buffer,
  from: Spot,
  regex: RegExp,
  forward: boolean,
  count: number,
  offset: Offset,
): Option.Option<Found> => {
  const usesEnd = offset.kind === 'End'
  let place: Place = undone(buffer, from, offset)
  let wrapped = false
  for (let left = count; left > 0; left -= 1) {
    const stepped = forward
      ? forwardStep(buffer, regex, place, usesEnd, left === count)
      : backwardStep(buffer, regex, place, usesEnd)
    if (Option.isNone(stepped)) {
      return Option.none()
    }
    wrapped = wrapped || stepped.value.wrapped
    place = placeOfHit(buffer, stepped.value.hit, usesEnd)
  }
  const landed = withOffset(buffer, place, offset)
  return Option.some({ ...landed, wrapped })
}

type Under = Readonly<{ start: Spot; pattern: string }>

const classOf = (text: string): 0 | 1 | 2 =>
  /^\s*$/u.test(text)
    ? 0
    : wordCharacter.test(Array.from(text)[0] ?? '') ||
        /^\p{Extended_Pictographic}/u.test(text)
      ? 2
      : 1

const escapedForSearch = (text: string): string =>
  text.replace(/[/.*~[^$\\]/gu, '\\$&')

export const wordUnder = (
  buffer: Buffer.Buffer,
  { line, cell }: Spot,
): Option.Option<Under> => {
  const row = buffer.lines[line]
  if (row === undefined) {
    return Option.none()
  }
  const cells = cellCount(row)
  const classes = (index: number): 0 | 1 | 2 =>
    index < cells ? classOf(cellText(row, index)) : 0
  const startOf = (pass: 0 | 1): number => {
    let at = cell
    while (
      at < cells &&
      !(classes(at) !== 0 && (pass === 1 || classes(at) !== 1))
    ) {
      at += 1
    }
    const kind = classes(at)
    while (at > 0 && kind !== 0 && classes(at - 1) === kind) {
      at -= 1
    }
    return at
  }
  const first = startOf(0)
  const start = classes(first) === 2 ? first : startOf(1)
  if (start >= cells) {
    return Option.none()
  }
  const kind = classes(start)
  const isWord = kind === 2
  let end = start
  while (end < cells && (isWord ? classes(end) === kind : classes(end) !== 0)) {
    end += 1
  }
  const text = row.text.slice(cellStart(row, start), cellStart(row, end))
  const lastIsWord = classes(end - 1) === 2
  return Option.some({
    start: { line, cell: start },
    pattern: `${isWord ? '\\<' : ''}${escapedForSearch(text)}${lastIsWord ? '\\>' : ''}`,
  })
}
