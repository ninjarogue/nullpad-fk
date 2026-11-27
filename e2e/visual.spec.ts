import {
  type Nullpad,
  driver,
  expect,
  numberedLines,
  openFresh,
  settle,
  test,
  startVimRow,
} from './nullpad'
import { type Row, texts, groups } from './vim-rows/visual.ts'

const SAVED = 1500
const ROWS_PER_TEST = 17
const toggle = 'Control+,'

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
      `visual ${group.name} act as in Vim (rows ${from + 1} to ${from + rows.length})`,
      { tag: '@vim-table' },
      async ({ nullpad }) => {
        for (const row of rows) {
          await playRow(nullpad, row)
        }
      },
    )
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

test('a paste in VISUAL, by Ctrl-Shift-V, replaces the selection and lands in NORMAL as one change', async ({
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

test('Ctrl-V in NORMAL starts V-BLOCK and pastes nothing, and Ctrl-Shift-V pastes', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc\ndef')
  await nullpad.paste('PP')
  expect(
    await nullpad.text(),
    'Ctrl-Shift-V in NORMAL pastes the clipboard text',
  ).toBe('PPabc\ndef')
  expect(await modeOf(nullpad), 'still NORMAL after the paste').toBe('NORMAL')
  await nullpad.press('Control+v')
  expect(
    await nullpad.text(),
    'Ctrl-V in NORMAL leaves the text, with PP still on the clipboard',
  ).toBe('PPabc\ndef')
  expect(await modeOf(nullpad), 'Ctrl-V in NORMAL starts V-BLOCK').toBe(
    'V-BLOCK',
  )
  await nullpad.press('Control+v')
  expect(await modeOf(nullpad), 'a second Ctrl-V leaves it').toBe('NORMAL')
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
  for (const key of ['J', '~', 'u', 'U', '>', '<', '=', ':']) {
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

type Rect = Readonly<{
  left: number
  top: number
  right: number
  bottom: number
}>

const selectionBoxes = (nullpad: Nullpad): Promise<ReadonlyArray<Rect>> =>
  nullpad.page.evaluate(() =>
    [...document.querySelectorAll('#selection > *')]
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      })),
  )

const caretRect = (nullpad: Nullpad): Promise<Rect> =>
  nullpad.page.evaluate(() => {
    const rect = document.getElementById('caret')?.getBoundingClientRect()
    if (rect === undefined) {
      throw new Error('no #caret')
    }
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    }
  })

type Pixel = readonly [number, number, number]

const pixelsOf = async (
  nullpad: Nullpad,
  points: ReadonlyArray<readonly [number, number]>,
): Promise<ReadonlyArray<Pixel>> => {
  await settle(nullpad.page)
  const png = await nullpad.page.screenshot({
    animations: 'disabled',
    caret: 'hide',
  })
  return nullpad.page.evaluate(
    async ({ base64, wanted }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (context === null) {
        throw new Error('no 2d canvas to read the screenshot')
      }
      context.drawImage(image, 0, 0)
      return wanted.map(([x, y]): [number, number, number] => {
        const [r = 0, g = 0, b = 0] = context.getImageData(x, y, 1, 1).data
        return [r, g, b]
      })
    },
    { base64: png.toString('base64'), wanted: points },
  )
}

const apart = (a: Pixel, b: Pixel) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))

const lettersPerRow = async (nullpad: Nullpad): Promise<number> => {
  await nullpad.paste('x'.repeat(400))
  const { rows } = await nullpad.screen()
  const first = rows[0]
  if (first === undefined) {
    throw new Error('no row drawn')
  }
  return first.text.length
}

