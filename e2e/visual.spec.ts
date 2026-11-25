import {
  type Nullpad,
  expect,
  numberedLines,
  openFresh,
  settle,
  test,
} from './nullpad'

const SAVED = 1500
const ROWS_PER_TEST = 17
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
  A: 'one two three\nfour five six\nseven eight\nnine',
  B: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
  C: 'abc\n\nd\n\n\nef',
  D: 'abcdef\nab\nabcdef\nab\nz',
  E: 'p1 a\np1 b\n\np2 a\np2 b\n\np3 a',
  F: 'f(a, (b c), d)\nx "q r" y [s t] <u v>\n{ one\n  two }\nend',
  G: '  indented line\n\ttab line\nlast words here',
  H: 'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
  I: 'call(a,\n  b,\n  c)\nend [x y\nz] done',
} as const

const groups: ReadonlyArray<Group> = [
  {
    name: 'v with each motion, then d',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'vld',
        after: 'one two three\nfour ve six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'v2wd',
        after: 'one two three\nfour even eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'v2ed',
        after: 'one two three\nfour \nseven eight\nnine',
        line: 2,
        column: 5,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vkd',
        after: 'one tive six\nseven eight\nnine',
        line: 1,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vjhd',
        after: 'one two three\nfour  eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [3, 3],
        keys: 'vld',
        after: 'one two three\nfour five six\nsen eight\nnine',
        line: 3,
        column: 3,
      },
      {
        text: 'A',
        at: [3, 3],
        keys: 'v2wd',
        after: 'one two three\nfour five six\nseine',
        line: 3,
        column: 3,
      },
      {
        text: 'A',
        at: [3, 3],
        keys: 'v2ed',
        after: 'one two three\nfour five six\nse\nnine',
        line: 3,
        column: 2,
      },
      {
        text: 'A',
        at: [3, 3],
        keys: 'vkd',
        after: 'one two three\nfoen eight\nnine',
        line: 2,
        column: 3,
      },
      {
        text: 'A',
        at: [3, 3],
        keys: 'vjhd',
        after: 'one two three\nfour five six\nsene',
        line: 3,
        column: 3,
      },
    ],
  },
  {
    name: 'v with a motion, y and Esc',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlyGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\nfi',
        line: 5,
        column: 2,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vwyGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\nfive s',
        line: 5,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'veyGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\nfive',
        line: 5,
        column: 4,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vjyGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\nfive six\nseven ',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vkyGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\nwo three\nfour f',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vGyGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\nfive six\nseven eight\nn',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vjjyGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\nfive six\nseven eight\nnine',
        line: 5,
        column: 1,
      },
    ],
  },
  {
    name: 'V with motions, d, y and Esc',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'Vd',
        after: 'one two three\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'Vkd',
        after: 'seven eight\nnine',
        line: 1,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'VGd',
        after: 'one two three',
        line: 1,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'Vbd',
        after: 'one two three\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'Vjkd',
        after: 'one two three\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'G',
        at: [2, 4],
        keys: 'VyGo<Esc>p',
        after: '  indented line\n\ttab line\nlast words here\n\n\ttab line',
        line: 5,
        column: 2,
      },
      {
        text: 'G',
        at: [2, 4],
        keys: 'VGyGo<Esc>p',
        after:
          '  indented line\n\ttab line\nlast words here\n\n\ttab line\nlast words here',
        line: 5,
        column: 2,
      },
    ],
  },
  {
    name: 'v and V with arrows, Home, End, Space and Backspace',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'v<Right>d',
        after: 'one two three\nfour ve six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'v<Up>d',
        after: 'one tive six\nseven eight\nnine',
        line: 1,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'v3<Space>d',
        after: 'one two three\nfour  six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'v2<Right>d',
        after: 'one two three\nfour e six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'v<Down><End>d',
        after: 'one two three\nfour nine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 1],
        keys: 'v<BS>d',
        after: 'one two threeour five six\nseven eight\nnine',
        line: 1,
        column: 14,
      },
      {
        text: 'A',
        at: [1, 13],
        keys: 'v<Left>d',
        after: 'one two thr\nfour five six\nseven eight\nnine',
        line: 1,
        column: 11,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'V<Down>d',
        after: 'one two three\nnine',
        line: 2,
        column: 1,
      },
    ],
  },
  {
    name: 'o in v and V',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'vllo<Esc>',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlloyGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\nfiv',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vjo<Esc>',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlloo<Esc>',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 8,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vjlohd',
        after: 'one two three\nfouright\nnine',
        line: 2,
        column: 5,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vwowoyGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\ns',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'Vjokd',
        after: 'nine',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'v and V leave and switch kind, ends kept',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'lvd',
        after: 'one two three\nfour fve six\nseven eight\nnine',
        line: 2,
        column: 7,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'lVd',
        after: 'one two three\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'lVvd',
        after: 'one two three\nfour fve six\nseven eight\nnine',
        line: 2,
        column: 7,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'lvlVd',
        after: 'one two three\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'lvjVd',
        after: 'one two three\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'lvjVvod',
        after: 'one two three\nfour fight\nnine',
        line: 2,
        column: 7,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'lVjvd',
        after: 'one two three\nfour fight\nnine',
        line: 2,
        column: 7,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'lVjvod',
        after: 'one two three\nfour fight\nnine',
        line: 2,
        column: 7,
      },
    ],
  },
  {
    name: 'operators d x Delete y c s X D Y C S R on forward, backward and linewise selections',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlldGo<Esc>p',
        after: 'one two three\nfour e six\nseven eight\nnine\nfiv',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vllXGo<Esc>p',
        after: 'one two three\nseven eight\nnine\n\nfour five six',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vhhxGo<Esc>p',
        after: 'one two three\nfouive six\nseven eight\nnine\nr f',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vhhCZ<Esc>Go<Esc>p',
        after: 'one two three\nZ\nseven eight\nnine\n\nfour five six',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vjsZ<Esc>Go<Esc>p',
        after: 'one two three\nfour Zeight\nnine\nfive six\nseven ',
        line: 4,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vkdGo<Esc>p',
        after: 'one tive six\nseven eight\nnine\nwo three\nfour f',
        line: 4,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vkYGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\n\none two three\nfour five six',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 4],
        keys: 'vjjyGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\n two three\nfour five six\nseve',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 4],
        keys: 'vjjSZ<Esc>Go<Esc>p',
        after: 'Z\nnine\n\none two three\nfour five six\nseven eight',
        line: 4,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vcZ<Esc>Go<Esc>p',
        after: 'one two three\nfour Zive six\nseven eight\nnine\nf',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vRZ<Esc>Go<Esc>p',
        after: 'one two three\nZ\nseven eight\nnine\n\nfour five six',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'VXGo<Esc>p',
        after: 'one two three\nseven eight\nnine\n\nfour five six',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'VjxGo<Esc>p',
        after: 'one two three\nnine\n\nfour five six\nseven eight',
        line: 4,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'VjYGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\n\nfour five six\nseven eight',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'VkyGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\n\none two three\nfour five six',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'VkSZ<Esc>Go<Esc>p',
        after: 'Z\nseven eight\nnine\n\none two three\nfour five six',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 4],
        keys: 'VjjsZ<Esc>Go<Esc>p',
        after: 'Z\nnine\n\none two three\nfour five six\nseven eight',
        line: 4,
        column: 1,
      },
    ],
  },
  {
    name: 'empty lines and the cursor end on the line break',
    rows: [
      {
        text: 'C',
        at: [2, 1],
        keys: 'vd',
        after: 'abc\nd\n\n\nef',
        line: 2,
        column: 1,
      },
      {
        text: 'C',
        at: [2, 1],
        keys: 'vjd',
        after: 'abc\n\n\n\nef',
        line: 2,
        column: 1,
      },
      {
        text: 'C',
        at: [2, 1],
        keys: 'v$d',
        after: 'abc\nd\n\n\nef',
        line: 2,
        column: 1,
      },
      {
        text: 'C',
        at: [2, 1],
        keys: 'Vd',
        after: 'abc\nd\n\n\nef',
        line: 2,
        column: 1,
      },
      {
        text: 'C',
        at: [2, 1],
        keys: 'vjld',
        after: 'abc\n\n\nef',
        line: 2,
        column: 1,
      },
      {
        text: 'C',
        at: [4, 1],
        keys: 'vkd',
        after: 'abc\n\n\nef',
        line: 3,
        column: 1,
      },
      {
        text: 'C',
        at: [6, 1],
        keys: 'vd',
        after: 'abc\n\nd\n\n\nf',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 13],
        keys: 'vd',
        after: 'one two thre\nfour five six\nseven eight\nnine',
        line: 1,
        column: 12,
      },
      {
        text: 'A',
        at: [1, 13],
        keys: 'vlyGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\ne\n',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 13],
        keys: 'vlX',
        after: 'four five six\nseven eight\nnine',
        line: 1,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 13],
        keys: 'v$kd',
        after: 'one two threfour five six\nseven eight\nnine',
        line: 1,
        column: 13,
      },
      {
        text: 'A',
        at: [4, 4],
        keys: 'v$yGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\ne',
        line: 5,
        column: 1,
      },
    ],
  },
  {
    name: 'word objects select and grow',
    rows: [
      {
        text: 'A',
        at: [1, 6],
        keys: 'viwd',
        after: 'one  three\nfour five six\nseven eight\nnine',
        line: 1,
        column: 5,
      },
      {
        text: 'A',
        at: [1, 6],
        keys: 'viwiwiwd',
        after: 'one \nfour five six\nseven eight\nnine',
        line: 1,
        column: 4,
      },
      {
        text: 'A',
        at: [1, 6],
        keys: 'v2iwd',
        after: 'one three\nfour five six\nseven eight\nnine',
        line: 1,
        column: 5,
      },
      {
        text: 'A',
        at: [1, 6],
        keys: 'viwawd',
        after: 'one \nfour five six\nseven eight\nnine',
        line: 1,
        column: 4,
      },
      {
        text: 'A',
        at: [1, 6],
        keys: 'vlliwd',
        after: 'one t\nfour five six\nseven eight\nnine',
        line: 1,
        column: 5,
      },
      {
        text: 'A',
        at: [1, 6],
        keys: 'viwoiwd',
        after: 'one three\nfour five six\nseven eight\nnine',
        line: 1,
        column: 4,
      },
      {
        text: 'A',
        at: [1, 6],
        keys: 'vebd',
        after: 'one o three\nfour five six\nseven eight\nnine',
        line: 1,
        column: 5,
      },
      {
        text: 'A',
        at: [1, 6],
        keys: 'viWiWd',
        after: 'one three\nfour five six\nseven eight\nnine',
        line: 1,
        column: 5,
      },
      {
        text: 'A',
        at: [1, 3],
        keys: 'vawd',
        after: 'two three\nfour five six\nseven eight\nnine',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'paragraph objects select lines and grow',
    rows: [
      {
        text: 'E',
        at: [1, 2],
        keys: 'vipd',
        after: '\np2 a\np2 b\n\np3 a',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 2],
        keys: 'vapapd',
        after: 'p3 a',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 2],
        keys: 'vipod',
        after: '\np2 a\np2 b\n\np3 a',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [1, 2],
        keys: 'Vapd',
        after: 'p2 a\np2 b\n\np3 a',
        line: 1,
        column: 1,
      },
      {
        text: 'E',
        at: [3, 1],
        keys: 'vipd',
        after: 'p1 a\np1 b\np2 a\np2 b\n\np3 a',
        line: 3,
        column: 1,
      },
      {
        text: 'E',
        at: [3, 1],
        keys: 'vipjd',
        after: 'p1 a\np1 b\np2 b\n\np3 a',
        line: 3,
        column: 1,
      },
      {
        text: 'E',
        at: [7, 1],
        keys: 'vipd',
        after: 'p1 a\np1 b\n\np2 a\np2 b\n',
        line: 6,
        column: 1,
      },
      {
        text: 'E',
        at: [7, 1],
        keys: 'vipip<Esc>',
        after: 'p1 a\np1 b\n\np2 a\np2 b\n\np3 a',
        line: 7,
        column: 1,
      },
    ],
  },
  {
    name: 'quote and bracket objects select and grow',
    rows: [
      {
        text: 'F',
        at: [1, 7],
        keys: 'vi(d',
        after: 'f(a, (), d)\nx "q r" y [s t] <u v>\n{ one\n  two }\nend',
        line: 1,
        column: 7,
      },
      {
        text: 'F',
        at: [1, 7],
        keys: 'vi(a(d',
        after: 'f(a, , d)\nx "q r" y [s t] <u v>\n{ one\n  two }\nend',
        line: 1,
        column: 6,
      },
      {
        text: 'F',
        at: [1, 7],
        keys: 'va)d',
        after: 'f(a, , d)\nx "q r" y [s t] <u v>\n{ one\n  two }\nend',
        line: 1,
        column: 6,
      },
      {
        text: 'F',
        at: [1, 4],
        keys: 'vi(d',
        after: 'f()\nx "q r" y [s t] <u v>\n{ one\n  two }\nend',
        line: 1,
        column: 3,
      },
      {
        text: 'F',
        at: [1, 2],
        keys: 'vi(i(d',
        after: 'f()\nx "q r" y [s t] <u v>\n{ one\n  two }\nend',
        line: 1,
        column: 3,
      },
      {
        text: 'F',
        at: [2, 4],
        keys: 'vi"i"d',
        after: 'f(a, (b c), d)\nx  y [s t] <u v>\n{ one\n  two }\nend',
        line: 2,
        column: 3,
      },
      {
        text: 'F',
        at: [2, 4],
        keys: 'va"yGo<Esc>p',
        after:
          'f(a, (b c), d)\nx "q r" y [s t] <u v>\n{ one\n  two }\nend\n"q r" ',
        line: 6,
        column: 6,
      },
      {
        text: 'F',
        at: [2, 1],
        keys: "vi'd",
        after: 'f(a, (b c), d)\n "q r" y [s t] <u v>\n{ one\n  two }\nend',
        line: 2,
        column: 1,
      },
      {
        text: 'F',
        at: [2, 12],
        keys: 'va[a[d',
        after: 'f(a, (b c), d)\nx "q r" y  <u v>\n{ one\n  two }\nend',
        line: 2,
        column: 11,
      },
      {
        text: 'F',
        at: [3, 4],
        keys: 'vi{d',
        after: 'f(a, (b c), d)\nx "q r" y [s t] <u v>\n{}\nend',
        line: 3,
        column: 2,
      },
      {
        text: 'F',
        at: [3, 4],
        keys: 'vi{i{d',
        after: 'f(a, (b c), d)\nx "q r" y [s t] <u v>\n{}\nend',
        line: 3,
        column: 2,
      },
      {
        text: 'I',
        at: [3, 2],
        keys: 'vi(d',
        after: 'call()\nend [x y\nz] done',
        line: 1,
        column: 6,
      },
      {
        text: 'I',
        at: [2, 3],
        keys: 'vi(i(d',
        after: 'call()\nend [x y\nz] done',
        line: 1,
        column: 6,
      },
      {
        text: 'I',
        at: [4, 6],
        keys: 'vi[d',
        after: 'call(a,\n  b,\n  c)\nend [] done',
        line: 4,
        column: 6,
      },
    ],
  },
  {
    name: 'a text object can change the kind',
    rows: [
      {
        text: 'F',
        at: [1, 7],
        keys: 'vipd',
        after: '',
        line: 1,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 7],
        keys: 'Vi(d',
        after: 'f(a, (), d)\nx "q r" y [s t] <u v>\n{ one\n  two }\nend',
        line: 1,
        column: 7,
      },
      {
        text: 'F',
        at: [1, 7],
        keys: 'Va"yGo<Esc>p',
        after:
          'f(a, (b c), d)\nx "q r" y [s t] <u v>\n{ one\n  two }\nend\n\nf(a, (b c), d)',
        line: 7,
        column: 1,
      },
      {
        text: 'F',
        at: [1, 7],
        keys: 'vipvhd',
        after: 'f(a, (nd',
        line: 1,
        column: 7,
      },
      {
        text: 'F',
        at: [1, 7],
        keys: 'vipVd',
        after: 'f(a, (b c), d)\nx "q r" y [s t] <u v>\n{ one\n  two }\nend',
        line: 5,
        column: 1,
      },
      {
        text: 'E',
        at: [2, 2],
        keys: 'Viwd',
        after: 'p1 a\n b\n\np2 a\np2 b\n\np3 a',
        line: 2,
        column: 1,
      },
      {
        text: 'E',
        at: [2, 2],
        keys: 'vipVvod',
        after: 'p1 a\n1 b\n\np2 a\np2 b\n\np3 a',
        line: 2,
        column: 1,
      },
    ],
  },
  {
    name: 'p and P over letters with a letters register',
    rows: [
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwwviwpGo<Esc>p',
        after: 'one one three\nfour five six\nseven eight\nnine\ntwo',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwwviwppGo<Esc>p',
        after: 'one onetwo three\nfour five six\nseven eight\nnine\ntwo',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwwvlPGo<Esc>p',
        after: 'one oneo three\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwwVPGo<Esc>p',
        after: 'one\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwjvjpGo<Esc>p',
        after: 'one two three\noneeven eight\nnine\nfour five six\ns',
        line: 4,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwjv$PGo<Esc>p',
        after: 'one two three\noneseven eight\nnine\none',
        line: 4,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwwviwPuGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwwviwPGo<Esc>"0p',
        after: 'one one three\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
    ],
  },
  {
    name: 'p and P over a selection with a whole-lines register',
    rows: [
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjviwpGo<Esc>p',
        after:
          'one two three\n\none two three\n five six\nseven eight\nnine\nfour',
        line: 7,
        column: 4,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjviw3PGo<Esc>p',
        after:
          'one two three\n\none two three\none two three\none two three\n five six\nseven eight\nnine\n\none two three',
        line: 10,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjVpGo<Esc>p',
        after:
          'one two three\none two three\nseven eight\nnine\n\nfour five six',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjVj2pGo<Esc>p',
        after:
          'one two three\none two three\none two three\nnine\n\nfour five six\nseven eight',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjv$pGo<Esc>p',
        after:
          'one two three\n\none two three\nseven eight\nnine\nfour five six\n',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyVGpGo<Esc>p',
        after:
          'one two three\n\none two three\nfour five six\nseven eight\nnine',
        line: 3,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjviwppGo<Esc>p',
        after:
          'one two three\n\nofourne two three\n five six\nseven eight\nnine\nfour',
        line: 7,
        column: 4,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjVpu<C-r>Go<Esc>p',
        after:
          'one two three\none two three\nseven eight\nnine\n\nfour five six',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjviwPGo<Esc>"0p',
        after:
          'one two three\n\none two three\n five six\nseven eight\nnine\n\none two three',
        line: 8,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yjVpGo<Esc>p',
        after:
          'one two three\nfour five six\nfour five six\nseven eight\nnine\n\none two three',
        line: 7,
        column: 1,
      },
    ],
  },
  {
    name: 'p and P with an empty or small register',
    rows: [
      {
        text: 'C',
        at: [1, 1],
        keys: 'xvlpGo<Esc>p',
        after: 'a\n\nd\n\n\nef\nbc',
        line: 7,
        column: 2,
      },
    ],
  },
  {
    name: 'a register prefix before a Visual operator or put',
    rows: [
      {
        text: 'A',
        at: [1, 1],
        keys: 'viw"ayGo<Esc>"ap',
        after: 'one two three\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'viw"ay$"apGo<Esc>p',
        after: 'one two threeone\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: '"ayiwwviw"aP"aPGo<Esc>p',
        after: 'one ononee three\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwwviw"_dviwpGo<Esc>p',
        after: 'oneonethree\nfour five six\nseven eight\nnine\n  ',
        line: 5,
        column: 2,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'viw"axGo<Esc>"ap',
        after: ' two three\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'Vj"ay"apGo<Esc>p',
        after:
          'one two three\none two three\nfour five six\nfour five six\nseven eight\nnine\n\none two three\nfour five six',
        line: 8,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'viw"Ay"apGo<Esc>p',
        after: 'oonene two three\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'viw"0yGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\none',
        line: 5,
        column: 3,
      },
    ],
  },
  {
    name: 'what the unnamed and yank registers hold after a Visual operator',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'viw"ayGo<Esc>p',
        after: 'one two three\nfour five six\nseven eight\nnine\nfive',
        line: 5,
        column: 4,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'V"ayGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\n\nfour five six',
        line: 6,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'viwYGo<Esc>p',
        after:
          'one two three\nfour five six\nseven eight\nnine\n\nfour five six',
        line: 6,
        column: 1,
      },
    ],
  },
  {
    name: '. after a Visual operator repeats the same amount of text',
    rows: [
      {
        text: 'A',
        at: [1, 1],
        keys: 'vlldj0.',
        after: ' two three\nr five six\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'Vjd.',
        after: '',
        line: 1,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'vjdj.',
        after: 'our five six\nine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'vl3d.',
        after: 'two three\nfour five six\nseven eight\nnine',
        line: 1,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'Vjyj.',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'vapd.',
        after: '',
        line: 1,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'vlcXY<Esc>j0.',
        after: 'XYe two three\nXYur five six\nseven eight\nnine',
        line: 2,
        column: 2,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'vlxj0.',
        after: 'e two three\nur five six\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'vhd.',
        after: 'e two three\nfour five six\nseven eight\nnine',
        line: 1,
        column: 1,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: 'vjd.',
        after: 'bcdef\nab\nz',
        line: 1,
        column: 1,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: 'v$d.',
        after: 'abcdef\nab\nz',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: '. with tabs, a count before it, and after Visual p',
    rows: [
      {
        text: 'G',
        at: [1, 1],
        keys: 'vlld.',
        after: 'nted line\n\ttab line\nlast words here',
        line: 1,
        column: 1,
      },
      {
        text: 'G',
        at: [2, 1],
        keys: 'vlldj0.',
        after: '  indented line\nb line\n here',
        line: 3,
        column: 1,
      },
      {
        text: 'G',
        at: [2, 1],
        keys: 'vjdj.',
        after: '  indented line\n',
        line: 2,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 1],
        keys: 'Vjdj.',
        after: '',
        line: 1,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwjviwp.Go<Esc>p',
        after: 'one two three\nonve six\nseven eight\nnine\ne fi',
        line: 5,
        column: 4,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yyjVp.Go<Esc>p',
        after: 'one two three\nseven eight\nnine\n\none two three',
        line: 5,
        column: 1,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'yiwjvlp..Go<Esc>p',
        after: 'one two three\nonfive six\nseven eight\nnine\nr ',
        line: 5,
        column: 2,
      },
      {
        text: 'A',
        at: [1, 1],
        keys: 'vjd2.',
        after: 'even eight\nnine',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'u and Ctrl-R after a Visual operator are one change',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'vjdu',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlcX<Esc>u',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'yiwwviwpu',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 11,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlldu',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'jvkdu<C-r>',
        after: 'one two three\nfour eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vjXu',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlld.u<C-r>',
        after: 'one two three\nfour ix\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'VjRX<Esc>u',
        after: 'one two three\nfour five six\nseven eight\nnine',
        line: 3,
        column: 1,
      },
      {
        text: 'G',
        at: [1, 5],
        keys: 'Vjdu<C-r>',
        after: 'last words here',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'gv selects the last selection again with its kind',
    rows: [
      {
        text: 'A',
        at: [2, 6],
        keys: 'vll<Esc>gvd',
        after: 'one two three\nfour e six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vll<Esc>$gv<Esc>x',
        after: 'one two three\nfour fie six\nseven eight\nnine',
        line: 2,
        column: 8,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'Vj<Esc>gvd',
        after: 'one two three\nnine',
        line: 2,
        column: 1,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vj<Esc>Ggvd',
        after: 'one two three\nfour eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlyjgvd',
        after: 'one two three\nfour ve six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vlldgvyGo<Esc>p',
        after: 'one two three\nfour e six\nseven eight\nnine\ne s',
        line: 5,
        column: 3,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vl<Esc>gv<Esc>gvd',
        after: 'one two three\nfour ve six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
      {
        text: 'A',
        at: [2, 6],
        keys: 'vll<Esc>gvhod',
        after: 'one two three\nfour ve six\nseven eight\nnine',
        line: 2,
        column: 6,
      },
    ],
  },
  {
    name: 'the screen column j and k keep, and a count before an operator',
    rows: [
      {
        text: 'D',
        at: [1, 1],
        keys: '4lvjjd',
        after: 'abcdf\nab\nz',
        line: 1,
        column: 5,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: '4lvjjkd',
        after: 'abcdabcdef\nab\nz',
        line: 1,
        column: 5,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: '5lvjd',
        after: 'abcdeabcdef\nab\nz',
        line: 1,
        column: 6,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: '4lvjjhd',
        after: 'abcdef\nab\nz',
        line: 1,
        column: 5,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: 'vjjjjd',
        after: '',
        line: 1,
        column: 1,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: 'vGkd',
        after: 'b\nz',
        line: 1,
        column: 1,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: 'Vj3d',
        after: 'abcdef\nab\nz',
        line: 1,
        column: 1,
      },
      {
        text: 'D',
        at: [1, 1],
        keys: 'vl2cZ<Esc>',
        after: 'Zcdef\nab\nabcdef\nab\nz',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'motions that fail or stop at the start and end of the note',
    rows: [
      {
        text: 'H',
        at: [2, 5],
        keys: 'v2wd',
        after: 'foo bar baz\nfoo oo bar baz\nfoo bar baz',
        line: 2,
        column: 5,
      },
      {
        text: 'H',
        at: [2, 5],
        keys: 'vbbd',
        after: 'foo bar ar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 9,
      },
      {
        text: 'H',
        at: [2, 5],
        keys: 'vggod',
        after: 'ar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: 'vbd',
        after: 'oo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [1, 1],
        keys: 'vggd',
        after: 'oo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
        line: 1,
        column: 1,
      },
      {
        text: 'H',
        at: [4, 11],
        keys: 'vjd',
        after: 'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar ba',
        line: 4,
        column: 10,
      },
      {
        text: 'H',
        at: [4, 11],
        keys: 'vGd',
        after: 'foo bar baz\nfoo bar baz\nfoo bar baz\n',
        line: 4,
        column: 1,
      },
    ],
  },
]

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Del>': 'Delete',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Up>': 'ArrowUp',
  '<Down>': 'ArrowDown',
  '<Home>': 'Home',
  '<End>': 'End',
  '<Space>': ' ',
  '<C-r>': 'Control+r',
  '<C-[>': 'Control+[',
  '<C-e>': 'Control+e',
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .pending').innerText()
}

const clipboardOf = (nullpad: Nullpad) =>
  nullpad.page.evaluate(() => navigator.clipboard.readText())

const setClipboard = (nullpad: Nullpad, text: string) =>
  nullpad.page.evaluate(value => navigator.clipboard.writeText(value), text)

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of keys.match(/<[A-Za-z-[\]]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
}

const vimOn = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press(toggle)
  await settle(nullpad.page)
}

const placeAt = async (nullpad: Nullpad, line: number, column: number) => {
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', line - 1)
  await nullpad.press('Home')
  await nullpad.press('ArrowRight', column - 1)
}

const selectionOf = async (nullpad: Nullpad): Promise<string> => {
  await settle(nullpad.page)
  const read: unknown = Reflect.get(nullpad, 'selection')
  if (typeof read !== 'function') {
    throw new Error('the fixture has no nullpad.selection() yet')
  }
  const text: unknown = await Reflect.apply(read, nullpad, [])
  if (typeof text !== 'string') {
    throw new Error(`nullpad.selection() gave ${typeof text}, not a string`)
  }
  return text
}

const kindOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const selection = nullpad.page.locator('#selection')
  return (await selection.count()) === 0
    ? 'none'
    : ((await selection.first().getAttribute('data-kind')) ?? '')
}

type Box = Readonly<{
  left: number
  top: number
  right: number
  bottom: number
}>

const selectionBox = async (nullpad: Nullpad): Promise<Box | null> => {
  await settle(nullpad.page)
  return nullpad.page.evaluate(() => {
    const root = document.getElementById('selection')
    if (root === null) {
      return null
    }
    const rects = [root, ...root.querySelectorAll('*')]
      .flatMap(element => [...element.getClientRects()])
      .filter(rect => rect.width > 0 && rect.height > 0)
    if (rects.length === 0) {
      return null
    }
    return {
      left: Math.min(...rects.map(rect => rect.left)),
      top: Math.min(...rects.map(rect => rect.top)),
      right: Math.max(...rects.map(rect => rect.right)),
      bottom: Math.max(...rects.map(rect => rect.bottom)),
    }
  })
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  const label = `${row.text} at ${row.at.join(':')} keys ${row.keys}`
  await openFresh(nullpad.page)
  await nullpad.paste(texts[row.text])
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
    test(`visual ${group.name} act as in Vim (rows ${from + 1} to ${from + rows.length})`, async ({
      nullpad,
    }) => {
      for (const row of rows) {
        await playRow(nullpad, row)
      }
    })
  }
}

const begin = async (nullpad: Nullpad, text: string) => {
  await nullpad.paste(text)
  await nullpad.press('Control+Home')
  await vimOn(nullpad)
}

const expectState = async (
  nullpad: Nullpad,
  label: string,
  state: Readonly<{ mode: string; kind: string; selection: string }>,
) => {
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe(state.mode)
  expect
    .soft(await kindOf(nullpad), `${label}: #selection kind`)
    .toBe(state.kind)
  expect
    .soft(await selectionOf(nullpad), `${label}: selected text`)
    .toBe(state.selection)
}

const left = (mode: string) => ({ mode, kind: 'none', selection: '' })

test('the mode reads VISUAL and V-LINE as v and V come and go', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\nthree four\nfive')
  expect(await modeOf(nullpad), 'start').toBe('NORMAL')
  await play(nullpad, 'v')
  expect(await modeOf(nullpad), 'v').toBe('VISUAL')
  await play(nullpad, 'v')
  expect(await modeOf(nullpad), 'v again leaves').toBe('NORMAL')
  await play(nullpad, 'V')
  expect(await modeOf(nullpad), 'V').toBe('V-LINE')
  await play(nullpad, 'V')
  expect(await modeOf(nullpad), 'V again leaves').toBe('NORMAL')
  await play(nullpad, 'vV')
  expect(await modeOf(nullpad), 'v then V switches to lines').toBe('V-LINE')
  await play(nullpad, 'v')
  expect(await modeOf(nullpad), 'v in V-LINE switches to letters').toBe(
    'VISUAL',
  )
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'Esc from VISUAL').toBe('NORMAL')
  await play(nullpad, 'V<Esc>')
  expect(await modeOf(nullpad), 'Esc from V-LINE').toBe('NORMAL')
  await play(nullpad, 'vl<C-[>')
  expect(await modeOf(nullpad), 'Ctrl-[ from VISUAL').toBe('NORMAL')
  expect(await kindOf(nullpad), 'nothing selected after Ctrl-[').toBe('none')
  await play(nullpad, 'Vj<C-[>')
  expect(await modeOf(nullpad), 'Ctrl-[ from V-LINE').toBe('NORMAL')
  await play(nullpad, 'ggvd')
  expect(await modeOf(nullpad), 'an operator returns to NORMAL').toBe('NORMAL')
  await play(nullpad, 'vc')
  expect(await modeOf(nullpad), 'vc enters INSERT').toBe('INSERT')
  await play(nullpad, 'X<Esc>')
  expect(await modeOf(nullpad), 'Esc from the change').toBe('NORMAL')
  expect(await nullpad.text(), 'vd took o and vc took n and typed X').toBe(
    'Xe two\nthree four\nfive',
  )
  await play(nullpad, 'Vy')
  expect(await modeOf(nullpad), 'y returns to NORMAL').toBe('NORMAL')
  await play(nullpad, 'VC')
  expect(await modeOf(nullpad), 'VC enters INSERT').toBe('INSERT')
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'Esc after VC').toBe('NORMAL')
})

