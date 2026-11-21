import {
  type Nullpad,
  expect,
  numberedLines,
  screenOf,
  test,
  textOf,
} from './nullpad'
import { openPair } from './typist/run'

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

test('Backspace takes the whole letter before the caret, as an EditContext does', async ({
  nullpad,
}) => {
  const letters: ReadonlyArray<
    Readonly<{ name: string; typed: string; left: string }>
  > = [
    { name: 'e and an acute', typed: 'ae\u0301', left: 'a' },
    { name: 'e and two stacked marks', typed: 'ae\u0301\u0308', left: 'a' },
    { name: 'the conjunct क्ष', typed: 'aक्ष', left: 'a' },
    { name: 'स्ते, the last letter of नमस्ते', typed: 'नमस्ते', left: 'नम' },
    { name: 'Hangul jamo ᄀ ᅡ ᆨ', typed: 'a\u1100\u1161\u11a8', left: 'a' },
    { name: 'Thai กำ', typed: 'aกำ', left: 'a' },
    { name: 'Arabic بَ', typed: 'aبَ', left: 'a' },
  ]
  for (const { name, typed, left } of letters) {
    await nullpad.press('Control+Home')
    await nullpad.press('Delete', 8)
    for (const point of typed) {
      await nullpad.page.keyboard.insertText(point)
    }
    expect(await nullpad.text(), `${name} typed one code point at a time`).toBe(
      typed,
    )
    await nullpad.press('Backspace')
    expect(await nullpad.text(), `Backspace after ${name}`).toBe(left)
  }
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

/** A textarea's page: seven eighths of the screen's rows, rounded down, as Chrome measured at every height. */
const pageRows = (rows: number) => Math.floor((rows * 7) / 8)

const pageStop = async (nullpad: Nullpad) => {
  const screen = await nullpad.screen()
  return {
    line: screen.status.line,
    column: screen.status.column,
    row: screen.cursor?.row,
    top: Number(screen.rows[0]?.number),
  }
}

test('PageDown and PageUp move the cursor a textarea page and scroll its row to the top, as a textarea does', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(200))
  await nullpad.press('Control+Home')
  const page = pageRows((await nullpad.screen()).rows.length)
  await nullpad.press('ArrowDown')
  await nullpad.press('ArrowRight', 3)
  const path = []
  for (const key of ['PageDown', 'PageDown', 'PageUp', 'PageUp', 'PageUp']) {
    await nullpad.press(key)
    path.push({ key, ...(await pageStop(nullpad)) })
  }
  expect(path).toEqual([
    { key: 'PageDown', line: 2 + page, column: 4, row: 0, top: 2 + page },
    {
      key: 'PageDown',
      line: 2 + 2 * page,
      column: 4,
      row: 0,
      top: 2 + 2 * page,
    },
    { key: 'PageUp', line: 2 + page, column: 4, row: 0, top: 2 + page },
    { key: 'PageUp', line: 2, column: 4, row: 0, top: 2 },
    { key: 'PageUp', line: 1, column: 1, row: 0, top: 1 },
  ])
})

test('PageDown on the last page goes to the end of the note, and PageUp from there keeps the last page on screen', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(200))
  const visible = (await nullpad.screen()).rows.length
  const page = pageRows(visible)
  const lastTop = 200 - visible + 1
  await nullpad.press('ArrowUp', 3)
  await nullpad.press('Home')
  await nullpad.press('PageDown')
  expect(await pageStop(nullpad), 'PageDown past the last line').toEqual({
    line: 200,
    column: 9,
    row: visible - 1,
    top: lastTop,
  })
  await nullpad.press('PageDown')
  expect(await pageStop(nullpad), 'PageDown at the end').toEqual({
    line: 200,
    column: 9,
    row: visible - 1,
    top: lastTop,
  })
  await nullpad.press('PageUp')
  expect(await pageStop(nullpad), 'PageUp from the end').toEqual({
    line: 200 - page,
    column: 9,
    row: visible - 1 - page,
    top: lastTop,
  })
})

test('PageDown and PageUp in a note that fits on screen go to its end and its start', async ({
  nullpad,
}) => {
  await nullpad.paste('one\ntwo two\nthree')
  await nullpad.press('ArrowUp')
  await nullpad.press('Home')
  await nullpad.press('ArrowRight')
  await nullpad.press('PageDown')
  expect(await nullpad.status(), 'PageDown').toEqual({
    line: 3,
    column: 6,
    lineCount: 3,
  })
  await nullpad.press('PageUp')
  expect(await nullpad.status(), 'PageUp').toEqual({
    line: 1,
    column: 1,
    lineCount: 3,
  })
})

