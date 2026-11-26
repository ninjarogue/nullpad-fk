import {
  type Nullpad,
  expect,
  numberedLines,
  openFresh,
  openTab,
  settle,
  test,
  startVimRow,
} from './nullpad'
import { type Row, texts, vimRows } from './vim-rows/undo.ts'

const SAVED = 1500

const toggle = 'Control+,'
const redoKeys = ['Control+Shift+z', 'Control+y'] as const

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

const playRow = async (nullpad: Nullpad, row: Row) => {
  const label = `${row.text} at ${row.at.join(':')} keys ${row.keys}`
  await startVimRow(nullpad, texts[row.text], row.at[0], row.at[1])
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
  test(
    `vim u and Ctrl-R after changes, counts and mixed scripts act as in Vim (rows ${part * chunk + 1} to ${part * chunk + rows.length})`,
    { tag: '@vim-table' },
    async ({ nullpad }) => {
      for (const row of rows) {
        await playRow(nullpad, row)
      }
    },
  )
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
  expect(await nullpad.text(), 'redo puts the run back').toBe('ab   cd ef')

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
    'lineZZ one\nline ',
  )
  await undo(nullpad)
  expect(await nullpad.status(), 'cursor before the Backspaces').toMatchObject({
    line: 2,
    column: 9,
  })
  await nullpad.press('Control+y')
  expect(await nullpad.status(), 'cursor after the Backspaces').toMatchObject({
    line: 2,
    column: 6,
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
    const listener = (event: KeyboardEvent) => {
      if (!['Control', 'Shift', 'Meta', 'Alt'].includes(event.key)) {
        box.cancelled = event.defaultPrevented
        window.removeEventListener('keydown', listener)
      }
    }
    window.addEventListener('keydown', listener)
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
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim on').toBe('NORMAL')
  expect(
    await cancelled(nullpad, 'Control+r'),
    'vim on: Ctrl-R cancelled',
  ).toBe(true)
  expect(await nullpad.text(), 'the page did not reload').toBe('abc')
  expect(await modeOf(nullpad), 'vim still on').toBe('NORMAL')

  await nullpad.page.keyboard.press(toggle)

  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  expect(
    await cancelled(nullpad, 'Control+r'),
    'vim off: Ctrl-R not cancelled',
  ).toBe(false)
})

test('with Caps Lock on, Ctrl-R redoes in NORMAL and its keydown is cancelled', async ({
  nullpad,
}) => {
  await nullpad.type('abc')
  await nullpad.page.keyboard.press(toggle)
  await settle(nullpad.page)
  await nullpad.press('u')
  expect(await nullpad.text(), 'u took the typing back').toBe('')
  const seen = await nullpad.page.evaluateHandle(() => {
    const box: { cancelled: boolean | null } = { cancelled: null }
    window.addEventListener(
      'keydown',
      event => (box.cancelled = event.defaultPrevented),
      { once: true },
    )
    return box
  })
  const key = {
    key: 'R',
    code: 'KeyR',
    windowsVirtualKeyCode: 82,
    modifiers: 2,
  }
  await nullpad.cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    ...key,
  })
  await nullpad.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  await settle(nullpad.page)
  expect(
    await seen.evaluate(box => box.cancelled),
    'the keydown was cancelled, so the page does not reload',
  ).toBe(true)
  expect(await nullpad.text(), 'Ctrl-R put the typing back').toBe('abc')
})

test('history runs across the vim toggle both ways', async ({ nullpad }) => {
  await nullpad.type('abc')
  await nullpad.page.keyboard.press(toggle)
  await settle(nullpad.page)
  await nullpad.press('u')
  expect(await nullpad.text(), 'u took the change made with vim off').toBe('')
  await nullpad.press('Control+r')
  expect(await nullpad.text(), 'Ctrl-R put it back').toBe('abc')

  await nullpad.type('ggdd')
  expect(await nullpad.text(), 'dd emptied the note').toBe('')
  await nullpad.page.keyboard.press(toggle)
  await settle(nullpad.page)
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
  await settle(nullpad.page)
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
  await settle(nullpad.page)
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
  await settle(nullpad.page)
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
  await settle(nullpad.page)
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

test('a cancelled IME composition leaves no change, so one Ctrl-Z takes back the typed run', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.compose('k')
  await nullpad.compose('')
  expect(await nullpad.text(), 'after the cancel').toBe('ab')
  await undo(nullpad)
  expect(await nullpad.text(), 'one Ctrl-Z takes the run of ab').toBe('')
  await nullpad.press('Control+Shift+z')
  expect(await nullpad.text(), 'Ctrl-Shift-Z brings ab back').toBe('ab')
})