test('the status line shows the pending keys in VISUAL as in NORMAL', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two three')
  await play(nullpad, 'v')
  expect(await modeOf(nullpad), 'v').toBe('VISUAL')
  await play(nullpad, '2')
  expect(await pendingOf(nullpad), 'a count').toBe('2')
  await play(nullpad, 'g')
  expect(await pendingOf(nullpad), 'a count and g').toBe('2g')
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'Esc drops them').toBe('')
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'a second Esc is in NORMAL').toBe('NORMAL')
  await play(nullpad, 'v"')
  expect(await modeOf(nullpad), 'v and a quote').toBe('VISUAL')
  expect(await pendingOf(nullpad), 'a quote waits for a name').toBe('"')
  await play(nullpad, 'a')
  expect(await pendingOf(nullpad), 'the register is named').toBe('"a')
  await play(nullpad, 'y')
  expect(await pendingOf(nullpad), 'the yank is done').toBe('')
  expect(await modeOf(nullpad), 'NORMAL after the yank').toBe('NORMAL')
  await play(nullpad, 'vi')
  expect(await modeOf(nullpad), 'v and i').toBe('VISUAL')
  expect(await pendingOf(nullpad), 'i waits for an object').toBe('i')
  await play(nullpad, 'w')
  expect(await pendingOf(nullpad), 'the object is read').toBe('')
  expect(await selectionOf(nullpad), 'viw selects the word').toBe('one')
  await play(nullpad, 'a')
  expect(await pendingOf(nullpad), 'a waits for an object').toBe('a')
  await play(nullpad, 'w')
  expect(await selectionOf(nullpad), 'viwaw grows by the next word').toBe(
    'one two',
  )
})

