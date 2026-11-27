import { Array, Option, Order, Schema } from 'effect'

import * as Buffer from '../buffer'
import { Input } from '../input'
import { cellAt, cellCount, cellEnd, isCellEdge } from './cells'

export const Region = Schema.Struct({
  first: Buffer.Position,
  last: Buffer.Position,
})
export type Region = typeof Region.Type

export const Label = Schema.Struct({
  letter: Schema.String,
  at: Buffer.Position,
})
export type Label = typeof Label.Type

export const Jump = Schema.Struct({
  pattern: Schema.String,
  region: Region,
  labels: Schema.Array(Label),
})
export type Jump = typeof Jump.Type

export type Hit = Readonly<{ line: number; from: number; to: number }>

export type Found = Readonly<{
  matches: ReadonlyArray<Hit>
  taken: ReadonlySet<string>
}>

export type Act =
  | Readonly<{ _tag: 'Stay'; jump: Jump }>
  | Readonly<{ _tag: 'End' }>
  | Readonly<{ _tag: 'Land'; at: Buffer.Position }>

export type Marks = Readonly<{
  matches: ReadonlyArray<Hit>
  labels: ReadonlyArray<
    Readonly<{
      letter: string
      line: number
      column: number
      over: Readonly<{ from: number; to: number }>
    }>
  >
}>

export const letters = 'asdfghjklqwertyuiopzxcvbnmASDFGHJKLQWERTYUIOPZXCVBNM'

export const open = (region: Region): Jump => ({
  pattern: '',
  region,
  labels: [],
})

const asciiOnly = /^[\u{0}-\u{7f}]*$/u

const asciiLetter = /^[A-Za-z]$/u

const folded = (text: string): string =>
  asciiOnly.test(text)
    ? text.toLowerCase()
    : Array.join(
        Array.map(Array.fromIterable(text), letter => {
          const lowered = letter.toLowerCase()
          return lowered.length === letter.length ? lowered : letter
        }),
        '',
      )

const forbidden = (letter: string, caseless: boolean): ReadonlyArray<string> =>
  caseless ? [letter.toLowerCase(), letter.toUpperCase()] : [letter]

export const find = (
  buffer: Buffer.Buffer,
  region: Region,
  pattern: string,
): Found => {
  const matches: Array<Hit> = []
  const taken = new Set<string>()
  if (pattern === '') {
    return { matches, taken }
  }
  const caseless = pattern === pattern.toLowerCase()
  const lastLine = Math.min(region.last.line, buffer.lines.length - 1)
  for (
    let index = Math.max(0, region.first.line);
    index <= lastLine;
    index += 1
  ) {
    const line = buffer.lines[index]
    if (line === undefined) {
      continue
    }
    const { text } = line
    const begin = index === region.first.line ? region.first.column : 0
    const limit =
      index === region.last.line
        ? Math.min(region.last.column, text.length)
        : text.length
    if (begin >= limit) {
      continue
    }
    const slice = text.slice(
      begin,
      Math.min(text.length, limit + pattern.length),
    )
    const hay = caseless ? folded(slice) : slice
    let at = hay.indexOf(pattern)
    while (at !== -1 && begin + at < limit) {
      const from = begin + at
      const to = from + pattern.length
      if (isCellEdge(line, from)) {
        if (isCellEdge(line, to)) {
          matches.push({ line: index, from, to })
        }
        const after = hay[at + pattern.length]
        if (
          after !== undefined &&
          asciiLetter.test(after) &&
          isCellEdge(line, to + 1)
        ) {
          for (const letter of forbidden(after, caseless)) {
            taken.add(letter)
          }
        }
      }
      at = hay.indexOf(pattern, at + 1)
    }
  }
  return { matches, taken }
}

const isLowerLabel = (letter: string): boolean => /^[a-z]$/u.test(letter)

const cellOfColumn = (line: Buffer.Line | undefined, column: number): number =>
  line === undefined
    ? 0
    : column >= line.text.length
      ? cellCount(line)
      : cellAt(line, column)

const isAtCursor = (hit: Hit, cursor: Buffer.Position): boolean =>
  hit.line === cursor.line && hit.from === cursor.column

type Ranked = Readonly<{
  hit: Hit
  lines: number
  cells: number
  before: number
}>

const nearest: Order.Order<Ranked> = Order.make((a, b) =>
  Order.Number(
    a.lines - b.lines ||
      a.cells - b.cells ||
      a.before - b.before ||
      a.hit.line - b.hit.line ||
      a.hit.from - b.hit.from,
    0,
  ),
)

