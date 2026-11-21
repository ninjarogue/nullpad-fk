import { type Script, type Step, insert, key, text } from './script'

/**
 * Every document, placed the same ways, then moved the same ways: one script for each document, each placement of the
 * cursor, and each move of that placement. A row is `[...setup, ...keys, ...move]`.
 */
export type Sweep = Readonly<{
  name: string
  scripts: number
  documents: ReadonlyArray<Readonly<{ name: string; setup: Script }>>
  placements: ReadonlyArray<
    Readonly<{ name: string; keys: Script; moves: ReadonlyArray<Script> }>
  >
}>

/** `from` is the index of the first step of the move. */
export type Row = Readonly<{
  document: string
  placement: string
  move: Script
  script: Script
  from: number
}>

export const rowsOf = (sweep: Sweep): ReadonlyArray<Row> =>
  sweep.documents.flatMap(document =>
    sweep.placements.flatMap(placement =>
      placement.moves.map(move => ({
        document: document.name,
        placement: placement.name,
        move,
        script: [...document.setup, ...placement.keys, ...move],
        from: document.setup.length + placement.keys.length,
      })),
    ),
  )

const times = (count: number, step: Step): Script =>
  Array.from({ length: count }, () => step)

const url =
  'https://example.com/a/long/path/that/does/not/break/anywhere/at/all/x1'

const verticalDocuments: Sweep['documents'] = [
  {
    name: 'three lines of different lengths',
    setup: [
      text('abc'),
      key('Enter'),
      text('defgh'),
      key('Enter'),
      text('0123456789'),
    ],
  },
  {
    name: 'a line of ordinary words that wraps at a space',
    setup: [
      insert(
        'the notes editor keeps every release note in one place and the list goes on for a while longer than one row',
      ),
    ],
  },
  {
    name: 'a short row, then a long word that moved to the next row',
    setup: [insert(`see the notes ${url}`)],
  },
  {
    name: 'one word longer than a row',
    setup: [insert('x'.repeat(100))],
  },
  {
    name: 'a full row that ends in a run of spaces',
    setup: [
      insert(
        'the notes editor keeps every release note in one place and the list goes',
      ),
      text('        '),
    ],
  },
  {
    name: 'rows of emoji and accents',
    setup: [text('ë'), text('❤'), text('️'), key('Enter'), text('👨')],
  },
]

const upOrDown: ReadonlyArray<Step> = [key('ArrowUp'), key('ArrowDown')]
const anyKey: ReadonlyArray<Step> = [
  key('ArrowLeft'),
  key('ArrowRight'),
  key('ArrowUp'),
  key('ArrowDown'),
  key('Home'),
  key('End'),
  key('Control+Home'),
  key('Control+End'),
  key('Backspace'),
  key('Delete'),
  key('Enter'),
  text('x'),
  text(' '),
]

const verticalMoves: ReadonlyArray<Script> = upOrDown.flatMap(first =>
  anyKey.flatMap(middle => upOrDown.map(last => [first, middle, last])),
)

const verticalPlacements: Sweep['placements'] = [
  { name: 'at the end', keys: [] },
  { name: 'at the start', keys: [key('Control+Home')] },
  { name: 'at the start of the last row', keys: [key('Home')] },
  {
    name: 'at the end of the first row',
    keys: [key('Control+Home'), key('End')],
  },
  {
    name: 'five letters in',
    keys: [key('Control+Home'), ...times(5, key('ArrowRight'))],
  },
  { name: 'three letters before the end', keys: times(3, key('ArrowLeft')) },
  { name: 'one row up from the end', keys: [key('ArrowUp')] },
].map(placement => ({ ...placement, moves: verticalMoves }))

export const sweeps: ReadonlyArray<Sweep> = [
  {
    name: 'Up or Down, any key, Up or Down lands where a textarea lands',
    scripts: 2184,
    documents: verticalDocuments,
    placements: verticalPlacements,
  },
]