test('the selection is the letters between the ends, the letter under the cursor included, and whole lines in V-LINE', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc def\nghi jkl\nmno')
  await expectState(nullpad, 'before v', left('NORMAL'))
  await play(nullpad, 'v')
  await expectState(nullpad, 'v', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'a',
  })
  await play(nullpad, 'l')
  await expectState(nullpad, 'vl', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'ab',
  })
  await play(nullpad, 'o')
  await expectState(nullpad, 'vlo keeps the same text', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'ab',
  })
  await play(nullpad, 'h')
  await expectState(nullpad, 'vloh moves the other end', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'ab',
  })
  await play(nullpad, '<Esc>')
  await expectState(nullpad, 'Esc', left('NORMAL'))

  await play(nullpad, 'V')
  await expectState(nullpad, 'V', {
    mode: 'V-LINE',
    kind: 'lines',
    selection: 'abc def\n',
  })
  await play(nullpad, 'j')
  await expectState(nullpad, 'Vj', {
    mode: 'V-LINE',
    kind: 'lines',
    selection: 'abc def\nghi jkl\n',
  })
  await play(nullpad, 'o')
  await expectState(nullpad, 'Vjo', {
    mode: 'V-LINE',
    kind: 'lines',
    selection: 'abc def\nghi jkl\n',
  })
  await play(nullpad, 'jj')
  await expectState(
    nullpad,
    'Vjojj keeps the second line and moves the cursor end down',
    {
      mode: 'V-LINE',
      kind: 'lines',
      selection: 'ghi jkl\nmno\n',
    },
  )
  await play(nullpad, '<Esc>')
  await expectState(nullpad, 'Esc', left('NORMAL'))

  await play(nullpad, 'ggwviw')
  await expectState(nullpad, 'wviw', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'def',
  })
  await play(nullpad, '<Esc>gg')
  await play(nullpad, 'v3l')
  await expectState(nullpad, 'v3l', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'abc ',
  })
  await play(nullpad, 'j')
  await expectState(nullpad, 'v3lj', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'abc def\nghi ',
  })
  await play(nullpad, '<Esc>ggwvj')
  await expectState(nullpad, 'wvj keeps the column', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'def\nghi j',
  })
  await play(nullpad, '<Esc>')
  expect(await nullpad.text(), 'selecting changed no text').toBe(
    'abc def\nghi jkl\nmno',
  )
})

