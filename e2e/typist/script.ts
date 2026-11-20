export type TypistKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'Control+Home'
  | 'Control+End'
  | 'Backspace'
  | 'Delete'
  | 'Enter'

/** A text step is typed as one key when it is one ASCII character, otherwise inserted as an IME or emoji picker does. */
export type Step =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'key'; key: TypistKey }>

export type Script = ReadonlyArray<Step>

const text = (value: string): Step => ({ kind: 'text', text: value })
const key = (name: TypistKey): Step => ({ kind: 'key', key: name })
const codePoints = (value: string): Script => [...value].map(text)

export const label = (step: Step): string =>
  step.kind === 'key' ? `<${step.key}>` : step.text

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

const ZWJ = '‍'
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

/** A script of 4 to 17 steps: whole clusters typed one code point at a time, lone code points, and editing keys. */
export const randomScript = (seed: number): Script => {
  const random = mulberry32(seed)
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
    name: 'Backspace takes a combining mark alone',
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
]

type Difference = Readonly<{ name: string; pattern: RegExp }>

/**
 * Malformed sequences where nullpad follows Intl.Segmenter and Chrome's textarea does not.
 * A mismatch counts as accepted only when the text around it holds one of these.
 */
export const acceptedDifferences: ReadonlyArray<Difference> = [
  {
    name: 'ZWJ next to a non-pictograph',
    pattern:
      /‍(?!\p{Extended_Pictographic})|(?<!\p{Extended_Pictographic}[\u{1f3fb}-\u{1f3ff}️]?)‍/u,
  },
  {
    name: 'mark, ZWJ or skin tone on a flag letter',
    pattern: /\p{Regional_Indicator}[\p{M}‍\u{1f3fb}-\u{1f3ff}]/u,
  },
  {
    name: 'skin tone after a non-base',
    pattern: /(?<!\p{Emoji_Modifier_Base})[\u{1f3fb}-\u{1f3ff}]/u,
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
