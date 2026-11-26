import { type Nullpad, expect, openFresh, settle, test } from './nullpad'

type Row = readonly [
  id: number,
  why: string,
  text: string,
  at: readonly [number, number],
  keys: string,
  after: string | null,
  line: number,
  column: number,
  mode: string,
  selection: string | null,
  afterP: string | null,
]

type Group = Readonly<{ name: string; rows: ReadonlyArray<Row> }>

const groups: ReadonlyArray<Group> = [
  {
    name: 'NORMAL: f F t T and counts',
    rows: [
      [
        1,
        'f lands on the next c',
        'abcabc xax',
        [1, 1],
        'fc',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        2,
        'a count finds the second c',
        'abcabc xax',
        [1, 1],
        '2fc',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        3,
        'too few c left: fails, cursor stays',
        'abcabc xax',
        [1, 1],
        '3fc',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        4,
        'absent letter: fails',
        'abcabc xax',
        [1, 1],
        'fz',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        5,
        'f skips the letter under the cursor',
        'abcabc xax',
        [1, 1],
        'fa',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        6,
        'nothing after the last letter: fails',
        'abcabc xax',
        [1, 10],
        'fx',
        null,
        1,
        10,
        'NORMAL',
        null,
        null,
      ],
      [
        7,
        't lands before the c',
        'abcabc xax',
        [1, 1],
        'tc',
        null,
        1,
        2,
        'NORMAL',
        null,
        null,
      ],
      [
        8,
        't with the letter right after the cursor: stays, does not fail',
        'abcabc xax',
        [1, 1],
        'tb',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        9,
        't with a count',
        'abcabc xax',
        [1, 1],
        '2tc',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        10,
        'F lands on the a before',
        'abcabc xax',
        [1, 10],
        'Fa',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
      ],
      [
        11,
        'F with a count',
        'abcabc xax',
        [1, 10],
        '2Fa',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        12,
        'F with too big a count fails',
        'abcabc xax',
        [1, 10],
        '3Fa',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        13,
        'F at the line start fails',
        'abcabc xax',
        [1, 1],
        'Fa',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        14,
        'T with the letter right before: stays',
        'abcabc xax',
        [1, 10],
        'Ta',
        null,
        1,
        10,
        'NORMAL',
        null,
        null,
      ],
      [
        15,
        'T lands after the c',
        'abcabc xax',
        [1, 10],
        'Tc',
        null,
        1,
        7,
        'NORMAL',
        null,
        null,
      ],
      [
        16,
        'T with a count',
        'abcabc xax',
        [1, 10],
        '2Tc',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        17,
        'count reaching the last a exactly',
        'a-a-a-a-a-a',
        [1, 1],
        '5fa',
        null,
        1,
        11,
        'NORMAL',
        null,
        null,
      ],
      [
        18,
        'one too many fails',
        'a-a-a-a-a-a',
        [1, 1],
        '6fa',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        19,
        'a huge count fails',
        'a-a-a-a-a-a',
        [1, 1],
        '9999999fa',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        20,
        't with a count where the first a is adjacent: the adjacent one counts',
        'a-a-a-a-a-a',
        [1, 2],
        '2ta',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        21,
        'f never crosses into the next line',
        'abc\nxcx',
        [1, 1],
        'fx',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        22,
        'F never crosses into the line above',
        'abc\nxcx',
        [2, 3],
        'Fa',
        null,
        2,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        23,
        'f finds a space',
        'abcabc xax',
        [1, 1],
        'f ',
        null,
        1,
        7,
        'NORMAL',
        null,
        null,
      ],
      [
        24,
        'a digit after f is the letter, not a count',
        'a1b2c1d2',
        [1, 1],
        'f2',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        25,
        'a count, then a digit letter',
        'a1b2c1d2',
        [1, 1],
        '2f1',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        26,
        'a quote after f is the letter, not a register',
        'say "hi" now',
        [1, 1],
        'f"',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        27,
        'count and quote',
        'say "hi" now',
        [1, 1],
        '2f"',
        null,
        1,
        8,
        'NORMAL',
        null,
        null,
      ],
      [
        28,
        'a register prefix does nothing to a motion',
        'abcabc xax',
        [1, 1],
        '"afc',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        29,
        'f then f looks for an f: none, fails',
        'abcabc xax',
        [1, 1],
        'ff',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
    ],
  },
  {
    name: 'NORMAL: f then a key that is not a letter',
    rows: [
      [
        30,
        'Esc cancels f; x then runs alone',
        'abcabc xax',
        [1, 1],
        'f<Esc>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        31,
        'count, f, Esc: the count is gone for x',
        'abcabc xax',
        [1, 1],
        '3f<Esc>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        32,
        'f then Enter fails; x runs',
        'abcabc xax',
        [1, 1],
        'f<CR>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        33,
        'f then Tab finds a tab',
        'a\tb\tc x',
        [1, 1],
        'f<Tab>',
        null,
        1,
        2,
        'NORMAL',
        null,
        null,
      ],
      [
        34,
        'the second tab',
        'a\tb\tc x',
        [1, 1],
        '2f<Tab>',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        35,
        'f then Backspace',
        'abcabc xax',
        [1, 1],
        'f<BS>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        36,
        'f then an arrow',
        'abcabc xax',
        [1, 1],
        'f<Left>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        37,
        'f then Delete',
        'abcabc xax',
        [1, 1],
        'f<Del>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        38,
        'f then Ctrl-C cancels (typed on a pty too, vimpty.out.txt); x runs',
        'abcabc xax',
        [1, 1],
        'f<C-c>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        39,
        'f then Ctrl-V: nothing found (pty too); x runs',
        'abcabc xax',
        [1, 1],
        'f<C-v>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        40,
        'f then a Ctrl chord: nothing found; x runs',
        'abcabc xax',
        [1, 1],
        'f<C-a>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
    ],
  },
  {
    name: 'NORMAL: ; and , with counts',
    rows: [
      [
        41,
        '; before any find does nothing',
        'abcabc xax',
        [1, 1],
        ';',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        42,
        ', before any find does nothing',
        'abcabc xax',
        [1, 1],
        ',',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        43,
        '; repeats fc',
        'abcabc xax',
        [1, 1],
        'fc;',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        44,
        'a third c is absent: the last ; fails',
        'abcabc xax',
        [1, 1],
        'fc;;',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        45,
        ', looks back for a c: none, fails',
        'abcabc xax',
        [1, 1],
        'fc,',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        46,
        ', after ; goes back',
        'abcabc xax',
        [1, 1],
        'fc;,',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        47,
        '; after F goes back',
        'abcabc xax',
        [1, 10],
        'Fc;',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        48,
        ', after F goes forward',
        'abcabc xax',
        [1, 10],
        'Fc;,',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        49,
        '; after t with the c adjacent skips it (no cpo-;)',
        'abcabc xax',
        [1, 1],
        'tc;',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        50,
        'second ; after t',
        'abcabc xax',
        [1, 1],
        'tc;;',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        51,
        't stayed beside b, ; skips that b',
        'abcabc xax',
        [1, 1],
        'tb;',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        52,
        '; after t with no later x fails',
        'axb',
        [1, 1],
        'tx;',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        53,
        'a count on ; after t: the adjacent a counts again (count is not 1)',
        'a-a-a-a-a-a',
        [1, 1],
        'ta3;',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        54,
        'a count of 1 on ; after t skips as ; does',
        'a-a-a-a-a-a',
        [1, 1],
        'ta1;',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        55,
        '2; after t',
        'a-a-a-a-a-a',
        [1, 1],
        'ta2;',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        56,
        '; after T with the a adjacent skips it',
        'abcabc xax',
        [1, 10],
        'Ta;',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        57,
        ', after t is T: with the x adjacent before, it skips; none left, fails',
        'x.x.x.x',
        [1, 1],
        'tx,',
        null,
        1,
        2,
        'NORMAL',
        null,
        null,
      ],
      [
        58,
        ', after T is t: the adjacent x is skipped',
        'x.x.x.x',
        [1, 7],
        'Tx,',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        59,
        ', after T from a dot: t onward, adjacent x skipped',
        'x.x.x.x',
        [1, 4],
        'Tx,',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        60,
        'a count on ;',
        'a-a-a-a-a-a',
        [1, 1],
        'fa2;',
        null,
        1,
        7,
        'NORMAL',
        null,
        null,
      ],
      [
        61,
        "; does not keep the find's count",
        'a-a-a-a-a-a',
        [1, 1],
        '2fa;',
        null,
        1,
        7,
        'NORMAL',
        null,
        null,
      ],
      [
        62,
        'a count on ,: forward from the end fails',
        'a-a-a-a-a-a',
        [1, 11],
        'Fa3,',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
      ],
      [
        63,
        '3, goes back three',
        'a-a-a-a-a-a',
        [1, 1],
        '4fa3,',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        64,
        'a count on ; that is too big fails',
        'a-a-a-a-a-a',
        [1, 1],
        'fa9;',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        65,
        'a failed find is still what ; repeats',
        'abcabc xax',
        [1, 1],
        'fc0fz;',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        66,
        'after a failed fz, , looks back for z',
        'abcabc xax',
        [1, 1],
        'fcfz,',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        67,
        '; from the line start',
        'abcabc xax',
        [1, 1],
        'fc;0;',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        68,
        'a cancelled f is not a find; ; before any find',
        'abcabc xax',
        [1, 1],
        'f<Esc>;',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        69,
        'a cancelled f keeps the last find',
        'abcabc xax',
        [1, 1],
        'fcf<Esc>;',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        70,
        'a register before ; is ignored',
        'abcabc xax',
        [1, 1],
        'fc"a;',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        71,
        'the last find is not tied to a line',
        'abc\nxcx',
        [1, 1],
        'fcj0;',
        null,
        2,
        2,
        'NORMAL',
        null,
        null,
      ],
    ],
  },
  {
    name: 'NORMAL: the column j and k keep',
    rows: [
      [
        72,
        'j after fx goes to the column of the x',
        'abcabc xax\nabcdefghijklm',
        [1, 1],
        'fxj',
        null,
        2,
        8,
        'NORMAL',
        null,
        null,
      ],
      [
        73,
        'j after ;',
        'abcabc xax\nabcdefghijklm',
        [1, 1],
        'fx;j',
        null,
        2,
        10,
        'NORMAL',
        null,
        null,
      ],
      [
        74,
        'F after $ sets the column again',
        'abcabc xax\nabcdefghijklm',
        [1, 1],
        '$Fbj',
        null,
        2,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        75,
        'a failed f after $ keeps the line end for j',
        'abc\nabcdef',
        [1, 1],
        '$fzj',
        null,
        2,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        76,
        'a failed f keeps the column fx set',
        'abcabc xax\nabcdefghijklm',
        [1, 1],
        'fxfzj',
        null,
        2,
        8,
        'NORMAL',
        null,
        null,
      ],
      [
        77,
        't from a b lands before the next b; j goes from there',
        'abcabc xax\nabcdefghijklm',
        [1, 2],
        'tbj',
        null,
        2,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        78,
        'T that did not move after $: the line end column is dropped',
        'abcabc xax\nabcdefghijklm',
        [1, 1],
        '$Taj',
        null,
        2,
        10,
        'NORMAL',
        null,
        null,
      ],
      [
        79,
        'a failed F after $ keeps the line end',
        'abcabc xax\nabcdefghijklm',
        [1, 1],
        '$Fzj',
        null,
        2,
        13,
        'NORMAL',
        null,
        null,
      ],
      [
        80,
        "f onto a tab: j goes from the tab's last screen column",
        'a\tbc\td\nabcdefghijkl',
        [1, 1],
        'f<Tab>j',
        null,
        2,
        8,
        'NORMAL',
        null,
        null,
      ],
      [
        81,
        't onto a tab',
        'a\tbc\td\nabcdefghijkl',
        [1, 1],
        'tbj',
        null,
        2,
        8,
        'NORMAL',
        null,
        null,
      ],
      [
        82,
        'f onto an emoji (two columns)',
        'a世b😀c\nabcdefgh',
        [1, 1],
        'f😀j',
        null,
        2,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        83,
        'f onto a wide letter',
        'a世b😀c\nabcdefgh',
        [1, 1],
        'f世j',
        null,
        2,
        2,
        'NORMAL',
        null,
        null,
      ],
    ],
  },
  {
    name: 'NORMAL: tabs, wide letters, emoji, accents, kana',
    rows: [
      [
        84,
        't before a tab',
        'a\tb\tc x',
        [1, 1],
        't<Tab>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        85,
        'F back to a tab',
        'a\tb\tc x',
        [1, 5],
        'F<Tab>',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        86,
        'f across a tab',
        'a\tb\tc x',
        [1, 1],
        'fc',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        87,
        'a wide letter',
        'a世b世c😀d😀e',
        [1, 1],
        'f世',
        null,
        1,
        2,
        'NORMAL',
        null,
        null,
      ],
      [
        88,
        'the second wide letter',
        'a世b世c😀d😀e',
        [1, 1],
        '2f世',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        89,
        'an emoji',
        'a世b世c😀d😀e',
        [1, 1],
        'f😀',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        90,
        '; to the next emoji',
        'a世b世c😀d😀e',
        [1, 1],
        'f😀;',
        null,
        1,
        8,
        'NORMAL',
        null,
        null,
      ],
      [
        91,
        't before an emoji',
        'a世b世c😀d😀e',
        [1, 1],
        't😀',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        92,
        'T after a wide letter',
        'a世b世c😀d😀e',
        [1, 9],
        'T世',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        93,
        'a precomposed é',
        'café é x',
        [1, 1],
        'fé',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        94,
        '; to the next precomposed é',
        'café é x',
        [1, 1],
        'fé;',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        95,
        'decomposed é: does f e find the e under the accent?',
        'cafe\u0301 e\u0301 x',
        [1, 1],
        'fe',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        96,
        'decomposed é typed as e and a combining accent',
        'cafe\u0301 e\u0301 x',
        [1, 1],
        'fe\u0301',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        97,
        'f to a lone combining accent',
        'cafe\u0301 e\u0301 x',
        [1, 1],
        'f\u0301',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        98,
        'precomposed é is not an e',
        'café é x',
        [1, 1],
        'fe',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        99,
        'a ZWJ family typed as the letter',
        'a👨\u200d👩\u200d👧b\u{1f1eb}\u{1f1f7}c👨\u200d👩\u200d👧d',
        [1, 1],
        'f👨\u200d👩\u200d👧',
        null,
        1,
        2,
        'NORMAL',
        null,
        null,
      ],
      [
        100,
        'the first code point of the family',
        'a👨\u200d👩\u200d👧b\u{1f1eb}\u{1f1f7}c👨\u200d👩\u200d👧d',
        [1, 1],
        'f👨',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        101,
        'a flag typed as the letter',
        'a👨\u200d👩\u200d👧b\u{1f1eb}\u{1f1f7}c👨\u200d👩\u200d👧d',
        [1, 1],
        'f\u{1f1eb}\u{1f1f7}',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        102,
        'f across a family and a flag',
        'a👨\u200d👩\u200d👧b\u{1f1eb}\u{1f1f7}c👨\u200d👩\u200d👧d',
        [1, 1],
        'fc',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        103,
        'a kana, as an IME commits it',
        'あいうえおう',
        [1, 1],
        'fう',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        104,
        '; to the next kana',
        'あいうえおう',
        [1, 1],
        'fう;',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
    ],
  },
  {
    name: 'operators d c y',
    rows: [
      [
        105,
        'f is inclusive: the c goes too',
        'abcabc xax',
        [1, 1],
        'dfc',
        'abc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        106,
        't is inclusive, up to the letter before c',
        'abcabc xax',
        [1, 1],
        'dtc',
        'cabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        107,
        'a count after d',
        'abcabc xax',
        [1, 1],
        'd2fc',
        ' xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        108,
        'a count before d',
        'abcabc xax',
        [1, 1],
        '2dfc',
        ' xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        109,
        'the counts multiply: d4fa',
        'a-a-a-a-a-a',
        [1, 1],
        '2d2fa',
        '-a',
        1,
        1,
        'NORMAL',
        null,
        'a-a-a-a-a-a',
      ],
      [
        110,
        'd4fc fails: nothing changes',
        'abcabc xax',
        [1, 1],
        '2d2fc',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        111,
        'a failed find cancels d, no register',
        'abcabc xax',
        [1, 1],
        'dfz',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        112,
        'after the cancelled d, x runs alone',
        'abcabc xax',
        [1, 1],
        'dfzx',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        113,
        'F is exclusive: the letter under the cursor stays',
        'abcabc xax',
        [1, 10],
        'dFa',
        'abcabc xx',
        1,
        9,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        114,
        'dF to the line start',
        'abcabc xax',
        [1, 3],
        'dFa',
        'cabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        115,
        'T is exclusive',
        'abcabc xax',
        [1, 10],
        'dTc',
        'abcabcx',
        1,
        7,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        116,
        'T that did not move: nothing to delete',
        'abcabc xax',
        [1, 10],
        'dTa',
        null,
        1,
        10,
        'NORMAL',
        null,
        null,
      ],
      [
        117,
        'an empty dTa: is it what dot repeats?',
        'abcabc xax',
        [1, 1],
        'x$dTa0.',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        118,
        'cT that did not move: an empty change still types',
        'abcabc xax',
        [1, 10],
        'cTaX<Esc>',
        'abcabc xaXx',
        1,
        10,
        'NORMAL',
        null,
        null,
      ],
      [
        119,
        't that did not move, inclusive: does d take the letter under the cursor?',
        'abcabc xax',
        [1, 1],
        'dtb',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        120,
        'y with a t that did not move',
        'abcabc xax',
        [1, 1],
        'ytb',
        null,
        1,
        1,
        'NORMAL',
        null,
        'aabcabc xax',
      ],
      [
        121,
        'y to before c, cursor stays',
        'abcabc xax',
        [1, 1],
        'ytc',
        null,
        1,
        1,
        'NORMAL',
        null,
        'ababcabc xax',
      ],
      [
        122,
        'y through c, cursor stays',
        'abcabc xax',
        [1, 1],
        'yfc',
        null,
        1,
        1,
        'NORMAL',
        null,
        'abcabcabc xax',
      ],
      [
        123,
        'yF moves the cursor to the start of the yank',
        'abcabc xax',
        [1, 10],
        'yFa',
        null,
        1,
        9,
        'NORMAL',
        null,
        'abcabc xaax',
      ],
      [
        124,
        'yT moves the cursor too',
        'abcabc xax',
        [1, 10],
        'yTc',
        null,
        1,
        7,
        'NORMAL',
        null,
        'abcabc xa xax',
      ],
      [
        125,
        'c through c',
        'abcabc xax',
        [1, 1],
        'cfcX<Esc>',
        'Xabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcXabc xax',
      ],
      [
        126,
        'c to before c',
        'abcabc xax',
        [1, 1],
        'ctcX<Esc>',
        'Xcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abXcabc xax',
      ],
      [
        127,
        'cF, exclusive',
        'abcabc xax',
        [1, 10],
        'cFaX<Esc>',
        'abcabc xXx',
        1,
        9,
        'NORMAL',
        null,
        'abcabc xaXx',
      ],
      [
        128,
        'ct that did not move changes the letter under the cursor',
        'abcabc xax',
        [1, 1],
        'ctbX<Esc>',
        'Xbcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'aXbcabc xax',
      ],
      [
        129,
        'a register',
        'abcabc xax',
        [1, 1],
        '"adfc',
        'abc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        130,
        'the black hole register',
        'abcabc xax',
        [1, 1],
        '"_dfc',
        'abc xax',
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
    ],
  },
  {
    name: 'operators with ; and , and failures',
    rows: [
      [
        131,
        'd, f, Esc: d is cancelled, x runs',
        'abcabc xax',
        [1, 1],
        'df<Esc>x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        132,
        'd; with no last find: cancelled, x runs',
        'abcabc xax',
        [1, 1],
        'd;x',
        'bcabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        133,
        'd; repeats fc under d, inclusive',
        'abcabc xax',
        [1, 1],
        'fcd;',
        'ab xax',
        1,
        3,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        134,
        'd, after ; goes back, exclusive',
        'abcabc xax',
        [1, 1],
        'fc;d,',
        'abc xax',
        1,
        3,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        135,
        'd; after t skips the adjacent c',
        'abcabc xax',
        [1, 1],
        'tcd;',
        'ac xax',
        1,
        2,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        136,
        '2d; after t: no skip, the adjacent c is the first; lands before the second',
        'abcabc xax',
        [1, 1],
        'tc2d;',
        'ac xax',
        1,
        2,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        137,
        'd; after F: backward and exclusive',
        'abcabc xax',
        [1, 10],
        'Fcd;',
        'abc xax',
        1,
        3,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        138,
        'd, after F: forward and inclusive',
        'abcabc xax',
        [1, 10],
        'Fcd,',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        139,
        'y; leaves the cursor',
        'abcabc xax',
        [1, 1],
        'fcy;',
        null,
        1,
        3,
        'NORMAL',
        null,
        'abcabccabc xax',
      ],
      [
        140,
        'c;',
        'abcabc xax',
        [1, 1],
        'fcc;X<Esc>',
        'abX xax',
        1,
        3,
        'NORMAL',
        null,
        'abcabcX xax',
      ],
      [
        141,
        'dfc sets the last find',
        'abcabc xax',
        [1, 1],
        'dfc;',
        'abc xax',
        1,
        3,
        'NORMAL',
        null,
        'ababcc xax',
      ],
      [
        142,
        'a failed dfz still sets the last find',
        'abcabc xax',
        [1, 1],
        'dfz;',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        143,
        'yfc sets the last find too',
        'abcabc xax',
        [1, 1],
        'yfc,',
        null,
        1,
        1,
        'NORMAL',
        null,
        'abcabcabc xax',
      ],
      [
        144,
        'd with f never crosses a line',
        'abc\nxcx',
        [1, 1],
        'dfx',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        145,
        'd to a tab',
        'a\tb\tc x',
        [1, 1],
        'df<Tab>',
        'b\tc x',
        1,
        1,
        'NORMAL',
        null,
        'a\tb\tc x',
      ],
      [
        146,
        'd before an emoji',
        'a世b世c😀d😀e',
        [1, 1],
        'dt😀',
        '😀d😀e',
        1,
        1,
        'NORMAL',
        null,
        'a世b世c😀d😀e',
      ],
      [
        147,
        'dF to a wide letter',
        'a世b世c😀d😀e',
        [1, 9],
        'dF世',
        'a世be',
        1,
        4,
        'NORMAL',
        null,
        'a世b世c😀d😀e',
      ],
    ],
  },
  {
    name: 'dot and undo',
    rows: [
      [
        148,
        'dot repeats dfc',
        'abcabcabc xax',
        [1, 1],
        'dfc.',
        'abc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        149,
        'dot keeps its own c; the dot does not change what ; repeats (still b)',
        'abcabcabc xax',
        [1, 1],
        'dfcfb.;',
        'aabc xax',
        1,
        3,
        'NORMAL',
        null,
        'aabcbc xax',
      ],
      [
        150,
        'dot keeps its own letter after another find',
        'abcabcabc xax',
        [1, 1],
        'dfcfb.',
        'aabc xax',
        1,
        2,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        151,
        'the dot of d; reads the newest find',
        'abcabcabc xax',
        [1, 1],
        'fcd;0fa.',
        'abx',
        1,
        3,
        'NORMAL',
        null,
        'ababc xax',
      ],
      [
        152,
        'dot of dt: the c beside the cursor (a fresh t, no skip)',
        'abcabcabc xax',
        [1, 1],
        'dtc.',
        'cabc xax',
        1,
        1,
        'NORMAL',
        null,
        'cabcabc xax',
      ],
      [
        153,
        'dot of dfa',
        'a-a-a-a-a-a',
        [1, 1],
        'dfa.',
        '-a-a-a',
        1,
        1,
        'NORMAL',
        null,
        '-a-a-a-a',
      ],
      [
        154,
        'a count before dot replaces the count',
        'a-a-a-a-a-a',
        [1, 1],
        'dfa2.',
        '-a-a',
        1,
        1,
        'NORMAL',
        null,
        '-a-a-a-a',
      ],
      [
        155,
        'dot keeps the count',
        'a-a-a-a-a-a',
        [1, 1],
        '2dfa.',
        '-a',
        1,
        1,
        'NORMAL',
        null,
        '-a-a-a',
      ],
      [
        156,
        'the new count stays for the next dot',
        'a-a-a-a-a-a',
        [1, 1],
        'dfa2..',
        '',
        1,
        1,
        'NORMAL',
        null,
        '-a-a',
      ],
      [
        157,
        'a failed dfz is not what dot repeats',
        'abcabc xax',
        [1, 1],
        'xdfz.',
        'cabc xax',
        1,
        1,
        'NORMAL',
        null,
        'bcabc xax',
      ],
      [
        158,
        'a yank is not what dot repeats',
        'abcabc xax',
        [1, 1],
        'xyfc.',
        'cabc xax',
        1,
        1,
        'NORMAL',
        null,
        'bcabc xax',
      ],
      [
        159,
        'a motion is not what dot repeats',
        'abcabc xax',
        [1, 1],
        'xfc.',
        'babc xax',
        1,
        2,
        'NORMAL',
        null,
        'bcabc xax',
      ],
      [
        160,
        'after a failed dfz, dot still repeats dfc',
        'abcabc xax',
        [1, 1],
        'dfcdfz.',
        ' xax',
        1,
        1,
        'NORMAL',
        null,
        'abc xax',
      ],
      [
        161,
        'dot of a change with a find',
        'a-a-a-a-a-a',
        [1, 1],
        'cfaX<Esc>l.',
        'XX-a-a-a',
        1,
        2,
        'NORMAL',
        null,
        'X-aX-a-a-a',
      ],
      [
        162,
        'a register before dot',
        'abcabcabc xax',
        [1, 1],
        'dfc"a.',
        'abc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        163,
        'dot of d; after t: skips again',
        'abcabc xax',
        [1, 1],
        'tcd;.',
        'ac xax',
        1,
        2,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        164,
        'dot of d, : back again',
        'abcabc xax',
        [1, 1],
        'fcd,.',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
      ],
      [
        165,
        'after Fz (backward), dot still finds forward',
        'abcabcabc xax',
        [1, 1],
        'dfcFz.',
        'abc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        166,
        'undo of dfc, cursor',
        'abcabc xax',
        [1, 1],
        'dfcu',
        null,
        1,
        1,
        'NORMAL',
        null,
        'abcabcabc xax',
      ],
      [
        167,
        'undo of dFa, cursor',
        'abcabc xax',
        [1, 10],
        'dFau',
        null,
        1,
        9,
        'NORMAL',
        null,
        'abcabc xaax',
      ],
      [
        168,
        'redo of dfc',
        'abcabc xax',
        [1, 1],
        'dfcu<C-r>',
        'abc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        169,
        'undo after a find: the cursor goes back',
        'abcabc xax',
        [1, 1],
        'xfcu',
        null,
        1,
        1,
        'NORMAL',
        null,
        'aabcabc xax',
      ],
      [
        170,
        'undo of d;',
        'abcabc xax',
        [1, 1],
        'fcd;u',
        null,
        1,
        3,
        'NORMAL',
        null,
        'abcabccabc xax',
      ],
    ],
  },
  {
    name: 'VISUAL',
    rows: [
      [
        171,
        'the selection grows to the c',
        'abcabc xax',
        [1, 1],
        'vfc',
        null,
        1,
        3,
        'VISUAL',
        'abc',
        null,
      ],
      [
        172,
        'then d deletes through the c',
        'abcabc xax',
        [1, 1],
        'vfcd',
        'abc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        173,
        'a failed find leaves the selection',
        'abcabc xax',
        [1, 1],
        'vfz',
        null,
        1,
        1,
        'VISUAL',
        'a',
        null,
      ],
      [
        174,
        'after a failed find d deletes the old selection',
        'abcabc xax',
        [1, 1],
        'vlfzd',
        'cabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        175,
        'a count',
        'abcabc xax',
        [1, 1],
        'v2fc',
        null,
        1,
        6,
        'VISUAL',
        'abcabc',
        null,
      ],
      [
        176,
        '; in VISUAL',
        'abcabc xax',
        [1, 1],
        'vtc;',
        null,
        1,
        5,
        'VISUAL',
        'abcab',
        null,
      ],
      [
        177,
        '; then d',
        'abcabc xax',
        [1, 1],
        'vtc;d',
        'c xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        178,
        'F in VISUAL: the cursor end goes back',
        'abcabc xax',
        [1, 10],
        'vFa',
        null,
        1,
        9,
        'VISUAL',
        'ax',
        null,
      ],
      [
        179,
        'T in VISUAL, then d',
        'abcabc xax',
        [1, 10],
        'vTcd',
        'abcabc',
        1,
        6,
        'NORMAL',
        null,
        'abcab xaxc',
      ],
      [
        180,
        'the find in VISUAL is the last find after Esc',
        'abcabc xax',
        [1, 1],
        'vfc<Esc>;',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
      ],
      [
        181,
        'a NORMAL find, then ; in VISUAL',
        'abcabc xax',
        [1, 1],
        'fcv;',
        null,
        1,
        6,
        'VISUAL',
        'cabc',
        null,
      ],
      [
        182,
        '; from the other end',
        'abcabc xax',
        [1, 1],
        'vfco;',
        null,
        1,
        3,
        'VISUAL',
        'c',
        null,
      ],
      [
        183,
        'f then Esc in VISUAL: f drops, the selection stays',
        'abcabc xax',
        [1, 1],
        'vlf<Esc>d',
        'cabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        184,
        'mode after f Esc in VISUAL',
        'abcabc xax',
        [1, 1],
        'vf<Esc>',
        null,
        1,
        1,
        'VISUAL',
        'a',
        null,
      ],
      [
        185,
        'f then Ctrl-C in VISUAL: f drops, the selection stays (pty too)',
        'abcabc xax',
        [1, 1],
        'vlf<C-c>d',
        'cabc xax',
        1,
        1,
        'NORMAL',
        null,
        'abcabc xax',
      ],
      [
        186,
        'F from the line break in VISUAL',
        'abcabc xax',
        [1, 1],
        'v$Fa',
        null,
        1,
        9,
        'VISUAL',
        'abcabc xa',
        null,
      ],
      [
        187,
        'f from the line break fails',
        'abcabc xax',
        [1, 1],
        'v$fa',
        null,
        1,
        11,
        'VISUAL',
        'abcabc xax\n',
        null,
      ],
      [
        188,
        'dot of a visual d after a find: same amount',
        'abcabc xax',
        [1, 1],
        'vfcd.',
        ' xax',
        1,
        1,
        'NORMAL',
        null,
        'abc xax',
      ],
      [
        189,
        'undo',
        'abcabc xax',
        [1, 1],
        'vfcdu',
        null,
        1,
        1,
        'NORMAL',
        null,
        'abcabcabc xax',
      ],
      [
        190,
        'y leaves the cursor at the start',
        'abcabc xax',
        [1, 1],
        'vfcy',
        null,
        1,
        1,
        'NORMAL',
        null,
        'abcabcabc xax',
      ],
      [
        191,
        'gv after',
        'abcabc xax',
        [1, 1],
        'vfcygv',
        null,
        1,
        3,
        'VISUAL',
        'abc',
        null,
      ],
      [
        192,
        'the column j keeps after f in VISUAL',
        'abcabc xax\nabcdefghijklm',
        [1, 1],
        'vfxj',
        null,
        2,
        8,
        'VISUAL',
        'abcabc xax\nabcdefgh',
        null,
      ],
      [
        193,
        '; after the visual d',
        'abcabc xax',
        [1, 1],
        'vfcd;',
        'abc xax',
        1,
        3,
        'NORMAL',
        null,
        'ababcc xax',
      ],
      [
        194,
        't that does not move in VISUAL',
        'abcabc xax',
        [1, 1],
        'vtb',
        null,
        1,
        1,
        'VISUAL',
        'a',
        null,
      ],
      [
        195,
        '; after it skips the b',
        'abcabc xax',
        [1, 1],
        'vtb;',
        null,
        1,
        4,
        'VISUAL',
        'abca',
        null,
      ],
      [
        196,
        'a count on ; in VISUAL',
        'a-a-a-a-a-a',
        [1, 1],
        'vfa2;',
        null,
        1,
        7,
        'VISUAL',
        'a-a-a-a',
        null,
      ],
      [
        197,
        'a count too big in VISUAL: the selection stays',
        'abcabc xax',
        [1, 1],
        'v3fc',
        null,
        1,
        1,
        'VISUAL',
        'a',
        null,
      ],
      [
        198,
        "f on the cursor end's line",
        'abc\nxcx',
        [1, 1],
        'vjfc',
        null,
        2,
        2,
        'VISUAL',
        'abc\nxc',
        null,
      ],
    ],
  },
  {
    name: 'V-LINE and V-BLOCK',
    rows: [
      [
        199,
        'V then f: the cursor moves, the lines stay',
        'one.two.three\nfour.five\n\nsix.seven',
        [1, 1],
        'Vf.',
        null,
        1,
        4,
        'V-LINE',
        'one.two.three\n',
        null,
      ],
      [
        200,
        'V, j, f, d deletes the lines',
        'one.two.three\nfour.five\n\nsix.seven',
        [1, 1],
        'Vjf.d',
        '\nsix.seven',
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        201,
        'a failed find in V-LINE',
        'one.two.three\nfour.five\n\nsix.seven',
        [1, 1],
        'Vfz',
        null,
        1,
        1,
        'V-LINE',
        'one.two.three\n',
        null,
      ],
      [
        202,
        'count, then ;',
        'one.two.three\nfour.five\n\nsix.seven',
        [1, 1],
        'V2f.;',
        null,
        1,
        8,
        'V-LINE',
        'one.two.three\n',
        null,
      ],
      [
        203,
        'the last find after V-LINE',
        'one.two.three\nfour.five\n\nsix.seven',
        [1, 1],
        'Vf.<Esc>,',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
      ],
      [
        204,
        'f moves the cursor corner on its line',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>jf.',
        null,
        2,
        3,
        'V-BLOCK',
        'a.b\nab.',
        null,
      ],
      [
        205,
        'then d deletes the block',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>jf.d',
        '.c.d\ncd.ef\na.\n\nx.y.z.w',
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        206,
        '; in a block',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>jf.;d',
        'd\nef\na.\n\nx.y.z.w',
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        207,
        '; fails on a short line, the block stays',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>jjf.;',
        null,
        3,
        2,
        'V-BLOCK',
        'a.\nab\na.',
        null,
      ],
      [
        208,
        'f, then j',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>f.jd',
        'b.c.d\n.cd.ef\na.\n\nx.y.z.w',
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        209,
        'F in a block',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 7],
        '<C-v>jF.d',
        'a.b.c\nab.cdf\na.\n\nx.y.z.w',
        1,
        5,
        'NORMAL',
        null,
        null,
      ],
      [
        210,
        't in a block, y',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>jt.y',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        211,
        'dot of a block d after a find',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>jf.dj0.',
        '.c.d\nef\n\n\nx.y.z.w',
        2,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        212,
        'a failed find leaves the block',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>jfz',
        null,
        2,
        1,
        'V-BLOCK',
        'a\na',
        null,
      ],
      [
        213,
        'F from a $ block',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>$F.d',
        'd\nab.cd.ef\na.\n\nx.y.z.w',
        1,
        1,
        'NORMAL',
        null,
        null,
      ],
      [
        214,
        'gv after the block d',
        'a.b.c.d\nab.cd.ef\na.\n\nx.y.z.w',
        [1, 1],
        '<C-v>jf.dgv',
        '.c.d\ncd.ef\na.\n\nx.y.z.w',
        2,
        3,
        'V-BLOCK',
        '.c.\ncd.',
        null,
      ],
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
  '<Home>': 'Home',
  '<End>': 'End',
  '<C-r>': 'Control+r',
  '<C-[>': 'Control+[',
  '<C-v>': 'Control+v',
  '<C-c>': 'Control+c',
  '<C-a>': 'Control+a',
  '<C-x>': 'Control+x',
}

const tokensOf = (keys: string): ReadonlyArray<string> =>
  keys
    .split(/(<[A-Za-z-[\]]+>)/u)
    .flatMap(part =>
      part in keyNames
        ? [part]
        : (part.match(/[\x20-\x7e]|[^\x20-\x7e]+/gu) ?? []),
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
  const [
    id,
    why,
    text,
    at,
    keys,
    after,
    line,
    column,
    mode,
    selection,
    afterP,
  ] = row
  await begin(nullpad, text, at)
  await play(nullpad, keys)
  const label = `row ${id} (${why}) keys ${keys} at ${at.join(':')}`
  await expectScreen(nullpad, label, {
    text: after ?? text,
    line,
    column,
    mode,
    ...(selection === null ? {} : { selection }),
  })
  if (afterP !== null) {
    await play(nullpad, 'P')
    expect
      .soft(await nullpad.text(), `${label}: P puts the unnamed register`)
      .toBe(afterP)
  }
}

for (const group of groups) {
  const half = Math.ceil(group.rows.length / 2)
  const parts =
    group.rows.length > 16
      ? [group.rows.slice(0, half), group.rows.slice(half)]
      : [group.rows]
  for (const rows of parts) {
    test(`find ${group.name} as in Vim (rows ${rows.map(row => row[0]).join(', ')})`, async ({
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

const openFinder = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
}

const startNote = async (nullpad: Nullpad, firstLine: string) => {
  await openFinder(nullpad)
  await nullpad.type(firstLine)
  for (let i = 0; i < 20; i++) {
    const selected = (await nullpad.finder())?.rows.find(row => row.selected)
    if (selected?.text.startsWith('+ new note')) {
      break
    }
    await nullpad.press('ArrowDown')
  }
  await nullpad.press('Enter')
}

test('a find waits for its letter and .status .pending reads f, 2f, 2df and the VISUAL f', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'f')
  expect(await pendingOf(nullpad), 'f alone').toBe('f')
  await play(nullpad, 'c')
  expect(await pendingOf(nullpad), 'nothing pending after the letter').toBe('')
  await play(nullpad, '2f')
  expect(await pendingOf(nullpad), 'a count before f').toBe('2f')
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'Esc empties it').toBe('')
  await play(nullpad, '2df')
  expect(await pendingOf(nullpad), 'a count, d and f').toBe('2df')
  await play(nullpad, '<Esc>')
  for (const key of ['F', 't', 'T']) {
    await play(nullpad, key)
    expect(await pendingOf(nullpad), `${key} alone`).toBe(key)
    await play(nullpad, '<Esc>')
  }
  await play(nullpad, 'vf')
  expect(await modeOf(nullpad), 'still VISUAL while f waits').toBe('VISUAL')
  expect(await pendingOf(nullpad), 'f in VISUAL').toBe('f')
  await play(nullpad, 'c')
  expect(await pendingOf(nullpad), 'done').toBe('')
  expect(await nullpad.selection(), 'the selection grew to the c').toBe('abc')
})

for (const key of [
  'Escape',
  'Control+[',
  'Control+c',
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Control+x',
]) {
  test(`f then ${key} changes nothing, drops the count, and the next key runs on its own`, async ({
    nullpad,
  }) => {
    await begin(nullpad, 'abcdef', [1, 3])
    await play(nullpad, '2f')
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await nullpad.text(), 'text after the cancelled f').toBe('abcdef')
    expect(await pendingOf(nullpad), 'nothing pending, the count is gone').toBe(
      '',
    )
    expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
    await play(nullpad, 'x')
    expect(
      (await nullpad.text()).length,
      'x deleted one letter, the count did not carry',
    ).toBe(5)
  })
}

test('a cancelled f keeps the Ctrl-C keydown from the browser and is no find', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'fc')
  await nullpad.page.evaluate(() => {
    const seen: Array<{ key: string; prevented: boolean }> = []
    Object.assign(window, { keysSeen: seen })
    window.addEventListener('keydown', event =>
      seen.push({ key: event.key, prevented: event.defaultPrevented }),
    )
  })
  await play(nullpad, 'f<C-c>')
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
  await play(nullpad, '0;')
  expect(
    await nullpad.status(),
    'the cancelled f left the last find as fc',
  ).toMatchObject({ line: 1, column: 3 })
})

test('f then Enter finds nothing and becomes the last find, so ; then finds nothing too', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'fc')
  await play(nullpad, 'f<CR>')
  expect(await nullpad.status(), 'Enter found nothing').toMatchObject({
    line: 1,
    column: 3,
  })
  expect(await pendingOf(nullpad), 'Enter was taken as the letter').toBe('')
  await play(nullpad, ';')
  expect(
    await nullpad.status(),
    '; looks for the Enter, not for the c',
  ).toMatchObject({ line: 1, column: 3 })
  expect(await nullpad.text(), 'no line break was typed').toBe('abcabc xax')
})

test('f then Ctrl-E opens the read view and f then Ctrl-P opens the finder, each dropping f', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'f')
  await nullpad.page.keyboard.press('Control+e')
  expect(await modeOf(nullpad), 'Ctrl-E opens the read view').toBe('READ')
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'back in NORMAL').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'f is gone').toBe('')
  await play(nullpad, 'f')
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'f is gone after the finder').toBe('')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x runs on its own').toBe('bcabc xax')
})

