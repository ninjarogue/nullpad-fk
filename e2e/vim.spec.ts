import {
  type Nullpad,
  expect,
  openFresh,
  openTab,
  settle,
  test,
  startVimRow,
} from './nullpad'
import { type Row, tables } from './vim-rows/vim.ts'

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Up>': 'ArrowUp',
  '<Down>': 'ArrowDown',
  '<Home>': 'Home',
  '<End>': 'End',
}

const toggle = 'Control+,'

const modeOf = (nullpad: Nullpad) =>
  nullpad.page.locator('.status .mode').innerText()

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const pending = nullpad.page.locator('.status .pending')
  return (await pending.count()) === 0 ? '' : (await pending.innerText()).trim()
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  await startVimRow(nullpad, row.text, row.at[0], row.at[1])
  for (const token of row.keys.match(/<[A-Za-z]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
  expect.soft(await nullpad.text(), `${row.name}: text`).toBe(row.after)
  expect
    .soft(await nullpad.status(), `${row.name}: line and column`)
    .toMatchObject({ line: row.line, column: row.column })
  expect.soft(await modeOf(nullpad), `${row.name}: mode`).toBe('NORMAL')
}

for (const [name, rows] of tables) {
  test(
    `vim Normal keys: ${name}`,
    { tag: '@vim-table' },
    async ({ nullpad }) => {
      for (const row of rows) {
        await playRow(nullpad, row)
      }
    },
  )
}

test('a toggle typed between fast keys acts in order with the keys around it', async ({
  nullpad,
}) => {
  const { keyboard } = nullpad.page
  await keyboard.type('abc')
  for (const key of [
    'ArrowLeft',
    'ArrowLeft',
    toggle,
    'x',
    toggle,
    'Z',
    toggle,
    'x',
    toggle,
    'q',
  ]) {
    await keyboard.press(key)
  }
  await settle(nullpad.page)
  expect(
    await nullpad.text(),
    'x ran in Normal, Z and q typed with vim off',
  ).toBe('aqZ')
  expect(await nullpad.status()).toMatchObject({ line: 1, column: 3 })
  expect(await modeOf(nullpad), 'the last toggle left vim off').toBe('EDIT')
})

test('vim is off on a fresh profile, survives a plain reload, and types letters itself when off', async ({
  nullpad,
}) => {
  const button = nullpad.page.locator('.status .toggle-vim')
  expect(await modeOf(nullpad), 'fresh profile').toBe('EDIT')
  await expect(button, 'button on a fresh profile').toHaveText('vim off')
  await nullpad.type('xji')
  expect(await nullpad.text(), 'x j i type themselves with vim off').toBe('xji')
  await nullpad.press('Control+,')
  expect(await modeOf(nullpad), 'Ctrl+, turns vim on into Normal').toBe(
    'NORMAL',
  )
  await expect(button, 'button with vim on').toHaveText('vim on')
  await nullpad.reload()
  expect(await modeOf(nullpad), 'a plain reload keeps vim on').toBe('NORMAL')
  await expect(button, 'button after reload').toHaveText('vim on')
  await nullpad.press('Control+,')
  expect(await modeOf(nullpad), 'toggled off again').toBe('EDIT')
  await nullpad.reload()
  expect(await modeOf(nullpad), 'a plain reload keeps vim off').toBe('EDIT')
  await nullpad.press('Control+,')
  await openFresh(nullpad.page)
  expect(await modeOf(nullpad), 'a fresh profile starts with vim off').toBe(
    'EDIT',
  )
  await expect(button).toHaveText('vim off')
  await nullpad.type('xji')
  expect(await nullpad.text(), 'letters type themselves again').toBe('xji')
})

test('the status line names the mode, the caret is a block in Normal and a bar in Insert, pending keys show', async ({
  nullpad,
}) => {
  await nullpad.paste('one\ntwo\nthree')
  await nullpad.press('Control+Home')
  const cell = (await nullpad.screen()).cell
  const off = await nullpad.cursor()
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  expect(off?.width, 'a block caret with vim off').toBeGreaterThan(cell * 0.7)
  expect(off?.width).toBeLessThan(cell * 1.4)
  await nullpad.press(toggle)
  expect(await modeOf(nullpad), 'vim on').toBe('NORMAL')
  const block = await nullpad.cursor()
  expect(block?.char, 'Normal caret sits on a letter').toBe('o')
  expect(block?.width, 'Normal caret is about one letter wide').toBeGreaterThan(
    cell * 0.7,
  )
  expect(block?.width).toBeLessThan(cell * 1.4)
  await nullpad.press('i')
  expect(await modeOf(nullpad), 'i').toBe('INSERT')
  const bar = await nullpad.cursor()
  expect(bar?.width, 'Insert caret is a thin bar').toBeGreaterThan(1)
  expect(bar?.width).toBeLessThan(3.5)
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 'Esc').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')
  await nullpad.press('2')
  expect(await pendingOf(nullpad), 'a count shows').toBe('2')
  await nullpad.press('g')
  expect(await pendingOf(nullpad), 'a count and g show').toBe('2g')
  await nullpad.press('g')
  expect(await pendingOf(nullpad), 'a finished command clears them').toBe('')
  expect(await nullpad.status(), '2gg went to line 2').toMatchObject({
    line: 2,
    column: 1,
  })
  await nullpad.press('4')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Esc clears a count').toBe('')
  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'read view').toBe('READ')
  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'back to the mode left').toBe('NORMAL')
})

