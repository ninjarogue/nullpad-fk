import { type Nullpad, expect, openFresh, settle, test } from './nullpad'

const ROWS_PER_TEST = 12

type Row = Readonly<{
  id: number
  why: string
  note: keyof typeof notes
  at: readonly [number, number]
  keys: string
  text: string
  line: number
  column: number
  mode: string
  selection?: string
}>

type Group = Readonly<{ name: string; rows: ReadonlyArray<Row> }>

const notes = {
  N0: 'abcdef',
  N1: 'a\tbc\td\nabcdefghijkl',
  N2: 'a世b😀c\nabcdefgh',
  N3: 'café é x',
  N4: 'café x',
  N5: 'a👨‍👩‍👧b🇫🇷c',
  N6: 'one two three\nfour five\n\nsix',
  N7: 'abcdef\nab\n\nabcdefgh',
  N8: 'ab  cd',
  N9: '  ab cd',
  N10: 'abcdef\nabcdefgh',
  N11: 'abcdefghij\na\tbcdef\nabcdefghij',
  N12: 'abcdefgh\na世bcdef\nabcdefgh',
  N13: 'abc\nabcdefg\na\nabcde',
} as const

const groups: ReadonlyArray<Group> = [
  {
    name: 'NORMAL, one letter',
    rows: [
      {
        id: 1,
        why: 'one letter',
        note: 'N0',
        at: [1, 1],
        keys: 'rx',
        text: 'xbcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 5,
        why: 'last letter',
        note: 'N0',
        at: [1, 6],
        keys: 'rx',
        text: 'abcdex',
        line: 1,
        column: 6,
        mode: 'NORMAL',
      },
      {
        id: 10,
        why: 'space',
        note: 'N0',
        at: [1, 1],
        keys: 'r ',
        text: ' bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 11,
        why: 'digit is the letter, not a count',
        note: 'N0',
        at: [1, 1],
        keys: 'r3',
        text: '3bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 12,
        why: 'zero is the letter',
        note: 'N0',
        at: [1, 1],
        keys: 'r0',
        text: '0bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 13,
        why: 'quote is the letter, not a register',
        note: 'N0',
        at: [1, 1],
        keys: 'r"',
        text: '"bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 14,
        why: 'r replaced by r',
        note: 'N0',
        at: [1, 1],
        keys: 'rr',
        text: 'rbcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 23,
        why: 'a register prefix does nothing to r',
        note: 'N0',
        at: [1, 1],
        keys: '"arx',
        text: 'xbcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 24,
        why: 'the registers keep the yank',
        note: 'N0',
        at: [1, 1],
        keys: 'yllrx',
        text: 'axcdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 25,
        why: 'Tab',
        note: 'N0',
        at: [1, 1],
        keys: 'r<Tab>',
        text: '\tbcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 41,
        why: 'on a tab',
        note: 'N1',
        at: [1, 2],
        keys: 'rx',
        text: 'axbc\td\nabcdefghijkl',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 44,
        why: 'a tab over a tab',
        note: 'N1',
        at: [1, 2],
        keys: 'r<Tab>',
        text: 'a\tbc\td\nabcdefghijkl',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 46,
        why: 'a wide letter',
        note: 'N2',
        at: [1, 2],
        keys: 'rx',
        text: 'axb😀c\nabcdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 48,
        why: 'an emoji',
        note: 'N2',
        at: [1, 4],
        keys: 'rx',
        text: 'a世bxc\nabcdefgh',
        line: 1,
        column: 4,
        mode: 'NORMAL',
      },
      {
        id: 49,
        why: 'a wide letter put',
        note: 'N2',
        at: [1, 1],
        keys: 'r世',
        text: '世世b😀c\nabcdefgh',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 53,
        why: 'precomposed accent',
        note: 'N3',
        at: [1, 4],
        keys: 'rx',
        text: 'cafx é x',
        line: 1,
        column: 4,
        mode: 'NORMAL',
      },
      {
        id: 54,
        why: 'decomposed accent: the mark goes with the letter',
        note: 'N4',
        at: [1, 4],
        keys: 'rx',
        text: 'cafx x',
        line: 1,
        column: 4,
        mode: 'NORMAL',
      },
      {
        id: 56,
        why: 'letter after the family (nullpad letter 3 is b)',
        note: 'N5',
        at: [1, 3],
        keys: 'rx',
        text: 'a👨‍👩‍👧x🇫🇷c',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 58,
        why: 'an accented letter put',
        note: 'N0',
        at: [1, 1],
        keys: 'ré',
        text: 'ébcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 60,
        why: 'decomposed: does the mark ride with r?',
        note: 'N0',
        at: [1, 1],
        keys: 'ré',
        text: 'ébcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 61,
        why: 'a ZWJ family put',
        note: 'N0',
        at: [1, 1],
        keys: 'r👨‍👩‍👧',
        text: '👨‍👩‍👧bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 55,
        why: 'a ZWJ family',
        note: 'N5',
        at: [1, 2],
        keys: 'rx',
        text: 'axb🇫🇷c',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 57,
        why: 'a flag',
        note: 'N5',
        at: [1, 4],
        keys: 'rx',
        text: 'a👨‍👩‍👧bxc',
        line: 1,
        column: 4,
        mode: 'NORMAL',
      },
    ],
  },
  {
    name: 'NORMAL, counts',
    rows: [
      {
        id: 2,
        why: 'count replaces 3, cursor on the last one',
        note: 'N0',
        at: [1, 1],
        keys: '3rx',
        text: 'xxxdef',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 3,
        why: 'count reaching the line end exactly',
        note: 'N0',
        at: [1, 4],
        keys: '3rx',
        text: 'abcxxx',
        line: 1,
        column: 6,
        mode: 'NORMAL',
      },
      {
        id: 4,
        why: 'count past the line end fails, nothing changes',
        note: 'N0',
        at: [1, 5],
        keys: '3rx',
        text: 'abcdef',
        line: 1,
        column: 5,
        mode: 'NORMAL',
      },
      {
        id: 6,
        why: 'whole line',
        note: 'N0',
        at: [1, 1],
        keys: '6rx',
        text: 'xxxxxx',
        line: 1,
        column: 6,
        mode: 'NORMAL',
      },
      {
        id: 7,
        why: 'one too many fails',
        note: 'N0',
        at: [1, 1],
        keys: '7rx',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 8,
        why: 'empty line fails',
        note: 'N6',
        at: [3, 1],
        keys: 'rx',
        text: 'one two three\nfour five\n\nsix',
        line: 3,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 9,
        why: 'after the failed r, x still runs on its own',
        note: 'N6',
        at: [3, 1],
        keys: 'rxx',
        text: 'one two three\nfour five\n\nsix',
        line: 3,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 26,
        why: '3 Tabs',
        note: 'N0',
        at: [1, 1],
        keys: '3r<Tab>',
        text: '\t\t\tdef',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 45,
        why: 'a tab is one letter for the count',
        note: 'N1',
        at: [1, 1],
        keys: '3rx',
        text: 'xxxc\td\nabcdefghijkl',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 51,
        why: 'a, wide, b: three letters',
        note: 'N2',
        at: [1, 1],
        keys: '3rx',
        text: 'xxx😀c\nabcdefgh',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 52,
        why: 'three emoji',
        note: 'N2',
        at: [1, 2],
        keys: '3r😀',
        text: 'a😀😀😀c\nabcdefgh',
        line: 1,
        column: 4,
        mode: 'NORMAL',
      },
      {
        id: 59,
        why: 'three accented letters',
        note: 'N0',
        at: [1, 1],
        keys: '3ré',
        text: 'ééédef',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 145,
        why: 'counts around a register multiply',
        note: 'N0',
        at: [1, 1],
        keys: '2"a3rx',
        text: 'xxxxxx',
        line: 1,
        column: 6,
        mode: 'NORMAL',
      },
      {
        id: 146,
        why: 'r after an operator cancels it; x runs alone',
        note: 'N0',
        at: [1, 1],
        keys: 'drx',
        text: 'bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 147,
        why: 'd then a count then r',
        note: 'N0',
        at: [1, 1],
        keys: 'd2rx',
        text: 'bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 130,
        why: 'count in a block',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jl3rx',
        text: 'axxdef\nax\n\nabcdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
    ],
  },
  {
    name: 'NORMAL, special keys',
    rows: [
      {
        id: 15,
        why: 'Esc cancels',
        note: 'N0',
        at: [1, 1],
        keys: 'r<Esc>',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 16,
        why: 'Esc cancels and the next key runs alone',
        note: 'N0',
        at: [1, 1],
        keys: 'r<Esc>x',
        text: 'bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 17,
        why: 'count then Esc, the count is gone for x',
        note: 'N0',
        at: [1, 1],
        keys: '3r<Esc>x',
        text: 'bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 19,
        why: 'Backspace',
        note: 'N0',
        at: [1, 1],
        keys: 'r<BS>',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 20,
        why: 'an arrow',
        note: 'N0',
        at: [1, 1],
        keys: 'r<Left>',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 21,
        why: 'Delete',
        note: 'N0',
        at: [1, 1],
        keys: 'r<Del>',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 18,
        why: 'Ctrl-C cancels',
        note: 'N0',
        at: [1, 1],
        keys: 'r<C-c>',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 22,
        why: 'a control letter is put as itself',
        note: 'N0',
        at: [1, 1],
        keys: 'r<C-a>',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 137,
        why: 'Ctrl-V takes the next key literally',
        note: 'N0',
        at: [1, 1],
        keys: 'r<C-v>x',
        text: 'bcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 27,
        why: 'a line break',
        note: 'N0',
        at: [1, 1],
        keys: 'r<CR>',
        text: '\nbcdef',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 28,
        why: 'three letters become ONE line break',
        note: 'N0',
        at: [1, 2],
        keys: '3r<CR>',
        text: 'a\nef',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 29,
        why: 'the last letter becomes a break, the new line is empty',
        note: 'N0',
        at: [1, 6],
        keys: 'r<CR>',
        text: 'abcde\n',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 30,
        why: 'a count past the end fails',
        note: 'N0',
        at: [1, 5],
        keys: '3r<CR>',
        text: 'abcdef',
        line: 1,
        column: 5,
        mode: 'NORMAL',
      },
      {
        id: 31,
        why: 'the space before the cursor stays? (trailing white space)',
        note: 'N8',
        at: [1, 3],
        keys: 'r<CR>',
        text: 'ab\n cd',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 32,
        why: 'a space after the break: is it kept at the new line start?',
        note: 'N8',
        at: [1, 4],
        keys: 'r<CR>',
        text: 'ab \ncd',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 33,
        why: 'spaces after the break',
        note: 'N8',
        at: [1, 2],
        keys: 'r<CR>',
        text: 'a\n  cd',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 34,
        why: 'an indented line: no autoindent with -u NONE',
        note: 'N9',
        at: [1, 4],
        keys: 'r<CR>',
        text: '  a\n cd',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 138,
        why: 'the whole line becomes one break',
        note: 'N0',
        at: [1, 1],
        keys: '6r<CR>',
        text: '\n',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
    ],
  },
  {
    name: 'NORMAL, dot',
    rows: [
      {
        id: 37,
        why: 'dot repeats the break on the new line',
        note: 'N0',
        at: [1, 1],
        keys: 'r<CR>.',
        text: '\n\ncdef',
        line: 3,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 38,
        why: 'dot of a counted break',
        note: 'N0',
        at: [1, 2],
        keys: '2r<CR>.',
        text: 'a\n\nf',
        line: 3,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 39,
        why: 'dot with a count: two letters become one break',
        note: 'N0',
        at: [1, 1],
        keys: 'r<CR>2.',
        text: '\n\ndef',
        line: 3,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 62,
        why: 'dot on the next letter',
        note: 'N0',
        at: [1, 1],
        keys: 'rxl.',
        text: 'xxcdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 63,
        why: 'dot keeps the count',
        note: 'N0',
        at: [1, 1],
        keys: '2rxll.',
        text: 'xxcxxf',
        line: 1,
        column: 5,
        mode: 'NORMAL',
      },
      {
        id: 64,
        why: 'a count before dot replaces it',
        note: 'N0',
        at: [1, 1],
        keys: '2rxl3.',
        text: 'xxxxxf',
        line: 1,
        column: 5,
        mode: 'NORMAL',
      },
      {
        id: 65,
        why: 'and stays for the next dot',
        note: 'N0',
        at: [1, 1],
        keys: '2rxl3.l.',
        text: 'xxxxxf',
        line: 1,
        column: 6,
        mode: 'NORMAL',
      },
      {
        id: 66,
        why: 'a dot whose count fails changes nothing',
        note: 'N0',
        at: [1, 1],
        keys: '2rxll9.',
        text: 'xxcdef',
        line: 1,
        column: 4,
        mode: 'NORMAL',
      },
      {
        id: 67,
        why: 'after a failed dot the old count stays',
        note: 'N0',
        at: [1, 1],
        keys: '2rxll9.l.',
        text: 'xxcdxx',
        line: 1,
        column: 6,
        mode: 'NORMAL',
      },
      {
        id: 68,
        why: 'a failed r is not what dot repeats',
        note: 'N0',
        at: [1, 1],
        keys: 'x$9rz0.',
        text: 'cdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 69,
        why: 'a register before dot',
        note: 'N0',
        at: [1, 1],
        keys: 'rxl"b.',
        text: 'xxcdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 70,
        why: 'a cancelled r leaves dot to x',
        note: 'N0',
        at: [1, 1],
        keys: 'r<Esc>xl.',
        text: 'bdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 71,
        why: 'dot on a tab',
        note: 'N1',
        at: [1, 1],
        keys: 'rxl.',
        text: 'xxbc\td\nabcdefghijkl',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 139,
        why: 'dot of a break on the empty line fails',
        note: 'N0',
        at: [1, 6],
        keys: 'r<CR>.',
        text: 'abcde\n',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 140,
        why: 'dot of a break with a count past the end fails',
        note: 'N0',
        at: [1, 2],
        keys: '2r<CR>3.',
        text: 'a\n\n',
        line: 3,
        column: 1,
        mode: 'NORMAL',
      },
    ],
  },
  {
    name: 'NORMAL, undo and redo',
    rows: [
      {
        id: 35,
        why: 'undo of a break',
        note: 'N0',
        at: [1, 1],
        keys: 'r<CR>u',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 36,
        why: 'undo of a counted break',
        note: 'N0',
        at: [1, 2],
        keys: '3r<CR>u',
        text: 'abcdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 72,
        why: 'undo',
        note: 'N0',
        at: [1, 1],
        keys: 'rxu',
        text: 'abcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 73,
        why: 'undo of a count, cursor',
        note: 'N0',
        at: [1, 3],
        keys: '3rxu',
        text: 'abcdef',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 74,
        why: 'undo from elsewhere on the line',
        note: 'N0',
        at: [1, 3],
        keys: '3rx0u',
        text: 'abcdef',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 75,
        why: 'redo',
        note: 'N0',
        at: [1, 1],
        keys: 'rxu<C-r>',
        text: 'xbcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 76,
        why: 'redo of a count',
        note: 'N0',
        at: [1, 3],
        keys: '3rxu<C-r>',
        text: 'abxxxf',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 77,
        why: 'undo of a dot',
        note: 'N0',
        at: [1, 1],
        keys: 'rxl.u',
        text: 'xbcdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 78,
        why: 'two r, one undo',
        note: 'N0',
        at: [1, 1],
        keys: 'rxlrxu',
        text: 'xbcdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
    ],
  },
  {
    name: 'NORMAL, the column j and k keep',
    rows: [
      {
        id: 40,
        why: 'column after a break, then k',
        note: 'N0',
        at: [1, 1],
        keys: 'r<CR>k',
        text: '\nbcdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 42,
        why: 'the column j keeps after replacing a tab',
        note: 'N1',
        at: [1, 2],
        keys: 'rxj',
        text: 'axbc\td\nabcdefghijkl',
        line: 2,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 43,
        why: 'a tab put, then j',
        note: 'N1',
        at: [1, 1],
        keys: 'r<Tab>j',
        text: '\t\tbc\td\nabcdefghijkl',
        line: 2,
        column: 8,
        mode: 'NORMAL',
      },
      {
        id: 47,
        why: 'wide letter then j',
        note: 'N2',
        at: [1, 2],
        keys: 'rxj',
        text: 'axb😀c\nabcdefgh',
        line: 2,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 50,
        why: 'wide letter put, then j',
        note: 'N2',
        at: [1, 1],
        keys: 'r世j',
        text: '世世b😀c\nabcdefgh',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 79,
        why: 'the column j keeps after rx',
        note: 'N10',
        at: [1, 1],
        keys: 'rxj',
        text: 'xbcdef\nabcdefgh',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 80,
        why: 'after 3rx the cursor is on the last, j goes from there',
        note: 'N10',
        at: [1, 2],
        keys: '3rxj',
        text: 'axxxef\nabcdefgh',
        line: 2,
        column: 4,
        mode: 'NORMAL',
      },
      {
        id: 81,
        why: 'after $, r keeps the line-end column? ',
        note: 'N10',
        at: [1, 1],
        keys: '$rxj',
        text: 'abcdex\nabcdefgh',
        line: 2,
        column: 6,
        mode: 'NORMAL',
      },
    ],
  },
  {
    name: 'VISUAL',
    rows: [
      {
        id: 82,
        why: 'letters',
        note: 'N0',
        at: [1, 2],
        keys: 'vllrx',
        text: 'axxxef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 83,
        why: 'gv after',
        note: 'N0',
        at: [1, 2],
        keys: 'vllrxgv',
        text: 'axxxef',
        line: 1,
        column: 4,
        mode: 'VISUAL',
        selection: 'xxx',
      },
      {
        id: 84,
        why: 'dot after: the same width from the cursor',
        note: 'N0',
        at: [1, 2],
        keys: 'vllrxl.',
        text: 'axxxxf',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 85,
        why: 'a count before that dot',
        note: 'N0',
        at: [1, 2],
        keys: 'vllrxl3.',
        text: 'axxxxf',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 86,
        why: 'undo after a visual r',
        note: 'N0',
        at: [1, 2],
        keys: 'vllrxu',
        text: 'abcdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 87,
        why: 'cursor end before the anchor',
        note: 'N0',
        at: [1, 4],
        keys: 'vhhrx',
        text: 'axxxef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 88,
        why: 'a count in VISUAL before r',
        note: 'N0',
        at: [1, 2],
        keys: 'vl3rx',
        text: 'axxdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 89,
        why: 'Esc after r in VISUAL',
        note: 'N0',
        at: [1, 2],
        keys: 'vlr<Esc>',
        text: 'abcdef',
        line: 1,
        column: 3,
        mode: 'VISUAL',
        selection: 'bc',
      },
      {
        id: 90,
        why: 'after the cancelled r: still VISUAL?',
        note: 'N0',
        at: [1, 2],
        keys: 'vlr<Esc>d',
        text: 'adef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 91,
        why: 'a line break over letters',
        note: 'N0',
        at: [1, 2],
        keys: 'vlr<CR>',
        text: 'abcdef',
        line: 1,
        column: 3,
        mode: 'VISUAL',
        selection: 'bc',
      },
      {
        id: 92,
        why: 'a tab over letters',
        note: 'N0',
        at: [1, 2],
        keys: 'vlr<Tab>',
        text: 'a\t\tdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 93,
        why: 'a wide letter over letters',
        note: 'N0',
        at: [1, 2],
        keys: 'vlr世',
        text: 'a世世def',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 94,
        why: 'register prefix',
        note: 'N0',
        at: [1, 2],
        keys: 'vl"arx',
        text: 'axxdef',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 95,
        why: 'over two lines: the line break stays',
        note: 'N6',
        at: [1, 5],
        keys: 'vjrx',
        text: 'one xxxxxxxxx\nxxxxxfive\n\nsix',
        line: 1,
        column: 5,
        mode: 'NORMAL',
      },
      {
        id: 96,
        why: 'v$ takes the break: it stays',
        note: 'N6',
        at: [1, 1],
        keys: 'v$rx',
        text: 'xxxxxxxxxxxxx\nfour five\n\nsix',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 97,
        why: 'through an empty line',
        note: 'N6',
        at: [1, 5],
        keys: 'vjjrx',
        text: 'one xxxxxxxxx\nxxxxxxxxx\n\nsix',
        line: 1,
        column: 5,
        mode: 'NORMAL',
      },
      {
        id: 98,
        why: 'only an empty line',
        note: 'N6',
        at: [3, 1],
        keys: 'vrx',
        text: 'one two three\nfour five\n\nsix',
        line: 3,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 99,
        why: 'gv after two lines',
        note: 'N6',
        at: [1, 5],
        keys: 'vjrxgv',
        text: 'one xxxxxxxxx\nxxxxxfive\n\nsix',
        line: 2,
        column: 5,
        mode: 'VISUAL',
      },
      {
        id: 100,
        why: 'dot of a two-line r from the last line',
        note: 'N6',
        at: [1, 5],
        keys: 'vjrxG0.',
        text: 'one xxxxxxxxx\nxxxxxfive\n\nxxx',
        line: 4,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 101,
        why: 'breaks over two lines',
        note: 'N6',
        at: [1, 5],
        keys: 'vjr<CR>',
        text: 'one two three\nfour five\n\nsix',
        line: 2,
        column: 5,
        mode: 'VISUAL',
      },
      {
        id: 102,
        why: 'letters over a tab',
        note: 'N1',
        at: [1, 1],
        keys: 'vllrx',
        text: 'xxxc\td\nabcdefghijkl',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 103,
        why: 'letters over a wide letter',
        note: 'N2',
        at: [1, 1],
        keys: 'vllrx',
        text: 'xxx😀c\nabcdefgh',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 104,
        why: 'letters over a ZWJ family',
        note: 'N5',
        at: [1, 1],
        keys: 'vllrx',
        text: 'xxx🇫🇷c',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 132,
        why: 'dot of a visual r over a tab: letters or screen columns?',
        note: 'N1',
        at: [1, 1],
        keys: 'vllrxj0.',
        text: 'xxxc\td\nxxxxxxxxxjkl',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 133,
        why: 'dot of a visual r over a wide letter',
        note: 'N2',
        at: [1, 1],
        keys: 'vllrxj0.',
        text: 'xxx😀c\nxxxxefgh',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 134,
        why: 'dot of a plain visual r on the next line',
        note: 'N10',
        at: [1, 1],
        keys: 'vllrxj0.',
        text: 'xxxdef\nxxxdefgh',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 135,
        why: 'count 1 before the visual dot is ignored',
        note: 'N0',
        at: [1, 2],
        keys: 'vllrxl1.',
        text: 'axxxxf',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 136,
        why: 'dot of v$ r runs to the line end',
        note: 'N10',
        at: [1, 3],
        keys: 'v$rxj0.',
        text: 'abxxxx\nxxxxxxxx',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 141,
        why: 'the column j keeps after a visual r',
        note: 'N10',
        at: [1, 2],
        keys: 'vllrxj',
        text: 'axxxef\nabcdefgh',
        line: 2,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 143,
        why: 'selection onto the line break: the break stays',
        note: 'N0',
        at: [1, 6],
        keys: 'vlrx',
        text: 'abcdex',
        line: 1,
        column: 6,
        mode: 'NORMAL',
      },
      {
        id: 144,
        why: 'two whole lines with breaks',
        note: 'N6',
        at: [1, 1],
        keys: 'vj$rx',
        text: 'xxxxxxxxxxxxx\nxxxxxxxxx\n\nsix',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 148,
        why: 'undo of a two-line visual r',
        note: 'N6',
        at: [1, 5],
        keys: 'vjrxu',
        text: 'one two three\nfour five\n\nsix',
        line: 1,
        column: 5,
        mode: 'NORMAL',
      },
      {
        id: 152,
        why: 'undo of a visual dot',
        note: 'N0',
        at: [1, 2],
        keys: 'vlrxgg0.u',
        text: 'axxdef',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
    ],
  },
  {
    name: 'V-LINE',
    rows: [
      {
        id: 105,
        why: 'one line',
        note: 'N6',
        at: [1, 3],
        keys: 'Vrx',
        text: 'xxxxxxxxxxxxx\nfour five\n\nsix',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 106,
        why: 'lines with an empty one',
        note: 'N6',
        at: [1, 3],
        keys: 'Vjjjrx',
        text: 'xxxxxxxxxxxxx\nxxxxxxxxx\n\nxxx',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 107,
        why: 'gv after V',
        note: 'N6',
        at: [2, 3],
        keys: 'Vrxgv',
        text: 'one two three\nxxxxxxxxx\n\nsix',
        line: 2,
        column: 3,
        mode: 'V-LINE',
        selection: 'xxxxxxxxx\n',
      },
      {
        id: 108,
        why: 'dot of a V r',
        note: 'N6',
        at: [1, 3],
        keys: 'Vrxj.',
        text: 'xxxxxxxxxxxxx\nxxxxxxxxx\n\nsix',
        line: 2,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 109,
        why: 'breaks over a line',
        note: 'N6',
        at: [1, 3],
        keys: 'Vr<CR>',
        text: 'one two three\nfour five\n\nsix',
        line: 1,
        column: 3,
        mode: 'V-LINE',
        selection: 'one two three\n',
      },
      {
        id: 110,
        why: 'undo after V',
        note: 'N6',
        at: [1, 3],
        keys: 'Vjrxu',
        text: 'one two three\nfour five\n\nsix',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
    ],
  },
  {
    name: 'V-BLOCK',
    rows: [
      {
        id: 111,
        why: 'a block',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jlrx',
        text: 'axxdef\nax\n\nabcdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 112,
        why: 'a block over a short and an empty line',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jjjlrx',
        text: 'axxdef\nax\n\naxxdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 113,
        why: 'gv after a block',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jjjlrxgv',
        text: 'axxdef\nax\n\naxxdefgh',
        line: 4,
        column: 3,
        mode: 'V-BLOCK',
        selection: 'xx\nx\n\nxx',
      },
      {
        id: 114,
        why: 'dot of a block r',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jlrxG0.',
        text: 'axxdef\nax\n\nxxcdefgh',
        line: 4,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 115,
        why: 'undo after a block r',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jlrxu',
        text: 'abcdef\nab\n\nabcdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 116,
        why: 'a $ block',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jjj$rx',
        text: 'axxxxx\nax\n\naxxxxxxx',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 117,
        why: 'a block where the middle line is short',
        note: 'N7',
        at: [1, 4],
        keys: '<C-v>jjrx',
        text: 'xxxxef\nxx\n\nabcdefgh',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 118,
        why: 'a block cutting a tab on the left (cols 2-3)',
        note: 'N11',
        at: [1, 2],
        keys: '<C-v>jjlrx',
        text: 'axxdefghij\naxx     bcdef\naxxdefghij',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 119,
        why: 'a block inside a tab (cols 4-5)',
        note: 'N11',
        at: [1, 4],
        keys: '<C-v>jjlrx',
        text: 'abcxxfghij\na  xx   bcdef\nabcxxfghij',
        line: 1,
        column: 4,
        mode: 'NORMAL',
      },
      {
        id: 120,
        why: 'a block cutting a tab on the right (cols 8-9)',
        note: 'N11',
        at: [1, 8],
        keys: '<C-v>jjlrx',
        text: 'abcdefgxxj\na      xxcdef\nabcdefgxxj',
        line: 1,
        column: 8,
        mode: 'NORMAL',
      },
      {
        id: 121,
        why: 'a block cutting a wide letter on its right half',
        note: 'N12',
        at: [1, 3],
        keys: '<C-v>jjrx',
        text: 'abxdefgh\na xbcdef\nabxdefgh',
        line: 1,
        column: 3,
        mode: 'NORMAL',
      },
      {
        id: 122,
        why: 'a block cutting a wide letter on its left half',
        note: 'N12',
        at: [1, 2],
        keys: '<C-v>jjrx',
        text: 'axcdefgh\nax bcdef\naxcdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 123,
        why: 'a block holding a wide letter whole',
        note: 'N12',
        at: [1, 2],
        keys: '<C-v>jjlrx',
        text: 'axxdefgh\naxxbcdef\naxxdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 124,
        why: 'a wide letter over 3 columns',
        note: 'N7',
        at: [1, 1],
        keys: '<C-v>jjjllr世',
        text: '世 def\n世\n\n世 defgh',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 125,
        why: 'a wide letter over 2 columns',
        note: 'N7',
        at: [1, 1],
        keys: '<C-v>jjjlr世',
        text: '世cdef\n世\n\n世cdefgh',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 126,
        why: 'breaks over a block',
        note: 'N7',
        at: [1, 1],
        keys: '<C-v>jlr<CR>',
        text: '\ncdef\n\n\n\nabcdefgh',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 127,
        why: 'tabs over a block',
        note: 'N7',
        at: [1, 1],
        keys: '<C-v>jlr<Tab>',
        text: '\t\tcdef\n\t\t\n\nabcdefgh',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 128,
        why: '$ block over lines of 3, 7, 1, 5',
        note: 'N13',
        at: [1, 2],
        keys: '<C-v>jjj$rx',
        text: 'axx\naxxxxxx\na\naxxxx',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 129,
        why: 'dot of a $ block',
        note: 'N13',
        at: [1, 2],
        keys: '<C-v>jjj$rxgg0.',
        text: 'xxx\nxxxxxxx\nx\nxxxxx',
        line: 1,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 131,
        why: 'count before the dot of a block',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jlrxgg0l3.',
        text: 'axxdef\nax\n\nabcdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 142,
        why: 'the column j keeps after a block r',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jlrxjj',
        text: 'axxdef\nax\n\nabcdefgh',
        line: 3,
        column: 1,
        mode: 'NORMAL',
      },
      {
        id: 149,
        why: 'redo of a block r',
        note: 'N7',
        at: [1, 2],
        keys: '<C-v>jlrxu<C-r>',
        text: 'axxdef\nax\n\nabcdefgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 150,
        why: 'wide over a wide letter',
        note: 'N12',
        at: [1, 2],
        keys: '<C-v>jjlr世',
        text: 'a世defgh\na世bcdef\na世defgh',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
      {
        id: 151,
        why: 'tabs over a cut tab',
        note: 'N11',
        at: [1, 2],
        keys: '<C-v>jjlr<Tab>',
        text: 'a\t\tdefghij\na\t\t     bcdef\na\t\tdefghij',
        line: 1,
        column: 2,
        mode: 'NORMAL',
      },
    ],
  },
]

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Del>': 'Delete',
  '<Tab>': 'Tab',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Up>': 'ArrowUp',
  '<Down>': 'ArrowDown',
  '<Home>': 'Home',
  '<End>': 'End',
  '<PageUp>': 'PageUp',
  '<PageDown>': 'PageDown',
  '<C-r>': 'Control+r',
  '<C-[>': 'Control+[',
  '<C-v>': 'Control+v',
  '<C-c>': 'Control+c',
  '<C-a>': 'Control+a',
  '<C-x>': 'Control+x',
}

const segmenter = new Intl.Segmenter()

const tokensOf = (keys: string): ReadonlyArray<string> =>
  keys
    .split(/(<[A-Za-z-[\]]+>)/u)
    .flatMap(part =>
      part in keyNames
        ? [part]
        : [...segmenter.segment(part)].map(piece => piece.segment),
    )

const isPlainKey = (token: string) => /^[\x20-\x7e]$/u.test(token)

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of tokensOf(keys)) {
    if (token in keyNames) {
      await nullpad.page.keyboard.press(keyNames[token] ?? token)
    } else if (isPlainKey(token)) {
      await nullpad.page.keyboard.press(token)
    } else {
      await nullpad.page.keyboard.insertText(token)
    }
  }
  await settle(nullpad.page)
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const pending = nullpad.page.locator('.status .pending')
  return (await pending.count()) === 0 ? '' : (await pending.innerText()).trim()
}

const vimOn = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
}

const placeAt = async (nullpad: Nullpad, line: number, column: number) => {
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', line - 1)
  await nullpad.press('Home')
  await nullpad.press('ArrowRight', column - 1)
}

const begin = async (
  nullpad: Nullpad,
  text: string,
  at: readonly [number, number] = [1, 1],
) => {
  await openFresh(nullpad.page)
  await nullpad.paste(text)
  await placeAt(nullpad, at[0], at[1])
  await vimOn(nullpad)
}

const expectScreen = async (
  nullpad: Nullpad,
  label: string,
  state: Readonly<{
    text: string
    line: number
    column: number
    mode: string
    selection?: string
  }>,
) => {
  expect.soft(await nullpad.text(), `${label}: text`).toBe(state.text)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line: state.line, column: state.column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe(state.mode)
  if (state.selection !== undefined) {
    expect
      .soft(await nullpad.selection(), `${label}: selected letters`)
      .toBe(state.selection)
  }
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  await begin(nullpad, notes[row.note], row.at)
  await play(nullpad, row.keys)
  await expectScreen(
    nullpad,
    `row ${row.id} (${row.why}) keys ${row.keys} at ${row.at.join(':')}`,
    row,
  )
}

for (const group of groups) {
  for (let from = 0; from < group.rows.length; from += ROWS_PER_TEST) {
    const rows = group.rows.slice(from, from + ROWS_PER_TEST)
    test(`r ${group.name} as in Vim (rows ${rows.map(row => row.id).join(', ')})`, async ({
      nullpad,
    }) => {
      for (const row of rows) {
        await playRow(nullpad, row)
      }
    })
  }
}

const typeKeyWithText = async (nullpad: Nullpad, text: string) => {
  await nullpad.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: text,
    text,
    unmodifiedText: text,
  })
  await nullpad.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: text })
  await settle(nullpad.page)
}