test('f then Page Down or Page Up pages and drops f', async ({ nullpad }) => {
  for (const key of ['PageDown', 'PageUp']) {
    await begin(nullpad, 'abcdef')
    await play(nullpad, 'f')
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await pendingOf(nullpad), `${key} drops f`).toBe('')
    await play(nullpad, 'x')
    expect(
      (await nullpad.text()).length,
      `the key after ${key} runs alone`,
    ).toBe(5)
  }
})

test('the last find stays when another note is opened and when vim goes off and on, and a reload forgets it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'fc')
  await nullpad.page.waitForTimeout(1100)
  await startNote(nullpad, 'zzczzc')
  expect(await modeOf(nullpad), 'another note opens in NORMAL').toBe('NORMAL')
  expect(await nullpad.text(), 'the new note').toBe('zzczzc')
  await play(nullpad, 'gg0;')
  expect(
    await nullpad.status(),
    '; in the other note repeats fc',
  ).toMatchObject({ line: 1, column: 3 })
  await play(nullpad, '0')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  await play(nullpad, 'gg0;')
  expect(
    await nullpad.status(),
    '; after vim off and on repeats fc',
  ).toMatchObject({ line: 1, column: 3 })
  await nullpad.page.waitForTimeout(1100)
  await nullpad.reload()
  expect(await modeOf(nullpad), 'vim stays on after a reload').toBe('NORMAL')
  await play(nullpad, 'gg0;')
  expect(await nullpad.status(), 'a reload forgot the last find').toMatchObject(
    {
      line: 1,
      column: 1,
    },
  )
  await play(nullpad, ',')
  expect(await nullpad.status(), 'and , too').toMatchObject({
    line: 1,
    column: 1,
  })
})

