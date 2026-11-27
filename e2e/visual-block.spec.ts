import {
  type Nullpad,
  expect,
  numberedLines,
  openTab,
  settle,
  test,
  startVimRow,
} from './nullpad'
import { type Row, type State, notes, groups } from './vim-rows/visual-block.ts'

const ROWS_PER_TEST = 12
const toggle = 'Control+,'
const BLOCKED = 'clipboard blocked, use Ctrl-Shift-V'

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
    test(
      `block ${group.name} as in Vim (rows ${from + 1} to ${from + rows.length})`,
      { tag: '@vim-table' },
      async ({ nullpad }) => {
        for (const row of rows) {
          await playRow(nullpad, row)
        }
      },
    )
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
