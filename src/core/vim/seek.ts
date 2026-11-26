import { Option, Schema } from 'effect'

import type * as Buffer from '../buffer'
import { cellAt, cellEnd, cellStart } from './cells'
import type { Spot } from './motions'

export const Way = Schema.Literals(['Forward', 'Backward'])
export type Way = typeof Way.Type

export const Find = Schema.Struct({
  way: Way,
  till: Schema.Boolean,
  letter: Schema.String,
})
export type Find = typeof Find.Type

export const Seek = Schema.TaggedUnion({
  Find: Find.fields,
  Again: { reverse: Schema.Boolean },
})
export type Seek = typeof Seek.Type

export const Memory = Schema.Struct({ find: Schema.Option(Find) })
export type Memory = typeof Memory.Type

export const forgotten: Memory = { find: Option.none() }

export type Landing = Readonly<{
  spot: Spot
  reach: 'Inclusive' | 'Exclusive'
}>

export type Sought = Readonly<{
  memory: Memory
  landing: Option.Option<Landing>
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
      return {
        memory: { ...memory, find: Option.some(find) },
        landing: landingOf(buffer, from, find, count ?? 1, false),
      }
    },
    Again: ({ reverse }): Sought => ({
      memory,
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
  })
