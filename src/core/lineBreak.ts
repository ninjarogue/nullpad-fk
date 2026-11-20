/**
 * Where a Chrome text field may start a new row inside a run of text, measured against Chrome rather than read from
 * UAX #14. Chrome breaks a pair of ASCII characters by its own table, and any other pair by ICU's line breaker,
 * which looks a few characters around the pair. This keeps the classes and rules that decide the pairs a note holds:
 * letters, digits, spaces, hyphens and dashes, brackets, quotes, punctuation, the slashes and symbols in URLs,
 * CJK and emoji. A model of them matched Chrome on all but about 1 in 20,000 random strings of those characters.
 *
 * Left out, so they break as the table says rather than as Chrome does:
 * - a few ICU pairs with context, such as ? or a doubled hyphen before U+00A7 or U+00A9,
 * - a lone skin tone after a letter,
 * - line and paragraph separators, which break as a zero width space does,
 * - math brackets (U+27C0 to U+27FF, U+2900 to U+2AFF) and supplemental punctuation (U+2E00 to U+2E7F),
 *   which break by their general category alone,
 * - an ideographic space (U+3000) at a row end, whose hanging is not measured.
 */

const EXa = 0
const QUa = 1
const ALa = 2
const PRa = 3
const POa = 4
const APa = 5
const OPa = 6
const CPa = 7
const PRb = 8
const HYa = 9
const SYa = 10
const AN = 11
const LTa = 12
const QMa = 13
const BAa = 14
const GL = 15
const OP = 16
const PO = 17
const PR = 18
const AL = 19
const QU = 20
const OPW = 21
const CM = 22
const IS = 23
const BA = 24
const ZW = 25
const B2 = 26
const CL = 27
const ID = 28
const IDSP = 29
const RI = 30
const EM = 31
const NS = 32

type LineClass = number

/**
 * Whether a row may start between a grapheme of the row class and one of the column class, when no rule
 * below decides first. Measured in Chrome. The ASCII classes (lower case suffix) are Chrome's own groups.
 */
const pairs: ReadonlyArray<string> = [
  '000000100000100011110100001010100', // EXa
  '000000100000100000000000000000000', // QUa
  '000000100000100000000100001010100', // ALa
  '000000000000000011100100001000100', // PRa
  '000000100000100011100100001010100', // POa
  '000000000000000000000000000000000', // APa
  '000000000000000000000000000000000', // OPa
  '000000100000100011100100001010100', // CPa
  '000000100000100011100100001000100', // PRb
  '011011101101101111110100001010100', // HYa
  '000000000000000011110100001010100', // SYa
  '000000000000000000000100001010100', // AN
  '000000000000000000000100001010100', // LTa
  '001110101101101011110100001010100', // QMa
  '000000100000100111110100001010100', // BAa
  '000000000000000000000000000000000', // GL
  '000000000000000000000000000000000', // OP
  '000110101000000011100100001010100', // PO
  '000110101000000011100100001000100', // PR
  '000000000000000000000100001010100', // AL
  '000000000000000000000000000000000', // QU
  '000000000000000000000000000000000', // OPW
  '000000000000000000000100001010100', // CM
  '000110101000000011100100001010100', // IS
  '001110101001100111110100001010100', // BA
  '111111111111111111111111101110111', // ZW
  '001110101001100011110100000010100', // B2
  '001110101001100011110100001010100', // CL
  '001100101001100010110100001010100', // ID
  '001110101001100111110100001010100', // IDSP
  '001110101001100011110100001010100', // RI
  '111111111111111111111101111111101', // EM
  '001110101001100011110100001010100', // NS
]

const breaksBetween = (before: LineClass, at: LineClass): boolean =>
  pairs[before]?.charCodeAt(at) === 49

const asciiGroups: ReadonlyArray<readonly [string, LineClass]> = [
  ['!}', EXa],
  ['"', QUa],
  ['#&*=>~', ALa],
  ['$', PRa],
  ['%', POa],
  ["'", APa],
  ['([{', OPa],
  [')],.:;', CPa],
  ['+\\', PRb],
  ['-', HYa],
  ['/', SYa],
  ['<', LTa],
  ['?', QMa],
  ['|', BAa],
]

const asciiClasses: ReadonlyArray<LineClass> = Array.from(
  { length: 128 },
  (_, code) =>
    asciiGroups.find(([chars]) =>
      chars.includes(String.fromCharCode(code)),
    )?.[1] ?? (code > 32 && code < 127 ? AN : AL),
)

