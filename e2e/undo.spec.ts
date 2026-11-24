import {
  type Nullpad,
  expect,
  numberedLines,
  openFresh,
  openTab,
  settle,
  test,
} from './nullpad'

const SAVED = 1500

const toggle = 'Control+,'
const redoKeys = ['Control+Shift+z', 'Control+y'] as const

type Row = Readonly<{
  text: keyof typeof texts
  at: readonly [number, number]
  keys: string
  after: string
  line: number
  column: number
}>

const texts = {
  A: 'one two three\n  indent (x y) here\n\nend',
  B: 'alpha beta\n\nfoo bar baz\n    four spaces\nz',
  C: 'a b\nc d\ne f',
  D: 'hello world',
} as const

const vimRows: ReadonlyArray<Row> = [
  {
    text: 'A',
    at: [1, 1],
    keys: 'xu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xu<C-r>',
    after: 'ne two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 4],
    keys: 'Xu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 3,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: '3xu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: '3xu<C-r>',
    after: ' two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'Du',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ddu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ddu<C-r>',
    after: '  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [2, 1],
    keys: '2ddu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 1,
  },
  {
    text: 'A',
    at: [2, 5],
    keys: 'dwu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 5,
  },
  {
    text: 'A',
    at: [2, 5],
    keys: 'dwu<C-r>',
    after: 'one two three\n  in(x y) here\n\nend',
    line: 2,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'd2wu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 9],
    keys: 'dbu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 9],
    keys: 'dbu<C-r>',
    after: 'one three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'deu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'd$u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'd$u<C-r>',
    after: 'one \n  indent (x y) here\n\nend',
    line: 1,
    column: 4,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'dju',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [2, 5],
    keys: 'dku',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [2, 5],
    keys: 'dku<C-r>',
    after: '\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [2, 3],
    keys: 'dGu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 3,
  },
  {
    text: 'A',
    at: [3, 1],
    keys: 'dggu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [3, 1],
    keys: 'dggu<C-r>',
    after: 'end',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 6],
    keys: 'diwu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 6],
    keys: 'dawu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 6],
    keys: 'dawu<C-r>',
    after: 'one three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'B',
    at: [3, 2],
    keys: 'dipu',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces\nz',
    line: 3,
    column: 1,
  },
  {
    text: 'B',
    at: [3, 2],
    keys: 'dapu',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces\nz',
    line: 2,
    column: 1,
  },
  {
    text: 'B',
    at: [3, 2],
    keys: 'dapu<C-r>',
    after: 'alpha beta',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [2, 11],
    keys: 'ci(Q<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 11,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'cwHI<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'cwHI<Esc>u<C-r>',
    after: 'HI two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [2, 5],
    keys: 'ccNEW<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 3,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'Sxx<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'Sxx<Esc>u<C-r>',
    after: 'xx\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'sQ<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'CZ<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'CZ<Esc>u<C-r>',
    after: 'one Z\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'onew<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [2, 5],
    keys: 'Oabove<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 5,
  },
  {
    text: 'A',
    at: [2, 5],
    keys: 'Oabove<Esc>u<C-r>',
    after: 'one two three\nabove\n  indent (x y) here\n\nend',
    line: 2,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'ihey<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'ahey<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 6,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'ahey<Esc>u<C-r>',
    after: 'one theywo three\n  indent (x y) here\n\nend',
    line: 1,
    column: 6,
  },
  {
    text: 'A',
    at: [2, 5],
    keys: 'Ihey<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 3,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'Ahey<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 13,
  },
  {
    text: 'A',
    at: [1, 5],
    keys: 'Ahey<Esc>u<C-r>',
    after: 'one two threehey\n  indent (x y) here\n\nend',
    line: 1,
    column: 14,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'yyjpu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'yyPu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'yyPu<C-r>',
    after: 'one two three\none two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ywwpu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xpu',
    after: 'ne two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xpu<C-r>',
    after: 'noe two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'yw3Pu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ddpu',
    after: '  indent (x y) here\n\nend',
    line: 1,
    column: 3,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ddpu<C-r>',
    after: '  indent (x y) here\none two three\n\nend',
    line: 1,
    column: 3,
  },
  {
    text: 'D',
    at: [1, 7],
    keys: 'ddu',
    after: 'hello world',
    line: 1,
    column: 1,
  },
  {
    text: 'D',
    at: [1, 7],
    keys: 'xu',
    after: 'hello world',
    line: 1,
    column: 7,
  },
  {
    text: 'D',
    at: [1, 7],
    keys: 'xu<C-r>',
    after: 'hello orld',
    line: 1,
    column: 7,
  },
  {
    text: 'A',
    at: [4, 1],
    keys: 'ddu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 4,
    column: 1,
  },
  {
    text: 'A',
    at: [4, 2],
    keys: 'xu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 4,
    column: 2,
  },
  {
    text: 'A',
    at: [4, 2],
    keys: 'xu<C-r>',
    after: 'one two three\n  indent (x y) here\n\ned',
    line: 4,
    column: 2,
  },
  {
    text: 'A',
    at: [4, 1],
    keys: 'A!<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 4,
    column: 3,
  },
  {
    text: 'A',
    at: [3, 1],
    keys: 'ofoo<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 3,
    column: 1,
  },
  {
    text: 'A',
    at: [3, 1],
    keys: 'ofoo<Esc>u<C-r>',
    after: 'one two three\n  indent (x y) here\n\nfoo\nend',
    line: 3,
    column: 1,
  },
  {
    text: 'A',
    at: [3, 1],
    keys: 'ix<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 3,
    column: 1,
  },
  {
    text: 'A',
    at: [3, 1],
    keys: 'ddu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 3,
    column: 1,
  },
  {
    text: 'A',
    at: [3, 1],
    keys: 'ddu<C-r>',
    after: 'one two three\n  indent (x y) here\nend',
    line: 3,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'o<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xi<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xi<Esc>u<C-r>',
    after: 'ne two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 3],
    keys: 'xixy<BS><BS><Esc>u',
    after: 'on two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 3,
  },
  {
    text: 'A',
    at: [4, 1],
    keys: 'I<BS>x<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 4,
    column: 1,
  },
  {
    text: 'A',
    at: [4, 1],
    keys: 'I<BS>x<Esc>u<C-r>',
    after: 'one two three\n  indent (x y) here\nxend',
    line: 3,
    column: 1,
  },
  {
    text: 'A',
    at: [2, 1],
    keys: 'i<BS>z<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 1,
  },
  {
    text: 'C',
    at: [2, 1],
    keys: 'ddpu',
    after: 'a b\ne f',
    line: 2,
    column: 1,
  },
  {
    text: 'C',
    at: [2, 1],
    keys: 'ddpu<C-r>',
    after: 'a b\ne f\nc d',
    line: 2,
    column: 1,
  },
  {
    text: 'C',
    at: [1, 1],
    keys: 'yjPu',
    after: 'a b\nc d\ne f',
    line: 1,
    column: 1,
  },
  {
    text: 'C',
    at: [3, 3],
    keys: 'ddu',
    after: 'a b\nc d\ne f',
    line: 3,
    column: 1,
  },
  {
    text: 'C',
    at: [3, 3],
    keys: 'ddu<C-r>',
    after: 'a b\nc d',
    line: 2,
    column: 1,
  },
  {
    text: 'C',
    at: [2, 2],
    keys: 'cc<Esc>u',
    after: 'a b\nc d\ne f',
    line: 2,
    column: 1,
  },
  {
    text: 'B',
    at: [5, 1],
    keys: 'ddku',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces\nz',
    line: 5,
    column: 1,
  },
  {
    text: 'B',
    at: [5, 1],
    keys: 'ddku<C-r>',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces',
    line: 4,
    column: 5,
  },
  {
    text: 'B',
    at: [4, 1],
    keys: 'dwu',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces\nz',
    line: 4,
    column: 1,
  },
  {
    text: 'B',
    at: [4, 5],
    keys: 'cwX<Esc>u',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces\nz',
    line: 4,
    column: 5,
  },
  {
    text: 'B',
    at: [4, 5],
    keys: 'cwX<Esc>u<C-r>',
    after: 'alpha beta\n\nfoo bar baz\n    X spaces\nz',
    line: 4,
    column: 5,
  },
  {
    text: 'B',
    at: [1, 1],
    keys: 'Gddu',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces\nz',
    line: 5,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxxuuu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxx3u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxx9u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxx9u9<C-r>',
    after: ' two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxxuu2<C-r>',
    after: ' two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxx3u2<C-r>',
    after: 'e two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxxu<C-r><C-r>',
    after: ' two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxx3u<C-r>5<C-r>',
    after: ' two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: '<C-r>',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxuxx<C-r>',
    after: ' two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxux<C-r>',
    after: 'e two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xu<C-r>u<C-r>',
    after: 'ne two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xyyu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxuj<C-r>',
    after: 'e two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxuyy<C-r>',
    after: 'e two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xxuwb<C-r>',
    after: 'e two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [4, 1],
    keys: 'xxudj<C-r>',
    after: 'one two three\n  indent (x y) here\n\nd',
    line: 4,
    column: 1,
  },
  {
    text: 'A',
    at: [4, 1],
    keys: 'xxuxx<C-r>',
    after: 'one two three\n  indent (x y) here\n\n',
    line: 4,
    column: 1,
  },
  {
    text: 'C',
    at: [1, 1],
    keys: 'dddd3u3<C-r>',
    after: 'e f',
    line: 1,
    column: 1,
  },
  {
    text: 'C',
    at: [1, 1],
    keys: 'dddddd4u',
    after: 'a b\nc d\ne f',
    line: 1,
    column: 1,
  },
  {
    text: 'C',
    at: [1, 1],
    keys: 'dddddduu<C-r>',
    after: 'e f',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ofoo<Esc>ofoo<Esc>uu<C-r><C-r>',
    after: 'one two three\nfoo\nfoo\n  indent (x y) here\n\nend',
    line: 2,
    column: 3,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'Ifoo<Esc>Abar<Esc>uu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'Ifoo<Esc>Abar<Esc>u<C-r>',
    after: 'fooone two threebar\n  indent (x y) here\n\nend',
    line: 1,
    column: 17,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'wxwxuu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'wxwxuu<C-r>',
    after: 'one wo three\n  indent (x y) here\n\nend',
    line: 1,
    column: 5,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'Gxggu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 4,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'Gxggu<C-r>',
    after: 'one two three\n  indent (x y) here\n\nnd',
    line: 4,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'Gddggu<C-r>',
    after: 'one two three\n  indent (x y) here\n',
    line: 3,
    column: 1,
  },
  {
    text: 'B',
    at: [1, 1],
    keys: 'GddggkOnew<Esc>u',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'yyppp3u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'yyppp3u2<C-r>',
    after:
      'one two three\none two three\none two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'cwabc<Esc>wcwdef<Esc>uu<C-r>',
    after: 'abc two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xi<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xi<Esc>ui<Esc><C-r>',
    after: 'ne two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'o<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'o<Esc>uu',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'o<Esc>u<C-r>',
    after: 'one two three\n\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ixy<BS><BS><Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xixy<BS><BS><Esc>u',
    after: 'ne two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xixy<BS><BS><Esc>uu<C-r><C-r>',
    after: 'ne two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [4, 1],
    keys: 'I<BS>x<Esc>u<C-r>',
    after: 'one two three\n  indent (x y) here\nxend',
    line: 3,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ddddddddu',
    after: 'end',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ddddddddd9u9<C-r>',
    after: '',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'dwdwdwdw9u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'dwdwdwdw9u<C-r>',
    after: 'two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'B',
    at: [1, 1],
    keys: 'dGu<C-r>u',
    after: 'alpha beta\n\nfoo bar baz\n    four spaces\nz',
    line: 1,
    column: 1,
  },
  {
    text: 'B',
    at: [1, 1],
    keys: 'ddddddddddu',
    after: 'z',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ihello world<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ihello world<Esc>u<C-r>',
    after: 'hello worldone two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ione<CR>two<Esc>u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'ione<CR>two<Esc>u<C-r>',
    after: 'one\ntwoone two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'yyjpjyyP3u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 2,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xjxjxjx4u',
    after: 'one two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xjxjxjx4u2<C-r>',
    after: 'ne two three\n indent (x y) here\n\nend',
    line: 2,
    column: 1,
  },
  {
    text: 'A',
    at: [1, 1],
    keys: 'xgg<C-r>',
    after: 'ne two three\n  indent (x y) here\n\nend',
    line: 1,
    column: 1,
  },
]

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<C-r>': 'Control+r',
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const wait = (nullpad: Nullpad, ms = SAVED) => nullpad.page.waitForTimeout(ms)

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
  await nullpad.page.keyboard.press(toggle)
  for (const token of row.keys.match(/<[A-Za-z-]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
  expect.soft(await nullpad.text(), `${label}: text`).toBe(row.after)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line: row.line, column: row.column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe('NORMAL')
}

const chunk = Math.ceil(vimRows.length / 4)
for (let part = 0; part < 4; part++) {
  const rows = vimRows.slice(part * chunk, (part + 1) * chunk)
  test(`vim u and Ctrl-R after changes, counts and mixed scripts act as in Vim (rows ${part * chunk + 1} to ${part * chunk + rows.length})`, async ({
    nullpad,
  }) => {
    for (const row of rows) {
      await playRow(nullpad, row)
    }
  })
}

const undo = (nullpad: Nullpad) => nullpad.press('Control+z')

test('typed letters, Tab and spaces in a row are one change, and the cursor moves split it', async ({
  nullpad,
}) => {
  await nullpad.type('ab ')
  await nullpad.press('Tab')
  await nullpad.type('cd ef')
  await undo(nullpad)
  expect(await nullpad.text(), 'one Ctrl-Z took the whole run').toBe('')

  await nullpad.press('Control+Shift+z')
  expect(await nullpad.text(), 'redo puts the run back').toBe('ab \tcd ef')

  await nullpad.press('Control+z')
  await nullpad.type('abc')
  await nullpad.press('ArrowLeft')
  await nullpad.press('ArrowRight')
  await nullpad.type('def')
  expect(await nullpad.text(), 'typed around a cursor move').toBe('abcdef')
  await undo(nullpad)
  expect(
    await nullpad.text(),
    'the letters after the move are one change',
  ).toBe('abc')
  await undo(nullpad)
  expect(await nullpad.text(), 'the letters before the move').toBe('')
})

test('Backspace and typing are separate changes, a run of Backspaces is one', async ({
  nullpad,
}) => {
  await nullpad.type('abcd')
  await nullpad.press('Backspace', 2)
  await nullpad.type('xy')
  expect(await nullpad.text(), 'after the edits').toBe('abxy')
  await undo(nullpad)
  expect(await nullpad.text(), 'undo takes the typing after Backspace').toBe(
    'ab',
  )
  await undo(nullpad)
  expect(await nullpad.text(), 'undo takes both Backspaces at once').toBe(
    'abcd',
  )
  await undo(nullpad)
  expect(await nullpad.text(), 'undo takes the first typing').toBe('')
})

test('Enter starts a new change that holds the letters typed after it', async ({
  nullpad,
}) => {
  await nullpad.type('one')
  await nullpad.press('Enter')
  await nullpad.type('two')
  expect(await nullpad.text(), 'two lines').toBe('one\ntwo')
  await undo(nullpad)
  expect(
    await nullpad.text(),
    'undo takes the line break and its letters',
  ).toBe('one')
  await undo(nullpad)
  expect(await nullpad.text(), 'undo takes the first line').toBe('')
})

test('a paste is its own change, between typed runs', async ({ nullpad }) => {
  await nullpad.type('ab')
  await nullpad.paste('XY')
  await nullpad.type('cd')
  expect(await nullpad.text(), 'after the edits').toBe('abXYcd')
  await undo(nullpad)
  expect(await nullpad.text(), 'undo takes the letters after the paste').toBe(
    'abXY',
  )
  await undo(nullpad)
  expect(await nullpad.text(), 'undo takes the paste alone').toBe('ab')
  await undo(nullpad)
  expect(await nullpad.text(), 'undo takes the first letters').toBe('')
})

test('the cursor is before the change after Ctrl-Z and after the change after a redo', async ({
  nullpad,
}) => {
  await startWith(nullpad, 'line one\nline two')
  await nullpad.press('ArrowRight', 4)
  await nullpad.type('ZZ')
  expect(await nullpad.text(), 'typed').toBe('lineZZ one\nline two')
  expect(await nullpad.status(), 'cursor after typing').toMatchObject({
    line: 1,
    column: 7,
  })
  await undo(nullpad)
  expect(await nullpad.text(), 'undone').toBe('line one\nline two')
  expect(await nullpad.status(), 'cursor before the change').toMatchObject({
    line: 1,
    column: 5,
  })
  await nullpad.press('Control+Shift+z')
  expect(await nullpad.text(), 'redone').toBe('lineZZ one\nline two')
  expect(await nullpad.status(), 'cursor after the change').toMatchObject({
    line: 1,
    column: 7,
  })

  await nullpad.press('Control+End')
  await nullpad.press('Backspace', 3)
  expect(await nullpad.text(), 'Backspaces at the end').toBe(
    'lineZZ one\nline t',
  )
  await undo(nullpad)
  expect(await nullpad.status(), 'cursor before the Backspaces').toMatchObject({
    line: 2,
    column: 9,
  })
  await nullpad.press('Control+y')
  expect(await nullpad.status(), 'cursor after the Backspaces').toMatchObject({
    line: 2,
    column: 7,
  })
})

test('Ctrl-Shift-Z and Ctrl-Y both redo', async ({ nullpad }) => {
  await nullpad.type('abc')
  for (const key of redoKeys) {
    await undo(nullpad)
    expect(await nullpad.text(), `before ${key}`).toBe('')
    await nullpad.press(key)
    expect(await nullpad.text(), `${key} puts the text back`).toBe('abc')
  }
})

test('an IME composition is one change at its commit, and Ctrl-Z while composing leaves the text', async ({
  nullpad,
}) => {
  await nullpad.paste('ab')
  await nullpad.compose('に')
  await nullpad.compose('にほ')
  await nullpad.compose('にほん')
  await undo(nullpad)
  expect(await nullpad.text(), 'Ctrl-Z while composing').toBe('ab')
  await nullpad.commit('日本')
  expect(await nullpad.text(), 'committed').toBe('ab日本')
  await undo(nullpad)
  expect(await nullpad.text(), 'one Ctrl-Z takes the whole composition').toBe(
    'ab',
  )
  await nullpad.press('Control+Shift+z')
  expect(await nullpad.text(), 'redo').toBe('ab日本')
})

const cancelled = async (nullpad: Nullpad, key: string) => {
  const seen = await nullpad.page.evaluateHandle(() => {
    const box: { cancelled: boolean | null } = { cancelled: null }
    window.addEventListener(
      'keydown',
      event => (box.cancelled = event.defaultPrevented),
      { once: true },
    )
    return box
  })
  await nullpad.page.keyboard.press(key)
  await settle(nullpad.page)
  return seen.evaluate(box => box.cancelled)
}

test('Ctrl-Z, Ctrl-Shift-Z and Ctrl-Y keydowns are cancelled with vim off', async ({
  nullpad,
}) => {
  await nullpad.type('abc')
  for (const key of ['Control+z', 'Control+Shift+z', 'Control+y']) {
    expect(await cancelled(nullpad, key), `${key} keydown cancelled`).toBe(true)
  }
})

test('Ctrl-R keydown is cancelled with vim on and left to the browser with vim off', async ({
  nullpad,
}) => {
  await nullpad.type('abc')
  await nullpad.page.keyboard.press(toggle)
  expect(await modeOf(nullpad), 'vim on').toBe('NORMAL')
  expect(
    await cancelled(nullpad, 'Control+r'),
    'vim on: Ctrl-R cancelled',
  ).toBe(true)
  expect(await nullpad.text(), 'the page did not reload').toBe('abc')
  expect(await modeOf(nullpad), 'vim still on').toBe('NORMAL')

  await nullpad.page.keyboard.press(toggle)
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  expect(
    await cancelled(nullpad, 'Control+r'),
    'vim off: Ctrl-R not cancelled',
  ).toBe(false)
})

test('history runs across the vim toggle both ways', async ({ nullpad }) => {
  await nullpad.type('abc')
  await nullpad.page.keyboard.press(toggle)
  await nullpad.press('u')
  expect(await nullpad.text(), 'u took the change made with vim off').toBe('')
  await nullpad.press('Control+r')
  expect(await nullpad.text(), 'Ctrl-R put it back').toBe('abc')

  await nullpad.type('ggdd')
  expect(await nullpad.text(), 'dd emptied the note').toBe('')
  await nullpad.page.keyboard.press(toggle)
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  await undo(nullpad)
  expect(await nullpad.text(), 'Ctrl-Z took the change made with vim on').toBe(
    'abc',
  )
  await nullpad.press('Control+y')
  expect(await nullpad.text(), 'Ctrl-Y redid it').toBe('')
})

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

test('another note has an empty history, and so has the first note when you come back', async ({
  nullpad,
}) => {
  await nullpad.type('first')
  await wait(nullpad)
  await startNote(nullpad, 'second')
  expect(await nullpad.text(), 'the second note').toBe('second')
  await undo(nullpad)
  expect(await nullpad.text(), 'Ctrl-Z on a new note').toBe('second')
  await nullpad.press('Control+End')
  await nullpad.type(' more')
  await undo(nullpad)
  expect(await nullpad.text(), 'only the typing is undone').toBe('second')
  await undo(nullpad)
  expect(await nullpad.text(), 'nothing more to undo').toBe('second')

  await openFinder(nullpad)
  await nullpad.type('first')
  await nullpad.press('Enter')
  expect(await nullpad.text(), 'back in the first note').toBe('first')
  await undo(nullpad)
  expect(await nullpad.text(), 'its history is empty').toBe('first')
  await nullpad.press('Control+Shift+z')
  expect(await nullpad.text(), 'nothing to redo').toBe('first')
})

test('a task box clicked in the read view is undone by u in the editor', async ({
  nullpad,
}) => {
  await startWith(nullpad, '- [ ] one\n- [ ] two')
  await nullpad.page.keyboard.press(toggle)
  await nullpad.press('Control+e')
  await expect(nullpad.page.locator('.read')).toBeVisible()
  await nullpad.page.locator('.read [role=checkbox]').nth(1).click()
  await settle(nullpad.page)
  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'back in the editor').toBe('NORMAL')
  expect(await nullpad.text(), 'the box is flipped').toBe(
    '- [ ] one\n- [x] two',
  )
  await nullpad.press('u')
  expect(await nullpad.text(), 'u flipped it back').toBe('- [ ] one\n- [ ] two')
  await nullpad.press('Control+r')
  expect(await nullpad.text(), 'Ctrl-R flipped it again').toBe(
    '- [ ] one\n- [x] two',
  )
})

