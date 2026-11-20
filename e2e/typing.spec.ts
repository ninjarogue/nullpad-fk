import { type Nullpad, expect, numberedLines, test, textOf } from './nullpad'

const fortyWords = Array.from(
  { length: 40 },
  (_, i) => `w${String(i).padStart(2, '0')}`,
).join(' ')

test('a fresh editor takes typing at once and the status line reads EDIT untitled.md 1:1 1L', async ({
  nullpad,
}) => {
  await expect(nullpad.page.locator('.status')).toHaveText(
    /EDIT\s*untitled\.md\s*1:1 1L/,
  )
  await nullpad.type('hi')
  expect(await nullpad.text(), 'typed text with no click first').toBe('hi')
  expect(await nullpad.status()).toEqual({ line: 1, column: 3, lineCount: 1 })
})

test('Enter, Backspace and Delete split and join lines at line and document edges', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.press('Enter')
  await nullpad.type('cd')
  const expectScreen = async (
    step: string,
    text: string,
    line: number,
    column: number,
  ) => {
    const screen = await nullpad.screen()
    expect(
      {
        text: textOf(screen),
        line: screen.status.line,
        column: screen.status.column,
      },
      step,
    ).toEqual({ text, line, column })
  }
  await expectScreen('typed two lines', 'ab\ncd', 2, 3)
  await nullpad.press('Home')
  await nullpad.press('Backspace')
  await expectScreen(
    'Backspace at a line start joins it to the line above',
    'abcd',
    1,
    3,
  )
  await nullpad.press('Enter')
  await expectScreen('Enter in the middle splits the line', 'ab\ncd', 2, 1)
  await nullpad.press('ArrowUp')
  await nullpad.press('End')
  await nullpad.press('Delete')
  await expectScreen('Delete at a line end joins the next line', 'abcd', 1, 3)
  await nullpad.press('End')
  await nullpad.press('Enter')
  await expectScreen(
    'Enter at the line end opens an empty line',
    'abcd\n',
    2,
    1,
  )
  await nullpad.press('Control+Home')
  await nullpad.press('Backspace')
  await expectScreen(
    'Backspace at the document start does nothing',
    'abcd\n',
    1,
    1,
  )
  await nullpad.press('Control+End')
  await nullpad.press('Delete')
  await expectScreen('Delete at the document end does nothing', 'abcd\n', 2, 1)
  await nullpad.press('Backspace')
  await expectScreen(
    'Backspace on the empty last line removes it',
    'abcd',
    1,
    5,
  )
})

test('Tab inserts two spaces and the editor keeps the keyboard', async ({
  nullpad,
}) => {
  await nullpad.type('a')
  await nullpad.press('Tab')
  await nullpad.type('b')
  expect(await nullpad.text()).toBe('a  b')
})

test('Ctrl with a letter types nothing', async ({ nullpad }) => {
  await nullpad.type('ab')
  await nullpad.press('Control+e')
  await nullpad.press('Control+k')
  expect(await nullpad.text()).toBe('ab')
  expect(await nullpad.status()).toEqual({ line: 1, column: 3, lineCount: 1 })
})

/**
 * Windows reports AltGr as Ctrl+Alt and inserts the character only when the keydown is not cancelled.
 * Chromium on Linux never inserts text with Ctrl held, so the test types the character itself after the keydown.
 */
const keydownCancelled = async (
  nullpad: Nullpad,
  key: string,
  modifiers: number,
) => {
  const seen = await nullpad.page.evaluateHandle(() => {
    const box: { cancelled: boolean | null } = { cancelled: null }
    window.addEventListener(
      'keydown',
      event => (box.cancelled = event.defaultPrevented),
      { once: true },
    )
    return box
  })
  await nullpad.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    text: key,
    unmodifiedText: key,
    modifiers,
  })
  await nullpad.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    modifiers,
  })
  return seen.evaluate(box => box.cancelled)
}