/** Code points whose class differs from the default `fallbackClass` gives them, ascending. */
const exceptions: ReadonlyArray<readonly [number, number, LineClass]> = [
  [0xa0, 0xa0, GL],
  [0xa1, 0xa1, OP],
  [0xa2, 0xa2, PO],
  [0xad, 0xad, QU],
  [0xb0, 0xb0, PO],
  [0xb1, 0xb1, PR],
  [0xb4, 0xb4, OPW],
  [0xbf, 0xbf, OP],
  [0x2c8, 0x2c8, OPW],
  [0x2cc, 0x2cc, OPW],
  [0x2df, 0x2df, OPW],
  [0x35c, 0x362, QU],
  [0x37e, 0x37e, IS],
  [0x2000, 0x2006, BA],
  [0x2007, 0x2007, GL],
  [0x2008, 0x200a, BA],
  [0x200b, 0x200b, ZW],
  [0x200c, 0x200c, CM],
  [0x200d, 0x200d, QU],
  [0x200e, 0x200f, CM],
  [0x2010, 0x2010, BA],
  [0x2011, 0x2011, GL],
  [0x2012, 0x2013, BA],
  [0x2014, 0x2014, B2],
  [0x2024, 0x2026, NS],
  [0x2027, 0x2027, BA],
  [0x2028, 0x2029, ZW],
  [0x202a, 0x202e, CM],
  [0x202f, 0x202f, GL],
  [0x2030, 0x2037, PO],
  [0x203c, 0x203d, NS],
  [0x2044, 0x2044, IS],
  [0x2047, 0x2049, NS],
  [0x2056, 0x2056, BA],
  [0x2057, 0x2057, PO],
  [0x2058, 0x205b, BA],
  [0x205d, 0x205f, BA],
  [0x2060, 0x2060, QU],
  [0x2066, 0x206f, CM],
  [0x20a7, 0x20a7, PO],
  [0x20b6, 0x20b6, PO],
  [0x20bb, 0x20bb, PO],
  [0x20be, 0x20be, PO],
  [0x20c0, 0x20c0, PO],
  [0x2103, 0x2103, PO],
  [0x2109, 0x2109, PO],
  [0x2116, 0x2116, PR],
  [0x2212, 0x2213, PR],
  [0x22ef, 0x22ef, NS],
  [0x231a, 0x231b, ID],
  [0x2329, 0x2329, OPW],
  [0x23f0, 0x23f3, ID],
  [0x2600, 0x2603, ID],
  [0x2614, 0x2615, ID],
  [0x2618, 0x2618, ID],
  [0x261a, 0x261f, ID],
  [0x2639, 0x263b, ID],
  [0x2668, 0x2668, ID],
  [0x267f, 0x267f, ID],
  [0x26bd, 0x26c8, ID],
  [0x26cd, 0x26cd, ID],
  [0x26cf, 0x26d1, ID],
  [0x26d3, 0x26d4, ID],
  [0x26d8, 0x26d9, ID],
  [0x26dc, 0x26dc, ID],
  [0x26df, 0x26e1, ID],
  [0x26ea, 0x26ea, ID],
  [0x26f1, 0x26f5, ID],
  [0x26f7, 0x26fa, ID],
  [0x26fd, 0x2704, ID],
  [0x2708, 0x270d, ID],
  [0x275b, 0x2760, QU],
  [0x2762, 0x2763, NS],
  [0x2764, 0x2764, ID],
  [0x2800, 0x2800, BA],
  [0x2e3a, 0x2e3b, B2],
  [0x3000, 0x3000, IDSP],
  [0x3001, 0x3002, CL],
  [0x3005, 0x3005, NS],
  [0x301c, 0x301c, NS],
  [0x3035, 0x3035, CM],
  [0x303b, 0x303c, NS],
  [0x303f, 0x303f, ID],
  [0x309b, 0x309e, NS],
  [0x30a0, 0x30a0, NS],
  [0x30fb, 0x30fb, NS],
  [0x30fd, 0x30fe, NS],
  [0x3248, 0x324f, AL],
  [0xfe10, 0xfe12, CL],
  [0xfe13, 0xfe16, NS],
  [0xfe19, 0xfe19, NS],
  [0xfe20, 0xfe20, QU],
  [0xfe22, 0xfe22, QU],
  [0xfe24, 0xfe24, QU],
  [0xfe26, 0xfe27, QU],
  [0xfe29, 0xfe29, QU],
  [0xfe2b, 0xfe2b, QU],
  [0xfe2d, 0xfe2e, QU],
  [0xfe50, 0xfe50, CL],
  [0xfe52, 0xfe52, CL],
  [0xfe54, 0xfe57, NS],
  [0xfe6a, 0xfe6a, PO],
  [0xff01, 0xff01, NS],
  [0xff05, 0xff05, PO],
  [0xff0c, 0xff0c, CL],
  [0xff0e, 0xff0e, CL],
  [0xff1a, 0xff1b, NS],
  [0xff1f, 0xff1f, NS],
  [0xff61, 0xff61, CL],
  [0xff62, 0xff62, OPW],
  [0xff64, 0xff64, CL],
  [0xff65, 0xff65, NS],
  [0xff70, 0xff70, ID],
  [0xff9e, 0xff9f, NS],
  [0xffe0, 0xffe0, PO],
  [0x1f100, 0x1f1ad, AL],
  [0x1f1e6, 0x1f1ff, RI],
  [0x1f39c, 0x1f39d, AL],
  [0x1f3b5, 0x1f3b6, AL],
  [0x1f3bc, 0x1f3bc, AL],
  [0x1f3fb, 0x1f3ff, EM],
  [0x1f4a0, 0x1f4a0, AL],
  [0x1f4a2, 0x1f4a2, AL],
  [0x1f4a4, 0x1f4a4, AL],
  [0x1f4af, 0x1f4af, AL],
  [0x1f4b1, 0x1f4b2, AL],
  [0x1f500, 0x1f506, AL],
  [0x1f517, 0x1f524, AL],
  [0x1f532, 0x1f549, AL],
  [0x1f5d4, 0x1f5db, AL],
  [0x1f5f4, 0x1f5f9, AL],
  [0x1f650, 0x1f675, AL],
  [0x1f676, 0x1f678, QU],
  [0x1f679, 0x1f67b, NS],
  [0x1f67c, 0x1f67f, AL],
  [0x1f700, 0x1f773, AL],
  [0x1f777, 0x1f77a, AL],
  [0x1f780, 0x1f7d4, AL],
  [0x1f800, 0x1f90b, AL],
  [0x1fa00, 0x1fa57, AL],
]