test('a letter chosen in an IME after f, F, t and df is the letter, and IME text of two letters cancels f', async ({
  nullpad,
}) => {
  await begin(nullpad, 'あいにえおにか')
  await play(nullpad, 'f')
  await nullpad.compose('n')
  await nullpad.compose('に')
  await nullpad.commit('に')
  await expectScreen(nullpad, 'f then an IME に', {
    text: 'あいにえおにか',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
  expect(await pendingOf(nullpad), 'f is done').toBe('')
  await play(nullpad, '0t')
  await nullpad.commit('に')
  expect(await nullpad.status(), 't then an IME に').toMatchObject({
    line: 1,
    column: 2,
  })
  await play(nullpad, '$F')
  await nullpad.commit('に')
  expect(await nullpad.status(), 'F then an IME に').toMatchObject({
    line: 1,
    column: 6,
  })
  await play(nullpad, ';')
  expect(
    await nullpad.status(),
    '; repeats the IME letter backwards',
  ).toMatchObject({
    line: 1,
    column: 3,
  })
  await play(nullpad, '0df')
  await nullpad.commit('に')
  await expectScreen(nullpad, 'df then an IME に', {
    text: 'えおにか',
    line: 1,
    column: 1,
    mode: 'NORMAL',
  })
  await play(nullpad, 'f')
  await nullpad.compose('ね')
  await nullpad.compose('')
  expect(await pendingOf(nullpad), 'a cancelled composition keeps f').toBe('f')
  await nullpad.commit('おに')
  expect(await pendingOf(nullpad), 'two letters while f waits drop f').toBe('')
  expect(await nullpad.text(), 'and change nothing').toBe('えおにか')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x then runs on its own').toBe('おにか')
  await play(nullpad, 'vf')
  await nullpad.commit('か')
  expect(await modeOf(nullpad), 'VISUAL f with an IME letter').toBe('VISUAL')
  expect(await nullpad.selection(), 'selects to か').toBe('おにか')
})

test('a single letter that arrives as a typed key with text, such as a dead key makes, is the letter', async ({
  nullpad,
}) => {
  await begin(nullpad, 'ab^cd^e')
  await play(nullpad, 'f')
  await typeKeyWithText(nullpad, '^')
  await expectScreen(nullpad, 'f then ^', {
    text: 'ab^cd^e',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
  await play(nullpad, ';')
  expect(await nullpad.status(), '; finds the second ^').toMatchObject({
    line: 1,
    column: 6,
  })
})

test('after a find k and j keep the column of the letter found: the last column of a tab, the first of a wide letter', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdefghijkl\na\tbx\ty', [2, 1])
  await play(nullpad, 'f<Tab>k')
  await expectScreen(nullpad, 'f Tab then k', {
    text: 'abcdefghijkl\na\tbx\ty',
    line: 1,
    column: 8,
    mode: 'NORMAL',
  })
  await play(nullpad, 'j0')
  await play(nullpad, '2f<Tab>k')
  expect(
    await nullpad.status(),
    'the second tab ends at column 16, the line above ends at 12',
  ).toMatchObject({ line: 1, column: 12 })
  await begin(nullpad, 'abcdefghi\na世bcdef', [2, 1])
  await play(nullpad, 'f世k')
  expect(await nullpad.status(), 'f of a wide letter then k').toMatchObject({
    line: 1,
    column: 2,
  })
  await begin(nullpad, 'abcdef\nabcdefgh', [1, 1])
  await play(nullpad, '$fzj')
  expect(
    await nullpad.status(),
    'a failed find keeps the line end after $',
  ).toMatchObject({ line: 2, column: 8 })
  await play(nullpad, 'k')
  expect(await nullpad.status(), 'and k too').toMatchObject({
    line: 1,
    column: 6,
  })
})

test('a find that fails leaves the column that j and k keep, and one that works sets it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax\nabcdefghijklm\nabcdefghijklm', [1, 1])
  await play(nullpad, 'fxjj')
  expect(await nullpad.status(), 'fx then j j').toMatchObject({
    line: 3,
    column: 8,
  })
  await play(nullpad, 'fqk')
  expect(
    await nullpad.status(),
    'a failed fq keeps the column of the x',
  ).toMatchObject({ line: 2, column: 8 })
})

test('dfx and yfx write the unnamed register, and a failed df writes none', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'dfcp')
  await expectScreen(nullpad, 'dfc then p', {
    text: 'aabcbc xax',
    line: 1,
    column: 4,
    mode: 'NORMAL',
  })
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'yfc$p')
  await expectScreen(nullpad, 'yfc then $p', {
    text: 'abcabc xaxabc',
    line: 1,
    column: 13,
    mode: 'NORMAL',
  })
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'yfcdtb"0p')
  await expectScreen(nullpad, 'yfc, dtb, then "0p puts the yank', {
    text: 'babccabc xax',
    line: 1,
    column: 4,
    mode: 'NORMAL',
  })
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'yfcdtbp')
  expect(await nullpad.text(), 'p puts the delete').toBe('bacabc xax')
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'yldfzp')
  expect(
    await nullpad.text(),
    'a failed dfz wrote no register, so p puts the yank',
  ).toBe('aabcabc xax')
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, '"adfc$"ap')
  expect(await nullpad.text(), '"a takes the delete').toBe('abc xaxabc')
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, '$yFa0P')
  expect(await nullpad.text(), 'yFa put back before the first letter').toBe(
    'aabcabc xax',
  )
})