const ctrl = 2
const ctrlAlt = 3

test('a character typed with Ctrl+Alt, as Windows sends AltGr, is left to the browser and lands as text', async ({
  nullpad,
}) => {
  expect(
    await keydownCancelled(nullpad, 'e', ctrl),
    'a Ctrl+E keydown is taken by the editor',
  ).toBe(true)
  for (const char of ['@', '€', '{', '\\', '|', '~', 'ł']) {
    expect(
      await keydownCancelled(nullpad, char, ctrlAlt),
      `Ctrl+Alt+${char} keydown is not cancelled`,
    ).toBe(false)
    await nullpad.page.keyboard.insertText(char)
  }
  expect(await nullpad.text()).toBe('@€{\\|~ł')
})

test('Backspace after e and a combining acute takes the mark alone, as Chrome does', async ({
  nullpad,
}) => {
  await nullpad.type('e')
  await nullpad.page.keyboard.insertText('́')
  expect(await nullpad.text()).toBe('é')
  expect(
    (await nullpad.status()).column,
    'e and its mark are one character',
  ).toBe(2)
  await nullpad.press('Backspace')
  expect(await nullpad.text(), 'the e stays').toBe('e')
  await nullpad.press('Backspace')
  expect(await nullpad.text()).toBe('')
})

test('300 keys sent while the main thread is blocked land in order', async ({
  nullpad,
}) => {
  const steps = Array.from({ length: 300 }, (_, i) =>
    i % 37 === 36
      ? 'Enter'
      : i % 23 === 22
        ? 'Backspace'
        : 'abcdefghijklmnopqrstuvwxyz0123456789 '.charAt(i % 37),
  )
  const expected = steps.reduce(
    (text, step) =>
      step === 'Enter'
        ? `${text}\n`
        : step === 'Backspace'
          ? text.slice(0, -1)
          : text + step,
    '',
  )
  await nullpad.page.evaluate(() => {
    setTimeout(() => {
      const start = performance.now()
      while (performance.now() - start < 400) {}
    }, 0)
  })
  const named: Readonly<Record<string, [string, number]>> = {
    Enter: ['Enter', 13],
    Backspace: ['Backspace', 8],
  }
  const sends = steps.flatMap(step => {
    const [key, code] = named[step] ?? [step, 0]
    const down =
      code === 0
        ? { type: 'keyDown' as const, key, text: key, unmodifiedText: key }
        : {
            type: 'rawKeyDown' as const,
            key,
            code: key,
            windowsVirtualKeyCode: code,
          }
    return [
      nullpad.cdp.send('Input.dispatchKeyEvent', down),
      nullpad.cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp' as const,
        key,
      }),
    ]
  })
  await Promise.all(sends)
  await expect.poll(() => nullpad.text()).toBe(expected)
  expect((await nullpad.cursor())?.inside, 'cursor on screen').toBe(true)
})

test('Down then Up through wrapped rows and a short line keeps the cursor in cell 40', async ({
  nullpad,
}) => {
  await nullpad.paste(`${fortyWords}\nshort\n${fortyWords}`)
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowRight', 40)
  const where = async () => {
    const screen = await nullpad.screen()
    return {
      row: screen.cursor?.row,
      cell: screen.cursor?.cell,
      at: `${screen.status.line}:${screen.status.column}`,
    }
  }
  const path = [await where()]
  for (const key of [
    'ArrowDown',
    'ArrowDown',
    'ArrowDown',
    'ArrowDown',
    'ArrowUp',
    'ArrowUp',
    'ArrowUp',
    'ArrowUp',
  ]) {
    await nullpad.press(key)
    path.push(await where())
  }
  expect(path).toEqual([
    { row: 0, cell: 40, at: '1:41' },
    { row: 1, cell: 40, at: '1:117' },
    { row: 2, cell: 7, at: '1:160' },
    { row: 3, cell: 5, at: '2:6' },
    { row: 4, cell: 40, at: '3:41' },
    { row: 3, cell: 5, at: '2:6' },
    { row: 2, cell: 7, at: '1:160' },
    { row: 1, cell: 40, at: '1:117' },
    { row: 0, cell: 40, at: '1:41' },
  ])
})