const wide: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
]

const inRanges = (
  ranges: ReadonlyArray<readonly [number, number]>,
  code: number,
): boolean => ranges.some(([from, to]) => code >= from && code <= to)

const opening = /\p{Ps}/u
const closing = /\p{Pe}/u
const quote = /[\p{Pi}\p{Pf}]/u
const currency = /\p{Sc}/u
const mark = /\p{M}/u
const ideograph =
  /\p{Ideographic}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u

const fallbackClass = (code: number): LineClass => {
  const char = String.fromCodePoint(code)
  if (opening.test(char)) {
    return inRanges(wide, code) ? OPW : OP
  }
  if (closing.test(char)) {
    return CL
  }
  if (quote.test(char)) {
    return QU
  }
  if (currency.test(char)) {
    return PR
  }
  if (mark.test(char)) {
    return CM
  }
  return (code >= 0x1f000 && code <= 0x1faff) ||
    inRanges(wide, code) ||
    ideograph.test(char)
    ? ID
    : AL
}

const exceptionClass = (code: number): LineClass | undefined => {
  let low = 0
  let high = exceptions.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const [from, to, lineClass] = exceptions[middle] ?? [0, 0, AL]
    if (code < from) {
      high = middle - 1
    } else if (code > to) {
      low = middle + 1
    } else {
      return lineClass
    }
  }
  return undefined
}

const known = new Map<number, LineClass>()

const codeClass = (code: number): LineClass => {
  if (code < 128) {
    return asciiClasses[code] ?? AL
  }
  const remembered = known.get(code)
  if (remembered !== undefined) {
    return remembered
  }
  const lineClass = exceptionClass(code) ?? fallbackClass(code)
  known.set(code, lineClass)
  return lineClass
}

/** A grapheme breaks as its first code point does. */
const classOf = (grapheme: string): LineClass =>
  codeClass(grapheme.codePointAt(0) ?? 0)

/** Spaces and tabs, after which a row may always start, and which hang past a row's end. */
export const isBreakSpace = (grapheme: string | undefined): boolean =>
  grapheme === ' ' || grapheme === '\t'

const isDigit = (grapheme: string | undefined): boolean => {
  const code = grapheme?.charCodeAt(0) ?? 0
  return code >= 48 && code <= 57
}

const isAlphanumeric = /[0-9A-Za-z]$/

