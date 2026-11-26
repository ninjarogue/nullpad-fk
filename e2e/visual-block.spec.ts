import {
  type Nullpad,
  expect,
  numberedLines,
  openTab,
  settle,
  test,
  startVimRow,
} from './nullpad'

const ROWS_PER_TEST = 12
const toggle = 'Control+,'
const BLOCKED = 'clipboard blocked, use Ctrl-Shift-V'

type State = Readonly<{
  text: string
  line: number
  column: number
  mode: string
  selection?: string
}>

type Row = Readonly<{
  note: keyof typeof notes
  at: readonly [number, number]
  keys: string
  state: State
  readback?: Readonly<{ keys: string; state: State }>
}>

type Group = Readonly<{ name: string; rows: ReadonlyArray<Row> }>

const notes = {
  T1: 'abcdef\nab\nabcdef\nabcdef',
  T2: 'abcdef\n\nabcdef',
  RAG: 'abcdef\nab\nabcdefgh\nabcd',
  T3: 'one two\nthree four\nfive six',
  DIG: '0123456789\nabcdefghij\nklmnopqrst\nuvwxyzABCD',
  TXT: 'one two three\nfour five six\nseven eight\nnine',
  OBJ: 'f(a b) "q r" x\nf(a b) "q r" x',
  TAB: 'a\tbcd\nabcdefghijkl\n\tx\ty',
  TAB2: 'abcdefghijkl\n\tx\ty\nabcdefghijkl',
  WIDE: 'ab字cd\nabcdef\na字字b',
} as const