test('Down and Up from the start of a wrapped line walk every row at cell 0', async ({
  nullpad,
}) => {
  await nullpad.paste(`${fortyWords}\nshort`)
  await nullpad.press('Control+Home')
  const screen = await nullpad.screen()
  const starts = screen.rows.slice(0, 3).map(row => row.start)
  expect(starts, 'the long line wraps to three rows').toHaveLength(3)
  const where = async () => {
    const after = await nullpad.screen()
    return {
      row: after.cursor?.row,
      cell: after.cursor?.cell,
      at: `${after.status.line}:${after.status.column}`,
    }
  }
  const path = [await where()]
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown']) {
    await nullpad.press(key)
    path.push(await where())
  }
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp']) {
    await nullpad.press(key)
    path.push(await where())
  }
  const rowStart = (row: number) => ({
    row,
    cell: 0,
    at: `1:${(starts[row] ?? 0) + 1}`,
  })
  expect(path).toEqual([
    rowStart(0),
    rowStart(1),
    rowStart(2),
    { row: 3, cell: 0, at: '2:1' },
    rowStart(2),
    rowStart(1),
    rowStart(0),
  ])
})

test('ArrowRight off the end of the bottom row scrolls the next row of the same line into view', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(200))
  await nullpad.press('Control+Home')
  const visible = (await nullpad.screen()).rows.length
  await nullpad.press('ArrowDown', visible - 1)
  await nullpad.paste(`${fortyWords} `)
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', visible - 1)
  const before = await nullpad.screen()
  const bottom = before.rows.at(-1)
  expect(
    { row: before.cursor?.row, top: before.rows[0]?.number },
    'the cursor starts the long line on the bottom row',
  ).toEqual({ row: visible - 1, top: '1' })
  await nullpad.press('ArrowRight', (bottom?.text.length ?? 0) - 1)
  expect(
    (await nullpad.cursor())?.cell,
    'the cursor on the last cell of the bottom row',
  ).toBe((bottom?.text.length ?? 0) - 1)
  await nullpad.press('ArrowRight')
  const after = await nullpad.screen()
  expect(
    {
      inside: after.cursor?.inside,
      row: after.cursor?.row,
      cell: after.cursor?.cell,
      top: after.rows[0]?.number,
    },
    'one row scrolled up and the cursor starts the next row',
  ).toEqual({ inside: true, row: visible - 1, cell: 0, top: '2' })
})

test('PageDown and PageUp move one screen less one row, so the row at the edge stays on screen', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(200))
  await nullpad.press('Control+Home')
  const visible = (await nullpad.screen()).rows.length
  const where = async () => {
    const screen = await nullpad.screen()
    return {
      line: screen.status.line,
      row: screen.cursor?.row,
      top: Number(screen.rows[0]?.number),
    }
  }
  const path = []
  for (const key of ['PageDown', 'PageDown', 'PageUp', 'PageUp']) {
    await nullpad.press(key)
    path.push(await where())
  }
  expect(path).toEqual([
    { line: visible, row: visible - 1, top: 1 },
    { line: 2 * visible - 1, row: visible - 1, top: visible },
    { line: visible, row: 0, top: visible },
    { line: 1, row: 0, top: 1 },
  ])
})

test('Ctrl+End from a short line lands at the end of the last line', async ({
  nullpad,
}) => {
  await nullpad.paste('ab\nthe longer last line')
  await nullpad.press('Control+Home')
  await nullpad.press('Control+End')
  expect(await nullpad.status()).toEqual({ line: 2, column: 21, lineCount: 2 })
  await nullpad.type('!')
  expect(await nullpad.text()).toBe('ab\nthe longer last line!')
})
