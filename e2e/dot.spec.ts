import { type Nullpad, expect, settle, test, startVimRow } from './nullpad'
import { type Row, texts, groups } from './vim-rows/dot.ts'

const SAVED = 1500
const ROWS_PER_TEST = 18

const toggle = 'Control+,'

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

const playRow = async (nullpad: Nullpad, row: Row) => {
  const label = `${row.text} at ${row.at.join(':')} keys ${row.keys}`
  await startVimRow(nullpad, texts[row.text], row.at[0], row.at[1])
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
    test(
      `vim ${group.name} act as in Vim (rows ${from + 1} to ${from + rows.length})`,
      { tag: '@vim-table' },
      async ({ nullpad }) => {
        for (const row of rows) {
          await playRow(nullpad, row)
        }
      },
    )
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

test('a dot answers at once after a stay of 4,000 typed letters', async ({
  nullpad,
}) => {
  test.setTimeout(90_000)
  const letters = 'abcdefghij'.repeat(400)
  await nullpad.paste('\n')
  await vimOn(nullpad)
  await play(nullpad, 'ki')
  await nullpad.page.keyboard.type(letters)
  await settle(nullpad.page)
  await play(nullpad, '<Esc>')
  expect(await nullpad.status(), 'the stay put its letters on line 1').toEqual({
    line: 1,
    column: letters.length,
    lineCount: 2,
  })
  await play(nullpad, 'j')
  const before = Date.now()
  await nullpad.page.keyboard.press('.')
  await settle(nullpad.page)
  const took = Date.now() - before
  expect(await nullpad.status(), 'dot put the same letters on line 2').toEqual({
    line: 2,
    column: letters.length,
    lineCount: 2,
  })
  expect(
    (await nullpad.text()).endsWith('abcdefghij'),
    'the end of line 2 is on screen',
  ).toBe(true)
  expect(await modeOf(nullpad), 'dot ends in NORMAL').toBe('NORMAL')
  expect(
    took,
    `a dot after a stay of 4,000 letters took ${took} ms to reach the screen`,
  ).toBeLessThan(500)
})
