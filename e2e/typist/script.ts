export type TypistKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End'
  | 'Control+Home'
  | 'Control+End'
  | 'Backspace'
  | 'Delete'
  | 'Enter'

/**
 * A text step is typed key by key when it is all ASCII, otherwise inserted as an IME or emoji picker does.
 * An insert step is always inserted that way.
 */
export type Step =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'insert'; text: string }>
  | Readonly<{ kind: 'key'; key: TypistKey }>

export type Script = ReadonlyArray<Step>

export const text = (value: string): Step => ({ kind: 'text', text: value })
export const insert = (value: string): Step => ({ kind: 'insert', text: value })
export const key = (name: TypistKey): Step => ({ kind: 'key', key: name })
export const codePoints = (value: string): Script => [...value].map(text)

export const label = (step: Step): string =>
  step.kind === 'key'
    ? `<${step.key}>`
    : step.kind === 'insert'
      ? `<insert ${JSON.stringify(step.text)}>`
      : step.text

export const show = (script: Script): string => script.map(label).join(' ')

export const hex = (value: string): string =>
  [...value].map(char => char.codePointAt(0)?.toString(16)).join(' ')

const mulberry32 = (seed: number) => {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The seed of sequence `index` of a run, so one sequence replays alone from its own seed. */
export const sequenceSeed = (runSeed: number, index: number): number =>
  Math.floor(mulberry32(runSeed ^ Math.imul(index + 1, 0x9e3779b1))() * 2 ** 31)

export const ZWJ = '‍'
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
const keys: ReadonlyArray<TypistKey> = [
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

const pick = <A>(random: () => number, items: ReadonlyArray<A>): A => {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) {
    throw new Error('pick from an empty list')
  }
  return item
}

/** 4 to 17 steps: whole clusters typed one code point at a time, lone code points, and editing keys. */
const clusterScript = (random: () => number): Script => {
  const steps: Array<Step> = []
  const length = 4 + Math.floor(random() * 14)
  while (steps.length < length) {
    const roll = random()
    if (roll < 0.35) {
      steps.push(...codePoints(pick(random, clusters)))
    } else if (roll < 0.55) {
      steps.push(text(pick(random, loneCodePoints)))
    } else {
      steps.push(key(pick(random, keys)))
    }
  }
  return steps
}

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
const proseKeys: ReadonlyArray<TypistKey> = [...keys, 'ArrowUp', 'ArrowDown']

const phrase = (random: () => number, count: number): string =>
  Array.from(
    { length: count },
    () => pick(random, words) + pick(random, gaps),
  ).join('')

/**
 * A line of 50 to 90 characters inserted at once, so the wrap edge is near, then 4 to 11 steps of one or two
 * words typed key by key, runs of spaces, and editing keys.
 */
const proseScript = (random: () => number): Script => {
  const target = 50 + Math.floor(random() * 41)
  let line = ''
  while (line.length < target) {
    line += phrase(random, 1)
  }
  const steps: Array<Step> = [insert(line)]
  const length = 5 + Math.floor(random() * 8)
  while (steps.length < length) {
    const roll = random()
    if (roll < 0.45) {
      steps.push(text(phrase(random, 1 + Math.floor(random() * 2))))
    } else if (roll < 0.55) {
      steps.push(text(' '.repeat(1 + Math.floor(random() * 6))))
    } else {
      steps.push(key(pick(random, proseKeys)))
    }
  }
  return steps
}

/** A cluster script or a prose script, chosen by the seed. */
export const randomScript = (seed: number): Script => {
  const random = mulberry32(seed)
  return random() < 0.5 ? clusterScript(random) : proseScript(random)
}

/** Scripts that once broke, kept as named cases. */
export const namedScripts: ReadonlyArray<
  Readonly<{ name: string; script: Script }>
> = [
  {
    name: 'a flag typed before a flag',
    script: [...codePoints('🇺🇸'), key('Home'), ...codePoints('🇯🇵')],
  },
  {
    name: 'a family typed before a family',
    script: [...codePoints('👨‍👩‍👧'), key('Home'), ...codePoints('👨‍👩‍👧‍👦')],
  },
  {
    name: 'ab🇯🇵cd typed before a flag',
    script: [...codePoints('🇺🇸'), key('Home'), ...codePoints('ab🇯🇵cd')],
  },
  {
    name: 'a flag letter typed before its pair, then x',
    script: [text('🇸'), key('Home'), text('🇺'), text('x')],
  },
  {
    name: 'Backspace on the x in 🇺x🇸, then y',
    script: [
      text('🇺'),
      text('x'),
      text('🇸'),
      key('ArrowLeft'),
      key('Backspace'),
      text('y'),
    ],
  },
  {
    name: 'Delete on the x in 🇺x🇸, then y',
    script: [
      text('🇺'),
      text('x'),
      text('🇸'),
      key('Home'),
      key('ArrowRight'),
      key('Delete'),
      text('y'),
    ],
  },
  {
    name: 'Backspace after a mark on a flag, with a letter after it',
    script: [
      text('a'),
      key('Home'),
      text('🇺'),
      text('🇸'),
      text('\u0308'),
      key('Backspace'),
    ],
  },
  {
    name: 'Backspace after a flag letter joins its pair',
    script: [text('🇸'), key('Home'), text('🇺'), key('Backspace'), text('y')],
  },
  {
    name: 'Delete after a flag letter joins its pair',
    script: [text('🇸'), key('Home'), text('🇺'), key('Delete'), text('y')],
  },
  {
    name: 'ArrowRight after a flag letter joins its pair',
    script: [
      text('🇸'),
      text('a'),
      key('Home'),
      text('🇺'),
      key('ArrowRight'),
      text('y'),
    ],
  },
  {
    name: 'ArrowLeft after a flag letter joins its pair',
    script: [
      text('a'),
      text('🇸'),
      key('ArrowLeft'),
      text('🇺'),
      key('ArrowLeft'),
      text('y'),
    ],
  },
  {
    name: 'Backspace takes e with its combining mark',
    script: [text('e'), text('́'), key('Backspace'), text('y')],
  },
  {
    name: 'Backspace takes a skin tone with its base',
    script: [text('👍'), text('🏽'), key('Backspace'), text('y')],
  },
  {
    name: 'Backspace takes a whole family',
    script: [...codePoints('👨‍👩‍👧'), key('Backspace'), text('y')],
  },
  {
    name: 'Backspace takes a heart with its variation selector',
    script: [text('❤'), text('️'), key('Backspace'), text('y')],
  },
  {
    name: 'Backspace takes a whole keycap',
    script: [...codePoints('1️⃣'), key('Backspace'), text('y')],
  },
  {
    name: 'Backspace takes a keycap with no variation selector',
    script: [...codePoints('#⃣'), key('Backspace'), text('y')],
  },
  {
    name: 'ArrowLeft at a line start lands at the end of the line above',
    script: [
      text('a'),
      text('b'),
      key('Enter'),
      text('c'),
      key('Home'),
      key('ArrowLeft'),
      text('y'),
    ],
  },
  {
    name: 'Delete joins a mark onto a heart, then a thumbs up',
    script: [
      key('Enter'),
      text('́'),
      key('Control+Home'),
      text('❤'),
      key('Delete'),
      text('👍'),
    ],
  },
  {
    name: 'Backspace and Delete re-pair flag letters, then a',
    script: [
      key('Enter'),
      text('🇺'),
      text('🇸'),
      key('ArrowLeft'),
      text('🇺'),
      key('Backspace'),
      key('ArrowLeft'),
      text('🇸'),
      key('Delete'),
      text('a'),
    ],
  },
  {
    name: 'a flag typed at a lone flag letter that Backspace joined back',
    script: [
      text(' '),
      text('🇸'),
      key('ArrowLeft'),
      key('Enter'),
      key('Backspace'),
      text('🇯'),
      text('🇵'),
    ],
  },
  {
    name: 'Enter and Backspace around a flag',
    script: [
      ...codePoints('🇯🇵'),
      key('Enter'),
      key('Backspace'),
      key('Backspace'),
      text('z'),
    ],
  },
  {
    name: 'Backspace joins flag letters across lines, then 🇸',
    script: [
      text('🇵'),
      key('Enter'),
      text('🇸'),
      key('Home'),
      key('Backspace'),
      text('🇸'),
    ],
  },
  {
    name: 'Backspace joins flag letters across lines, then 🇺',
    script: [
      text('🇵'),
      key('Enter'),
      text('🇸'),
      key('Home'),
      key('Backspace'),
      text('🇺'),
    ],
  },
  {
    name: 'Delete joins flag letters across lines, then 🇺',
    script: [
      text('🇵'),
      key('Enter'),
      text('🇸'),
      key('Control+Home'),
      key('End'),
      key('Delete'),
      text('🇺'),
    ],
  },
  {
    name: 'Backspace joins a combining mark to the line above, then yz',
    script: [
      text('e'),
      key('Enter'),
      text('́'),
      key('Home'),
      key('Backspace'),
      text('y'),
      text('z'),
    ],
  },
  {
    name: 'Backspace joins Hangul jamo across lines, then y',
    script: [
      text('ᄀ'),
      key('Enter'),
      text('ᅡ'),
      key('Home'),
      key('Backspace'),
      text('y'),
    ],
  },
  {
    name: 'Backspace joins a ZWJ sequence across lines, then y',
    script: [
      text('👨'),
      text(ZWJ),
      key('Enter'),
      text('👩'),
      key('Home'),
      key('Backspace'),
      text('y'),
    ],
  },
  {
    name: 'Backspace joins a skin tone to the line above, then y',
    script: [
      text('👍'),
      key('Enter'),
      text('🏽'),
      key('Home'),
      key('Backspace'),
      text('y'),
    ],
  },
  {
    name: 'Backspace joins a variation selector to the line above, then y',
    script: [
      text('❤'),
      key('Enter'),
      text('️'),
      key('Home'),
      key('Backspace'),
      text('y'),
    ],
  },
  {
    name: 'text typed at a line join stays before it',
    script: [
      text('a'),
      key('Enter'),
      text('🇸'),
      key('Home'),
      key('Backspace'),
      text('🇺'),
      text('y'),
    ],
  },
  {
    name: 'a line join holds after the caret leaves and comes back',
    script: [
      text('a'),
      key('Enter'),
      text('🇸'),
      key('Home'),
      key('Backspace'),
      key('ArrowRight'),
      key('ArrowLeft'),
      text('🇺'),
      text('y'),
    ],
  },
  {
    name: 'Backspace from the line end stops at a line join',
    script: [
      text('🇵'),
      key('Enter'),
      text('🇸'),
      key('Home'),
      key('Backspace'),
      key('End'),
      key('Backspace'),
      text('y'),
    ],
  },
  {
    name: 'ArrowRight from a line join steps over a ZWJ and the emoji after it',
    script: [
      ...codePoints('ab👨'),
      key('Enter'),
      ...codePoints('‍👩cd'),
      key('Home'),
      key('Backspace'),
      key('ArrowRight'),
      text('z'),
    ],
  },
  {
    name: 'Delete at a line join takes a ZWJ and the emoji after it',
    script: [
      ...codePoints('ab👨'),
      key('Enter'),
      ...codePoints('‍👩cd'),
      key('Home'),
      key('Backspace'),
      key('Delete'),
      text('z'),
    ],
  },
  {
    name: 'ArrowRight from a line join steps over a virama and the consonant after it',
    script: [
      ...codePoints('abक'),
      key('Enter'),
      ...codePoints('्षcd'),
      key('Home'),
      key('Backspace'),
      key('ArrowRight'),
      text('z'),
    ],
  },
  {
    name: 'Backspace at the end of a keycap joined to its digit takes the variation selector and keycap mark',
    script: [
      text('1'),
      key('Enter'),
      ...codePoints('️⃣'),
      key('Home'),
      key('Backspace'),
      key('End'),
      key('Backspace'),
      text('z'),
    ],
  },
  {
    name: 'Backspace at a line join takes the syllable the line above ends with',
    script: [
      ...codePoints('ab가'),
      key('Enter'),
      ...codePoints('ᆨcd'),
      key('Home'),
      key('Backspace'),
      key('Backspace'),
      text('z'),
    ],
  },
  {
    name: 'Backspace at a line join takes the emoji and ZWJ the line above ends with',
    script: [
      ...codePoints('ab👨‍'),
      key('Enter'),
      ...codePoints('👩cd'),
      key('Home'),
      key('Backspace'),
      key('Backspace'),
      text('z'),
    ],
  },
  {
    name: 'Backspace takes a whole syllable of jamo',
    script: [...codePoints('ab가'), key('Backspace'), text('z')],
  },
  {
    name: 'Backspace takes a whole conjunct',
    script: [...codePoints('abक्ष'), key('Backspace'), text('z')],
  },
  {
    name: 'Backspace takes a letter with its stacked combining marks',
    script: [...codePoints('ab\u0301\u0302'), key('Backspace'), text('z')],
  },
  {
    name: 'Backspace takes नमस्ते apart one letter at a time',
    script: [
      ...codePoints('नमस्ते'),
      key('Backspace'),
      key('Backspace'),
      text('z'),
    ],
  },
  {
    name: 'Backspace takes Thai กำ whole',
    script: [...codePoints('กำ'), key('Backspace'), text('z')],
  },
  {
    name: 'Backspace takes Arabic letters with their harakat',
    script: [
      ...codePoints('مَرْحَبًا'),
      key('Backspace'),
      key('Backspace'),
      key('Backspace'),
      text('z'),
    ],
  },
  {
    name: 'Backspace takes a trailing ZWJ with its letter',
    script: [...codePoints('e‍'), key('Backspace'), text('z')],
  },
  {
    name: 'Backspace takes a heart with its skin tone',
    script: [...codePoints('❤🏽'), key('Backspace'), text('z')],
  },
  {
    name: 'Backspace takes a letter with its mark and a skin tone',
    script: [...codePoints('á🏽'), key('Backspace'), text('z')],
  },
  {
    name: 'ArrowLeft steps over a leading ZWJ and the flag letter after it',
    script: [...codePoints('‍🇵'), key('ArrowLeft'), text('z')],
  },
  {
    name: 'ArrowRight does not move a caret that inserted text left before a ZWJ',
    script: [
      ...codePoints('‍🇵'),
      key('Home'),
      text('👍'),
      key('ArrowRight'),
      text('z'),
    ],
  },
  {
    name: 'Delete after a ZWJ inserted before the last flag letter does nothing',
    script: [text('🇸'), key('ArrowLeft'), text(ZWJ), key('Delete'), text('z')],
  },
  {
    name: 'End moves a caret that a ZWJ inserted before a flag letter left inside it',
    script: [text('🇺'), key('ArrowLeft'), text(ZWJ), key('End'), text('z')],
  },
  {
    name: 'a virama typed before a consonant sticks to it',
    script: [text('ष'), key('ArrowLeft'), text('्'), text('z')],
  },
  {
    name: 'ArrowUp then ArrowDown from a line join inside é comes back to the join',
    script: [
      text('q'),
      text('q'),
      key('Enter'),
      text('e'),
      key('Enter'),
      text('́'),
      key('ArrowLeft'),
      key('Backspace'),
      key('ArrowUp'),
      key('ArrowDown'),
      text('z'),
    ],
  },
  {
    name: 'ArrowUp then ArrowDown from a line join inside a flag comes back to the join',
    script: [
      ...codePoints('qqqq'),
      key('Enter'),
      text('🇵'),
      key('Enter'),
      text('🇸'),
      key('ArrowLeft'),
      key('Backspace'),
      key('ArrowUp'),
      key('ArrowDown'),
      text('z'),
    ],
  },
  {
    name: 'Delete joining two lines keeps the column ArrowDown aims for',
    script: [
      ...codePoints('abc'),
      key('Enter'),
      ...codePoints('defgh'),
      key('Enter'),
      ...codePoints('0123456789'),
      key('ArrowUp'),
      key('ArrowUp'),
      key('Delete'),
      key('ArrowDown'),
      text('z'),
    ],
  },
  {
    name: 'Backspace keeps the column ArrowDown aims for',
    script: [
      ...codePoints('abcd'),
      key('Enter'),
      ...codePoints('defgh'),
      key('Enter'),
      ...codePoints('0123456789'),
      key('ArrowUp'),
      key('ArrowUp'),
      key('Backspace'),
      key('ArrowDown'),
      key('ArrowDown'),
      text('z'),
    ],
  },
  {
    name: 'End at the line end keeps the column ArrowDown aims for',
    script: [
      ...codePoints('abc'),
      key('Enter'),
      ...codePoints('defgh'),
      key('Enter'),
      ...codePoints('0123456789'),
      key('ArrowUp'),
      key('End'),
      key('ArrowDown'),
      text('z'),
    ],
  },
  {
    name: 'ArrowUp on the first line goes to its start, and ArrowDown comes back to the column',
    script: [
      ...codePoints('abcdef'),
      key('Enter'),
      ...codePoints('0123456789'),
      key('Control+Home'),
      key('ArrowRight'),
      key('ArrowRight'),
      key('ArrowRight'),
      key('ArrowUp'),
      key('ArrowDown'),
      text('z'),
    ],
  },
  {
    name: 'ArrowDown on the last line goes to its end, and ArrowUp comes back to the column',
    script: [
      ...codePoints('0123456789'),
      key('Enter'),
      ...codePoints('abcdef'),
      key('Home'),
      key('ArrowRight'),
      key('ArrowRight'),
      key('ArrowDown'),
      key('ArrowUp'),
      text('z'),
    ],
  },
  {
    name: 'Enter inside a line keeps the column ArrowUp aimed at, and ArrowDown aims at it again',
    script: [
      ...codePoints('wait!  ok... _italic_  the '),
      key('Enter'),
      ...codePoints('notes {x}y  '),
      key('ArrowUp'),
      key('Enter'),
      key('ArrowDown'),
    ],
  },
  {
    name: 'Enter at a line end forgets the column ArrowDown aimed at',
    script: [
      ...codePoints('abcdefghijkl'),
      key('Enter'),
      ...codePoints('xy'),
      key('Enter'),
      ...codePoints('abcdefghijkl'),
      key('Control+Home'),
      key('End'),
      key('ArrowDown'),
      key('Enter'),
      key('ArrowDown'),
      text('z'),
    ],
  },
  {
    name: 'Backspace that moves the caret onto another row forgets the column ArrowUp aimed at',
    script: [
      insert(
        '"quoted" $100  editor  <tag>  ok...  internationalizationx-1 - [ ] https://example.com/path/to/page?x=1&y=2   ',
      ),
      text('@user word(note) '),
      text('-1   100%  '),
      key('ArrowUp'),
      key('Backspace'),
      key('ArrowUp'),
    ],
  },
  {
    name: 'ArrowUp from after 👨 aims from the whole pixel before the caret, so it lands before ❤️',
    script: [
      text('ë'),
      text('❤'),
      text('️'),
      key('Enter'),
      text('👨'),
      key('ArrowUp'),
    ],
  },
  {
    name: 'Enter at the row end that ArrowUp landed on forgets the column it aimed at',
    script: [
      insert(
        'so…**bold** a,b   #tag wait!   and/or editor well-knownhttps://example.com/path/to/page?x=1&y=2 ',
      ),
      text('     '),
      key('ArrowUp'),
      key('Enter'),
      key('ArrowUp'),
    ],
  },
]

type Difference = Readonly<{ name: string; pattern: RegExp }>

/**
 * Malformed sequences where nullpad follows Intl.Segmenter and Chrome's textarea, or its EditContext for Backspace,
 * does not: where a caret left inside a grapheme settles after inserted text, and how much Backspace takes. A mismatch
 * counts as accepted only when the text around it holds one of these, in a named script as in a random one.
 */
/** A flag letter followed by a mark, a ZWJ or a skin tone, which no flag has. */
const markOnFlagLetter = /\p{Regional_Indicator}[\p{M}‍\u{1f3fb}-\u{1f3ff}]/u

export const acceptedDifferences: ReadonlyArray<Difference> = [
  {
    name: 'ZWJ next to a non-pictograph',
    pattern:
      /‍(?!\p{Extended_Pictographic})|(?<!\p{Extended_Pictographic}[\u{1f3fb}-\u{1f3ff}️]?)‍/u,
  },
  {
    name: 'mark, ZWJ or skin tone on a flag letter',
    pattern: markOnFlagLetter,
  },
  {
    name: 'skin tone after a non-base',
    pattern: /(?<!\p{Emoji_Modifier_Base})[\u{1f3fb}-\u{1f3ff}]/u,
  },
  {
    name: 'virama with no consonant before it',
    pattern:
      /(?<!\p{L})[\u094d\u09cd\u0a4d\u0acd\u0b4d\u0bcd\u0c4d\u0ccd\u0d4d\u0dca]/u,
  },
  {
    name: 'stray variation selector',
    pattern: /(?<!\p{Extended_Pictographic})️/u,
  },
]

export const acceptedDifference = (
  texts: ReadonlyArray<string>,
): string | undefined =>
  acceptedDifferences.find(({ pattern }) =>
    texts.some(value => pattern.test(value)),
  )?.name

/** Delta debugging: the shortest script, by removing chunks then single steps, that still fails. */
export const shrink = async (
  script: Script,
  fails: (candidate: Script) => Promise<boolean>,
): Promise<Script> => {
  let current = script
  let chunk = Math.max(1, Math.floor(current.length / 2))
  while (chunk >= 1) {
    let removed = false
    for (let start = 0; start < current.length; start += chunk) {
      const candidate = [
        ...current.slice(0, start),
        ...current.slice(start + chunk),
      ]
      if (candidate.length > 0 && (await fails(candidate))) {
        current = candidate
        removed = true
        start -= chunk
      }
    }
    if (!removed) {
      chunk = Math.floor(chunk / 2)
    }
  }
  return current
}