test('r waits for a letter and .status .pending reads r, with the count before it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef')
  await play(nullpad, 'r')
  expect(await pendingOf(nullpad), 'r alone').toBe('r')
  await play(nullpad, 'x')
  expect(await pendingOf(nullpad), 'nothing pending after the letter').toBe('')
  expect(await nullpad.text(), 'rx').toBe('xbcdef')
  await play(nullpad, '3r')
  expect(await pendingOf(nullpad), 'a count before r').toBe('3r')
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'Esc empties it').toBe('')
  await play(nullpad, 'vr')
  expect(await modeOf(nullpad), 'still VISUAL while r waits').toBe('VISUAL')
  expect(await pendingOf(nullpad), 'r in VISUAL').toBe('r')
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'Esc after r in VISUAL keeps VISUAL').toBe(
    'VISUAL',
  )
  expect(await pendingOf(nullpad), 'and drops r').toBe('')
  expect(await nullpad.selection(), 'and keeps the selection').toBe('x')
})

test('r then Ctrl-C cancels, the keydown is cancelled so the browser does not take it, and x then runs alone', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef')
  await nullpad.page.evaluate(() => {
    const seen: Array<{ key: string; prevented: boolean }> = []
    Object.assign(window, { keysSeen: seen })
    window.addEventListener('keydown', event =>
      seen.push({ key: event.key, prevented: event.defaultPrevented }),
    )
  })
  await play(nullpad, 'r<C-c>')
  const seen = await nullpad.page.evaluate(
    () =>
      (
        window as unknown as {
          keysSeen: Array<{ key: string; prevented: boolean }>
        }
      ).keysSeen,
  )
  expect(
    seen.find(entry => entry.key === 'c'),
    'the Ctrl-C keydown was cancelled',
  ).toEqual({ key: 'c', prevented: true })
  await expectScreen(nullpad, 'after r and Ctrl-C', {
    text: 'abcdef',
    line: 1,
    column: 1,
    mode: 'NORMAL',
  })
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x runs on its own and deletes').toBe('bcdef')
})

