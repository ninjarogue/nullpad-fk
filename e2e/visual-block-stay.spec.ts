import { type Nullpad, expect, settle, test, startVimRow } from './nullpad'

const toggle = 'Control+,'

type State = Readonly<{
  text: string
  line: number
  column: number
  mode: string
}>

type Row = Readonly<{
  note: keyof typeof stayNotes
  at: readonly [number, number]
  keys: string
  state: State
}>

const stayNotes = {
  S3: 'abcdef\nghijkl\nmnopqr',
  T1: 'abcdef\nab\nabcdef\nabcdef',
  RAG: 'abcdef\nab\nabcdefgh\nabcd',
  SH: 'abc\nde\nfghij\nk',
} as const

const stayRows: ReadonlyArray<Row> = [
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

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Del>': 'Delete',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Space>': ' ',
  '<C-v>': 'Control+v',
}

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of keys.match(/<[A-Za-z-[\]]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const vimOn = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press(toggle)
  await settle(nullpad.page)
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  const label = `${row.note} at ${row.at.join(':')} keys ${row.keys}`
  await startVimRow(nullpad, stayNotes[row.note], row.at[0], row.at[1])
  await play(nullpad, row.keys)
  expect.soft(await nullpad.text(), `${label}: text`).toBe(row.state.text)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line: row.state.line, column: row.state.column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe(row.state.mode)
}

const ROWS_PER_TEST = 5

for (let from = 0; from < stayRows.length; from += ROWS_PER_TEST) {
  const rows = stayRows.slice(from, from + ROWS_PER_TEST)
  test(`a block stay mixing typing with Delete, Backspace, Left and Right, Enter ends as in Vim (rows ${from + 1} to ${from + rows.length})`, async ({
    nullpad,
  }) => {
    for (const row of rows) {
      await playRow(nullpad, row)
    }
  })
}

const SAVE_AND_MARGIN = 2_000
const LONG = 49_000
const SHORT_LINES = 20_000

const longThenShort = () =>
  [
    'a'.repeat(LONG),
    ...Array.from({ length: SHORT_LINES - 1 }, (_, i) => `line ${i + 2}`),
  ].join('\n')

const begin = async (nullpad: Nullpad, text: string) => {
  await nullpad.paste(text)
  await nullpad.press('Control+Home')
  await vimOn(nullpad)
}

const expectUsable = async (
  nullpad: Nullpad,
  pageErrors: ReadonlyArray<string>,
  what: string,
) => {
  await nullpad.page.waitForTimeout(SAVE_AND_MARGIN)
  expect(pageErrors, `${what}: the page logged no error`).toEqual([])
  expect(await modeOf(nullpad), `${what}: back in NORMAL`).toBe('NORMAL')
  expect(
    (await nullpad.status()).lineCount,
    `${what}: the note still has its ${SHORT_LINES} lines`,
  ).toBe(SHORT_LINES)
  await play(nullpad, 'ggIZ<Esc>')
  expect(
    await nullpad.page
      .locator('.surface .line')
      .first()
      .evaluate(line => line.textContent.slice(0, 2)),
    `${what}: a typed key still shows`,
  ).toBe('Za')
  expect(pageErrors, `${what}: and still no error`).toEqual([])
}

test('a block put that would pad 20,000 short lines out to column 49,000 leaves the page working', async ({
  nullpad,
  pageErrors,
}) => {
  await begin(nullpad, longThenShort())
  await play(nullpad, 'j<C-v>G$y')
  expect(await modeOf(nullpad), 'the yank left the block').toBe('NORMAL')
  await play(nullpad, 'gg$p')
  await expectUsable(nullpad, pageErrors, 'p of a block')
})

test('a block A that would pad 20,000 short lines out to column 49,000 leaves the page working', async ({
  nullpad,
  pageErrors,
}) => {
  await begin(nullpad, longThenShort())
  await play(nullpad, `${LONG - 1}l<C-v>GAx<Esc>`)
  await expectUsable(nullpad, pageErrors, 'block A')
})
