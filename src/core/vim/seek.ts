import { Option, Result, Schema } from 'effect'

import type * as Buffer from '../buffer'
import { cellAt, cellCount, cellEnd, cellStart } from './cells'
import type { Matcher } from './matcher'
import type { LineEnd, Spot } from './motions'
import * as Pattern from './pattern'
import * as Search from './search'

export const Way = Search.Way
export type Way = Search.Way

export const Find = Schema.Struct({
  way: Way,
  till: Schema.Boolean,
  letter: Schema.String,
})
export type Find = typeof Find.Type

export const Seek = Schema.TaggedUnion({
  Find: Find.fields,
  Again: { reverse: Schema.Boolean },
  Search: { way: Way, text: Schema.String },
  Next: { reverse: Schema.Boolean },
  Word: { way: Way },
})
export type Seek = typeof Seek.Type

export const Searched = Schema.Struct({
  pattern: Schema.String,
  offset: Search.Offset,
  way: Way,
})
export type Searched = typeof Searched.Type

export const Memory = Schema.Struct({
  find: Schema.Option(Find),
  search: Schema.Option(Searched),
})
export type Memory = typeof Memory.Type

export const forgotten: Memory = {
  find: Option.none(),
  search: Option.none(),
}

export type Landing = Readonly<{
  spot: Spot
  reach: 'Inclusive' | 'Exclusive' | 'Linewise'
}>

export type Landed = Readonly<{
  _tag: 'Landed'
  memory: Memory
  notice: Option.Option<string>
  landing: Landing
}>

export type Failed = Readonly<{
  _tag: 'Failed'
  memory: Memory
  notice: Option.Option<string>
  cursor: Option.Option<Spot>
  resetsColumn: boolean
}>

export type Sought = Landed | Failed

const cellMatching = (
  line: Buffer.Line,
  index: number,
  letter: string,
): number | undefined => {
  const cell = cellAt(line, index)
  return cellStart(line, cell) === index &&
    cellEnd(line, cell) === index + letter.length
    ? cell
    : undefined
}

export const found = (
  buffer: Buffer.Buffer,
  from: Spot,
  { way, till, letter }: Find,
  count: number,
  skipsBeside: boolean,
): Option.Option<Spot> => {
  const line = buffer.lines[from.line] ?? buffer.lines[0]
  const forward = way === 'Forward'
  const step = forward ? 1 : -1
  const beside = from.cell + step
  let index = forward
    ? cellEnd(line, from.cell)
    : cellStart(line, from.cell) - letter.length
  let left = count
  while (index >= 0) {
    const at = forward
      ? line.text.indexOf(letter, index)
      : line.text.lastIndexOf(letter, index)
    if (at < 0) {
      return Option.none()
    }
    const cell = cellMatching(line, at, letter)
    if (cell !== undefined && !(skipsBeside && cell === beside)) {
      left -= 1
      if (left === 0) {
        return Option.some({
          line: from.line,
          cell: till ? cell - step : cell,
        })
      }
    }
    index = at + step
  }
  return Option.none()
}

const reversed = (find: Find, reverse: boolean): Find =>
  reverse
    ? { ...find, way: find.way === 'Forward' ? 'Backward' : 'Forward' }
    : find

const landingOf = (
  buffer: Buffer.Buffer,
  from: Spot,
  find: Find,
  count: number,
  skipsBeside: boolean,
): Option.Option<Landing> =>
  Option.map(found(buffer, from, find, count, skipsBeside), spot => ({
    spot,
    reach: find.way === 'Forward' ? 'Inclusive' : 'Exclusive',
  }))

const flipped = (way: Way): Way => (way === 'Forward' ? 'Backward' : 'Forward')

const notFound = (pattern: string): string =>
  `E486: Pattern not found: ${pattern}`

const wrapNotice = (way: Way): string =>
  way === 'Forward'
    ? 'search hit BOTTOM, continuing at TOP'
    : 'search hit TOP, continuing at BOTTOM'

const landed = (
  memory: Memory,
  landing: Landing,
  notice: Option.Option<string> = Option.none(),
): Sought => ({ _tag: 'Landed', memory, notice, landing })

const failed = (
  memory: Memory,
  notice: Option.Option<string>,
  resetsColumn: boolean,
  cursor: Option.Option<Spot> = Option.none(),
): Sought => ({ _tag: 'Failed', memory, notice, cursor, resetsColumn })

const soughtFrom = (memory: Memory, landing: Option.Option<Landing>): Sought =>
  Option.match(landing, {
    onNone: () => failed(memory, Option.none(), false),
    onSome: spot => landed(memory, spot),
  })

