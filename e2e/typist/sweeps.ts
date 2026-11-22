import {
  type Script,
  type Step,
  type TypistKey,
  ZWJ,
  codePoints,
  insert,
  key,
  text,
} from './script'

export type Sweep = Readonly<{
  name: string
  scripts: number
  runs: 'every push' | 'before a merge'
  documents: ReadonlyArray<Readonly<{ name: string; setup: Script }>>
  placements: ReadonlyArray<
    Readonly<{ name: string; steps: Script; moves: ReadonlyArray<Script> }>
  >
}>

export type Row = Readonly<{
  document: string
  placement: string
  move: Script
  script: Script
  compareFrom: number
}>

export const rowsOf = (sweep: Sweep): ReadonlyArray<Row> =>
  sweep.documents.flatMap(document =>
    sweep.placements.flatMap(placement =>
      placement.moves.map(move => ({
        document: document.name,
        placement: placement.name,
        move,
        script: [...document.setup, ...placement.steps, ...move],
        compareFrom: document.setup.length + placement.steps.length - 1,
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
  { name: 'at the end', steps: [] },
  { name: 'at the start', steps: [key('Control+Home')] },
  { name: 'at the start of the last row', steps: [key('Home')] },
  {
    name: 'at the end of the first row',
    steps: [key('Control+Home'), key('End')],
  },
  {
    name: 'five letters in',
    steps: [key('Control+Home'), ...times(5, key('ArrowRight'))],
  },
  { name: 'three letters before the end', steps: times(3, key('ArrowLeft')) },
  { name: 'one row up from the end', steps: [key('ArrowUp')] },
].map(placement => ({ ...placement, moves: verticalMoves }))

const letters: ReadonlyArray<Readonly<{ name: string; text: string }>> = [
  { name: 'a', text: 'a' },
  { name: 'combining acute U+0301', text: '\u0301' },
  { name: 'flag letter 🇺', text: '🇺' },
  { name: 'flag letter 🇸', text: '🇸' },
  { name: 'thumbs up 👍', text: '👍' },
  { name: 'skin tone 🏽', text: '🏽' },
  { name: 'man 👨', text: '👨' },
  { name: 'ZWJ U+200D', text: '\u200D' },
  { name: 'heart ❤', text: '❤' },
  { name: 'variation selector U+FE0F', text: '\uFE0F' },
  { name: 'Devanagari क', text: 'क' },
  { name: 'virama U+094D', text: '\u094D' },
]

type Parts = Readonly<{ name: string; head: string; tail: string }>

const parts: ReadonlyArray<Parts> = [
  ...letters.flatMap(first =>
    letters.map(second => ({
      name: `${first.name} then ${second.name}`,
      head: first.text,
      tail: second.text,
    })),
  ),
  { name: 'Hangul jamo U+1100, U+1161', head: '\u1100', tail: '\u1161' },
  {
    name: 'Hangul syllable U+AC00, jamo U+11A8',
    head: '\uAC00',
    tail: '\u11A8',
  },
  { name: 'keycap 1, U+FE0F, U+20E3', head: '1', tail: '\uFE0F\u20E3' },
  {
    name: 'family 👨 ZWJ 👩 ZWJ 👧',
    head: `👨${ZWJ}`,
    tail: `👩${ZWJ}👧`,
  },
  {
    name: 'family of four 👩 ZWJ 👩 ZWJ 👧 ZWJ 👦, 11 UTF-16 units',
    head: `👩${ZWJ}👩${ZWJ}`,
    tail: `👧${ZWJ}👦`,
  },
  {
    name: 'kiss with skin tones 👩 🏽 ZWJ ❤ U+FE0F ZWJ 💋 ZWJ 👨 🏽, 15 UTF-16 units',
    head: `👩🏽${ZWJ}❤️${ZWJ}`,
    tail: `💋${ZWJ}👨🏽`,
  },
  { name: 'flag letters around an x, 🇺 x 🇸', head: '🇺x', tail: '🇸' },
]

type Build = Readonly<{ name: string; setup: (parts: Parts) => Script }>

const typedInOrder: Build = {
  name: 'typed in order',
  setup: ({ head, tail }) => [...codePoints(head), ...codePoints(tail)],
}

const joinedByBackspace: Build = {
  name: 'on two lines, joined by Backspace',
  setup: ({ head, tail }) => [
    ...codePoints(head),
    key('Enter'),
    ...codePoints(tail),
    key('Home'),
    key('Backspace'),
  ],
}

const typedInFront: Build = {
  name: 'the first part typed in front of the second',
  setup: ({ head, tail }) => [
    ...codePoints(tail),
    key('Home'),
    ...codePoints(head),
  ],
}

const documentsOf = (builds: ReadonlyArray<Build>): Sweep['documents'] =>
  builds.flatMap(build =>
    parts.map(part => ({
      name: `${part.name}, ${build.name}`,
      setup: build.setup(part),
    })),
  )

const thenY = (...names: ReadonlyArray<TypistKey>): ReadonlyArray<Script> =>
  names.map(name => [key(name), text('y')])

const letterPlacements: Sweep['placements'] = [
  {
    name: 'at the end',
    steps: [key('End')],
    moves: thenY('Backspace', 'ArrowLeft'),
  },
  {
    name: 'at the start',
    steps: [key('Home')],
    moves: thenY('Delete', 'ArrowRight'),
  },
  {
    name: 'one Right from the start',
    steps: [key('Home'), key('ArrowRight')],
    moves: thenY('Backspace', 'Delete'),
  },
]

const lettersRule =
  'one Backspace, Delete, Left or Right takes what a textarea takes around emoji, flags and accents'

export const sweeps: ReadonlyArray<Sweep> = [
  {
    name: 'Up or Down, any key, Up or Down lands where a textarea lands',
    scripts: 2184,
    runs: 'every push',
    documents: verticalDocuments,
    placements: verticalPlacements,
  },
  {
    name: `${lettersRule} typed in order`,
    scripts: 906,
    runs: 'before a merge',
    documents: documentsOf([typedInOrder]),
    placements: letterPlacements,
  },
  {
    name: `${lettersRule} that met at a line join or were typed one in front of the other`,
    scripts: 3020,
    runs: 'before a merge',
    documents: documentsOf([joinedByBackspace, typedInFront]),
    placements: [
      ...letterPlacements,
      {
        name: 'where the build left the cursor',
        steps: [],
        moves: thenY('Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'),
      },
    ],
  },
]
