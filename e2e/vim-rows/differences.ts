export const vimDifferences = {
  'unbuilt-keys':
    'q, K, U and Q do nothing (Vim records a macro, looks up a word, undoes a line, enters Ex mode)',
  'find-grapheme':
    "a find's letter is one grapheme, so it finds no e under a combining accent and no first code point of a family or flag",
  'whole-letters':
    'emoji, flags and accented letters are one letter each, and r replaces and puts them whole',
  'r-control-cancels':
    'r then a Ctrl chord or Ctrl-V cancels (Vim puts the control character, or takes the next key as typed)',
  'visual-r-enter':
    'r then Enter over VISUAL or V-LINE does nothing (Vim puts a CR for every letter)',
} as const

export type VimDifference = keyof typeof vimDifferences
