export type State = Readonly<{
  text: string
  line: number
  column: number
  mode: string
}>

export type Row = Readonly<{
  note: keyof typeof stayNotes
  at: readonly [number, number]
  keys: string
  state: State
}>

export const stayNotes = {
  S3: 'abcdef\nghijkl\nmnopqr',
  T1: 'abcdef\nab\nabcdef\nabcdef',
  RAG: 'abcdef\nab\nabcdefgh\nabcd',
  SH: 'abc\nde\nfghij\nk',
} as const

export const stayRows: ReadonlyArray<Row> = [
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjc<Del><Esc>',
    state: {
      text: 'cdef\nhijkl\nnopqr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjlI<Del><Esc>',
    state: {
      text: 'bcdef\nghijkl\nmnopqr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjIx<Del><Esc>',
    state: {
      text: 'xbcdef\nghijkl\nmnopqr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjIxy<Left><Del><Esc>',
    state: {
      text: 'xabcdef\nxghijkl\nxmnopqr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 3],
    keys: '<C-v>jjA<Del>x<Esc>',
    state: {
      text: 'abcxef\nghijkl\nmnopqr',
      line: 1,
      column: 4,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 2],
    keys: '<C-v>jjIxy<BS><BS><BS><Esc>',
    state: {
      text: 'bcdef\nghijkl\nmnopqr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 3],
    keys: '<C-v>jjIx<BS><BS>y<Esc>',
    state: {
      text: 'aycdef\nghijkl\nmnopqr',
      line: 1,
      column: 2,
      mode: 'NORMAL',
    },
  },
  {
    note: 'T1',
    at: [1, 4],
    keys: '<C-v>3jIxy<Del>z<Esc>',
    state: {
      text: 'abcxyzef\nab\nabcxydef\nabcxydef',
      line: 1,
      column: 4,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 2],
    keys: '<C-v>jjIxy<Left>z<Esc>',
    state: {
      text: 'axzybcdef\ngxzyhijkl\nmxzynopqr',
      line: 1,
      column: 2,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 2],
    keys: '<C-v>jjIxy<Left><Left>z<Right>w<Esc>',
    state: {
      text: 'azxwybcdef\ngzxwyhijkl\nmzxwynopqr',
      line: 1,
      column: 2,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjIx<CR>y<Esc>',
    state: {
      text: 'x\nyabcdef\nghijkl\nmnopqr',
      line: 2,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjAx<CR>y<Esc>',
    state: {
      text: 'ax\nybcdef\nghijkl\nmnopqr',
      line: 2,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjlcxy<Del>z<Esc>',
    state: {
      text: 'xyzdef\nxyijkl\nxyopqr',
      line: 1,
      column: 3,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 2],
    keys: '<C-v>jjlc<BS>x<Esc>',
    state: {
      text: 'xdef\ngjkl\nmpqr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'T1',
    at: [1, 1],
    keys: 'l<C-v>jlI<BS> y<Esc>',
    state: {
      text: ' ybcdef\nab\nabcdef\nabcdef',
      line: 1,
      column: 2,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jj$Ax<BS><BS>y<Esc>',
    state: {
      text: 'abcdey\nghijkl\nmnopqr',
      line: 1,
      column: 6,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjAxy<Left><Del>z<Esc>',
    state: {
      text: 'axzbcdef\ngxzhijkl\nmxznopqr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'RAG',
    at: [1, 3],
    keys: '<C-v>3jlcab<Del><Del>c<Esc>',
    state: {
      text: 'ababc\naba\nabaefgh\naba',
      line: 1,
      column: 5,
      mode: 'NORMAL',
    },
  },
  {
    note: 'SH',
    at: [1, 2],
    keys: '<C-v>jjlIab<Right>c<Esc>',
    state: {
      text: 'aabbcc\ndabbe\nfabbghij\nk',
      line: 1,
      column: 2,
      mode: 'NORMAL',
    },
  },
  {
    note: 'SH',
    at: [1, 1],
    keys: '<C-v>3jIxy<Right><Del>z<Esc>',
    state: {
      text: 'xyazc\nxyde\nxyfghij\nxyk',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jjIxyz<Left><Left><BS>w<Esc>',
    state: {
      text: 'wyzabcdef\nwyzghijkl\nwyzmnopqr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 1],
    keys: '<C-v>jj$A<Left>x<Esc>',
    state: {
      text: 'abcdexf\nghijkxl\nmnopqxr',
      line: 1,
      column: 1,
      mode: 'NORMAL',
    },
  },
  {
    note: 'S3',
    at: [1, 4],
    keys: '<C-v>jjlcx<Left>y<Right>z<Esc>',
    state: {
      text: 'abcyxzf\nghiyxzl\nmnoyxzr',
      line: 1,
      column: 6,
      mode: 'NORMAL',
    },
  },
  {
    note: 'RAG',
    at: [1, 3],
    keys: '<C-v>3j$Ax<Left>y<Del><Esc>',
    state: {
      text: 'abcdefy\naby\nabcdefghy\nabcdy',
      line: 1,
      column: 3,
      mode: 'NORMAL',
    },
  },
]
