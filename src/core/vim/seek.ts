import { Option, Result, Schema } from 'effect'

import type * as Buffer from '../buffer'
import { cellAt, cellEnd, cellStart } from './cells'
import type { Spot } from './motions'
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

export const forgotten: Memory = { find: Option.none(), search: Option.none() }

export type Landing = Readonly<{
  spot: Spot
  reach: 'Inclusive' | 'Exclusive' | 'Linewise'
}>

export type Sought = Readonly<{
  memory: Memory
  landing: Option.Option<Landing>
  notice: Option.Option<string>
  cursorOnFailure: Option.Option<Spot>
}>

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

const outcome = (memory: Memory, overrides: Partial<Sought> = {}): Sought => ({
  memory,
  landing: Option.none(),
  notice: Option.none(),
  cursorOnFailure: Option.none(),
  ...overrides,
})

const failed = (memory: Memory, notice: string): Sought =>
  outcome(memory, { notice: Option.some(notice) })

type Run = Readonly<{
  buffer: Buffer.Buffer
  from: Spot
  memory: Memory
  request: Searched
  count: number
  remembers: boolean
  cursorOnFailure: Option.Option<Spot>
}>

const ranSearch = ({
  buffer,
  from,
  memory,
  request,
  count,
  remembers,
  cursorOnFailure,
}: Run): Sought =>
  Result.match(Pattern.compile(request.pattern), {
    onFailure: notice => failed(memory, notice),
    onSuccess: matcher => {
      const kept: Memory = remembers
        ? { ...memory, search: Option.some(request) }
        : memory
      return Option.match(
        Search.find(buffer, from, matcher, request.way, count, request.offset),
        {
          onNone: () =>
            outcome(kept, {
              notice: Option.some(notFound(request.pattern)),
              cursorOnFailure,
            }),
          onSome: ({ spot, reach, wrapped }) =>
            outcome(kept, {
              landing: Option.some({ spot, reach }),
              notice: wrapped
                ? Option.some(wrapNotice(request.way))
                : Option.none(),
            }),
        },
      )
    },
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
): Sought =>
  Seek.match(seek, {
    Find: ({ way, till, letter }): Sought => {
      const find = { way, till, letter }
      return outcome(
        { ...memory, find: Option.some(find) },
        { landing: landingOf(buffer, from, find, count ?? 1, false) },
      )
    },
    Again: ({ reverse }): Sought =>
      outcome(memory, {
        landing: Option.flatMap(memory.find, last =>
          landingOf(
            buffer,
            from,
            reversed(last, reverse),
            count ?? 1,
            last.till && (count ?? 1) === 1,
          ),
        ),
      }),
    Search: ({ way, text }): Sought =>
      Result.match(requestFrom(text, way, memory.search), {
        onFailure: notice => failed(memory, notice),
        onSuccess: request =>
          ranSearch({
            buffer,
            from,
            memory,
            request,
            count: count ?? 1,
            remembers: true,
            cursorOnFailure: Option.none(),
          }),
      }),
    Next: ({ reverse }): Sought =>
      Option.match(memory.search, {
        onNone: () => failed(memory, Pattern.noPrevious),
        onSome: last =>
          ranSearch({
            buffer,
            from,
            memory,
            request: reverse ? { ...last, way: flipped(last.way) } : last,
            count: count ?? 1,
            remembers: false,
            cursorOnFailure: Option.none(),
          }),
      }),
    Word: ({ way }): Sought =>
      Option.match(Search.wordUnder(buffer, from), {
        onNone: () => failed(memory, 'E348: No string under cursor'),
        onSome: ({ start, pattern }) =>
          ranSearch({
            buffer,
            from: start,
            memory,
            request: { pattern, offset: Search.noOffset, way },
            count: count ?? 1,
            remembers: true,
            cursorOnFailure: Option.some(start),
          }),
      }),
  })
