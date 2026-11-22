import {
  type Script,
  type Step,
  type TypistKey,
  ZWJ,
  codePoints,
  insert,
  key,
  mulberry32,
  text,
} from './script'
import { type Sweep, sweeps } from './sweeps'

const loneCodePoints = [
  '🇯',
  '🇵',
  '🇺',
  '🇸',
  '👨',
  ZWJ,
  '👩',
  '👧',
  '👍',
  '🏽',
  '́',
  '̈',
  '️',
  '❤',
  '漢',
  'a',
  'e',
  ' ',
]
const clusters = [
  '🇯🇵',
  '🇺🇸',
  '👨‍👩‍👧',
  '👨‍👩‍👧‍👦',
  '👍🏽',
  'é',
  'ë',
  '❤️',
  '漢字',
  'ab',
  'x',
  'q w',
]
const allKeys: ReadonlyArray<TypistKey> = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Control+Home',
  'Control+End',
  'Backspace',
  'Delete',
  'Enter',
]

/** Words whose joints a textarea may or may not break at: hyphens, dashes, URLs, markdown, brackets, quotes and punctuation. */
const words = [
  'the',
  'a',
  'notes',
  'editor',
  'release',
  'internationalization',
  'state-of-the-art',
  'well-known',
  'page-12',
  'x-1',
  '-1',
  'and/or',
  'https://example.com/path/to/page?x=1&y=2',
  '[a link](https://example.com)',
  '**bold**',
  '_italic_',
  '`code`',
  '(see',
  'note)',
  'word(note)',
  'why?',
  'wait!',
  'ok...',
  'end.',
  'a,b',
  '"quoted"',
  "it's",
  '$100',
  '100%',
  '#tag',
  '@user',
  'a=b+c',
  '<tag>',
  '{x}y',
  '1,000.50',
  'e.g.',
  '- [ ]',
  '>',
  'long—dash',
  'range–end',
  'so…',
  '“curly”',
]
const gaps = [' ', ' ', ' ', ' ', '  ', '   ', '']

const pick = <A>(random: () => number, items: ReadonlyArray<A>): A => {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) {
    throw new Error('pick from an empty list')
  }
  return item
}

const phrase = (random: () => number, count: number): string =>
  Array.from(
    { length: count },
    () => pick(random, words) + pick(random, gaps),
  ).join('')

/** A line of 50 to 90 characters, so the wrap edge is near. */
const proseLine = (random: () => number): string => {
  const target = 50 + Math.floor(random() * 41)
  let line = ''
  while (line.length < target) {
    line += phrase(random, 1)
  }
  return line
}

/** The distinct steps the moves of a sweep are made of, which are the steps that sweep found worth trying. */
const stepsOfMoves = (sweep: Sweep): ReadonlyArray<Step> => {
  const seen = new Map<string, Step>()
  for (const placement of sweep.placements) {
    for (const step of placement.moves.flat()) {
      seen.set(JSON.stringify(step), step)
    }
  }
  return [...seen.values()]
}

/**
 * A script that starts where a sweep's rows start and wanders off its grid. The dice pick a sweep, one of its
 * documents or else a line of prose, one of its placements, then 4 to 10 more steps: mostly the steps of that
 * sweep's moves, and otherwise any key, a word, a cluster or a lone code point.
 */
export const scoutScript = (seed: number): Script => {
  const random = mulberry32(seed)
  const sweep = pick(random, sweeps)
  const own = stepsOfMoves(sweep)
  const setup =
    random() < 0.25
      ? [insert(proseLine(random))]
      : pick(random, sweep.documents).setup
  const steps: Array<Step> = [...setup, ...pick(random, sweep.placements).keys]
  const wandering = 4 + Math.floor(random() * 7)
  for (let drawn = 0; drawn < wandering; drawn++) {
    const roll = random()
    if (roll < 0.6) {
      steps.push(pick(random, own))
    } else if (roll < 0.75) {
      steps.push(key(pick(random, allKeys)))
    } else if (roll < 0.85) {
      steps.push(text(phrase(random, 1)))
    } else if (roll < 0.95) {
      steps.push(...codePoints(pick(random, clusters)))
    } else {
      steps.push(text(pick(random, loneCodePoints)))
    }
  }
  return steps
}
