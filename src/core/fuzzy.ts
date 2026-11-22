import { Array, Option, Order } from 'effect'

import { type Note, newestFirst, pathOf, title } from './notes'

export type Match = Readonly<{
  score: number
  positions: ReadonlyArray<number>
}>

const scoreMatch = 16
const scoreGapStart = -3
const scoreGapExtension = -1
const bonusBoundary = scoreMatch / 2
const bonusNonWord = scoreMatch / 2
const bonusBoundaryDelimiter = bonusBoundary + 1
const bonusBoundaryWhite = bonusBoundary + 2
const bonusCamel123 = bonusBoundary + scoreGapExtension
const bonusConsecutive = -(scoreGapStart + scoreGapExtension)
const bonusFirstCharMultiplier = 2
const pathWeight = 0.6

type CharClass =
  | 'White'
  | 'NonWord'
  | 'Delimiter'
  | 'Lower'
  | 'Upper'
  | 'Letter'
  | 'Number'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

const graphemesOf = (text: string): ReadonlyArray<string> =>
  Array.map(
    Array.fromIterable(segmenter.segment(text.normalize('NFC'))),
    ({ segment }) => segment,
  )

const classOf = (grapheme: string): CharClass =>
  /^\s/u.test(grapheme)
    ? 'White'
    : /^[/,:;|]/u.test(grapheme)
      ? 'Delimiter'
      : /^\p{Ll}/u.test(grapheme)
        ? 'Lower'
        : /^\p{Lu}/u.test(grapheme)
          ? 'Upper'
          : /^\p{L}/u.test(grapheme)
            ? 'Letter'
            : /^\p{N}/u.test(grapheme)
              ? 'Number'
              : 'NonWord'

const isWord = (charClass: CharClass): boolean =>
  charClass === 'Lower' ||
  charClass === 'Upper' ||
  charClass === 'Letter' ||
  charClass === 'Number'

const bonusFor = (previous: CharClass, current: CharClass): number => {
  if (isWord(current)) {
    if (previous === 'White') {
      return bonusBoundaryWhite
    }
    if (previous === 'Delimiter') {
      return bonusBoundaryDelimiter
    }
    if (previous === 'NonWord') {
      return bonusBoundary
    }
  }
  if (
    (previous === 'Lower' && current === 'Upper') ||
    (previous !== 'Number' && current === 'Number')
  ) {
    return bonusCamel123
  }
  if (current === 'NonWord' || current === 'Delimiter') {
    return bonusNonWord
  }
  if (current === 'White') {
    return bonusBoundaryWhite
  }
  return 0
}

const firstPositions = (
  text: ReadonlyArray<string>,
  pattern: ReadonlyArray<string>,
): Option.Option<ReadonlyArray<number>> =>
  Array.reduce(
    pattern,
    Option.some<ReadonlyArray<number>>([]),
    (found, grapheme) =>
      Option.flatMap(found, positions => {
        const from = Array.last(positions).pipe(Option.getOrElse(() => -1)) + 1
        const at = text.indexOf(grapheme, from)
        return at < 0 ? Option.none() : Option.some([...positions, at])
      }),
  )

type Grid = Array<Array<number>>

const grid = (rows: number, columns: number): Grid =>
  Array.makeBy(rows, () => Array.makeBy(columns, () => 0))

const cell = (rows: Grid, row: number, column: number): number =>
  rows[row]?.[column] ?? 0

const setCell = (rows: Grid, row: number, column: number, value: number) => {
  const target = rows[row]
  if (target !== undefined) {
    target[column] = value
  }
}

const backtrace = (
  scores: Grid,
  runs: Grid,
  first: ReadonlyArray<number>,
  row: number,
  column: number,
  preferMatch: boolean,
  positions: ReadonlyArray<number>,
): ReadonlyArray<number> => {
  if (column < 0) {
    return positions
  }
  const here = cell(scores, row, column)
  const start = first[row] ?? 0
  const diagonal =
    row > 0 && column >= start ? cell(scores, row - 1, column - 1) : 0
  const left = column > start ? cell(scores, row, column - 1) : 0
  const takes =
    here > diagonal && (here > left || (here === left && preferMatch))
  if (takes && row === 0) {
    return [column, ...positions]
  }
  return backtrace(
    scores,
    runs,
    first,
    takes ? row - 1 : row,
    column - 1,
    cell(runs, row, column) > 1 || cell(runs, row + 1, column + 1) > 0,
    takes ? [column, ...positions] : positions,
  )
}

