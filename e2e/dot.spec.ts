import { type Nullpad, expect, openFresh, settle, test } from './nullpad'

const SAVED = 1500
const ROWS_PER_TEST = 18

const toggle = 'Control+,'

type Row = Readonly<{
  text: keyof typeof texts
  at: readonly [number, number]
  keys: string
  after: string
  line: number
  column: number
}>

type Group = Readonly<{ name: string; rows: ReadonlyArray<Row> }>

const texts = {
  A: 'one two three\n  indent (x y) here\n\nend',
  C: 'a b\nc d\ne f',
  E: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
  F: 'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
  G: 'one two three four five six seven',
  H: 'first line\nsecond line\nthird line\nfourth line\nfifth line',
  I: 'p1 a\np1 b\n\np2 a\np2 b\n\np3 a',
  J: 'f(a) x\nf(b) y\nf(c) z',
} as const

const groups: ReadonlyArray<Group> = [
  {
    name: 'dot after deletes: x X D dd dw d2w d$ db de dj dk dG dgg diw dap',
    rows: [
      {
        text: 'E',
        at: [1, 1],
        keys: 'x.',
        after: 'cdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xj.',
        after: 'bcdefgh\njklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 5],
        keys: 'X.',
        after: 'abefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 5],
        keys: 'dh.',
        after: 'abefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 5],
        keys: 'Dj.',
        after: 'foo \nfoo\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 5],
        keys: 'D2.',
        after: 'foo\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 5],
        keys: 'd$j.',
        after: 'foo \nfoo\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'dd.',
        after: 'foo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'dw.',
        after: 'baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'de.',
        after: ' baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'diww.',
        after: '  baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 2,
      },
      {
        text: 'F',
        at: [1, 9],
        keys: 'dw.',
        after: 'foo bar\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 7,
      },
      {
        text: 'F',
        at: [1, 9],
        keys: 'db.',
        after: 'baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: 'd2w.',
        after: 'five six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: 'dj.',
        after: 'fifth line',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [5, 1],
        keys: 'dk.',
        after: 'first line',
        line: 1,
        column: 1,
      },
      { text: 'E', at: [2, 1], keys: 'dG.', after: '', line: 1, column: 1 },
      { text: 'E', at: [3, 1], keys: 'dgg.', after: '', line: 1, column: 1 },
      {
        text: 'I',
        at: [1, 1],
        keys: 'dap.',
        after: 'p3 a',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'dot after puts: p P linewise and charwise',
    rows: [
      {
        text: 'F',
        at: [1, 1],
        keys: 'yyp.',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 3,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'yyP.',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'yyp..',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 4,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'ddp.',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 3,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'yyjp.',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 4,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'ywwp.',
        after: 'foo bfoo foo ar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 13,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'ywP.',
        after: 'foofoo  foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 7,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xp.',
        after: 'baacdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xP.',
        after: 'aabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'dot after changes: ciw cw cc s S C ci( cj c$ ce',
    rows: [
      {
        text: 'F',
        at: [1, 1],
        keys: 'ciwnew<Esc>w.',
        after: 'new new baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 7,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'ciwnew<Esc>j.',
        after: 'new bar baz\nnew bar baz\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'cwX<Esc>w.',
        after: 'X X baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'cwX<Esc>j.',
        after: 'X bar baz\nX bar baz\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'c$X<Esc>j.',
        after: 'X\nX\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'ccnew<Esc>j.',
        after: 'new\nnew\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'ccnew<Esc>j.j.',
        after: 'new\nnew\nnew\nfoo bar baz',
        line: 3,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'cc<Esc>j.',
        after: '\n\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'SX<Esc>j.',
        after: 'X\nX\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'CX<Esc>j.',
        after: 'X\nX\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 5],
        keys: 'CX<Esc>j.',
        after: 'foo X\nfoo X\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 5,
      },
      {
        text: 'F',
        at: [1, 5],
        keys: 'SX<Esc>jj.',
        after: 'X\nfoo bar baz\nX\nfoo bar baz',
        line: 3,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'sQ<Esc>l.',
        after: 'QQcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'sQ<Esc>j.',
        after: 'Qbcdefgh\nQjklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 1,
      },
      {
        text: 'J',
        at: [1, 3],
        keys: 'ci(Q<Esc>j.',
        after: 'f(Q) x\nf(Q) y\nf(c) z',
        line: 2,
        column: 3,
      },
      {
        text: 'J',
        at: [1, 3],
        keys: 'ciwQ<Esc>j.',
        after: 'f(Q) x\nf(Q) y\nf(c) z',
        line: 2,
        column: 3,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: 'cjX<Esc>.',
        after: 'X\nfourth line\nfifth line',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'dot after stays: i a I A o O, with Backspace, Enter, Tab',
    rows: [
      {
        text: 'E',
        at: [1, 1],
        keys: 'iab<Esc>.',
        after: 'aabbabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'iab<Esc>j.',
        after: 'ababcdefgh\niabjklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'aab<Esc>j.',
        after: 'aabbcdefgh\nijkablmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 5,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'Iab<Esc>j.',
        after: 'ababcdefgh\nabijklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'Aab<Esc>j.',
        after: 'abcdefghab\nijklmnopab\nqrstuvwx\nyz012345',
        line: 2,
        column: 10,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'A;<Esc>j.',
        after: 'abcdefgh;\nijklmnop;\nqrstuvwx\nyz012345',
        line: 2,
        column: 9,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'ohello<Esc>.',
        after: 'abcdefgh\nhello\nhello\nijklmnop\nqrstuvwx\nyz012345',
        line: 3,
        column: 5,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'ione<Esc>..',
        after: 'onononeeeabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 7,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'Aab<BS>c<Esc>j.',
        after: 'abcdefghac\nijklmnopac\nqrstuvwx\nyz012345',
        line: 2,
        column: 10,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'A<BS>x<Esc>j.',
        after: 'abcdefgx\nijklmnox\nqrstuvwx\nyz012345',
        line: 2,
        column: 8,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'Aab<BS><BS><BS>X<Esc>j.',
        after: 'abcdefgX\nijklmnoX\nqrstuvwx\nyz012345',
        line: 2,
        column: 8,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'ia<CR>b<Esc>.',
        after: 'a\na\nbbabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 3,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'ia<CR>b<CR>c<Esc>j.',
        after: 'a\nb\ncabcdefgh\na\nb\ncijklmnop\nqrstuvwx\nyz012345',
        line: 6,
        column: 1,
      },
      {
        text: 'E',
        at: [2, 1],
        keys: 'I<BS>x<Esc>j.',
        after: 'abcdefghxijklmnopxqrstuvwx\nyz012345',
        line: 1,
        column: 18,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'A<Tab>x<Esc>j.',
        after: 'abcdefgh  x\nijklmnop  x\nqrstuvwx\nyz012345',
        line: 2,
        column: 11,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'i<Tab><Tab>z<Esc>.',
        after: '        zzabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 9,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'Aab<Tab><BS>c<Esc>j.',
        after: 'abcdefghab c\nijklmnopab c\nqrstuvwx\nyz012345',
        line: 2,
        column: 12,
      },
      {
        text: 'C',
        at: [1, 1],
        keys: 'Ahello world<Esc>j.',
        after: 'a bhello world\nc dhello world\ne f',
        line: 2,
        column: 14,
      },
    ],
  },
  {
    name: 'the empty stay replaces what dot repeats',
    rows: [
      {
        text: 'E',
        at: [1, 3],
        keys: 'xi<Esc>.',
        after: 'abdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'xi<Esc>..',
        after: 'abdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'xa<Esc>.',
        after: 'abdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'xI<Esc>.',
        after: 'abdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'xA<Esc>.',
        after: 'abdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 7,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'xo<Esc>.',
        after: 'abdefgh\n\n\nijklmnop\nqrstuvwx\nyz012345',
        line: 3,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'ihi<Esc>xi<Esc>.',
        after: 'abhcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'ddi<Esc>.',
        after: 'ijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xi<Esc>.',
        after: 'bcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'a count before dot replaces the count and sticks, counts multiply',
    rows: [
      {
        text: 'E',
        at: [1, 1],
        keys: '3x2.',
        after: 'fgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: '3x2..',
        after: 'h\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: '3x.',
        after: 'gh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'x3.',
        after: 'efgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: '2x3.4.',
        after: '\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      { text: 'G', at: [1, 1], keys: '2d2w.', after: '', line: 1, column: 1 },
      { text: 'G', at: [1, 1], keys: '2d2w3.', after: '', line: 1, column: 1 },
      { text: 'G', at: [1, 1], keys: '2d2w3..', after: '', line: 1, column: 1 },
      {
        text: 'G',
        at: [1, 1],
        keys: 'dw2.',
        after: 'four five six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: 'd2w3.',
        after: 'six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: '3dw2.',
        after: 'six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: 'dd3.',
        after: 'fifth line',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: '2dd.',
        after: 'fifth line',
        line: 1,
        column: 1,
      },
      { text: 'H', at: [1, 1], keys: '2dd3.', after: '', line: 1, column: 1 },
      { text: 'H', at: [1, 1], keys: '2dd3..', after: '', line: 1, column: 1 },
      {
        text: 'F',
        at: [1, 1],
        keys: 'yy2p.',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 3,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'yy2p3.',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 3,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'yyp3.',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 3,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: '2cwX<Esc>w.',
        after: 'X X five six seven',
        line: 1,
        column: 3,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: '2cwX<Esc>w1.',
        after: 'X X four five six seven',
        line: 1,
        column: 3,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: 'c2wX<Esc>w.',
        after: 'X X five six seven',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'ix<Esc>3.',
        after: 'xxxxabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'ix<Esc>3..',
        after: 'xxxxxxxabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 5,
      },
    ],
  },
  {
    name: 'what dot repeats does not change: u, Ctrl-R, yanks, motions, failed commands',
    rows: [
      {
        text: 'E',
        at: [1, 1],
        keys: 'xu.',
        after: 'bcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xxu.',
        after: 'cdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xu<C-r>.',
        after: 'cdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xyyj.',
        after: 'bcdefgh\njklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xywj.',
        after: 'bcdefgh\njklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xw.',
        after: 'bcdefgh\njklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'x$.',
        after: 'bcdefg\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 6,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xGgg.',
        after: 'cdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'xjk.',
        after: 'cdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [5, 1],
        keys: 'dwdj.',
        after: 'first line\nsecond line\nthird line\nfourth line\n',
        line: 5,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: 'dwdk.',
        after: '\nsecond line\nthird line\nfourth line\nfifth line',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [4, 1],
        keys: 'x2dd.',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\n012345',
        line: 4,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'ywPwwyw.',
        after: 'foo foo bar bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 12,
      },
    ],
  },
  {
    name: 'dot with nothing to repeat',
    rows: [
      {
        text: 'E',
        at: [1, 1],
        keys: '.',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'w.',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'yy.',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'u.',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: '..',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: '3.',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'dot is one change for u, and Ctrl-R puts it back',
    rows: [
      {
        text: 'E',
        at: [1, 1],
        keys: 'x.u',
        after: 'bcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'x.uu',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'x.u<C-r>',
        after: 'cdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'x..3u',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'x..3u<C-r><C-r>',
        after: 'cdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'x.u.',
        after: 'cdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: '3x2.u',
        after: 'defgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'dd.u',
        after: 'foo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'dd.u<C-r>',
        after: 'foo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'dw.u',
        after: 'bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'yyp.u',
        after:
          'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 2,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'ywwp.uu<C-r>',
        after: 'foo bfoo ar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 5,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'iab<Esc>.u',
        after: 'ababcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'iab<Esc>.u<C-r>',
        after: 'aabbabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'ohi<Esc>.u',
        after: 'abcdefgh\nhi\nijklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: 'Aab<BS>c<Esc>j.u',
        after: 'abcdefghac\nijklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 8,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'cwX<Esc>w.u',
        after: 'X bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'cwX<Esc>w.u<C-r>',
        after: 'X X baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 1],
        keys: 'SX<Esc>j.uu',
        after: 'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'counts on inserts: i a I A o O',
    rows: [
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>',
        after: 'abxxxcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 5,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ax<Esc>',
        after: 'abcxxxdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 6,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3Ix<Esc>',
        after: 'xxxabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3Ax<Esc>',
        after: 'abcdefghxxx\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 11,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2Aab<Esc>',
        after: 'abcdefghabab\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 12,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2Iab<Esc>',
        after: 'abababcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 4,
      },
      {
        text: 'E',
        at: [2, 3],
        keys: '3ohi<Esc>',
        after: 'abcdefgh\nijklmnop\nhi\nhi\nhi\nqrstuvwx\nyz012345',
        line: 5,
        column: 2,
      },
      {
        text: 'E',
        at: [2, 3],
        keys: '2Ohi<Esc>',
        after: 'abcdefgh\nhi\nhi\nijklmnop\nqrstuvwx\nyz012345',
        line: 3,
        column: 2,
      },
      {
        text: 'E',
        at: [2, 3],
        keys: '2ohi<Esc>k',
        after: 'abcdefgh\nijklmnop\nhi\nhi\nqrstuvwx\nyz012345',
        line: 3,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: '2ohi<Esc>',
        after: 'abcdefgh\nhi\nhi\nijklmnop\nqrstuvwx\nyz012345',
        line: 3,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 1],
        keys: '2Ohi<Esc>',
        after: 'hi\nhi\nabcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 2,
      },
      {
        text: 'E',
        at: [4, 1],
        keys: '2ohi<Esc>',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345\nhi\nhi',
        line: 6,
        column: 2,
      },
      {
        text: 'C',
        at: [2, 1],
        keys: '3Ohi<Esc>',
        after: 'a b\nhi\nhi\nhi\nc d\ne f',
        line: 4,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2ix<BS>y<Esc>',
        after: 'abyycdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 4,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2ia<CR>b<Esc>',
        after: 'aba\nba\nbcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 3,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2oa<CR>b<Esc>',
        after: 'abcdefgh\na\nb\na\nb\nijklmnop\nqrstuvwx\nyz012345',
        line: 5,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2Aab<Tab>c<Esc>',
        after: 'abcdefghab  cab  c\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 18,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3i<Esc>',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>u',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>u<C-r>',
        after: 'abxxxcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2Aab<Esc>u',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 8,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ohi<Esc>u',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ohi<Esc>u<C-r>',
        after: 'abcdefgh\nhi\nhi\nhi\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2Ohi<Esc>u',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>uu',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
    ],
  },
  {
    name: 'dot after a counted insert, with and without a new count',
    rows: [
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>.',
        after: 'abxxxxxxcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 7,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>2.',
        after: 'abxxxxxcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 6,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>2..',
        after: 'abxxxxxxxcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 7,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>j.',
        after: 'abxxxcdefgh\nijklxxxmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 7,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ax<Esc>.',
        after: 'abcxxxxxxdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 9,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3Ax<Esc>j.',
        after: 'abcdefghxxx\nijklmnopxxx\nqrstuvwx\nyz012345',
        line: 2,
        column: 11,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2Aab<Esc>j.',
        after: 'abcdefghabab\nijklmnopabab\nqrstuvwx\nyz012345',
        line: 2,
        column: 12,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2Aab<Esc>j3.',
        after: 'abcdefghabab\nijklmnopababab\nqrstuvwx\nyz012345',
        line: 2,
        column: 14,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'ix<Esc>3.',
        after: 'abxxxxcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 5,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: 'Aab<Esc>j2.',
        after: 'abcdefghab\nijklmnopabab\nqrstuvwx\nyz012345',
        line: 2,
        column: 12,
      },
      {
        text: 'E',
        at: [2, 2],
        keys: '3ohi<Esc>.',
        after: 'abcdefgh\nijklmnop\nhi\nhi\nhi\nhi\nhi\nhi\nqrstuvwx\nyz012345',
        line: 8,
        column: 2,
      },
      {
        text: 'E',
        at: [2, 2],
        keys: '3ohi<Esc>2.',
        after: 'abcdefgh\nijklmnop\nhi\nhi\nhi\nhi\nhi\nqrstuvwx\nyz012345',
        line: 7,
        column: 2,
      },
      {
        text: 'E',
        at: [2, 2],
        keys: '2Ohi<Esc>.',
        after: 'abcdefgh\nhi\nhi\nhi\nhi\nijklmnop\nqrstuvwx\nyz012345',
        line: 4,
        column: 2,
      },
      {
        text: 'E',
        at: [2, 2],
        keys: '2Ohi<Esc>3.',
        after: 'abcdefgh\nhi\nhi\nhi\nhi\nhi\nijklmnop\nqrstuvwx\nyz012345',
        line: 5,
        column: 2,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>.u',
        after: 'abxxxcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 5,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ix<Esc>.u<C-r>',
        after: 'abxxxxxxcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 5,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3ohi<Esc>.uu',
        after: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '2Aab<Esc>j.u',
        after: 'abcdefghabab\nijklmnop\nqrstuvwx\nyz012345',
        line: 2,
        column: 8,
      },
    ],
  },
  {
    name: 'counts on changes belong to the operator: 3cw 2S 3s 2C',
    rows: [
      {
        text: 'G',
        at: [1, 1],
        keys: '3cwX<Esc>',
        after: 'X four five six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: '2cwX<Esc>',
        after: 'X three four five six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: 'c2wX<Esc>',
        after: 'X three four five six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: '2c2wX<Esc>',
        after: 'X five six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: '3cwX<Esc>w.',
        after: 'X X seven',
        line: 1,
        column: 3,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: '3cwX<Esc>2.',
        after: 'X five six seven',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: '2SX<Esc>',
        after: 'X\nthird line\nfourth line\nfifth line',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: '2SX<Esc>j.',
        after: 'X\nX\nfifth line',
        line: 2,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: '2CX<Esc>',
        after: 'X\nthird line\nfourth line\nfifth line',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: '2SX<Esc>1.',
        after: 'X\nthird line\nfourth line\nfifth line',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3sX<Esc>',
        after: 'abXfgh\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 3,
      },
      {
        text: 'E',
        at: [1, 3],
        keys: '3sX<Esc>l.',
        after: 'abXX\nijklmnop\nqrstuvwx\nyz012345',
        line: 1,
        column: 4,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: '2SX<Esc>u<C-r>',
        after: 'X\nthird line\nfourth line\nfifth line',
        line: 2,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: '3cwX<Esc>u',
        after: 'one two three four five six seven',
        line: 1,
        column: 1,
      },
    ],
  },
]

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Tab>': 'Tab',
  '<C-r>': 'Control+r',
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .pending').innerText()
}

const wait = (nullpad: Nullpad, ms = SAVED) => nullpad.page.waitForTimeout(ms)

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of keys.match(/<[A-Za-z-]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
}

const vimOn = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press(toggle)
  await settle(nullpad.page)
}

const startWith = async (nullpad: Nullpad, text: string) => {
  await openFresh(nullpad.page)
  await nullpad.paste(text)
  await nullpad.reload()
  await nullpad.press('Control+Home')
}

const placeAt = async (nullpad: Nullpad, line: number, column: number) => {
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', line - 1)
  await nullpad.press('Home')
  await nullpad.press('ArrowRight', column - 1)
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  const label = `${row.text} at ${row.at.join(':')} keys ${row.keys}`
  await startWith(nullpad, texts[row.text])
  await placeAt(nullpad, row.at[0], row.at[1])
  await vimOn(nullpad)
  await play(nullpad, row.keys)
  expect.soft(await nullpad.text(), `${label}: text`).toBe(row.after)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line: row.line, column: row.column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe('NORMAL')
}

for (const group of groups) {
  for (let from = 0; from < group.rows.length; from += ROWS_PER_TEST) {
    const rows = group.rows.slice(from, from + ROWS_PER_TEST)
    test(`vim ${group.name} act as in Vim (rows ${from + 1} to ${from + rows.length})`, async ({
      nullpad,
    }) => {
      for (const row of rows) {
        await playRow(nullpad, row)
      }
    })
  }
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

test('dot repeats the last change in another note, and back in the first, after a switch through the finder', async ({
  nullpad,
}) => {
  await nullpad.type('abcdef')
  await vimOn(nullpad)
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'x took the first letter').toBe('bcdef')
  await wait(nullpad)

  await startNote(nullpad, 'second')
  expect(await nullpad.text(), 'the second note').toBe('second')
  expect(await modeOf(nullpad), 'a note from the finder opens in NORMAL').toBe(
    'NORMAL',
  )
  await play(nullpad, '0.')
  expect(await nullpad.text(), 'dot in the second note repeats x').toBe('econd')
  await wait(nullpad)

  await openFinder(nullpad)
  await nullpad.type('bcdef')
  await nullpad.press('Enter')
  expect(await nullpad.text(), 'back in the first note').toBe('bcdef')
  await play(nullpad, '0.')
  expect(await nullpad.text(), 'dot in the first note repeats x').toBe('cdef')
  expect(await modeOf(nullpad), 'NORMAL after dot').toBe('NORMAL')
})

test('dot repeats a stay in INSERT after a switch to another note', async ({
  nullpad,
}) => {
  await nullpad.type('abc')
  await vimOn(nullpad)
  await play(nullpad, '0ixy<Esc>')
  expect(await nullpad.text(), 'the stay typed xy').toBe('xyabc')
  await wait(nullpad)
  await startNote(nullpad, 'two')
  await play(nullpad, '0.')
  expect(await nullpad.text(), 'dot typed xy in the other note').toBe('xytwo')
  expect(
    await nullpad.status(),
    'the cursor is on the last letter typed',
  ).toMatchObject({ line: 1, column: 2 })
})

test('dot survives vim off and on', async ({ nullpad }) => {
  await nullpad.type('abcdef')
  await vimOn(nullpad)
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'x').toBe('bcdef')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  await nullpad.press('Home')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  await play(nullpad, '.')
  expect(await nullpad.text(), 'dot repeats x').toBe('cdef')

  await play(nullpad, 'ixy<Esc>')
  expect(await nullpad.text(), 'a stay').toBe('xycdef')
  await vimOn(nullpad)
  await vimOn(nullpad)
  await play(nullpad, '.')
  expect(
    await nullpad.text(),
    'dot repeats the stay after another toggle',
  ).toBe('xxyycdef')
})

test('dot is empty after a reload', async ({ nullpad }) => {
  await nullpad.type('abcdef')
  await vimOn(nullpad)
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'x').toBe('bcdef')
  await wait(nullpad)
  await nullpad.reload()
  expect(await modeOf(nullpad), 'vim stays on after a reload').toBe('NORMAL')
  expect(await nullpad.text(), 'the note came back').toBe('bcdef')
  await play(nullpad, '0.')
  expect(await nullpad.text(), 'dot after a reload does nothing').toBe('bcdef')
  await play(nullpad, 'x')
  await play(nullpad, '.')
  expect(await nullpad.text(), 'a change after the reload is repeated').toBe(
    'def',
  )
})

test('the mode is NORMAL and nothing is pending after dot', async ({
  nullpad,
}) => {
  await nullpad.type('abc')
  await vimOn(nullpad)
  await play(nullpad, '0ihi<Esc>')
  expect(await nullpad.text(), 'the stay').toBe('hiabc')
  await play(nullpad, '.')
  expect(await nullpad.text(), 'dot typed hi again').toBe('hhiiabc')
  expect(await modeOf(nullpad), 'NORMAL after dot of a stay').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')

  await play(nullpad, '0ohey<Esc>')
  expect(await nullpad.text(), 'o stay').toBe('hhiiabc\nhey')
  await play(nullpad, '.')
  expect(await nullpad.text(), 'dot opened another line').toBe(
    'hhiiabc\nhey\nhey',
  )
  expect(await modeOf(nullpad), 'NORMAL after dot of o').toBe('NORMAL')

  await play(nullpad, 'ggcwX<Esc>')
  expect(await nullpad.text(), 'a change').toBe('X\nhey\nhey')
  await play(nullpad, 'j.')
  expect(await nullpad.text(), 'dot changed the word below').toBe('X\nX\nhey')
  expect(await modeOf(nullpad), 'NORMAL after dot of cw').toBe('NORMAL')
  await play(nullpad, '2.')
  expect(await modeOf(nullpad), 'NORMAL after a counted dot').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'nothing pending after a counted dot').toBe(
    '',
  )
})

test('the status shows the count while a counted insert waits', async ({
  nullpad,
}) => {
  await nullpad.type('abc')
  await vimOn(nullpad)
  await play(nullpad, '0')
  await nullpad.press('3')
  expect(await pendingOf(nullpad), '3 waits').toBe('3')
  expect(await modeOf(nullpad), 'still NORMAL').toBe('NORMAL')
  await nullpad.press('i')
  expect(await modeOf(nullpad), 'i opens the stay').toBe('INSERT')
  expect(await pendingOf(nullpad), 'the count is no longer pending').toBe('')
  await nullpad.type('x')
  await nullpad.press('Escape')
  expect(await nullpad.text(), '3ix<Esc> types xxx').toBe('xxxabc')
  expect(await modeOf(nullpad), 'NORMAL after the counted stay').toBe('NORMAL')

  await nullpad.press('1')
  await nullpad.press('2')
  expect(await pendingOf(nullpad), '12 waits').toBe('12')
  await nullpad.press('h')
  expect(await pendingOf(nullpad), 'h takes the count').toBe('')

  await nullpad.press('2')
  expect(await pendingOf(nullpad), '2 waits before dot').toBe('2')
  await nullpad.press('.')
  expect(await pendingOf(nullpad), 'dot takes the count').toBe('')
  expect(await nullpad.text(), '2. types xx again').toBe('xxxxxabc')
})

test('a huge count on an insert leaves the page answering, and one u takes it all back', async ({
  nullpad,
}) => {
  test.setTimeout(120_000)
  await nullpad.type('a')
  await vimOn(nullpad)
  await play(nullpad, '0')
  await nullpad.type('9999999')
  expect(await pendingOf(nullpad), 'the count waits').toBe('9999999')
  await play(nullpad, 'ix<Esc>')
  expect(await modeOf(nullpad), 'NORMAL after the huge stay').toBe('NORMAL')
  expect(
    (await nullpad.text()).startsWith('xx'),
    'the text starts with repeated x',
  ).toBe(true)
  await play(nullpad, '$')
  const { line, column } = await nullpad.status()
  expect(line, 'one line').toBe(1)
  expect(column - 1, 'x typed more than once').toBeGreaterThan(1)
  expect(column - 1, 'x typed at most 20,000 times').toBeLessThanOrEqual(20_000)
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u takes back all of it').toBe('a')
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'the page still takes keys').toBe('')
})

test('a huge count before dot and on o is bounded too', async ({ nullpad }) => {
  test.setTimeout(120_000)
  await nullpad.type('a')
  await vimOn(nullpad)
  await play(nullpad, '0ix<Esc>')
  expect(await nullpad.text(), 'the stay').toBe('xa')
  await nullpad.type('9999999')
  await play(nullpad, '.')
  await play(nullpad, '$')
  const first = await nullpad.status()
  expect(first.column - 2, 'dot typed x more than once').toBeGreaterThan(1)
  expect(
    first.column - 2,
    'dot typed x at most 20,000 times',
  ).toBeLessThanOrEqual(20_000)
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u takes back the dot').toBe('xa')
  await play(nullpad, 'gg0')
  await nullpad.type('9999999')
  await play(nullpad, 'ohi<Esc>')
  const { lineCount } = await nullpad.status()
  expect(lineCount - 1, 'o opened more than one line').toBeGreaterThan(1)
  expect(lineCount - 1, 'o opened at most 20,000 lines').toBeLessThanOrEqual(
    20_000,
  )
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u takes back the lines').toBe('xa')
})

test('a dot typed in INSERT is a dot, and dot then repeats the whole stay', async ({
  nullpad,
}) => {
  await nullpad.type('abc')
  await vimOn(nullpad)
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'x').toBe('bc')
  await play(nullpad, 'i.')
  expect(await nullpad.text(), 'a dot typed in INSERT').toBe('.bc')
  expect(await modeOf(nullpad), 'still INSERT').toBe('INSERT')
  await play(nullpad, '.')
  expect(await nullpad.text(), 'a second dot typed').toBe('..bc')
  expect(await modeOf(nullpad), 'still INSERT after two dots').toBe('INSERT')
  await play(nullpad, '<Esc>')
  expect(await nullpad.text(), 'the stay typed two dots').toBe('..bc')
  await play(nullpad, '.')
  expect(await nullpad.text(), 'dot repeats the stay, not x').toBe('....bc')
})

test('with vim off a dot is typed, even after changes made with vim on', async ({
  nullpad,
}) => {
  await nullpad.type('a.b.')
  expect(await nullpad.text(), 'dots typed with vim off').toBe('a.b.')
  expect(await modeOf(nullpad), 'EDIT').toBe('EDIT')
  await vimOn(nullpad)
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'x with vim on').toBe('.b.')
  await vimOn(nullpad)
  await nullpad.press('Control+End')
  await nullpad.type('.')
  expect(
    await nullpad.text(),
    'a dot with vim off is typed, not a repeat',
  ).toBe('.b..')
})