for (const key of [
  'Escape',
  'Control+[',
  'Home',
  'End',
  'ArrowRight',
  'ArrowLeft',
  'Delete',
  'Backspace',
  'Control+x',
]) {
  test(`r then ${key} changes nothing and the next key runs on its own`, async ({
    nullpad,
  }) => {
    await begin(nullpad, 'abcdef', [1, 3])
    await play(nullpad, '2r')
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await nullpad.text(), 'text after the cancelled r').toBe('abcdef')
    expect(await pendingOf(nullpad), 'nothing pending, the count is gone').toBe(
      '',
    )
    expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
    await play(nullpad, 'x')
    const text = await nullpad.text()
    expect(text.length, 'x deleted one letter, the count did not carry').toBe(5)
    expect(text.includes('x'), 'x was not put as the letter of r').toBe(false)
  })
}

test('r writes no register, a register name before it is ignored, and a put gives back the yank', async ({
  nullpad,
}) => {
  await begin(nullpad, 'foo bar')
  await play(nullpad, 'yiwwrx')
  expect(await nullpad.text(), 'rx over b').toBe('foo xar')
  await play(nullpad, '0p')
  expect(await nullpad.text(), 'p puts the yanked word, not x').toBe(
    'ffoooo xar',
  )
  await begin(nullpad, 'foo bar')
  await play(nullpad, 'yiwwvlrx0p')
  expect(await nullpad.text(), 'a VISUAL r leaves the registers too').toBe(
    'ffoooo xxr',
  )
  await begin(nullpad, 'abcdef')
  await play(nullpad, 'dl')
  await play(nullpad, 'rxp')
  expect(await nullpad.text(), 'the delete stays in the unnamed register').toBe(
    'xacdef',
  )
  await begin(nullpad, 'abcdef')
  await play(nullpad, '"arx"ap')
  expect(await nullpad.text(), '"a before r writes nothing into "a').toBe(
    'xbcdef',
  )
  await begin(nullpad, 'abcdef')
  await nullpad.page.evaluate(() => navigator.clipboard.writeText('KEEP'))
  await play(nullpad, '"+rx')
  expect(await nullpad.text(), '"+rx replaces the letter').toBe('xbcdef')
  expect(
    await nullpad.page.evaluate(() => navigator.clipboard.readText()),
    'the system clipboard is as it was',
  ).toBe('KEEP')
})