const groups: ReadonlyArray<Group> = [
  {
    name: 'enter, leave and switch the kind',
    rows: [
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 2,
          mode: 'V-BLOCK',
          selection: 'b',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v><C-v>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jlv',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 3,
          mode: 'VISUAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jlV',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 3,
          mode: 'V-LINE',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: 'vjl<C-v>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'bc\nb',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: 'Vj<C-v>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 2,
          mode: 'V-BLOCK',
          selection: 'b\nb',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jl<Esc>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jl<C-[>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jl<C-c>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jlv<C-v>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'bc\nb',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jlVv',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 3,
          mode: 'VISUAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jlvd',
        state: {
          text: 'aabcdef\nabcdef',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: 'vjl<C-v>d',
        state: {
          text: 'adef\na\nabcdef\nabcdef',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: 'Vj<C-v>d',
        state: {
          text: 'acdef\na\nabcdef\nabcdef',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>ip',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 4,
          column: 1,
          mode: 'V-LINE',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>iw',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 6,
          mode: 'V-BLOCK',
          selection: 'abcdef',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jl<Esc>gggv',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'bc\nb',
        },
      },
    ],
  },
  {
    name: 'motions, $, o and O',
    rows: [
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>j',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 2,
          mode: 'V-BLOCK',
          selection: 'b\nb',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>2jl',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 3,
          column: 4,
          mode: 'V-BLOCK',
          selection: 'cd\n\ncd',
        },
      },
      {
        note: 'T1',
        at: [1, 5],
        keys: '<C-v>j',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'cde\n',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>Gl',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 4,
          column: 2,
          mode: 'V-BLOCK',
          selection: 'bc\nb\nbc\nbc',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$',
        state: {
          text: 'abcdef\nab\nabcdefgh\nabcd',
          line: 4,
          column: 5,
          mode: 'V-BLOCK',
          selection: 'cdef\n\ncdefgh\ncd',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$k',
        state: {
          text: 'abcdef\nab\nabcdefgh\nabcd',
          line: 3,
          column: 9,
          mode: 'V-BLOCK',
          selection: 'cdef\n\ncdefgh',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$h',
        state: {
          text: 'abcdef\nab\nabcdefgh\nabcd',
          line: 4,
          column: 4,
          mode: 'V-BLOCK',
          selection: 'cd\n\ncd\ncd',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$o',
        state: {
          text: 'abcdef\nab\nabcdefgh\nabcd',
          line: 1,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'cde\n\ncde\ncd',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$O',
        state: {
          text: 'abcdef\nab\nabcdefgh\nabcd',
          line: 4,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'cde\n\ncde\ncd',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$<Esc>gv',
        state: {
          text: 'abcdef\nab\nabcdefgh\nabcd',
          line: 4,
          column: 5,
          mode: 'V-BLOCK',
          selection: 'cdef\n\ncdefgh\ncd',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jlo',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 2,
          mode: 'V-BLOCK',
          selection: 'bc\nb',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jlO',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 2,
          mode: 'V-BLOCK',
          selection: 'bc\nb',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>jlOo',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'bc\nb',
        },
      },
      {
        note: 'T1',
        at: [1, 2],
        keys: '<C-v>2jlohd',
        state: {
          text: 'def\n\ndef\nabcdef',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TXT',
        at: [1, 5],
        keys: '<C-v>2jw',
        state: {
          text: 'one two three\nfour five six\nseven eight\nnine',
          line: 3,
          column: 7,
          mode: 'V-BLOCK',
          selection: 'two\n fi\nn e',
        },
      },
      {
        note: 'TXT',
        at: [1, 5],
        keys: '<C-v>je',
        state: {
          text: 'one two three\nfour five six\nseven eight\nnine',
          line: 2,
          column: 9,
          mode: 'V-BLOCK',
          selection: 'two t\n five',
        },
      },
      {
        note: 'TXT',
        at: [2, 6],
        keys: '<C-v>ked',
        state: {
          text: 'one t three\nfour ve six\nseven eight\nnine',
          line: 1,
          column: 6,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TXT',
        at: [2, 4],
        keys: '<C-v>j0',
        state: {
          text: 'one two three\nfour five six\nseven eight\nnine',
          line: 3,
          column: 1,
          mode: 'V-BLOCK',
          selection: 'four\nseve',
        },
      },
      {
        note: 'TXT',
        at: [1, 1],
        keys: '<C-v>G$',
        state: {
          text: 'one two three\nfour five six\nseven eight\nnine',
          line: 4,
          column: 5,
          mode: 'V-BLOCK',
          selection: 'one two three\nfour five six\nseven eight\nnine',
        },
      },
      {
        note: 'TXT',
        at: [1, 1],
        keys: '<C-v>3l2j',
        state: {
          text: 'one two three\nfour five six\nseven eight\nnine',
          line: 3,
          column: 4,
          mode: 'V-BLOCK',
          selection: 'one \nfour\nseve',
        },
      },
      {
        note: 'DIG',
        at: [2, 3],
        keys: '<C-v>2j3lo2k',
        state: {
          text: '0123456789\nabcdefghij\nklmnopqrst\nuvwxyzABCD',
          line: 1,
          column: 3,
          mode: 'V-BLOCK',
          selection: '2345\ncdef\nmnop\nwxyz',
        },
      },
      {
        note: 'OBJ',
        at: [1, 3],
        keys: '<C-v>ji(',
        state: {
          text: 'f(a b) "q r" x\nf(a b) "q r" x',
          line: 2,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'a\na',
        },
      },
      {
        note: 'OBJ',
        at: [1, 9],
        keys: '<C-v>i"',
        state: {
          text: 'f(a b) "q r" x\nf(a b) "q r" x',
          line: 1,
          column: 11,
          mode: 'V-BLOCK',
          selection: 'q r',
        },
      },
      {
        note: 'OBJ',
        at: [1, 3],
        keys: '<C-v>jaw',
        state: {
          text: 'f(a b) "q r" x\nf(a b) "q r" x',
          line: 2,
          column: 5,
          mode: 'V-BLOCK',
          selection: 'a b\na b',
        },
      },
      {
        note: 'OBJ',
        at: [1, 3],
        keys: '<C-v>jed',
        state: {
          text: 'f() "q r" x\nf() "q r" x',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'd x X D y Y take the block into a block register',
    rows: [
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jld',
        state: {
          text: 'abef\nab\nabef\nabef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abef\nab\nabef\nabef\ncdcd\n  \ncdcd\ncdcd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlx',
        state: {
          text: 'abef\nab\nabef\nabef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abef\nab\nabef\nabef\ncdcd\n  \ncdcd\ncdcd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jly',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcdef\nab\nabcdef\nabcdef\ncdcd\n  \ncdcd\ncdcd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 5],
        keys: '<C-v>3jd',
        state: {
          text: 'abcdf\nab\nabcdf\nabcdf',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcdf\nab\nabcdf\nabcdf\nee\n  \nee\nee',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 5],
        keys: '<C-v>jd',
        state: {
          text: 'abf\nab\nabcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abf\nab\nabcdef\nabcdef\ncdecde\n   ',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [2, 2],
        keys: '<C-v>jld',
        state: {
          text: 'abcdef\na\nadef\nabcdef',
          line: 2,
          column: 1,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcdef\na\nadef\nabcdef\nb b\nbcbc',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3j$d',
        state: {
          text: 'ab\nab\nab\nab',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'ab\nab\nab\nab\ncdefcdef\n    \ncdefcdef\ncdefcdef',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3j$y',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcdef\nab\nabcdef\nabcdef\ncdefcdef\n    \ncdefcdef\ncdefcdef',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>$3jhd',
        state: {
          text: 'ab\nab\nab\nab',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'ab\nab\nab\nab\ncdefcdef\n    \ncdefcdef\ncdefcdef',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jD',
        state: {
          text: 'ab\nab\nab\nab',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'ab\nab\nab\nab\ncdefcdef\n    \ncdefcdef\ncdefcdef',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>2jlX',
        state: {
          text: 'abef\nab\nabef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abef\nab\nabef\nabcdef\ncdcd\n  \ncdcd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>2jlY',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcdef\nab\nabcdef\nabcdef\ncdcd\n  \ncdcd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>jlY',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcdef\nab\nabcdef\nabcdef\ncc\n ',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T2',
        at: [1, 2],
        keys: '<C-v>2jld',
        state: {
          text: 'adef\n\nadef',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'adef\n\nadef\nbcbc\n    \nbcbc',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T2',
        at: [2, 1],
        keys: '<C-v>d',
        state: {
          text: 'abcdef\n\nabcdef',
          line: 2,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T2',
        at: [1, 1],
        keys: '<C-v>2jlD',
        state: {
          text: '\n\n',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: '\n\n\nabcdefabcdef\n      \nabcdefabcdef',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$d',
        state: {
          text: 'ab\nab\nab\nab',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'ab\nab\nab\nab\ncdef  cdef\n      \ncdefghcdefgh\ncd    cd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$kd',
        state: {
          text: 'ab\nab\nab\nabcd',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'ab\nab\nab\nabcd\ncdef  cdef\n      \ncdefghcdefgh',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$hd',
        state: {
          text: 'abef\nab\nabefgh\nab',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abef\nab\nabefgh\nab\ncdcd\n  \ncdcd\ncdcd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$od',
        state: {
          text: 'abf\nab\nabfgh\nab',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abf\nab\nabfgh\nab\ncdecde\n   \ncdecde\ncd cd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$<Esc>gvd',
        state: {
          text: 'ab\nab\nab\nab',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'ab\nab\nab\nab\ncdef  cdef\n      \ncdefghcdefgh\ncd    cd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'RAG',
        at: [3, 8],
        keys: '<C-v>kkd',
        state: {
          text: 'abcdef\nab\nabcdef\nabcd',
          line: 1,
          column: 6,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcdef\nab\nabcdef\nabcd\n  \n    \nghgh',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'DIG',
        at: [1, 3],
        keys: '<C-v>2j2ld',
        state: {
          text: '0156789\nabfghij\nklpqrst\nuvwxyzABCD',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: '0156789\nabfghij\nklpqrst\nuvwxyzABCD\n234234\ncdecde\nmnomno',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'DIG',
        at: [2, 4],
        keys: '<C-v>j3loD',
        state: {
          text: '0123456789\nabc\nklm\nuvwxyzABCD',
          line: 2,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: '0123456789\nabc\nklm\nuvwxyzABCD\ndefghijdefghij\nnopqrstnopqrst',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'TXT',
        at: [1, 5],
        keys: '<C-v>2jed',
        state: {
          text: 'one ee\nfourix\nseve\nnine',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'one ee\nfourix\nseve\nnine\ntwo thrtwo thr\n five s five s\nn eightn eight',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'TXT',
        at: [1, 1],
        keys: '<C-v>GyG$p',
        state: {
          text: 'one two three\nfour five six\nseven eight\nnineo\n    f\n    s\n    n',
          line: 4,
          column: 5,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'registers and a block',
    rows: [
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jl"ayw<C-v>jll"Ay',
        state: {
          text: 'one two\nthree four\nfive six',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>"a2P',
          state: {
            text: 'one two\nthree four\nfive six\nonon\nthth\ntwotwo\ne fe f',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '"ayiww<C-v>jl"Ay',
        state: {
          text: 'one two\nthree four\nfive six',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>"a2P',
          state: {
            text: 'one two\nthree four\nfive six\nonetw\ne onetw\ne ',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '"ayyw<C-v>jl"Ay',
        state: {
          text: 'one two\nthree four\nfive six',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>"a2P',
          state: {
            text: 'one two\nthree four\nfive six\none two\ntw\ne \none two\ntw\ne \n',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jl"ayw"Ayy',
        state: {
          text: 'one two\nthree four\nfive six',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>"a2P',
          state: {
            text: 'one two\nthree four\nfive six\non\nth\none two\non\nth\none two\n',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jl"ad',
        state: {
          text: 'e two\nree four\nfive six',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>"a2P',
          state: {
            text: 'e two\nree four\nfive six\nonon\nthth',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jl"_d',
        state: {
          text: 'e two\nree four\nfive six',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: 'yiwj<C-v>jl"_dP',
        state: {
          text: 'one two\noneree four\nve six',
          line: 2,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: 'yiwj<C-v>jld"0P',
        state: {
          text: 'one two\noneree four\nve six',
          line: 2,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlyw<C-v>jld"0P',
        state: {
          text: 'one ono\nthrethfour\nfive six',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jl"+y',
        state: {
          text: 'one two\nthree four\nfive six',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'one two\nthree four\nfive six\nonon\nthth',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
    ],
  },
  {
    name: 'c s C S R change the block',
    rows: [
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlcXY<Esc>',
        state: {
          text: 'abXYef\nabXY\nabXYef\nabXYef',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abXYef\nabXY\nabXYef\nabXYef\ncdcd\n  \ncdcd\ncdcd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 5],
        keys: '<C-v>3jlcXY<Esc>',
        state: {
          text: 'abcdXY\nab\nabcdXY\nabcdXY',
          line: 1,
          column: 6,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcdXY\nab\nabcdXY\nabcdXY\nefef\n    \nefef\nefef',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jCXY<Esc>',
        state: {
          text: 'abXY\nabXY\nabXY\nabXY',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abXY\nabXY\nabXY\nabXY\ncdefcdef\n    \ncdefcdef\ncdefcdef',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3j$cXY<Esc>',
        state: {
          text: 'abXY\nabXY\nabXY\nabXY',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abXY\nabXY\nabXY\nabXY\ncdefcdef\n    \ncdefcdef\ncdefcdef',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlc<Esc>',
        state: {
          text: 'abef\nab\nabef\nabef',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abef\nab\nabef\nabef\ncdcd\n  \ncdcd\ncdcd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlcXY',
        state: {
          text: 'abXYef\nab\nabef\nabef',
          line: 1,
          column: 5,
          mode: 'INSERT',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlSXY<Esc>',
        state: {
          text: 'XY',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'XY\nabcdef\nab\nabcdef\nabcdef\nabcdef\nab\nabcdef\nabcdef\n',
            line: 2,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>jlcab<BS>c<Esc>',
        state: {
          text: 'abacdef\nabac\nabcdef\nabcdef',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$cX<Esc>',
        state: {
          text: 'abX\nabX\nabX\nabX',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abX\nabX\nabX\nabX\ncdef  cdef\n      \ncdefghcdefgh\ncd    cd',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'DIG',
        at: [1, 2],
        keys: '<C-v>3j2lcZ<Esc>u<C-r>',
        state: {
          text: '0Z456789\naZefghij\nkZopqrst\nuZyzABCD',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'I and A type on every line of the block at Esc',
    rows: [
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jIXY<Esc>',
        state: {
          text: 'abXYcdef\nabXY\nabXYcdef\nabXYcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 5],
        keys: '<C-v>3jIXY<Esc>',
        state: {
          text: 'abcdXYef\nab\nabcdXYef\nabcdXYef',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jAXY<Esc>',
        state: {
          text: 'abcXYdef\nab XY\nabcXYdef\nabcXYdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 5],
        keys: '<C-v>3jAXY<Esc>',
        state: {
          text: 'abcdeXYf\nab   XY\nabcdeXYf\nabcdeXYf',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3j$AXY<Esc>',
        state: {
          text: 'abcdefXY\nabXY\nabcdefXY\nabcdefXY',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3j$IXY<Esc>',
        state: {
          text: 'abXYcdef\nabXY\nabXYcdef\nabXYcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [4, 4],
        keys: '<C-v>3khIXY<Esc>',
        state: {
          text: 'abXYcdef\nabXY\nabXYcdef\nabXYcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>jjIx<CR>y<Esc>',
        state: {
          text: 'abx\nycdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>jjIab<BS>c<Esc>',
        state: {
          text: 'abaccdef\nabac\nabaccdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>jjIx<Left>y<Esc>',
        state: {
          text: 'abyxcdef\nabyx\nabyxcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>jj3Ix<Esc>',
        state: {
          text: 'abxxxcdef\nabxxx\nabxxxcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>jj2Ax<Esc>',
        state: {
          text: 'abcxxdef\nab xx\nabcxxdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlA<Esc>',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jloIX<Esc>',
        state: {
          text: 'abXcdef\nabX\nabXcdef\nabXcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [2, 2],
        keys: '<C-v>jllAX<Esc>',
        state: {
          text: 'abcdef\nab  X\nabcdXef\nabcdef',
          line: 2,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [2, 2],
        keys: '<C-v>jllA<Esc>',
        state: {
          text: 'abcdef\nab  \nabcdef\nabcdef',
          line: 2,
          column: 4,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jIXY',
        state: {
          text: 'abXYcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 5,
          mode: 'INSERT',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$AX<Esc>',
        state: {
          text: 'abcdefX\nabX\nabcdefghX\nabcdX',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'RAG',
        at: [3, 8],
        keys: '<C-v>jAX<Esc>',
        state: {
          text: 'abcdef\nab\nabcdefghX\nabcd    X',
          line: 3,
          column: 5,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T2',
        at: [1, 2],
        keys: '<C-v>2jAX<Esc>',
        state: {
          text: 'abXcdef\n  X\nabXcdef',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T2',
        at: [1, 1],
        keys: '<C-v>2j$AX<Esc>',
        state: {
          text: 'abcdefX\nX\nabcdefX',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'DIG',
        at: [1, 4],
        keys: '<C-v>3jlAab<Esc>u<C-r>',
        state: {
          text: '01234ab56789\nabcdeabfghij\nklmnoabpqrst\nuvwxyabzABCD',
          line: 1,
          column: 6,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'p and P put a block register as a rectangle',
    rows: [
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlly$p',
        state: {
          text: 'one twoone\nthree fthrour\nfive six',
          line: 1,
          column: 8,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlly$P',
        state: {
          text: 'one twoneo\nthree thrfour\nfive six',
          line: 1,
          column: 7,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jllyG$p',
        state: {
          text: 'one two\nthree four\nfive sixone\n        thr',
          line: 3,
          column: 9,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>2jlyj$p',
        state: {
          text: 'one two\nthree fouron\nfive six  th\n          fi',
          line: 2,
          column: 11,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlly$2p',
        state: {
          text: 'one twooneone\nthree fthrthrour\nfive six',
          line: 1,
          column: 8,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jldP',
        state: {
          text: 'one two\nthree four\nfive six',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 1],
        keys: '<C-v>jlygg$p',
        state: {
          text: 'abcdefab\nab    ab\nabcdef\nabcdef',
          line: 1,
          column: 7,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 1],
        keys: '<C-v>jlygg$pu',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 6,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 1],
        keys: '<C-v>jlygg$pj.',
        state: {
          text: 'abcdefab\nab    aabb\nabcdef ab\nabcdef',
          line: 2,
          column: 8,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T2',
        at: [1, 1],
        keys: '<C-v>2jly$p',
        state: {
          text: 'abcdefab\n      \nabcdefab',
          line: 1,
          column: 7,
          mode: 'NORMAL',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$ygg$p',
        state: {
          text: 'abcdefcdef\nab    \nabcdefcdefghgh\nabcd  cd',
          line: 1,
          column: 7,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TAB2',
        at: [1, 1],
        keys: '<C-v>2jly3lP',
        state: {
          text: 'abcabdefghijkl\n          x\ty\nabcabdefghijkl',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
      },
      {
        note: 'DIG',
        at: [1, 1],
        keys: '<C-v>2j2lyGP',
        state: {
          text: '0123456789\nabcdefghij\nklmnopqrst\n012uvwxyzABCD\nabc\nklm',
          line: 4,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'DIG',
        at: [1, 1],
        keys: '<C-v>2j2ld$puu',
        state: {
          text: '0123456789\nabcdefghij\nklmnopqrst\nuvwxyzABCD',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'a put over a block, and a block put over v and V',
    rows: [
      {
        note: 'T3',
        at: [1, 1],
        keys: 'yiwj<C-v>jlp',
        state: {
          text: 'one two\noneree four\noneve six',
          line: 2,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: 'yiwj<C-v>jlP',
        state: {
          text: 'one two\noneree four\noneve six',
          line: 2,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: 'yyj<C-v>jlp',
        state: {
          text: 'one two\nree four\nve six\none two',
          line: 4,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: 'yiwj<C-v>jl2p',
        state: {
          text: 'one two\noneoneree four\noneoneve six',
          line: 2,
          column: 6,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: 'yiwj<C-v>j$p',
        state: {
          text: 'one two\none\none',
          line: 2,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: 'vjy<C-v>jlp',
        state: {
          text: 'one two\nte two\nree four\nfive six',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: 'yiwj<C-v>jlpgg.',
        state: {
          text: 'e two\neree four\noneve six',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlywvlp',
        state: {
          text: 'one ono\nthrethe four\nfive six',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlyGVp',
        state: {
          text: 'one two\nthree four\non\nth',
          line: 3,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlyw<C-v>jllp',
        state: {
          text: 'one on\nthrethour\nfive six',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlywvjp',
        state: {
          text: 'one on four\nfiveth six',
          line: 1,
          column: 5,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T3',
        at: [1, 1],
        keys: '<C-v>jlywVjp',
        state: {
          text: 'on\nth\nfive six',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'dot repeats a block operator, I, A and c',
    rows: [
      {
        note: 'T1',
        at: [3, 3],
        keys: '<C-v>jldgg0.',
        state: {
          text: 'cdef\n\nabef\nabef',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 3],
        keys: '<C-v>jldgg03.',
        state: {
          text: 'cdef\n\nabef\nabef',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 3],
        keys: '<C-v>j$dggl.',
        state: {
          text: 'a\na\nab\nab',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 2],
        keys: '<C-v>jldG.',
        state: {
          text: 'abcdef\nab\nadef\nef',
          line: 4,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 3],
        keys: '<C-v>jIX<Esc>gg0.',
        state: {
          text: 'Xabcdef\nXab\nabXcdef\nabXcdef',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 3],
        keys: '<C-v>jAX<Esc>gg0.',
        state: {
          text: 'aXbcdef\naXb\nabcXdef\nabcXdef',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [3, 3],
        keys: '<C-v>jlcX<Esc>gg0.',
        state: {
          text: 'Xcdef\nX\nabXef\nabXef',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlIX<Esc>2G.',
        state: {
          text: 'abXcdef\nXabX\nXabXcdef\nXabXcdef',
          line: 2,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>j$dj0.',
        state: {
          text: 'ab\n\n\nabcd',
          line: 2,
          column: 1,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'ab\n\n\nabcd\nab      ab\nabcdefghabcdefgh',
            line: 5,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'DIG',
        at: [1, 3],
        keys: '<C-v>j2ldG.',
        state: {
          text: '0156789\nabfghij\nklmnopqrst\nxyzABCD',
          line: 4,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'DIG',
        at: [1, 3],
        keys: '<C-v>j2lIab<Esc>gg.u',
        state: {
          text: '01ab23456789\nababcdefghij\nklmnopqrst\nuvwxyzABCD',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'u and Ctrl-R take a block change as one',
    rows: [
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jldu<C-r>',
        state: {
          text: 'abef\nab\nabef\nabef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jIXY<Esc>u',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jIXY<Esc>u<C-r>',
        state: {
          text: 'abXYcdef\nabXY\nabXYcdef\nabXYcdef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3j$AXY<Esc>u<C-r>',
        state: {
          text: 'abcdefXY\nabXY\nabcdefXY\nabcdefXY',
          line: 1,
          column: 7,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlcXY<Esc>u<C-r>',
        state: {
          text: 'abXYef\nabXY\nabXYef\nabXYef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>xj<C-v>jxu',
        state: {
          text: 'abdef\nab\nabcdef\nabcdef',
          line: 2,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'DIG',
        at: [1, 3],
        keys: '<C-v>2jIab<Esc>xuu',
        state: {
          text: '0123456789\nabcdefghij\nklmnopqrst\nuvwxyzABCD',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'gv brings the block back',
    rows: [
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jIXY<Esc>gv',
        state: {
          text: 'abXYcdef\nabXY\nabXYcdef\nabXYcdef',
          line: 4,
          column: 3,
          mode: 'V-BLOCK',
          selection: 'X\nX\nX\nX',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jldgv',
        state: {
          text: 'abef\nab\nabef\nabef',
          line: 4,
          column: 4,
          mode: 'V-BLOCK',
          selection: 'ef\n\nef\nef',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jldugvd',
        state: {
          text: 'abef\nab\nabef\nabef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlygv',
        state: {
          text: 'abcdef\nab\nabcdef\nabcdef',
          line: 4,
          column: 4,
          mode: 'V-BLOCK',
          selection: 'cd\n\ncd\ncd',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jlyjgvd',
        state: {
          text: 'abef\nab\nabef\nabef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'T1',
        at: [1, 3],
        keys: '<C-v>3jl<Esc>Ggvod',
        state: {
          text: 'abef\nab\nabef\nabef',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'RAG',
        at: [1, 3],
        keys: '<C-v>3j$<Esc>gvyGp',
        state: {
          text: 'abcdef\nab\nabcdefgh\nacdef  bcd\n \n cdefgh\n cd',
          line: 4,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'DIG',
        at: [2, 2],
        keys: '<C-v>jl<Esc>gggvvd',
        state: {
          text: '0123456789\nanopqrst\nuvwxyzABCD',
          line: 2,
          column: 2,
          mode: 'NORMAL',
        },
      },
    ],
  },
  {
    name: 'tabs and wide letters, a cut one turned into spaces',
    rows: [
      {
        note: 'TAB',
        at: [2, 4],
        keys: '<C-v>k',
        state: {
          text: 'a\tbcd\nabcdefghijkl\n\tx\ty',
          line: 1,
          column: 2,
          mode: 'V-BLOCK',
        },
      },
      {
        note: 'TAB',
        at: [2, 4],
        keys: '<C-v>kd',
        state: {
          text: 'abcd\naijkl\n\tx\ty',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcd\naijkl\n\tx\ty\n\t\t\nbcdefghbcdefgh',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'TAB',
        at: [2, 3],
        keys: '<C-v>2jlld',
        state: {
          text: 'a\tbcd\nab\n  y',
          line: 2,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'a\tbcd\nab\n  y\ncdefghijkl    cdefghijkl\n      x\t      x\t',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'TAB',
        at: [2, 4],
        keys: '<C-v>kIX<Esc>',
        state: {
          text: 'aX\tbcd\naXbcdefghijkl\n\tx\ty',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TAB',
        at: [2, 2],
        keys: '<C-v>jAX<Esc>',
        state: {
          text: 'a\tbcd\nabcdefghXijkl\n\tXx\ty',
          line: 2,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TAB',
        at: [2, 5],
        keys: '<C-v>kcX<Esc>',
        state: {
          text: 'aXbcd\naXijkl\n\tx\ty',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TAB',
        at: [2, 1],
        keys: '<C-v>lykp',
        state: {
          text: 'aab\tbcd\nabcdefghijkl\n\tx\ty',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TAB',
        at: [2, 1],
        keys: '<C-v>jlyggP',
        state: {
          text: 'abcdefghia\tbcd\n\txabcdefghijkl\n\tx\ty',
          line: 1,
          column: 1,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TAB2',
        at: [1, 4],
        keys: '<C-v>2jld',
        state: {
          text: 'abcfghijkl\n      x\ty\nabcfghijkl',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcfghijkl\n      x\ty\nabcfghijkl\ndede\n    \ndede',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'TAB2',
        at: [1, 4],
        keys: '<C-v>2jIX<Esc>',
        state: {
          text: 'abcXdefghijkl\n   X     x\ty\nabcXdefghijkl',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TAB2',
        at: [1, 4],
        keys: '<C-v>2jlcX<Esc>',
        state: {
          text: 'abcXfghijkl\n   X   x\ty\nabcXfghijkl',
          line: 1,
          column: 4,
          mode: 'NORMAL',
        },
      },
      {
        note: 'TAB2',
        at: [1, 1],
        keys: '<C-v>lyjp',
        state: {
          text: 'abcdefghijkl\n\tabx\ty\nabcdefghijkl',
          line: 2,
          column: 2,
          mode: 'NORMAL',
        },
      },
      {
        note: 'WIDE',
        at: [2, 4],
        keys: '<C-v>kd',
        state: {
          text: 'abcd\nabef\na字字b',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'abcd\nabef\na字字b\n字字\ncdcd',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'WIDE',
        at: [2, 3],
        keys: '<C-v>2jld',
        state: {
          text: 'ab字cd\nabf\na b',
          line: 2,
          column: 3,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'ab字cd\nabf\na b\ncdecde\n 字 字',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
      },
      {
        note: 'WIDE',
        at: [2, 4],
        keys: '<C-v>kIX<Esc>',
        state: {
          text: 'abX字cd\nabXcdef\na字字b',
          line: 1,
          column: 3,
          mode: 'NORMAL',
        },
      },
      {
        note: 'WIDE',
        at: [3, 2],
        keys: '<C-v>kkld',
        state: {
          text: 'acd\naef\na b',
          line: 1,
          column: 2,
          mode: 'NORMAL',
        },
        readback: {
          keys: 'Go<Esc>2P',
          state: {
            text: 'acd\naef\na b\nb字b字\nbcdbcd\n字 字 ',
            line: 4,
            column: 1,
            mode: 'NORMAL',
          },
        },
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
  '<C-v>': 'Control+v',
  '<C-c>': 'Control+c',
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const noticeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const notice = nullpad.page.locator('.status .notice')
  return (await notice.count()) === 0 ? '' : (await notice.innerText()).trim()
}

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

const kindOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const selection = nullpad.page.locator('#selection')
  return (await selection.count()) === 0
    ? 'none'
    : ((await selection.first().getAttribute('data-kind')) ?? '')
}

const begin = async (nullpad: Nullpad, text: string) => {
  await nullpad.paste(text)
  await nullpad.press('Control+Home')
  await vimOn(nullpad)
}

const expectState = async (nullpad: Nullpad, label: string, state: State) => {
  expect.soft(await nullpad.text(), `${label}: text`).toBe(state.text)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line: state.line, column: state.column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe(state.mode)
  if (state.selection !== undefined) {
    expect
      .soft(await kindOf(nullpad), `${label}: #selection kind`)
      .toBe('block')
    expect
      .soft(await nullpad.selection(), `${label}: selected letters`)
      .toBe(state.selection)
  }
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  const label = `${row.note} at ${row.at.join(':')} keys ${row.keys}`
  await startVimRow(nullpad, notes[row.note], row.at[0], row.at[1])
  await play(nullpad, row.keys)
  await expectState(nullpad, label, row.state)
  if (row.readback !== undefined) {
    await play(nullpad, row.readback.keys)
    await expectState(
      nullpad,
      `${label}, then ${row.readback.keys} on a new last line`,
      row.readback.state,
    )
  }
}

for (const group of groups) {
  for (let from = 0; from < group.rows.length; from += ROWS_PER_TEST) {
    const rows = group.rows.slice(from, from + ROWS_PER_TEST)
    test(`block ${group.name} as in Vim (rows ${from + 1} to ${from + rows.length})`, async ({
      nullpad,
    }) => {
      for (const row of rows) {
        await playRow(nullpad, row)
      }
    })
  }
}

type Span = Readonly<{ left: number; right: number }>

type DrawnRow = Readonly<{ left: number; boxes: ReadonlyArray<Span> }>

const drawnRows = async (
  nullpad: Nullpad,
): Promise<Readonly<{ cell: number; rows: ReadonlyArray<DrawnRow> }>> => {
  await settle(nullpad.page)
  const { cell, rows } = await nullpad.screen()
  const boxes = await nullpad.page.evaluate(() =>
    [...document.querySelectorAll('#selection > *')]
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => ({
        left: rect.left,
        right: rect.right,
        middle: (rect.top + rect.bottom) / 2,
      })),
  )
  return {
    cell,
    rows: rows.map(row => ({
      left: row.left,
      boxes: boxes
        .filter(box => box.middle > row.top && box.middle < row.bottom)
        .map(({ left, right }) => ({ left, right })),
    })),
  }
}

const covered = (row: DrawnRow): Span | null =>
  row.boxes.length === 0
    ? null
    : {
        left: Math.min(...row.boxes.map(box => box.left)),
        right: Math.max(...row.boxes.map(box => box.right)),
      }

const expectCovers = (
  label: string,
  row: DrawnRow | undefined,
  cell: number,
  fromCell: number,
  toCell: number,
) => {
  const span = row === undefined ? null : covered(row)
  expect.soft(span, `${label}: a highlight is drawn`).not.toBeNull()
  if (row === undefined || span === null) {
    return
  }
  expect
    .soft(span.left, `${label}: the highlight starts at cell ${fromCell}`)
    .toBeCloseTo(row.left + fromCell * cell, 0)
  expect
    .soft(span.right, `${label}: the highlight ends at cell ${toCell}`)
    .toBeCloseTo(row.left + toCell * cell, 0)
}

const letterLeft = (nullpad: Nullpad, line: number, index: number) =>
  nullpad.page.evaluate(
    ({ lineNumber, wanted }) => {
      const element = document.querySelectorAll('.surface .line')[lineNumber]
      if (element === undefined) {
        throw new Error(`line ${lineNumber} is not drawn`)
      }
      let seen = 0
      for (const node of element.childNodes) {
        if (!(node instanceof Text)) {
          continue
        }
        if (wanted < seen + node.data.length) {
          const range = document.createRange()
          range.setStart(node, wanted - seen)
          range.setEnd(node, wanted - seen + 1)
          return range.getBoundingClientRect().left
        }
        seen += node.data.length
      }
      throw new Error(`line ${lineNumber} has no letter ${wanted}`)
    },
    { lineNumber: line, wanted: index },
  )

test('Ctrl-V in NORMAL enters V-BLOCK and Ctrl-V, Esc, Ctrl-[ and Ctrl-C leave it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc def\nghi jkl\nmno')
  expect(await modeOf(nullpad), 'start').toBe('NORMAL')
  await play(nullpad, '<C-v>')
  expect(await modeOf(nullpad), 'Ctrl-V').toBe('V-BLOCK')
  expect(await kindOf(nullpad), 'Ctrl-V draws a block selection').toBe('block')
  expect(await nullpad.text(), 'Ctrl-V in NORMAL pastes nothing').toBe(
    'abc def\nghi jkl\nmno',
  )
  expect(
    await nullpad.selection(),
    'the block is the letter under the cursor',
  ).toBe('a')
  await play(nullpad, '<C-v>')
  expect(await modeOf(nullpad), 'Ctrl-V again leaves').toBe('NORMAL')
  expect(await kindOf(nullpad), 'nothing is selected').toBe('none')
  for (const leave of ['<Esc>', '<C-[>', '<C-c>']) {
    await play(nullpad, `<C-v>jl${leave}`)
    expect(await modeOf(nullpad), `Ctrl-V jl ${leave}`).toBe('NORMAL')
    expect(await kindOf(nullpad), `nothing is selected after ${leave}`).toBe(
      'none',
    )
  }
  expect(await nullpad.text(), 'none of it changed the note').toBe(
    'abc def\nghi jkl\nmno',
  )
})

test('v, V and Ctrl-V switch between the three kinds and keep both ends', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc def\nghi jkl\nmno')
  await play(nullpad, '<C-v>jl')
  expect(await modeOf(nullpad), 'Ctrl-V jl').toBe('V-BLOCK')
  expect(await nullpad.selection(), 'the block is 2 columns on 2 lines').toBe(
    'ab\ngh',
  )
  await play(nullpad, 'v')
  expect(await modeOf(nullpad), 'v switches to letters').toBe('VISUAL')
  expect(await kindOf(nullpad), 'letters').toBe('letters')
  await play(nullpad, '<C-v>')
  expect(await modeOf(nullpad), 'Ctrl-V switches back').toBe('V-BLOCK')
  expect(await nullpad.selection(), 'both ends were kept').toBe('ab\ngh')
  await play(nullpad, 'V')
  expect(await modeOf(nullpad), 'V switches to lines').toBe('V-LINE')
  expect(await kindOf(nullpad), 'lines').toBe('lines')
  await play(nullpad, '<C-v>')
  expect(await modeOf(nullpad), 'Ctrl-V from V-LINE').toBe('V-BLOCK')
  expect(await nullpad.selection(), 'both ends were kept again').toBe('ab\ngh')
  await play(nullpad, 'ip')
  expect(
    await modeOf(nullpad),
    'ip from a block on two lines keeps the block, as Vim does',
  ).toBe('V-BLOCK')
  expect(
    await nullpad.selection(),
    'the cursor corner went to the start of the last line',
  ).toBe('a\ng\nm')
  await play(nullpad, '<Esc>gg<C-v>lip')
  expect(
    await modeOf(nullpad),
    'ip from a block on one line makes V-LINE, as Vim does',
  ).toBe('V-LINE')
  expect(await kindOf(nullpad), 'whole lines').toBe('lines')
})

test('Ctrl-V still pastes with vim off, in INSERT, in the finder and in the read view', async ({
  nullpad,
}) => {
  await nullpad.paste('abc')
  await setClipboard(nullpad, 'ZZ')
  await nullpad.press('Control+v')
  expect(await nullpad.text(), 'Ctrl-V with vim off pastes').toBe('abcZZ')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim on').toBe('NORMAL')
  await play(nullpad, '0i')
  expect(await modeOf(nullpad), 'i').toBe('INSERT')
  await setClipboard(nullpad, 'QQ')
  await nullpad.press('Control+v')
  expect(await nullpad.text(), 'Ctrl-V in INSERT pastes').toBe('QQabcZZ')
  expect(await modeOf(nullpad), 'still INSERT').toBe('INSERT')
  await play(nullpad, '<Esc>')
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
  await setClipboard(nullpad, 'needle')
  await nullpad.press('Control+v')
  expect((await nullpad.finder())?.query, 'Ctrl-V in the finder pastes').toBe(
    'needle',
  )
  await nullpad.press('Escape')
  expect(await nullpad.finder(), 'Esc closes the finder').toBeNull()
  await nullpad.page.keyboard.press('Control+e')
  expect(await modeOf(nullpad), 'Ctrl-E opens the read view').toBe('READ')
  await nullpad.press('Control+v')
  expect(await modeOf(nullpad), 'Ctrl-V in the read view stays in READ').toBe(
    'READ',
  )
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 'back in NORMAL, not in a block').toBe('NORMAL')
  expect(await nullpad.text(), 'the read view took no paste').toBe('QQabcZZ')
})

test('with vim on, Ctrl-V in NORMAL does not paste, and Ctrl-Shift-V and Shift-Insert do', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc\ndef')
  await setClipboard(nullpad, 'PP')
  await nullpad.press('Control+v')
  expect(await modeOf(nullpad), 'Ctrl-V starts a block').toBe('V-BLOCK')
  expect(await nullpad.text(), 'and pastes nothing').toBe('abc\ndef')
  await play(nullpad, '<Esc>')
  await nullpad.press('Control+Shift+V')
  expect(await nullpad.text(), 'Ctrl-Shift-V pastes in NORMAL').toBe(
    'PPabc\ndef',
  )
  expect(await modeOf(nullpad), 'and stays in NORMAL').toBe('NORMAL')
  await play(nullpad, '0')
  await nullpad.press('Shift+Insert')
  expect(await nullpad.text(), 'Shift-Insert pastes in NORMAL').toBe(
    'PPPPabc\ndef',
  )
  expect(await modeOf(nullpad), 'and stays in NORMAL again').toBe('NORMAL')
})

test('a paste in V-BLOCK erases the block into no register, pastes once at its top left and lands in NORMAL', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\nabcdef\nabcdef')
  await play(nullpad, 'yll<C-v>jl')
  expect(await modeOf(nullpad), 'a block over 2 lines').toBe('V-BLOCK')
  expect(await nullpad.selection(), 'the block').toBe('bc\nbc')
  await setClipboard(nullpad, 'ZZ')
  await nullpad.press('Control+Shift+V')
  expect(
    await nullpad.text(),
    'the block is gone and ZZ is at its top left',
  ).toBe('aZZdef\nadef\nabcdef')
  expect(await modeOf(nullpad), 'NORMAL after the paste').toBe('NORMAL')
  expect(await kindOf(nullpad), 'nothing is selected').toBe('none')
  await play(nullpad, 'G$p')
  expect(
    await nullpad.text(),
    'the unnamed register still holds the yank, the block went into none',
  ).toBe('aZZdef\nadef\nabcdefa')
  await play(nullpad, 'uu')
  expect(await nullpad.text(), 'the paste was one change').toBe(
    'abcdef\nabcdef\nabcdef',
  )
})

test('a refused clipboard says to use Ctrl-Shift-V', async ({ nullpad }) => {
  await begin(nullpad, 'abc\ndef')
  await setClipboard(nullpad, 'ZZ\n')
  await nullpad.page.context().clearPermissions()
  await play(nullpad, '"+p')
  await expect
    .poll(() => noticeOf(nullpad), {
      message: 'the status line names the key that pastes in NORMAL',
      timeout: 6000,
    })
    .toBe(BLOCKED)
  expect(await nullpad.text(), 'a refused put changes nothing').toBe('abc\ndef')
  await play(nullpad, '"+yy')
  await expect
    .poll(() => noticeOf(nullpad), {
      message: 'a refused write says the same',
      timeout: 6000,
    })
    .toBe(BLOCKED)
})

test('the highlight covers only the block letters on each line, with no line-break cell and nothing on a line that ends before the block', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\nab\nabcdef\nabcdef')
  await play(nullpad, 'll<C-v>3jl')
  expect(await nullpad.selection(), 'the selected letters').toBe('cd\n\ncd\ncd')
  const { cell, rows } = await drawnRows(nullpad)
  expect(rows.length, 'four rows are drawn').toBe(4)
  expectCovers('line 1', rows[0], cell, 2, 4)
  expect(
    rows[1] === undefined ? [] : rows[1].boxes,
    'line 2 ends before the block, nothing is drawn on it',
  ).toEqual([])
  expectCovers('line 3', rows[2], cell, 2, 4)
  expectCovers('line 4', rows[3], cell, 2, 4)
  expect(
    await nullpad.page.locator('#selection [data-break]').count(),
    'no line-break cell',
  ).toBe(0)
})

test('a block after $ runs to each line end and draws no line-break cell', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\nab\nabcdefgh\nabcd')
  await play(nullpad, 'll<C-v>3j$')
  expect(await nullpad.selection(), 'the selected letters').toBe(
    'cdef\n\ncdefgh\ncd',
  )
  const { cell, rows } = await drawnRows(nullpad)
  expectCovers('line 1', rows[0], cell, 2, 6)
  expect(
    rows[1] === undefined ? [] : rows[1].boxes,
    'line 2 ends before the block',
  ).toEqual([])
  expectCovers('line 3', rows[2], cell, 2, 8)
  expectCovers('line 4', rows[3], cell, 2, 4)
  expect(
    await nullpad.page.locator('#selection [data-break]').count(),
    'no line-break cell',
  ).toBe(0)
})

test('an empty line inside a block draws nothing, where v draws one cell', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\n\nabcdef')
  await play(nullpad, 'll<C-v>2jl')
  expect(await nullpad.selection(), 'the selected letters').toBe('cd\n\ncd')
  const { cell, rows } = await drawnRows(nullpad)
  expectCovers('line 1', rows[0], cell, 2, 4)
  expect(
    rows[1] === undefined ? [] : rows[1].boxes,
    'the empty line draws nothing',
  ).toEqual([])
  expectCovers('line 3', rows[2], cell, 2, 4)
  await play(nullpad, '<Esc>gg0v2j')
  const { rows: letters } = await drawnRows(nullpad)
  expect(
    letters[1]?.boxes.length,
    'v draws the empty line as a cell, which is why this check can tell',
  ).toBeGreaterThan(0)
})

test('a tab draws 8 cells wide, so a letter after a tab sits under the 9th letter of the line above', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdefghijkl\n\tx\nabcdefghijkl\nab\tc\nabcdefghijkl')
  const above = await letterLeft(nullpad, 0, 8)
  const afterTab = await letterLeft(nullpad, 1, 1)
  expect(
    Math.abs(afterTab - above),
    `x after a tab at the line start (${afterTab}) is under the 9th letter of the line above (${above})`,
  ).toBeLessThan(1)
  const midAbove = await letterLeft(nullpad, 2, 8)
  const midAfter = await letterLeft(nullpad, 3, 3)
  expect(
    Math.abs(midAfter - midAbove),
    `c after ab and a tab (${midAfter}) is under the 9th letter of the line above (${midAbove})`,
  ).toBeLessThan(1)
})

test('a block corner on a tab takes the whole tab, drawn 7 cells wide from its column', async ({
  nullpad,
}) => {
  await begin(nullpad, 'a\tbcd\nabcdefghijkl')
  await play(nullpad, 'j3l<C-v>k')
  expect(await modeOf(nullpad), 'V-BLOCK').toBe('V-BLOCK')
  expect(
    await nullpad.selection(),
    'the cursor went up onto the tab, so the block is the tab and the 7 cells under it',
  ).toBe('\t\nbcdefgh')
  const { cell, rows } = await drawnRows(nullpad)
  const first = rows[0] === undefined ? null : covered(rows[0])
  expect(first, 'the tab is highlighted').not.toBeNull()
  expect(
    ((first?.right ?? 0) - (first?.left ?? 0)) / cell,
    'the tab is highlighted over the 7 cells from column 2 to column 8',
  ).toBeCloseTo(7, 0)
  expectCovers('line 2', rows[1], cell, 1, 8)
})

test('one u takes back a block insert, and a second u goes on to the change before it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\nab\nabcdef\nabcdef')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x').toBe('bcdef\nab\nabcdef\nabcdef')
  await play(nullpad, 'l<C-v>3jIXY<Esc>')
  expect(await nullpad.text(), 'the block insert typed XY on 3 lines').toBe(
    'bXYcdef\naXYb\naXYbcdef\naXYbcdef',
  )
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u took the whole insert back').toBe(
    'bcdef\nab\nabcdef\nabcdef',
  )
  await play(nullpad, '<C-r>')
  expect(await nullpad.text(), 'Ctrl-R brings it all back at once').toBe(
    'bXYcdef\naXYb\naXYbcdef\naXYbcdef',
  )
  await play(nullpad, 'uu')
  expect(await nullpad.text(), 'the second u undid the x').toBe(
    'abcdef\nab\nabcdef\nabcdef',
  )
})

test('a block over 20,000 lines, G and d finish and u brings it all back', async ({
  nullpad,
}) => {
  await begin(nullpad, numberedLines(20_000))
  await play(nullpad, '<C-v>G')
  expect(await modeOf(nullpad), 'Ctrl-V G').toBe('V-BLOCK')
  expect((await nullpad.status()).line, 'G went to the last line').toBe(20_000)
  await play(nullpad, 'd')
  await expect
    .poll(() => modeOf(nullpad), {
      message: 'd finished and left the block',
      timeout: 15_000,
    })
    .toBe('NORMAL')
  expect(await nullpad.status(), 'the cursor is at the top left').toMatchObject(
    {
      line: 1,
      column: 1,
      lineCount: 20_000,
    },
  )
  expect(
    (await nullpad.text()).startsWith('ine 1\nine 2\nine 3'),
    'the first letter of the first lines is gone',
  ).toBe(true)
  await play(nullpad, 'G')
  expect(
    (await nullpad.text()).endsWith('ine 19999\nine 20000'),
    'and of the last lines',
  ).toBe(true)
  await play(nullpad, 'u')
  expect(
    (await nullpad.text()).startsWith('line 1\nline 2\nline 3'),
    'u brings the first lines back, and the cursor goes to the first changed line',
  ).toBe(true)
  await play(nullpad, 'G')
  expect(
    (await nullpad.text()).endsWith('line 19999\nline 20000'),
    'and the last lines',
  ).toBe(true)
})

const SAVED = 1100

test('a block insert left open keeps the other lines as they were when another tab changes the note', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\nab\nabcdef')
  await nullpad.page.waitForTimeout(SAVED)
  await play(nullpad, 'll<C-v>jjI')
  expect(await modeOf(nullpad), 'the block insert is open').toBe('INSERT')
  const other = await openTab(nullpad.page)
  expect(await other.text(), 'the second tab opens the same note').toBe(
    'abcdef\nab\nabcdef',
  )
  await other.press('Control+Home')
  if ((await modeOf(other)) === 'NORMAL') {
    await other.press('i')
  }
  await other.type('OTHER')
  await other.page.waitForTimeout(SAVED)
  await nullpad.page.bringToFront()
  await expect
    .poll(() => nullpad.text(), {
      message: 'the other tab save reached the first tab',
    })
    .toBe('OTHERabcdef\nab\nabcdef')
  expect(
    ['INSERT', 'NORMAL'],
    'the re-shown note keeps a mode of the stay',
  ).toContain(await modeOf(nullpad))
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'Esc leaves to NORMAL').toBe('NORMAL')
  expect(
    await nullpad.text(),
    'the other tab text is not copied to the lines below',
  ).toBe('OTHERabcdef\nab\nabcdef')
})

test('with Caps Lock on, Ctrl-V starts V-BLOCK in NORMAL and still pastes with vim off', async ({
  nullpad,
}) => {
  const capsCtrlV = async () => {
    const key = {
      key: 'V',
      code: 'KeyV',
      windowsVirtualKeyCode: 86,
      modifiers: 2,
    }
    await nullpad.cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      ...key,
      commands: ['paste'],
    })
    await nullpad.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    await settle(nullpad.page)
  }
  await nullpad.paste('abc\ndef')
  await nullpad.press('Control+Home')
  await setClipboard(nullpad, 'PP')
  await capsCtrlV()
  expect(await nullpad.text(), 'Caps Lock Ctrl-V pastes with vim off').toBe(
    'PPabc\ndef',
  )
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim on').toBe('NORMAL')
  await play(nullpad, '0')
  await capsCtrlV()
  expect(await modeOf(nullpad), 'Caps Lock Ctrl-V starts a block').toBe(
    'V-BLOCK',
  )
  expect(await nullpad.text(), 'and pastes nothing').toBe('PPabc\ndef')
})