test('u and Ctrl-Z do nothing in the read view and with the finder open', async ({
  nullpad,
}) => {
  await startWith(nullpad, 'base')
  await nullpad.page.keyboard.press(toggle)
  await nullpad.press('x')
  expect(await nullpad.text(), 'x').toBe('ase')

  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'read view').toBe('READ')
  await nullpad.press('u')
  await nullpad.press('Control+z')
  await nullpad.press('Escape')
  expect(await nullpad.text(), 'u in the read view changed nothing').toBe('ase')

  await openFinder(nullpad)
  await nullpad.press('Control+z')
  await nullpad.press('Escape')
  expect(await nullpad.finder(), 'finder closed').toBeNull()
  expect(await nullpad.text(), 'Ctrl-Z in the finder changed nothing').toBe(
    'ase',
  )
  await nullpad.press('u')
  expect(await nullpad.text(), 'the history was kept').toBe('base')
})

test('a note emptied by ggdG comes back with u after a save, and undo is saved like typing', async ({
  nullpad,
}) => {
  await startWith(nullpad, 'a\nb\nc')
  await nullpad.page.keyboard.press(toggle)
  await nullpad.type('ggdG')
  expect(await nullpad.text(), 'emptied').toBe('')
  await wait(nullpad)
  await nullpad.press('u')
  expect(await nullpad.text(), 'u brings the note back').toBe('a\nb\nc')
  await wait(nullpad)
  await nullpad.reload()
  expect(await nullpad.text(), 'after a reload').toBe('a\nb\nc')
})