test('after yFx and yTx the cursor goes back to where the yank starts, after yfx and ytx it stays', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax', [1, 10])
  await play(nullpad, 'yFa')
  expect(await nullpad.status(), 'yFa').toMatchObject({ line: 1, column: 9 })
  await begin(nullpad, 'abcabc xax', [1, 10])
  await play(nullpad, 'yTc')
  expect(await nullpad.status(), 'yTc').toMatchObject({ line: 1, column: 7 })
  await begin(nullpad, 'abcabc xax', [1, 4])
  await play(nullpad, 'yfc')
  expect(await nullpad.status(), 'yfc stays').toMatchObject({
    line: 1,
    column: 4,
  })
})

test('a count before and after d multiply, a failing find cancels d and the key after it runs alone', async ({
  nullpad,
}) => {
  await begin(nullpad, 'a-a-a-a-a-a')
  await play(nullpad, '2d2fa')
  expect(await nullpad.text(), '2d2fa finds the fourth a').toBe('-a')
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'd9fcx')
  expect(await nullpad.text(), 'd9fc fails, then x runs alone').toBe(
    'bcabc xax',
  )
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')
})

test('. repeats a delete with a find with its own letter, and a count before . is kept for the next .', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabcabc xax')
  await play(nullpad, 'dfcfb.')
  expect(await nullpad.text(), 'dfc, fb moves, . deletes to the next c').toBe(
    'aabc xax',
  )
  await begin(nullpad, 'a-a-a-a-a-a-a')
  await play(nullpad, 'dfa3.')
  expect(await nullpad.text(), 'dfa then 3. deletes three a').toBe('-a-a')
  await play(nullpad, '.')
  expect(
    await nullpad.text(),
    'the next . keeps the 3 and fails or deletes what is left',
  ).toBe('-a-a')
})

test('a find in VISUAL then Esc or Ctrl-C keeps the selection, and the find made there is the last find after leaving', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'vlf<Esc>')
  await expectScreen(nullpad, 'vlf then Esc keeps the selection', {
    text: 'abcabc xax',
    line: 1,
    column: 2,
    mode: 'VISUAL',
    selection: 'ab',
  })
  await play(nullpad, 'f<C-c>')
  expect(await modeOf(nullpad), 'f then Ctrl-C keeps VISUAL').toBe('VISUAL')
  expect(await nullpad.selection(), 'and the selection').toBe('ab')
  await play(nullpad, 'tc<Esc>0;')
  expect(
    await nullpad.status(),
    'tc made there is the last find',
  ).toMatchObject({
    line: 1,
    column: 2,
  })
})