const matchedCell = (
  scores: Grid,
  runs: Grid,
  bonuses: ReadonlyArray<number>,
  row: number,
  column: number,
  left: number,
): Readonly<{ score: number; run: number }> => {
  const bonus = bonuses[column] ?? 0
  if (row === 0) {
    return { score: scoreMatch + bonus * bonusFirstCharMultiplier, run: 1 }
  }
  const diagonal = cell(scores, row - 1, column - 1) + scoreMatch
  const run = cell(runs, row - 1, column - 1) + 1
  const runStartBonus = bonuses[column - run + 1] ?? 0
  const breaksRun = run > 1 && bonus >= bonusBoundary && bonus > runStartBonus
  const boosted =
    run > 1 && !breaksRun
      ? Math.max(bonus, bonusConsecutive, runStartBonus)
      : bonus
  return diagonal + boosted < left
    ? { score: diagonal + bonus, run: 0 }
    : { score: diagonal + boosted, run: breaksRun ? 1 : run }
}

const matchTerm = (
  text: ReadonlyArray<string>,
  bonuses: ReadonlyArray<number>,
  pattern: ReadonlyArray<string>,
): Option.Option<Match> =>
  Option.flatMap(firstPositions(text, pattern), first => {
    const rows = pattern.length
    const columns = text.length
    const scores = grid(rows, columns)
    const runs = grid(rows, columns)
    const best = { score: 0, column: -1 }
    Array.forEach(pattern, (wanted, row) => {
      const start = first[row] ?? 0
      const gap = { open: false }
      Array.forEach(Array.range(start, columns - 1), column => {
        const left =
          column > start
            ? cell(scores, row, column - 1) +
              (gap.open ? scoreGapExtension : scoreGapStart)
            : 0
        const isMatch = text[column] === wanted
        const outcome = isMatch
          ? matchedCell(scores, runs, bonuses, row, column, left)
          : { score: 0, run: 0 }
        const freshStart = row === 0 && isMatch
        const score = freshStart
          ? outcome.score
          : Math.max(outcome.score, left, 0)
        gap.open = freshStart ? false : outcome.score < left
        setCell(scores, row, column, score)
        setCell(runs, row, column, isMatch ? outcome.run : 0)
        if (row === rows - 1 && score > best.score) {
          best.score = score
          best.column = column
        }
      })
    })
    return best.column < 0
      ? Option.none()
      : Option.some({
          score: best.score,
          positions: backtrace(
            scores,
            runs,
            first,
            rows - 1,
            best.column,
            true,
            [],
          ),
        })
  })

const foldCase = (graphemes: ReadonlyArray<string>, caseSensitive: boolean) =>
  caseSensitive
    ? graphemes
    : Array.map(graphemes, grapheme => grapheme.toLowerCase())

export const match = (text: string, query: string): Option.Option<Match> => {
  const terms = Array.filter(
    query.normalize('NFC').split(/\s+/u),
    term => term !== '',
  )
  if (Array.isArrayEmpty(terms)) {
    return Option.some({ score: 0, positions: [] })
  }
  const caseSensitive = /\p{Lu}/u.test(query)
  const original = graphemesOf(text)
  const folded = foldCase(original, caseSensitive)
  const bonuses = Array.map(original, (grapheme, index) =>
    bonusFor(
      index === 0 ? 'White' : classOf(original[index - 1] ?? ' '),
      classOf(grapheme),
    ),
  )
  return Array.reduce(
    terms,
    Option.some<Match>({ score: 0, positions: [] }),
    (sofar, term) =>
      Option.flatMap(sofar, total =>
        Option.map(
          matchTerm(
            folded,
            bonuses,
            foldCase(graphemesOf(term), caseSensitive),
          ),
          found => ({
            score: total.score + found.score,
            positions: Array.sort(
              Array.dedupe([...total.positions, ...found.positions]),
              Order.Number,
            ),
          }),
        ),
      ),
  )
}

export type Ranked = Readonly<{
  note: Note
  score: number
  titleHits: ReadonlyArray<number>
}>

const byScore: Order.Order<Ranked> = Order.flip(
  Order.mapInput(Order.Number, (ranked: Ranked) => ranked.score),
)

export const rank = (
  notes: ReadonlyArray<Note>,
  query: string,
): ReadonlyArray<Ranked> =>
  Array.sort(
    Array.getSomes(
      Array.map(notes, note => {
        const titleMatch = match(title(note.text), query)
        const pathMatch = match(pathOf(note), query)
        if (Option.isNone(titleMatch) && Option.isNone(pathMatch)) {
          return Option.none()
        }
        const titleScore = Option.match(titleMatch, {
          onNone: () => 0,
          onSome: ({ score }) => score,
        })
        const pathScore = Option.match(pathMatch, {
          onNone: () => 0,
          onSome: ({ score }) => score,
        })
        return Option.some({
          note,
          score: Math.max(titleScore, pathWeight * pathScore),
          titleHits: Option.match(titleMatch, {
            onNone: () => [],
            onSome: ({ positions }) => positions,
          }),
        })
      }),
    ),
    Order.combine(
      byScore,
      Order.mapInput(newestFirst, (ranked: Ranked) => ranked.note),
    ),
  )