test('a text object changes the kind as in Vim, and v and V switch it keeping both ends', async ({
  nullpad,
}) => {
  await begin(nullpad, 'a b\nc d\n\ne f(g h) i\nj')
  await play(nullpad, 'vip')
  await expectState(nullpad, 'vip makes whole lines', {
    mode: 'V-LINE',
    kind: 'lines',
    selection: 'a b\nc d\n',
  })
  await play(nullpad, '<Esc>ggViw')
  await expectState(nullpad, 'iw in V-LINE makes letters', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'a',
  })
  await play(nullpad, '<Esc>4G0wll')
  expect(await nullpad.status(), 'the cursor is on g').toMatchObject({
    line: 4,
    column: 5,
  })
  await play(nullpad, 'Vi(')
  await expectState(nullpad, 'Vi( makes letters', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'g h',
  })
  await play(nullpad, 'a(')
  await expectState(nullpad, 'Vi(a( grows to the brackets', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: '(g h)',
  })
  await play(nullpad, '<Esc>ggvjV')
  await expectState(nullpad, 'vjV keeps both ends as lines', {
    mode: 'V-LINE',
    kind: 'lines',
    selection: 'a b\nc d\n',
  })
  await play(nullpad, 'v')
  await expectState(nullpad, 'vjVv keeps both ends as letters', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'a b\nc',
  })
  await play(nullpad, 'V')
  await expectState(nullpad, 'vjVvV', {
    mode: 'V-LINE',
    kind: 'lines',
    selection: 'a b\nc d\n',
  })
  await play(nullpad, 'v<Esc>')
  expect(
    await nullpad.status(),
    'after leaving the cursor is the cursor end',
  ).toMatchObject({
    line: 2,
    column: 1,
  })
})