const isAsciiChar = (grapheme: string): boolean =>
  grapheme.length === 1 && grapheme.charCodeAt(0) < 128

const eastAsianWide: ReadonlyArray<readonly [number, number]> = [
  ...wide,
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
  [0xff61, 0xffdc],
  [0xffe8, 0xffee],
]

const emojiPresentation = /^\p{Emoji_Presentation}/u

/** East Asian for ICU's quote rules: wide or halfwidth characters, and emoji other than flag letters. */
const isEastAsian = (grapheme: string | undefined): boolean => {
  if (grapheme === undefined) {
    return false
  }
  const code = grapheme.codePointAt(0) ?? 0
  return (
    inRanges(eastAsianWide, code) ||
    (emojiPresentation.test(grapheme) && !(code >= 0x1f1e6 && code <= 0x1f1ff))
  )
}

const initialQuote = /^\p{Pi}/u
const finalQuote = /^\p{Pf}/u
const numberAffixes: ReadonlySet<LineClass> = new Set([PR, PO, PRa, PRb, POa])
const wordLetters: ReadonlySet<LineClass> = new Set([AL, ALa, LTa, AN])

/**
 * The graphemes around a place in a line. `at` is the grapheme after the place, `before` the one before it.
 * `spacedIdeographicSpace` says `before` ends a run of ideographic spaces that follows a space or a zero width space.
 */
export type Around = Readonly<{
  twoBefore: string | undefined
  before: string
  at: string
  after: string | undefined
  twoAfter: string | undefined
  spacedIdeographicSpace: boolean
}>

/** Whether `grapheme` ends a run of ideographic spaces that follows a space, given the same for the grapheme before it. */
export const endsSpacedIdeographicSpace = (
  grapheme: string,
  before: string | undefined,
  beforeEnds: boolean,
): boolean =>
  classOf(grapheme) === IDSP &&
  before !== undefined &&
  (isBreakSpace(before) || classOf(before) === ZW || beforeEnds)

/** Whether a row may start at `around.at`. A row never starts at a space: spaces stay on the row they end. */
export const breaksBefore = (around: Around): boolean => {
  const { twoBefore, before, at, after, twoAfter } = around
  if (isBreakSpace(at)) {
    return false
  }
  const atClass = classOf(at)
  if (isBreakSpace(before)) {
    return atClass !== IDSP
  }
  const beforeClass = classOf(before)
  if (around.spacedIdeographicSpace) {
    return true
  }
  if (atClass === ZW) {
    return false
  }
  if (beforeClass === ZW) {
    return atClass !== IDSP
  }
  if (before === '-' && isDigit(at)) {
    return twoBefore !== undefined && isAlphanumeric.test(twoBefore)
  }
  const bothAscii = isAsciiChar(before) && isAsciiChar(at)
  if (bothAscii) {
    return breaksBetween(beforeClass, atClass)
  }
  const wordStart =
    twoBefore === undefined ||
    isBreakSpace(twoBefore) ||
    classOf(twoBefore) === GL ||
    classOf(twoBefore) === ZW
  if (
    wordLetters.has(atClass) &&
    !isDigit(at) &&
    ((before === '-' &&
      (wordStart || twoBefore === '-' || twoBefore === '?')) ||
      ((before === '\u2010' || before === '\u2013') && wordStart))
  ) {
    return false
  }
  if (
    (before.codePointAt(0) ?? 0) >= 0x100 ||
    (at.codePointAt(0) ?? 0) >= 0x100
  ) {
    if (
      numberAffixes.has(atClass) &&
      isDigit(twoBefore) &&
      (beforeClass === CL || /^[)\]},.:;/]$/.test(before))
    ) {
      return false
    }
    if (
      numberAffixes.has(beforeClass) &&
      (atClass === OPW ||
        ((atClass === OP || atClass === OPa) &&
          (before.codePointAt(0) ?? 0) >= 0x100)) &&
      (isDigit(after) ||
        ((after === '.' || after === ',') && isDigit(twoAfter)))
    ) {
      return false
    }
  }
  if (atClass === QU) {
    return (
      initialQuote.test(at) &&
      isEastAsian(before) &&
      isEastAsian(after) &&
      breaksBetween(beforeClass, ID)
    )
  }
  if (beforeClass === QU) {
    return (
      finalQuote.test(before) &&
      isEastAsian(twoBefore) &&
      isEastAsian(at) &&
      breaksBetween(ID, atClass)
    )
  }
  return breaksBetween(beforeClass, atClass)
}