test('a letter chosen in an IME after r replaces the letter, and IME text counts only while r waits', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef')
  await play(nullpad, 'r')
  await nullpad.compose('n')
  await nullpad.compose('に')
  await nullpad.commit('に')
  await expectScreen(nullpad, 'r then an IME に', {
    text: 'にbcdef',
    line: 1,
    column: 1,
    mode: 'NORMAL',
  })
  expect(await pendingOf(nullpad), 'r is done').toBe('')
  await play(nullpad, '3r')
  await nullpad.commit('ほ')
  await expectScreen(nullpad, '3r then an IME ほ', {
    text: 'ほほほdef',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
  await nullpad.commit('ん')
  expect(await nullpad.text(), 'IME text with no r waiting does nothing').toBe(
    'ほほほdef',
  )
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u brings the 3 letters back').toBe(
    'にbcdef',
  )
  await play(nullpad, 'r')
  await nullpad.commit('xy')
  expect(await nullpad.text(), 'two letters while r waits do nothing').toBe(
    'にbcdef',
  )
  await play(nullpad, '<Esc>')
  expect(await nullpad.text(), 'and Esc leaves it as it was').toBe('にbcdef')
})

test('a single letter that arrives as a typed key with text, such as a dead key makes, replaces the letter', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef')
  await play(nullpad, 'r')
  await typeKeyWithText(nullpad, 'é')
  await expectScreen(nullpad, 'r then é', {
    text: 'ébcdef',
    line: 1,
    column: 1,
    mode: 'NORMAL',
  })
  await play(nullpad, 'l2r')
  await typeKeyWithText(nullpad, '^')
  await expectScreen(nullpad, '2r then ^', {
    text: 'é^^def',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
})

test('after r the column j and k keep is the letter put, even after $', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\nabcdefgh\nab')
  await play(nullpad, '$rxj')
  await expectScreen(nullpad, '$rxj', {
    text: 'abcdex\nabcdefgh\nab',
    line: 2,
    column: 6,
    mode: 'NORMAL',
  })
  await play(nullpad, 'j')
  expect(await nullpad.status(), 'the short line clamps').toMatchObject({
    line: 3,
    column: 2,
  })
  await play(nullpad, 'k')
  expect(
    await nullpad.status(),
    'k goes back to the column of the letter put, not the line end',
  ).toMatchObject({ line: 2, column: 6 })
  await play(nullpad, 'kk')
  expect(await nullpad.status(), 'k from line 1 stays and fails').toMatchObject(
    {
      line: 1,
      column: 6,
    },
  )
})