test('gv selects the last selection again with its kind, after Esc and after an operator', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\nghijkl\nmnopqr')
  await play(nullpad, 'lvll<Esc>')
  await play(nullpad, 'jgv')
  await expectState(nullpad, 'gv after Esc', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'bcd',
  })
  await play(nullpad, '<Esc>')
  expect(
    await nullpad.status(),
    'Esc leaves the cursor on the cursor end',
  ).toMatchObject({
    line: 1,
    column: 4,
  })
  await play(nullpad, 'GVk<Esc>gg')
  await play(nullpad, 'gv')
  await expectState(nullpad, 'gv remembers the lines of V', {
    mode: 'V-LINE',
    kind: 'lines',
    selection: 'ghijkl\nmnopqr\n',
  })
  await play(nullpad, '<Esc>ggjvly')
  await play(nullpad, 'gg')
  await play(nullpad, 'gv')
  await expectState(nullpad, 'gv after a yank', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'gh',
  })
  await play(nullpad, 'd')
  expect(await nullpad.text(), 'd took gh').toBe('abcdef\nijkl\nmnopqr')
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
  await play(nullpad, 'gv')
  expect(await modeOf(nullpad), 'gv after an operator selects again').toBe(
    'VISUAL',
  )
  expect(await kindOf(nullpad), 'with the kind it had').toBe('letters')
  await play(nullpad, '<Esc>')
})