test('Ctrl+P and Ctrl+E drop pending keys', async ({ nullpad }) => {
  await nullpad.paste('a\nb\nc\nd')
  await nullpad.press(toggle)
  await nullpad.press('G')
  expect(await nullpad.status(), 'G').toMatchObject({ line: 4 })
  await nullpad.press('g')
  await nullpad.press('Control+p')
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 'finder closed, Normal again').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'finder dropped the g').toBe('')
  await nullpad.press('g')
  expect(
    await nullpad.status(),
    'a lone g after the finder goes nowhere',
  ).toMatchObject({ line: 4 })
  await nullpad.press('Escape')
  await nullpad.press('g')
  await nullpad.press('Control+e')
  await nullpad.press('Control+e')
  expect(await pendingOf(nullpad), 'read view dropped the g').toBe('')
  await nullpad.press('g')
  expect(
    await nullpad.status(),
    'a lone g after the read view goes nowhere',
  ).toMatchObject({ line: 4 })
  await nullpad.press('g')
  expect(await nullpad.status(), 'gg still works').toMatchObject({ line: 1 })
})

test('an IME in Normal changes nothing, and a conversion in Insert after Normal keys replaces only its letters', async ({
  nullpad,
}) => {
  await nullpad.press(toggle)
  await nullpad.press('i')
  await nullpad.type('one two three')
  await nullpad.press('Escape')
  await nullpad.compose('にほん')
  await nullpad.commit('日本')
  expect(await nullpad.text(), 'IME text in Normal is thrown away').toBe(
    'one two three',
  )
  expect(await modeOf(nullpad), 'still Normal').toBe('NORMAL')
  await nullpad.press('0')
  await nullpad.press('x')
  expect(await nullpad.text(), 'Normal x after the IME').toBe('ne two three')
  await nullpad.press('A')
  await nullpad.type(' four')
  await nullpad.compose('2', { start: 3, end: 6 })
  await nullpad.commit('2')
  expect(await nullpad.text(), 'only "two" was converted').toBe(
    'ne 2 three four',
  )
  await nullpad.press('Escape')
  await nullpad.press('0')
  await nullpad.press('i')
  await nullpad.type('o')
  expect(await nullpad.text(), 'typing goes on after the conversion').toBe(
    'one 2 three four',
  )
})

const SAVED = 1100

const editInOtherTab = async (nullpad: Nullpad) => {
  const other = await openTab(nullpad.page)
  if ((await modeOf(other)) === 'EDIT') {
    await other.press(toggle)
  }
  expect(await other.text(), 'the second tab opens the same note').toBe('base')
  await other.press('A')
  await other.type(' B')
  await other.page.waitForTimeout(SAVED)
  await nullpad.page.bringToFront()
  await expect
    .poll(() => nullpad.text(), {
      message: 'the other tab save reached this tab',
    })
    .toBe('base B')
}

test('a save from another tab leaves a tab in Insert in Insert, so the next letters are typed as text', async ({
  nullpad,
}) => {
  await nullpad.press(toggle)
  await nullpad.press('i')
  await nullpad.type('base')
  await nullpad.page.waitForTimeout(SAVED)
  await editInOtherTab(nullpad)
  expect(await modeOf(nullpad), 'still INSERT after the other tab saved').toBe(
    'INSERT',
  )
  const caret = await nullpad.page.locator('#caret').boundingBox()
  expect(caret?.width ?? 99, 'the cursor is still a bar').toBeLessThanOrEqual(4)
  await nullpad.type('xyz')
  expect(
    (await nullpad.text()).replace('xyz', ''),
    'xyz was typed and no letter was deleted',
  ).toBe('base B')
  expect(await modeOf(nullpad), 'still INSERT after typing').toBe('INSERT')
})