for (const trailing of ['', '  ']) {
  test(`the block cursor sits on the line break after a line that fills its row exactly${trailing === '' ? '' : ', with two trailing spaces'}`, async ({
    nullpad,
  }) => {
    const fill = await lettersPerRow(nullpad)
    await openFresh(nullpad.page)
    await begin(nullpad, `${'x'.repeat(fill)}${trailing}\nend`)
    const { cell, rows } = await nullpad.screen()
    expect(
      rows.filter(row => row.lineId === rows[0]?.lineId).length,
      `${fill} letters fill one row exactly${trailing === '' ? '' : ' (the spaces hang)'}`,
    ).toBe(1)
    await play(nullpad, 'gg0v$')
    expect(await modeOf(nullpad), 'v$').toBe('VISUAL')
    expect(
      (await selectionOf(nullpad)).endsWith('\n'),
      'the selection holds the line break',
    ).toBe(true)
    const caret = await caretRect(nullpad)
    expect(
      caret.right - caret.left,
      'the cursor on the line break is a block, wider than half a cell',
    ).toBeGreaterThan(cell / 2)
    const boxes = (await selectionBoxes(nullpad)).filter(
      box => Math.abs(box.top - caret.top) < 3,
    )
    const rightmost = boxes.reduce<Rect | null>(
      (best, box) => (best === null || box.right > best.right ? box : best),
      null,
    )
    expect(rightmost, 'a highlight box on the cursor row').not.toBeNull()
    expect(
      caret.left < (rightmost?.right ?? 0) &&
        caret.right > (rightmost?.left ?? 0),
      `the cursor (${caret.left} to ${caret.right}) lies on the highlight of the break (${rightmost?.left} to ${rightmost?.right})`,
    ).toBe(true)
  })
}

test('the highlight covers only the selected letters on a line that mixes left-to-right and right-to-left text', async ({
  nullpad,
}) => {
  const note = 'abc אבג def'
  await begin(nullpad, note)
  await play(nullpad, 'gg0vw')
  expect(await modeOf(nullpad), 'vw').toBe('VISUAL')
  expect(
    await nullpad.status(),
    'the cursor end is the first Hebrew letter',
  ).toMatchObject({ line: 1, column: 5 })
  const boxes = await selectionBoxes(nullpad)
  const covered = await nullpad.page.evaluate(
    ({ rects }) => {
      const segmenter = new Intl.Segmenter(undefined, {
        granularity: 'grapheme',
      })
      const range = document.createRange()
      const found: Array<{ letter: string; index: number; covered: boolean }> =
        []
      let index = 0
      for (const line of document.querySelectorAll('.surface .line')) {
        for (const node of line.childNodes) {
          if (!(node instanceof Text)) {
            continue
          }
          for (const part of segmenter.segment(node.data)) {
            range.setStart(node, part.index)
            range.setEnd(node, part.index + part.segment.length)
            const [rect] = range.getClientRects()
            if (rect !== undefined) {
              const x = (rect.left + rect.right) / 2
              const y = (rect.top + rect.bottom) / 2
              found.push({
                letter: part.segment,
                index,
                covered: rects.some(
                  box =>
                    x > box.left &&
                    x < box.right &&
                    y > box.top &&
                    y < box.bottom,
                ),
              })
            }
            index += 1
          }
        }
        break
      }
      return found
    },
    { rects: boxes },
  )
  expect(covered.length, 'every letter of the line has a rect').toBe(11)
  for (const { letter, index, covered: isCovered } of covered) {
    expect(
      isCovered,
      `letter ${index} (${JSON.stringify(letter)}) is ${index < 5 ? '' : 'not '}covered`,
    ).toBe(index < 5)
  }
})

test('a selected letter that has no width still shows a highlight', async ({
  nullpad,
}) => {
  await begin(nullpad, '‌')
  await play(nullpad, 'v')
  expect(await modeOf(nullpad), 'v').toBe('VISUAL')
  expect(await selectionOf(nullpad), 'the letter under the cursor').toBe('‌')
  const widths = (await selectionBoxes(nullpad)).map(
    box => box.right - box.left,
  )
  expect(
    widths.some(width => width > 0),
    `a highlight box with a width (boxes ${JSON.stringify(widths)})`,
  ).toBe(true)
})

test('the highlight shows in forced colours', async ({ nullpad }) => {
  await nullpad.page.emulateMedia({ forcedColors: 'active' })
  await begin(nullpad, 'hello')
  await play(nullpad, 'viw')
  expect(await selectionOf(nullpad), 'viw').toBe('hello')
  const box = await selectionBox(nullpad)
  if (box === null) {
    throw new Error('no highlight box')
  }
  const { rowHeight } = await nullpad.screen()
  const [inside, outside] = await pixelsOf(nullpad, [
    [Math.round(box.left) + 1, Math.round(box.top) + 1],
    [500, Math.round(box.top + rowHeight * 6)],
  ])
  expect(
    apart(inside ?? [0, 0, 0], outside ?? [0, 0, 0]),
    `the highlight pixel ${JSON.stringify(inside)} differs from the page background ${JSON.stringify(outside)}`,
  ).toBeGreaterThan(8)
})