test('a selection on an empty line is its line break, one cell wide, and vd removes the line', async ({
  nullpad,
}) => {
  await begin(nullpad, 'a\n\nb')
  await play(nullpad, 'j')
  await play(nullpad, 'v')
  await expectState(nullpad, 'v on an empty line', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: '\n',
  })
  const box = await selectionBox(nullpad)
  const { cell } = await nullpad.screen()
  expect(box, 'the selection is drawn').not.toBeNull()
  expect(
    (box?.right ?? 0) - (box?.left ?? 0),
    'one cell wide, as Vim draws it',
  ).toBeGreaterThan(cell - 2)
  expect((box?.right ?? 0) - (box?.left ?? 0), 'and no more').toBeLessThan(
    cell + 2,
  )
  await play(nullpad, 'd')
  expect(await nullpad.text(), 'vd removed the empty line').toBe('a\nb')
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
})

test('the selection is drawn over emoji and wide letters, a whole letter at a time', async ({
  nullpad,
}) => {
  await begin(nullpad, 'a😀b世c')
  const { cell } = await nullpad.screen()
  const width = async () => {
    const box = await selectionBox(nullpad)
    return box === null ? 0 : box.right - box.left
  }
  await play(nullpad, 'vl')
  await expectState(nullpad, 'vl over an emoji', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'a😀',
  })
  expect(
    await width(),
    'a letter and an emoji are three cells',
  ).toBeGreaterThan(3 * cell - 2)
  expect(await width(), 'a letter and an emoji are three cells').toBeLessThan(
    3 * cell + 2,
  )
  await play(nullpad, '<Esc>0l')
  await play(nullpad, 'v')
  await expectState(nullpad, 'v on the emoji', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: '😀',
  })
  expect(await width(), 'the emoji is two cells wide').toBeGreaterThan(
    2 * cell - 2,
  )
  expect(await width(), 'the emoji is two cells wide').toBeLessThan(
    2 * cell + 2,
  )
  await play(nullpad, '<Esc>l')
  await play(nullpad, 'vl')
  await expectState(nullpad, 'vl over b and a wide letter', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'b世',
  })
  await play(nullpad, 'd')
  expect(await nullpad.text(), 'vd took both letters').toBe('a😀c')
  await play(nullpad, '0lvd')
  expect(await nullpad.text(), 'vd on the emoji takes the whole emoji').toBe(
    'ac',
  )
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'u brings it back in one change').toBe('a😀c')
})