test('PageDown aims at the cell the cursor is in, not at one an earlier move kept, as a textarea does', async ({
  nullpad,
}) => {
  const empty = await nullpad.screen()
  const page = pageRows(
    Math.floor((empty.area.bottom - empty.area.top) / empty.rowHeight),
  )
  await nullpad.paste(
    numberedLines(200)
      .split('\n')
      .map((line, index) => (index === 1 + page ? 'a' : line))
      .join('\n'),
  )
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown')
  await nullpad.press('ArrowRight', 5)
  await nullpad.press('PageDown')
  expect(await pageStop(nullpad), 'onto a line holding only "a"').toMatchObject(
    { line: 2 + page, column: 2 },
  )
  await nullpad.press('PageDown')
  expect(
    await pageStop(nullpad),
    'the next page aims at the cell after the "a"',
  ).toMatchObject({ line: 2 + 2 * page, column: 2 })
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

test('ArrowDown onto a wrapped row shorter than the column puts the cursor at that row end, as a textarea does', async ({
  nullpad,
}) => {
  await nullpad.paste(`${'a'.repeat(76)}\n${'b'.repeat(200)}`)
  await nullpad.press('Control+Home')
  await nullpad.press('End')
  await nullpad.press('ArrowDown')
  const cursor = await nullpad.cursor()
  expect({ row: cursor?.row, cell: cursor?.cell }).toEqual({ row: 1, cell: 76 })
  await nullpad.type('Z')
  expect(await nullpad.text()).toBe(
    `${'a'.repeat(76)}\n${'b'.repeat(76)}Z${'b'.repeat(124)}`,
  )
})

test('ArrowUp onto a word-wrapped row lands after its trailing space, as a textarea does', async ({
  nullpad,
}) => {
  const words = 'word '.repeat(30)
  await nullpad.paste(`${words}\n${'a'.repeat(76)}`)
  await nullpad.press('ArrowUp')
  await nullpad.press('ArrowUp')
  const cursor = await nullpad.cursor()
  expect({ row: cursor?.row, cell: cursor?.cell }).toEqual({ row: 0, cell: 75 })
  await nullpad.type('Z')
  expect((await nullpad.text()).split('\n')[0]).toBe(
    `${'word '.repeat(15)}Z${'word '.repeat(15)}`,
  )
})

test('Home and End on a wrapped line go to the start and end of the row the cursor is on, as a textarea does', async ({
  nullpad,
}) => {
  await nullpad.paste('x'.repeat(100))
  await nullpad.press('Home')
  const home = await nullpad.screen()
  expect(
    { row: home.cursor?.row, cell: home.cursor?.cell, at: home.status.column },
    'Home on the second row',
  ).toEqual({ row: 1, cell: 0, at: 77 })
  await nullpad.press('ArrowUp')
  await nullpad.press('ArrowRight', 3)
  await nullpad.press('End')
  const end = await nullpad.screen()
  expect(
    { row: end.cursor?.row, cell: end.cursor?.cell, at: end.status.column },
    'End on the first row',
  ).toEqual({ row: 0, cell: 76, at: 77 })
  await nullpad.press('Home')
  expect(
    (await nullpad.screen()).status.column,
    'Home from the end of the first row',
  ).toBe(1)
  await nullpad.press('End')
  await nullpad.type('Z')
  expect(await nullpad.text()).toBe(`${'x'.repeat(76)}Z${'x'.repeat(24)}`)
})

test('a burst of arrows, Home, End, Delete, Backspace and typing sent while the main thread is blocked lands where a textarea puts it', async ({
  browser,
  baseURL,
}) => {
  const pair = await openPair(browser, baseURL ?? '')
  const named: Readonly<Record<string, number>> = {
    Enter: 13,
    Backspace: 8,
    Delete: 46,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Home: 36,
    End: 35,
  }
  const pattern = [
    'ab',
    'Enter',
    'cdefgh',
    'ArrowUp',
    'x',
    'End',
    'Enter',
    'ijk',
    'ArrowLeft',
    'ArrowLeft',
    'Delete',
    'Home',
    'Backspace',
    'ArrowDown',
    'yz',
    'ArrowRight',
    'Delete',
    'ArrowUp',
    'ArrowUp',
    'm',
  ]
  const steps = Array.from({ length: 6 }, () => pattern)
    .flat()
    .flatMap(step => (step in named ? [step] : [...step]))
  const burst = async (page: typeof pair.nullpad) => {
    const cdp = await page.context().newCDPSession(page)
    await page.evaluate(() => {
      setTimeout(() => {
        const start = performance.now()
        while (performance.now() - start < 400) {}
      }, 0)
    })
    await Promise.all(
      steps.flatMap(step => {
        const code = named[step]
        const down =
          code === undefined
            ? {
                type: 'keyDown' as const,
                key: step,
                text: step,
                unmodifiedText: step,
              }
            : {
                type:
                  step === 'Enter'
                    ? ('keyDown' as const)
                    : ('rawKeyDown' as const),
                key: step,
                code: step,
                windowsVirtualKeyCode: code,
                ...(step === 'Enter'
                  ? { text: '\r', unmodifiedText: '\r' }
                  : {}),
              }
        return [
          cdp.send('Input.dispatchKeyEvent', down),
          cdp.send('Input.dispatchKeyEvent', {
            type: 'keyUp' as const,
            key: step,
          }),
        ]
      }),
    )
  }
  await pair.nullpad.goto('/')
  await pair.nullpad.locator('#caret').waitFor()
  await pair.textarea.evaluate(() =>
    document.querySelector('textarea')?.focus(),
  )
  await Promise.all([burst(pair.nullpad), burst(pair.textarea)])
  const expected = await pair.textarea.evaluate(() => {
    const area = document.querySelector('textarea')
    const before = area?.value.slice(0, area.selectionStart) ?? ''
    return {
      text: area?.value ?? '',
      line: before.split('\n').length,
      column: before.length - before.lastIndexOf('\n'),
    }
  })
  const nullpad = {
    text: async () => textOf(await screenOf(pair.nullpad)),
    caret: async () => {
      const { status } = await screenOf(pair.nullpad)
      return { line: status.line, column: status.column }
    },
  }
  await expect.poll(nullpad.text).toBe(expected.text)
  expect(await nullpad.caret()).toEqual({
    line: expected.line,
    column: expected.column,
  })
  await pair.close()
})

test('Enter at the start of a line or of a joined piece forgets the cell Up and Down aim for, and Enter inside a piece keeps it, as a textarea does', async ({
  nullpad,
}) => {
  await nullpad.type('a\na')
  await nullpad.press('ArrowUp', 2)
  await nullpad.press('Enter')
  await nullpad.press('ArrowDown')
  expect(
    await nullpad.status(),
    'Up on the first line went to its start; Enter there, then Down',
  ).toEqual({ line: 3, column: 1, lineCount: 3 })
  await nullpad.press('Control+End')
  await nullpad.press('Enter')
  await nullpad.type('abcd\nab\ncd\nabcd\nabcd')
  await nullpad.press('ArrowUp', 2)
  await nullpad.press('Home')
  await nullpad.press('Backspace')
  await nullpad.press('ArrowDown')
  await nullpad.press('ArrowUp')
  await nullpad.press('Enter')
  await nullpad.press('ArrowDown')
  expect(
    await nullpad.status(),
    'Enter where Backspace joined two lines, then Down',
  ).toEqual({ line: 7, column: 1, lineCount: 8 })
  await nullpad.press('Control+End')
  await nullpad.press('Enter')
  await nullpad.type('abcd\nab\ncd\nabcd\nabcd')
  await nullpad.press('ArrowUp', 2)
  await nullpad.press('Home')
  await nullpad.press('Backspace')
  await nullpad.press('ArrowRight')
  await nullpad.press('ArrowDown')
  await nullpad.press('ArrowUp')
  await nullpad.press('Enter')
  await nullpad.press('ArrowDown')
  expect(
    await nullpad.status(),
    'Enter inside a piece of a joined line, then Down',
  ).toEqual({ line: 12, column: 4, lineCount: 13 })
})

test('the cursor is drawn where the status line puts it after Backspace joins lines at trailing spaces', async ({
  nullpad,
}) => {
  await nullpad.type('a  ')
  await nullpad.press('ArrowLeft')
  await nullpad.press('Enter')
  await nullpad.press('Backspace')
  await nullpad.press('ArrowRight')
  const screen = await nullpad.screen()
  expect(
    { cell: screen.cursor?.cell, row: screen.cursor?.row },
    'the cursor after both spaces',
  ).toEqual({ cell: 3, row: 0 })
  expect(screen.status).toEqual({ line: 1, column: 4, lineCount: 1 })
})

test('a key sent with no gap after a big paste and Ctrl+Home is never lost', async ({
  nullpad,
}) => {
  const first = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const lines = Array.from({ length: 150 }, (_, index) =>
    index % 5 === 0
      ? `${index + 1}. a paragraph line that is long enough to wrap over the column limit of seventy six characters for sure`
      : `${index + 1}. short line`,
  )
  const note = [first, ...lines].join('\n')
  const key = { key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86 }
  const rounds = 20
  for (let round = 0; round < rounds; round++) {
    await nullpad.page.evaluate(
      value => navigator.clipboard.writeText(value),
      round === 0 ? note : `\n${lines.join('\n')}`,
    )
    await nullpad.press('Control+End')
    await nullpad.cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      ...key,
      modifiers: 2,
      commands: ['paste'],
    })
    await nullpad.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      ...key,
      modifiers: 2,
    })
    await nullpad.page.keyboard.press('Control+Home')
    await nullpad.page.keyboard.press('Delete')
  }
  const screen = await nullpad.screen()
  expect(
    screen.rows[0]?.text,
    `the first line lost one letter to each of ${rounds} Deletes`,
  ).toBe(first.slice(rounds))
})