test('gv after an undo selects the lines that were selected', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\nthree four')
  await play(nullpad, 'ggVd')
  expect(await nullpad.text(), 'Vd took the first line').toBe('three four')
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'u brought it back').toBe('one two\nthree four')
  await play(nullpad, 'gv')
  expect(await modeOf(nullpad), 'gv').toBe('V-LINE')
  expect(await selectionOf(nullpad), 'gv selects the first line').toBe(
    'one two\n',
  )
  await play(nullpad, 'd')
  expect(await nullpad.text(), 'd took it again').toBe('three four')
})

test('Ctrl-C leaves VISUAL as in Vim', async ({ nullpad }) => {
  await begin(nullpad, 'hello world')
  await play(nullpad, 'viw')
  expect(await selectionOf(nullpad), 'viw').toBe('hello')
  await nullpad.press('Control+c')
  expect(await modeOf(nullpad), 'Ctrl-C leaves').toBe('NORMAL')
  expect(await selectionOf(nullpad), 'nothing is selected').toBe('')
  expect(await nullpad.text(), 'the text is unchanged').toBe('hello world')
  expect(
    await nullpad.status(),
    'the cursor stays on its letter',
  ).toMatchObject({ line: 1, column: 5 })
})

test('P of whole lines over a selection on an emptied note leaves no empty last line, as in Vim', async ({
  nullpad,
}) => {
  await begin(nullpad, 'a\nb')
  await play(nullpad, 'dGvP')
  expect(
    await nullpad.text(),
    'dG then vP: the lines go under the empty line, and nothing follows them',
  ).toBe('\na\nb')
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'u empties the note again').toBe('')
  await nullpad.press('Control+v')
  await play(nullpad, 'P')
  expect(
    await nullpad.text(),
    'Ctrl-V then P: the lines replace the empty line',
  ).toBe('a\nb')
  expect(await modeOf(nullpad), 'the put lands in NORMAL').toBe('NORMAL')
})

for (const scale of [1.25, 1.75]) {
  test(`the rows of a highlight join with no gap at ${scale * 100}% scale`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 600 },
      deviceScaleFactor: scale,
    })
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      const page = await context.newPage()
      await page.goto(baseURL ?? '/')
      await page.locator('#caret').waitFor()
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      const nullpad = driver(page, await context.newCDPSession(page))
      await begin(
        nullpad,
        Array.from({ length: 40 }, (_, i) => `ab${i % 7}`).join('\n'),
      )
      await play(nullpad, 'ggV10j')
      expect(await modeOf(nullpad), 'V10j').toBe('V-LINE')
      const breaks = await nullpad.page.evaluate(() =>
        [...document.querySelectorAll('#selection > [data-break]')].map(
          element => {
            const rect = element.getBoundingClientRect()
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            }
          },
        ),
      )
      const boxes = await selectionBoxes(nullpad)
      expect(boxes.length, 'the highlight is drawn').toBeGreaterThan(0)
      const first = breaks[0]
      expect(first, 'the line breaks of V-LINE are highlighted').toBeDefined()
      const x = Math.floor(
        (((first?.left ?? 0) + (first?.right ?? 0)) / 2) * scale,
      )
      const top = Math.ceil(Math.min(...boxes.map(box => box.top)) * scale)
      const bottom = Math.floor(
        Math.max(...boxes.map(box => box.bottom)) * scale,
      )
      const points: Array<readonly [number, number]> = []
      for (let y = top; y < bottom; y++) {
        points.push([x, y])
      }
      const column = await pixelsOf(nullpad, points)
      const reference = column[Math.floor(column.length / 2)] ?? [0, 0, 0]
      const gaps = column
        .map((pixel, i) => ({ y: top + i, pixel }))
        .filter(({ pixel }) => apart(pixel, reference) > 6)
      expect(
        gaps,
        `pixels in column ${x} from ${top} to ${bottom} that are not the highlight colour ${JSON.stringify(reference)}`,
      ).toEqual([])
    } finally {
      await context.close()
    }
  })
}