test('the selection runs across the rows of a wrapped line', async ({
  nullpad,
}) => {
  const line = 'lorem ipsum '.repeat(40).trim()
  await begin(nullpad, `${line}\nend`)
  const { rowHeight } = await nullpad.screen()
  await play(nullpad, 'v200l')
  expect(await modeOf(nullpad), 'VISUAL').toBe('VISUAL')
  expect(await selectionOf(nullpad), '201 letters of the line').toBe(
    line.slice(0, 201),
  )
  const box = await selectionBox(nullpad)
  expect(
    (box?.bottom ?? 0) - (box?.top ?? 0),
    'the highlight covers at least three rows',
  ).toBeGreaterThan(2.5 * rowHeight)
  await play(nullpad, '<Esc>V')
  expect(await selectionOf(nullpad), 'V selects the whole wrapped line').toBe(
    `${line}\n`,
  )
  const lines = await nullpad.screen()
  const caret = lines.cursor
  const whole = await selectionBox(nullpad)
  expect(
    (whole?.bottom ?? 0) - (whole?.top ?? 0),
    'V covers every row of the line',
  ).toBeGreaterThan(3.5 * rowHeight)
  expect(caret, 'the cursor is on screen').not.toBeNull()
  await play(nullpad, 'd')
  expect(await nullpad.text(), 'Vd removed the line').toBe('end')
})

test('a click leaves VISUAL and V-LINE with nothing selected', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two three\nfour five six\nseven')
  await play(nullpad, 'viw')
  expect(await modeOf(nullpad), 'viw').toBe('VISUAL')
  const screen = await nullpad.screen()
  const row = screen.rows[1]
  if (row === undefined) {
    throw new Error('no second row')
  }
  await nullpad.click(
    row.left + 5.2 * screen.cell,
    row.top + screen.rowHeight / 2,
  )
  await expectState(nullpad, 'a click in VISUAL', left('NORMAL'))
  expect(await nullpad.status(), 'the cursor went to the click').toMatchObject({
    line: 2,
    column: 6,
  })
  await play(nullpad, 'Vj')
  expect(await modeOf(nullpad), 'Vj').toBe('V-LINE')
  await nullpad.click(
    row.left + 2.2 * screen.cell,
    row.top + screen.rowHeight / 2,
  )
  await expectState(nullpad, 'a click in V-LINE', left('NORMAL'))
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'the next key is a plain x at the click').toBe(
    'one two three\nfor five six\nseven',
  )
})

test('the vim button and Ctrl-comma leave VISUAL, and vim comes back in NORMAL', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\nthree')
  const button = nullpad.page.locator('.status .toggle-vim')
  await play(nullpad, 'viw')
  expect(await modeOf(nullpad), 'viw').toBe('VISUAL')
  await button.click()
  await settle(nullpad.page)
  await expectState(nullpad, 'the button turns vim off', left('EDIT'))
  await button.click()
  await settle(nullpad.page)
  await expectState(nullpad, 'the button turns vim on again', left('NORMAL'))
  await play(nullpad, 'Vj')
  expect(await modeOf(nullpad), 'Vj').toBe('V-LINE')
  await nullpad.press(toggle)
  await expectState(nullpad, 'Ctrl-comma turns vim off in V-LINE', left('EDIT'))
  await nullpad.press(toggle)
  await expectState(nullpad, 'and on', left('NORMAL'))
  await play(nullpad, 'gg0x')
  expect(await nullpad.text(), 'the next key is a plain x').toBe(
    'ne two\nthree',
  )
})

test('the read view closes the selection, and coming back is NORMAL', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\nthree four')
  await play(nullpad, 'wviw')
  expect(await modeOf(nullpad), 'viw').toBe('VISUAL')
  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'Ctrl-E opens the read view').toBe('READ')
  await nullpad.press('Escape')
  await expectState(nullpad, 'Esc closes the read view', left('NORMAL'))
  await play(nullpad, 'x')
  expect((await nullpad.text()).length, 'x deleted one letter').toBe(
    'one two\nthree four'.length - 1,
  )
  await play(nullpad, 'u')
  await play(nullpad, 'Vj')
  expect(await modeOf(nullpad), 'Vj').toBe('V-LINE')
  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'Ctrl-E in V-LINE').toBe('READ')
  await nullpad.press('Control+e')
  await expectState(nullpad, 'Ctrl-E closes it', left('NORMAL'))
  expect(await nullpad.text(), 'the text is whole').toBe('one two\nthree four')
})

test('a paste in VISUAL replaces the selection and lands in NORMAL as one change', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two three')
  await play(nullpad, 'wviw')
  await expectState(nullpad, 'wviw', {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'two',
  })
  await nullpad.paste('ZZ')
  expect(await nullpad.text(), 'the paste replaced the word').toBe(
    'one ZZ three',
  )
  await expectState(nullpad, 'after the paste', left('NORMAL'))
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u undoes the replacement').toBe(
    'one two three',
  )
  await play(nullpad, '0wvlld')
  expect(await nullpad.text(), 'the editor still works').toBe('one  three')
})

