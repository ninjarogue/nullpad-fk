import { Array, Option, Order } from 'effect'

import { type Note, newestFirst, noteTitle, pathOf } from './notes'

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

const printableAscii = /^[\x20-\x7e]*$/u

const graphemesOf = (text: string): ReadonlyArray<string> =>
  printableAscii.test(text)
    ? text.split('')
    : Array.map(
        Array.fromIterable(segmenter.segment(text.normalize('NFC'))),
        ({ segment }) => segment,
      )

const classes = new Map<string, CharClass>()

const classOf = (grapheme: string): CharClass => {
  const known = classes.get(grapheme)
  if (known !== undefined) {
    return known
  }
  const found = freshClassOf(grapheme)
  classes.set(grapheme, found)
  return found
}

const freshClassOf = (grapheme: string): CharClass =>
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

type Table = Readonly<{
  scores: Int32Array
  runs: Int32Array
  rows: number
  columns: number
}>

const scratch = { scores: new Int32Array(1024), runs: new Int32Array(1024) }

const table = (rows: number, columns: number): Table => {
  const size = rows * columns
  if (scratch.scores.length < size) {
    scratch.scores = new Int32Array(size * 2)
    scratch.runs = new Int32Array(size * 2)
  }
  scratch.scores.fill(0, 0, size)
  scratch.runs.fill(0, 0, size)
  return { scores: scratch.scores, runs: scratch.runs, rows, columns }
}

const read = (
  cells: Int32Array,
  { rows, columns }: Table,
  row: number,
  column: number,
): number =>
  row < 0 || row >= rows || column < 0 || column >= columns
    ? 0
    : (cells[row * columns + column] ?? 0)

const backtrace = (
  grid: Table,
  first: ReadonlyArray<number>,
  row: number,
  column: number,
  preferMatch: boolean,
  positions: ReadonlyArray<number>,
): ReadonlyArray<number> => {
  if (column < 0) {
    return positions
  }
  const here = read(grid.scores, grid, row, column)
  const start = first[row] ?? 0
  const diagonal =
    row > 0 && column >= start
      ? read(grid.scores, grid, row - 1, column - 1)
      : 0
  const left = column > start ? read(grid.scores, grid, row, column - 1) : 0
  const takes =
    here > diagonal && (here > left || (here === left && preferMatch))
  if (takes && row === 0) {
    return [column, ...positions]
  }
  return backtrace(
    grid,
    first,
    takes ? row - 1 : row,
    column - 1,
    read(grid.runs, grid, row, column) > 1 ||
      read(grid.runs, grid, row + 1, column + 1) > 0,
    takes ? [column, ...positions] : positions,
  )
}

const fillMatchedCell = (
  grid: Table,
  bonuses: ReadonlyArray<number>,
  row: number,
  column: number,
  left: number,
): number => {
  const at = row * grid.columns + column
  const bonus = bonuses[column] ?? 0
  if (row === 0) {
    grid.runs[at] = 1
    return scoreMatch + bonus * bonusFirstCharMultiplier
  }
  const diagonal = read(grid.scores, grid, row - 1, column - 1) + scoreMatch
  const run = read(grid.runs, grid, row - 1, column - 1) + 1
  const runStartBonus = bonuses[column - run + 1] ?? 0
  const breaksRun = run > 1 && bonus >= bonusBoundary && bonus > runStartBonus
  const boosted =
    run > 1 && !breaksRun
      ? Math.max(bonus, bonusConsecutive, runStartBonus)
      : bonus
  if (diagonal + boosted < left) {
    grid.runs[at] = 0
    return diagonal + bonus
  }
  grid.runs[at] = breaksRun ? 1 : run
  return diagonal + boosted
}

const matchTerm = (
  text: ReadonlyArray<string>,
  bonuses: ReadonlyArray<number>,
  pattern: ReadonlyArray<string>,
): Option.Option<Match> =>
  Option.flatMap(firstPositions(text, pattern), first => {
    const rows = pattern.length
    const columns = text.length
    const grid = table(rows, columns)
    const best = { score: 0, column: -1 }
    Array.forEach(pattern, (wanted, row) => {
      const start = first[row] ?? 0
      const state = { gapOpen: false, left: 0 }
      Array.forEach(text, (grapheme, column) => {
        if (column < start) {
          return
        }
        const left =
          column > start
            ? state.left + (state.gapOpen ? scoreGapExtension : scoreGapStart)
            : 0
        const isMatch = grapheme === wanted
        const matched = isMatch
          ? fillMatchedCell(grid, bonuses, row, column, left)
          : 0
        const freshStart = row === 0 && isMatch
        const score = freshStart ? matched : Math.max(matched, left, 0)
        state.gapOpen = freshStart ? false : matched < left
        state.left = score
        grid.scores[row * columns + column] = score
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
          positions: backtrace(grid, first, rows - 1, best.column, true, []),
        })
  })

const foldCase = (graphemes: ReadonlyArray<string>, caseSensitive: boolean) =>
  caseSensitive
    ? graphemes
    : Array.map(graphemes, grapheme => grapheme.toLowerCase())

type Prepared = Readonly<{
  original: ReadonlyArray<string>
  lower: ReadonlyArray<string>
  bonuses: ReadonlyArray<number>
}>

const preparedLimit = 20_000

const prepared = new Map<string, Prepared>()

const prepare = (text: string): Prepared => {
  const known = prepared.get(text)
  if (known !== undefined) {
    return known
  }
  const original = graphemesOf(text)
  const fresh = {
    original,
    lower: foldCase(original, false),
    bonuses: Array.map(original, (grapheme, index) =>
      bonusFor(
        index === 0 ? 'White' : classOf(original[index - 1] ?? ' '),
        classOf(grapheme),
      ),
    ),
  }
  if (prepared.size >= preparedLimit) {
    prepared.clear()
  }
  prepared.set(text, fresh)
  return fresh
}

export const matcher = (
  query: string,
): ((text: string) => Option.Option<Match>) => {
  const caseSensitive = /\p{Lu}/u.test(query)
  const patterns = Array.map(
    Array.filter(query.normalize('NFC').split(/\s+/u), term => term !== ''),
    term => foldCase(graphemesOf(term), caseSensitive),
  )
  if (Array.isArrayEmpty(patterns)) {
    return () => Option.some({ score: 0, positions: [] })
  }
  return text => {
    const { original, lower, bonuses } = prepare(text)
    const folded = caseSensitive ? original : lower
    return Array.reduce(
      patterns,
      Option.some<Match>({ score: 0, positions: [] }),
      (sofar, pattern) =>
        Option.flatMap(sofar, total =>
          Option.map(matchTerm(folded, bonuses, pattern), found => ({
            score: total.score + found.score,
            positions: Array.sort(
              Array.dedupe([...total.positions, ...found.positions]),
              Order.Number,
            ),
          })),
        ),
    )
  }
}

export const match = (text: string, query: string): Option.Option<Match> =>
  matcher(query)(text)

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
): ReadonlyArray<Ranked> => {
  const matches = matcher(query)
  return Array.sort(
    Array.getSomes(
      Array.map(notes, note => {
        const pathMatch = matches(pathOf(note))
        if (Option.isNone(pathMatch)) {
          return Option.none()
        }
        const titleMatch = matches(noteTitle(note))
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
}