const spotAfterCheck = (
  buffer: Buffer.Buffer,
  { line, cell }: Spot,
  lineEnd: LineEnd,
): Spot => {
  const row = buffer.lines[line]
  return lineEnd === 'LastLetter' && row !== undefined
    ? { line, cell: Math.max(0, Math.min(cell, cellCount(row) - 1)) }
    : { line, cell }
}

const repeated = (
  buffer: Buffer.Buffer,
  from: Spot,
  lineEnd: LineEnd,
  count: number,
  search: (count: number) => Option.Option<Search.Found>,
): Option.Option<Search.Found> =>
  Option.flatMap(search(count), found => {
    const spot = spotAfterCheck(buffer, found.spot, lineEnd)
    const stuck =
      !found.wrapped &&
      found.reach !== 'Linewise' &&
      spot.line === from.line &&
      spot.cell === from.cell
    return stuck ? search(count + 1) : Option.some(found)
  })

const searching =
  (buffer: Buffer.Buffer, from: Spot, { way, offset }: Searched) =>
  (matcher: Matcher, count: number): Option.Option<Search.Found> =>
    Search.find(buffer, from, matcher, way, count, offset)

const ranSearch = (
  kept: Memory,
  request: Searched,
  cursor: Option.Option<Spot>,
  search: (matcher: Matcher) => Option.Option<Search.Found>,
): Sought =>
  Result.match(Pattern.compile(request.pattern), {
    onFailure: notice => failed(kept, Option.some(notice), true),
    onSuccess: matcher =>
      Option.match(search(matcher), {
        onNone: () =>
          failed(kept, Option.some(notFound(request.pattern)), true, cursor),
        onSome: ({ spot, reach, wrapped }) =>
          landed(
            kept,
            { spot, reach },
            wrapped ? Option.some(wrapNotice(request.way)) : Option.none(),
          ),
      }),
  })

const requestFrom = (
  text: string,
  way: Way,
  last: Option.Option<Searched>,
): Result.Result<Searched, string> => {
  if (text === '') {
    return Option.match(last, {
      onNone: () => Result.fail(Pattern.noPrevious),
      onSome: previous => Result.succeed({ ...previous, way }),
    })
  }
  const { pattern, offset } = Pattern.split(text, way === 'Forward' ? '/' : '?')
  return Result.flatMap(
    Option.match(offset, {
      onNone: () => Result.succeed(Search.noOffset),
      onSome: Search.parseOffset,
    }),
    parsed =>
      pattern !== ''
        ? Result.succeed({ pattern, offset: parsed, way })
        : Option.match(last, {
            onNone: () => Result.fail(Pattern.noPrevious),
            onSome: previous =>
              Result.succeed({
                pattern: previous.pattern,
                offset: parsed,
                way,
              }),
          }),
  )
}

export const sought = (
  buffer: Buffer.Buffer,
  from: Spot,
  seek: Seek,
  count: number | undefined,
  memory: Memory,
  lineEnd: LineEnd,
): Sought => {
  const times = count ?? 1
  return Seek.match(seek, {
    Find: ({ way, till, letter }): Sought => {
      const find = { way, till, letter }
      return soughtFrom(
        { ...memory, find: Option.some(find) },
        landingOf(buffer, from, find, times, false),
      )
    },
    Again: ({ reverse }): Sought =>
      soughtFrom(
        memory,
        Option.flatMap(memory.find, last =>
          landingOf(
            buffer,
            from,
            reversed(last, reverse),
            times,
            last.till && times === 1,
          ),
        ),
      ),
    Search: ({ way, text }): Sought =>
      Result.match(requestFrom(text, way, memory.search), {
        onFailure: notice => failed(memory, Option.some(notice), true),
        onSuccess: request => {
          const probe = searching(buffer, from, request)
          return ranSearch(
            { ...memory, search: Option.some(request) },
            request,
            Option.none(),
            matcher => probe(matcher, times),
          )
        },
      }),
    Next: ({ reverse }): Sought =>
      Option.match(memory.search, {
        onNone: () => failed(memory, Option.some(Pattern.noPrevious), true),
        onSome: last => {
          const request = reverse ? { ...last, way: flipped(last.way) } : last
          const probe = searching(buffer, from, request)
          return ranSearch(memory, request, Option.none(), matcher =>
            repeated(buffer, from, lineEnd, times, extra =>
              probe(matcher, extra),
            ),
          )
        },
      }),
    Word: ({ way }): Sought =>
      Option.match(Search.wordUnder(buffer, from), {
        onNone: () =>
          failed(memory, Option.some('E348: No string under cursor'), false),
        onSome: ({ start, pattern }) => {
          const request = { pattern, offset: Search.noOffset, way }
          const probe = searching(buffer, start, request)
          return ranSearch(
            { ...memory, search: Option.some(request) },
            request,
            Option.some(start),
            matcher => probe(matcher, times),
          )
        },
      }),
  })
}