test('a save from another tab leaves a tab in Normal in Normal', async ({
  nullpad,
}) => {
  await nullpad.press(toggle)
  await nullpad.press('i')
  await nullpad.type('base')
  await nullpad.press('Escape')
  await nullpad.page.waitForTimeout(SAVED)
  await editInOtherTab(nullpad)
  expect(await modeOf(nullpad), 'still NORMAL after the other tab saved').toBe(
    'NORMAL',
  )
  await nullpad.type('xyz')
  expect(
    (await nullpad.text()).length,
    'letters in Normal are commands, never typed text',
  ).toBeLessThan('base B'.length)
  expect(await modeOf(nullpad), 'still NORMAL after the keys').toBe('NORMAL')
})

test('operator-pending keys show in the status line and Esc, Ctrl+P, Ctrl+E and a non-target key drop them without a change', async ({
  nullpad,
}) => {
  await nullpad.paste('one two three\nfour')
  await nullpad.press('Control+Home')
  await nullpad.press(toggle)
  await nullpad.press('d')
  expect(await pendingOf(nullpad), 'd waits for a target').toBe('d')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Esc drops d').toBe('')
  await nullpad.press('2')
  await nullpad.press('d')
  await nullpad.press('3')
  expect(await pendingOf(nullpad), 'counts and operator show').toBe('2d3')
  await nullpad.press('Control+p')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Ctrl+P drops 2d3').toBe('')
  await nullpad.press('c')
  await nullpad.press('i')
  expect(await pendingOf(nullpad), 'ci waits for an object').toBe('ci')
  await nullpad.press('Control+e')
  await nullpad.press('Control+e')
  expect(await pendingOf(nullpad), 'Ctrl+E drops ci').toBe('')
  await nullpad.press('d')
  await nullpad.press('q')
  expect(await pendingOf(nullpad), 'q is no target and drops d').toBe('')
  await nullpad.press('c')
  await nullpad.press('i')
  await nullpad.press('Z')
  expect(await pendingOf(nullpad), 'Z is no object and drops ci').toBe('')
  expect(await modeOf(nullpad), 'no change of mode').toBe('NORMAL')
  expect(await nullpad.text(), 'nothing was deleted or typed').toBe(
    'one two three\nfour',
  )
  expect(await nullpad.status(), 'the cursor did not move').toMatchObject({
    line: 1,
    column: 1,
  })
  await nullpad.press('w')
  expect(
    await nullpad.status(),
    'w after a dropped d only moves',
  ).toMatchObject({ line: 1, column: 5 })
})

test('c lands in Insert with the bar cursor, typed text goes in and Esc returns to Normal', async ({
  nullpad,
}) => {
  await nullpad.paste('foo bar')
  await nullpad.press('Control+Home')
  await nullpad.press(toggle)
  await nullpad.press('c')
  await nullpad.press('w')
  expect(await modeOf(nullpad), 'cw lands in Insert').toBe('INSERT')
  const bar = await nullpad.cursor()
  expect(bar?.width, 'Insert caret is a thin bar').toBeGreaterThan(1)
  expect(bar?.width).toBeLessThan(3.5)
  await nullpad.type('xy')
  expect(await nullpad.text(), 'typed text replaces the word').toBe('xy bar')
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 'Esc returns to Normal').toBe('NORMAL')
  expect(await nullpad.status(), 'Esc steps one letter left').toMatchObject({
    line: 1,
    column: 2,
  })
  const block = await nullpad.cursor()
  expect(block?.width, 'Normal caret is a block again').toBeGreaterThan(5)
})

test('yy in one note and p in another note puts the line, and after a reload p does nothing', async ({
  nullpad,
}) => {
  await nullpad.type('alpha')
  await nullpad.page.waitForTimeout(SAVED)
  await nullpad.press(toggle)
  await nullpad.press('y')
  await nullpad.press('y')
  await nullpad.press('Control+p')
  await nullpad.type('second')
  for (let i = 0; i < 20; i++) {
    const selected = (await nullpad.finder())?.rows.find(row => row.selected)
    if (selected?.text.startsWith('+ new note')) {
      break
    }
    await nullpad.press('ArrowDown')
  }
  await nullpad.press('Enter')
  expect(await nullpad.text(), 'the second note is open').toBe('second')
  expect(await modeOf(nullpad), 'a note opened with vim on is Normal').toBe(
    'NORMAL',
  )
  await nullpad.press('p')
  expect(await nullpad.text(), 'p puts the yanked line below').toBe(
    'second\nalpha',
  )
  await nullpad.page.waitForTimeout(SAVED)
  await nullpad.reload()
  expect(await nullpad.text(), 'the note came back').toBe('second\nalpha')
  await nullpad.press('p')
  expect(await nullpad.text(), 'the store is empty after a reload').toBe(
    'second\nalpha',
  )
})