test('Ctrl-V in NORMAL still pastes', async ({ nullpad }) => {
  await begin(nullpad, 'abc\ndef')
  await nullpad.paste('PP')
  expect(
    await nullpad.text(),
    'Ctrl-V in NORMAL pastes the clipboard text',
  ).toBe('PPabc\ndef')
  expect(await modeOf(nullpad), 'still NORMAL after Ctrl-V').toBe('NORMAL')
  await play(nullpad, 'gg0v<Esc>')
  await nullpad.paste('Q')
  expect(await nullpad.text(), 'and after a v and Esc').toBe('QPPabc\ndef')
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
})

test('IME text and longer typed text change nothing in VISUAL', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two three')
  await play(nullpad, 'wviw')
  const selected = {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'two',
  }
  await expectState(nullpad, 'wviw', selected)
  await nullpad.compose('ab')
  await expectState(nullpad, 'a composition', selected)
  await nullpad.commit('xyz')
  await expectState(nullpad, 'the commit of it', selected)
  await nullpad.commit('hello world')
  await expectState(nullpad, 'longer text from one key', selected)
  expect(await nullpad.text(), 'no text changed').toBe('one two three')
  await play(nullpad, 'd')
  expect(await nullpad.text(), 'the selection was still there for d').toBe(
    'one  three',
  )
})

test('keys that are not built do nothing and stay in VISUAL', async ({
  nullpad,
}) => {
  await begin(nullpad, 'Hello World\nsecond line')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x').toBe('ello World\nsecond line')
  await play(nullpad, 'vl')
  const selected = {
    mode: 'VISUAL',
    kind: 'letters',
    selection: 'el',
  }
  await expectState(nullpad, 'vl', selected)
  for (const key of ['J', '~', 'u', 'U', 'r', '>', '<', '=', ':', '/']) {
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    await expectState(nullpad, `the key ${key}`, selected)
    expect(await nullpad.text(), `the key ${key} changed no text`).toBe(
      'ello World\nsecond line',
    )
  }
  await play(nullpad, '<Esc>')
  await expectState(nullpad, 'Esc', left('NORMAL'))
  await play(nullpad, 'Vj')
  for (const key of ['J', '~', 'u', 'U', '>', '<']) {
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await modeOf(nullpad), `the key ${key} in V-LINE`).toBe('V-LINE')
    expect(
      await nullpad.text(),
      `the key ${key} in V-LINE changed no text`,
    ).toBe('ello World\nsecond line')
  }
})

test('a count before an operator in VISUAL is ignored, a count before p puts that many copies', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdefghij\nxyz')
  await play(nullpad, 'vl3')
  expect(await pendingOf(nullpad), 'the count waits').toBe('3')
  await play(nullpad, 'd')
  expect(await nullpad.text(), 'vl3d took two letters, as Vim does').toBe(
    'cdefghij\nxyz',
  )
  await play(nullpad, 'yl')
  await play(nullpad, 'wvl')
  await play(nullpad, '3p')
  expect(await nullpad.text(), 'vl3p put three copies over two letters').toBe(
    'cdefghij\ncccz',
  )
  await expectState(nullpad, 'after the put', left('NORMAL'))
})

test('"+y writes the system clipboard from VISUAL and "+p replaces a selection with it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'alpha beta\ngamma')
  await setClipboard(nullpad, 'OLD')
  await play(nullpad, 'viw"+y')
  await expect
    .poll(() => clipboardOf(nullpad), {
      message: 'viw"+y wrote the word',
      timeout: 3000,
    })
    .toBe('alpha')
  expect(await modeOf(nullpad), 'NORMAL after the yank').toBe('NORMAL')
  await play(nullpad, 'wviw"+p')
  await expect
    .poll(() => nullpad.text(), {
      message: '"+p replaced beta with the clipboard text',
      timeout: 5000,
    })
    .toBe('alpha alpha\ngamma')
  expect(await modeOf(nullpad), 'NORMAL after the put').toBe('NORMAL')
  await play(nullpad, 'jV"+y')
  await expect
    .poll(() => clipboardOf(nullpad), {
      message: 'V"+y wrote the line with its line feed',
      timeout: 3000,
    })
    .toBe('gamma\n')
  await setClipboard(nullpad, 'NEW\n')
  await play(nullpad, 'ggV"+p')
  await expect
    .poll(() => nullpad.text(), {
      message: 'V"+p replaced the line with the clipboard line',
      timeout: 5000,
    })
    .toBe('NEW\ngamma')
  await play(nullpad, 'jviw"+d')
  await expect
    .poll(() => clipboardOf(nullpad), {
      message: 'viw"+d wrote what it deleted',
      timeout: 3000,
    })
    .toBe('gamma')
})

test('opening another note from the finder leaves VISUAL', async ({
  nullpad,
}) => {
  await begin(nullpad, 'first note text')
  await play(nullpad, 'viw')
  expect(await modeOf(nullpad), 'viw').toBe('VISUAL')
  await nullpad.page.waitForTimeout(SAVED)
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
  await nullpad.type('second')
  for (let i = 0; i < 20; i++) {
    const selected = (await nullpad.finder())?.rows.find(row => row.selected)
    if (selected?.text.startsWith('+ new note')) {
      break
    }
    await nullpad.press('ArrowDown')
  }
  await nullpad.press('Enter')
  expect(await nullpad.text(), 'the new note').toBe('second')
  await expectState(nullpad, 'in the new note', left('NORMAL'))
})

test('a held j in V-LINE on a 20,000-line note selects every line it passed', async ({
  nullpad,
}) => {
  await begin(nullpad, numberedLines(20_000))
  await play(nullpad, 'V')
  expect(await modeOf(nullpad), 'V').toBe('V-LINE')
  const held = 250
  for (let i = 0; i < held; i++) {
    await nullpad.page.keyboard.down('j')
  }
  await nullpad.page.keyboard.up('j')
  await expect
    .poll(async () => (await nullpad.status()).line, {
      message: 'the cursor reached the line after the held keys',
      timeout: 10_000,
    })
    .toBe(held + 1)
  expect(await modeOf(nullpad), 'still V-LINE').toBe('V-LINE')
  expect(await kindOf(nullpad), 'lines are selected').toBe('lines')
  await play(nullpad, 'd')
  expect(
    (await nullpad.status()).lineCount,
    'd took the first line and the 250 below it',
  ).toBe(20_000 - held - 1)
  expect(
    (await nullpad.text()).startsWith(`line ${held + 2}\nline ${held + 3}`),
    'the note now starts at the first line that was not selected',
  ).toBe(true)
  await play(nullpad, 'u')
  expect((await nullpad.status()).lineCount, 'u brings all of them back').toBe(
    20_000,
  )
})