test('the undone text is what a reload brings back, saved at once or after a wait', async ({
  nullpad,
}) => {
  await startWith(nullpad, 'base')
  await nullpad.press('End')
  await nullpad.type(' tail')
  await wait(nullpad)
  await undo(nullpad)
  expect(await nullpad.text(), 'undone').toBe('base')
  await wait(nullpad)
  await nullpad.reload()
  expect(await nullpad.text(), 'reload after a wait').toBe('base')

  await nullpad.press('End')
  await nullpad.type(' two')
  await wait(nullpad)
  await undo(nullpad)
  await nullpad.reload()
  expect(await nullpad.text(), 'reload right after Ctrl-Z').toBe('base')
  await undo(nullpad)
  expect(await nullpad.text(), 'a reload starts an empty history').toBe('base')
})

test('a change from another tab empties the history', async ({ nullpad }) => {
  await startWith(nullpad, 'base')
  await nullpad.press('End')
  await nullpad.type('!')
  await undo(nullpad)
  expect(await nullpad.text(), 'the history works before the other tab').toBe(
    'base',
  )
  await nullpad.press('Control+Shift+z')
  expect(await nullpad.text(), 'redo before the other tab').toBe('base!')
  await wait(nullpad)
  const other = await openTab(nullpad.page)
  expect(await other.text(), 'the second tab').toBe('base!')
  await other.press('Control+End')
  await other.type('?')
  await wait(other)
  await nullpad.page.bringToFront()
  await wait(nullpad, 500)
  expect(await nullpad.text(), 'the first tab took the change').toBe('base!?')
  await undo(nullpad)
  expect(await nullpad.text(), 'Ctrl-Z finds an empty history').toBe('base!?')
})

test('after u on a note of 3,000 lines the cursor line is on screen', async ({
  nullpad,
}) => {
  await startWith(nullpad, numberedLines(3000))
  await nullpad.page.keyboard.press(toggle)
  await nullpad.press('x')
  await nullpad.press('G')
  expect(await nullpad.status(), 'at the end').toMatchObject({ line: 3000 })
  await nullpad.press('u')
  expect(await nullpad.status(), 'cursor at the change').toMatchObject({
    line: 1,
  })
  const screen = await nullpad.screen()
  expect(screen.rows[0]?.text, 'the first line is drawn, undone').toBe('line 1')
  expect(screen.cursor?.inside, 'the cursor is on screen').toBe(true)
})