export const labelled = (
  buffer: Buffer.Buffer,
  found: Found,
  cursor: Buffer.Position,
  held: ReadonlyArray<Label>,
): ReadonlyArray<Label> => {
  const allowed = Array.filter(
    Array.fromIterable(letters),
    letter => !found.taken.has(letter),
  )
  const targets = Array.filter(found.matches, hit => !isAtCursor(hit, cursor))
  const starts = new Set(Array.map(targets, hit => `${hit.line}:${hit.from}`))
  const kept = Array.filter(
    held,
    ({ letter, at }) =>
      isLowerLabel(letter) &&
      allowed.includes(letter) &&
      starts.has(`${at.line}:${at.column}`),
  )
  const used = new Set(Array.map(kept, ({ letter }) => letter))
  const keptStarts = new Set(
    Array.map(kept, ({ at }) => `${at.line}:${at.column}`),
  )
  const free = Array.filter(allowed, letter => !used.has(letter))
  const cursorCell = cellOfColumn(buffer.lines[cursor.line], cursor.column)
  const ranked = Array.sort(
    Array.map(
      Array.filter(targets, hit => !keptStarts.has(`${hit.line}:${hit.from}`)),
      hit => ({
        hit,
        lines: Math.abs(hit.line - cursor.line),
        cells: Math.abs(
          cellOfColumn(buffer.lines[hit.line], hit.from) - cursorCell,
        ),
        before:
          hit.line < cursor.line ||
          (hit.line === cursor.line && hit.from < cursor.column)
            ? 1
            : 0,
      }),
    ),
    nearest,
  )
  return [
    ...kept,
    ...Array.map(Array.zip(free, ranked), ([letter, { hit }]): Label => ({
      letter,
      at: { line: hit.line, column: hit.from },
    })),
  ]
}

const retyped = (buffer: Buffer.Buffer, jump: Jump, pattern: string): Act => {
  const found = find(buffer, jump.region, pattern)
  return found.matches.length === 0 && pattern !== ''
    ? { _tag: 'End' }
    : {
        _tag: 'Stay',
        jump: {
          ...jump,
          pattern,
          labels: labelled(buffer, found, buffer.caret, jump.labels),
        },
      }
}

const lastLetterOut = (pattern: string): string =>
  pattern.slice(
    0,
    Option.match(
      Array.last(Array.fromIterable(Buffer.segmenter.segment(pattern))),
      { onNone: () => 0, onSome: ({ index }) => index },
    ),
  )

const entered = (buffer: Buffer.Buffer, jump: Jump): Act => {
  const { caret } = buffer
  const targets = Array.filter(
    find(buffer, jump.region, jump.pattern).matches,
    hit => !isAtCursor(hit, caret),
  )
  const chosen = Option.orElse(
    Array.findFirst(
      targets,
      hit =>
        hit.line > caret.line ||
        (hit.line === caret.line && hit.from > caret.column),
    ),
    () => Array.head(targets),
  )
  return jump.pattern === ''
    ? { _tag: 'End' }
    : Option.match(chosen, {
        onNone: (): Act => ({ _tag: 'End' }),
        onSome: (hit): Act => ({
          _tag: 'Land',
          at: { line: hit.line, column: hit.from },
        }),
      })
}

const typed = (buffer: Buffer.Buffer, jump: Jump, text: string): Act => {
  if (text === '') {
    return { _tag: 'Stay', jump }
  }
  return Option.match(
    Array.findFirst(jump.labels, ({ letter }) => letter === text),
    {
      onNone: () => retyped(buffer, jump, jump.pattern + text),
      onSome: ({ at }): Act => ({ _tag: 'Land', at }),
    },
  )
}

const hasModifier = ({
  ctrl,
  alt,
  meta,
}: Readonly<{ ctrl: boolean; alt: boolean; meta: boolean }>): boolean =>
  ctrl || alt || meta

export const feed = (buffer: Buffer.Buffer, jump: Jump, input: Input): Act =>
  Input.match(input, {
    Key: ({ key, modifiers }): Act =>
      hasModifier(modifiers)
        ? { _tag: 'End' }
        : key === 'Backspace'
          ? retyped(buffer, jump, lastLetterOut(jump.pattern))
          : key === 'Enter'
            ? entered(buffer, jump)
            : { _tag: 'End' },
    Chord: (): Act => ({ _tag: 'End' }),
    Paste: (): Act => ({ _tag: 'End' }),
    Text: ({ text }) => typed(buffer, jump, text),
    Commit: ({ text }) => typed(buffer, jump, text),
    Preedit: (): Act => ({ _tag: 'Stay', jump }),
    Erase: (): Act => ({ _tag: 'Stay', jump }),
  })

const cellAfter = (
  line: Buffer.Line | undefined,
  column: number,
): Readonly<{ from: number; to: number }> =>
  line === undefined || column >= line.text.length
    ? { from: column, to: column }
    : { from: column, to: cellEnd(line, cellAt(line, column)) }

export const marks = (
  buffer: Buffer.Buffer,
  jump: Jump,
  drawn: Readonly<{ first: number; last: number }>,
): Marks => {
  const isDrawn = (line: number): boolean =>
    line >= drawn.first && line <= drawn.last
  return {
    matches: Array.filter(
      find(buffer, jump.region, jump.pattern).matches,
      hit => isDrawn(hit.line),
    ),
    labels: Array.map(
      Array.filter(jump.labels, ({ at }) => isDrawn(at.line)),
      ({ letter, at }) => ({
        letter,
        line: at.line,
        column: at.column,
        over: cellAfter(buffer.lines[at.line], at.column + jump.pattern.length),
      }),
    ),
  }
}
