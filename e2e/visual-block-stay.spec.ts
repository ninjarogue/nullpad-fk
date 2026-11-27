import { type Nullpad, expect, settle, test, startVimRow } from './nullpad'
import { type Row, stayNotes, stayRows } from './vim-rows/visual-block-stay.ts'

const toggle = 'Control+,'

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
  test(
    `a block stay mixing typing with Delete, Backspace, Left and Right, Enter ends as in Vim (rows ${from + 1} to ${from + rows.length})`,
    { tag: '@vim-table' },
    async ({ nullpad }) => {
      for (const row of rows) {
        await playRow(nullpad, row)
      }
    },
  )
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