test('gv and . after a VISUAL r select and repeat on the same amount', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef', [1, 2])
  await play(nullpad, 'vllrxgv')
  await expectScreen(nullpad, 'gv after vllrx', {
    text: 'axxxef',
    line: 1,
    column: 4,
    mode: 'VISUAL',
    selection: 'xxx',
  })
  await play(nullpad, 'ry')
  await expectScreen(nullpad, 'ry over the brought-back selection', {
    text: 'ayyyef',
    line: 1,
    column: 2,
    mode: 'NORMAL',
  })
  await play(nullpad, 'l5.')
  await expectScreen(nullpad, 'l then 5. repeats ry on 3 letters', {
    text: 'ayyyyf',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
  await play(nullpad, 'u')
  await expectScreen(nullpad, 'u takes that repeat back', {
    text: 'ayyyef',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
})

test('r then Enter over VISUAL and V-LINE does nothing and keeps the selection', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef', [1, 2])
  await play(nullpad, 'vlr<CR>')
  await expectScreen(nullpad, 'vlr then Enter', {
    text: 'abcdef',
    line: 1,
    column: 3,
    mode: 'VISUAL',
    selection: 'bc',
  })
  expect(await pendingOf(nullpad), 'r is dropped').toBe('')
  await play(nullpad, 'd')
  await expectScreen(nullpad, 'd takes the kept selection', {
    text: 'adef',
    line: 1,
    column: 2,
    mode: 'NORMAL',
  })
  await begin(nullpad, 'ab\ncd')
  await play(nullpad, 'Vjr<CR>')
  await expectScreen(nullpad, 'Vjr then Enter', {
    text: 'ab\ncd',
    line: 2,
    column: 1,
    mode: 'V-LINE',
    selection: 'ab\ncd\n',
  })
})

test('r then Page Down or Page Up pages and drops r', async ({ nullpad }) => {
  for (const key of ['PageDown', 'PageUp']) {
    await begin(nullpad, 'abcdef')
    await play(nullpad, 'r')
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await pendingOf(nullpad), `${key} drops r`).toBe('')
    expect(await nullpad.text(), `${key} puts nothing`).toBe('abcdef')
    await play(nullpad, 'x')
    const text = await nullpad.text()
    expect(text.length, `the key after ${key} runs alone`).toBe(5)
    expect(text.includes('x'), `${key} left no r waiting`).toBe(false)
  }
})
