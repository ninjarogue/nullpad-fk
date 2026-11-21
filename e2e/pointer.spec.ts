import {
  type Nullpad,
  type Screen,
  expect,
  expectNumberedLinesIntact,
  linesOf,
  numberedLines,
  test,
} from './nullpad'

const words = Array.from(
  { length: 40 },
  (_, i) => `w${String(i).padStart(2, '0')}`,
).join(' ')

/** A point a quarter into cell `cell` of drawn row `row`, nearest the boundary before that cell. */
const pointIn = (screen: Screen, row: number, cell: number) => {
  const drawn = screen.rows[row]
  if (drawn === undefined) {
    throw new Error(`no row ${row} on screen`)
  }
  return {
    x: drawn.left + (cell + 0.25) * screen.cell,
    y: (drawn.top + drawn.bottom) / 2,
  }
}

const clickAt = async (nullpad: Nullpad, point: { x: number; y: number }) =>
  nullpad.click(point.x, point.y)

test.describe('clicks', () => {
  test.beforeEach(async ({ nullpad }) => {
    await nullpad.paste(`${words}\nshort`)
  })

  test('a click on a character of a wrapped row puts the cursor on that cell', async ({
    nullpad,
  }) => {
    const screen = await nullpad.screen()
    expect(
      screen.rows.slice(0, 3).map(row => row.lineId),
      'the long line wraps to three rows',
    ).toEqual(Array(3).fill(screen.rows[0]?.lineId))
    await clickAt(nullpad, pointIn(screen, 1, 10))
    const after = await nullpad.screen()
    expect({ row: after.cursor?.row, cell: after.cursor?.cell }).toEqual({
      row: 1,
      cell: 10,
    })
    expect(after.status.column).toBe((screen.rows[1]?.start ?? 0) + 11)
  })

  test('a click past the end of a wrapped row puts the cursor at the end of that row, as a textarea does', async ({
    nullpad,
  }) => {
    const screen = await nullpad.screen()
    const first = screen.rows[0]
    await clickAt(nullpad, pointIn(screen, 0, first?.text.length ?? 0))
    const cursor = await nullpad.cursor()
    expect({ row: cursor?.row, cell: cursor?.cell }).toEqual({
      row: 0,
      cell: first?.text.length,
    })
    await nullpad.type('Z')
    expect(
      (await nullpad.text()).slice(0, (first?.text.length ?? 0) + 1),
      'Z lands after the last character of the row',
    ).toBe(`${first?.text ?? ''}Z`)
  })

  test('a click right of the text, out to the window edge, puts the cursor at the line end', async ({
    nullpad,
  }) => {
    const screen = await nullpad.screen()
    const short = screen.rows[3]
    const y = ((short?.top ?? 0) + (short?.bottom ?? 0)) / 2
    const width = nullpad.page.viewportSize()?.width ?? 0
    for (const x of [(short?.inkRight ?? 0) + 4, width / 2, width - 3]) {
      await nullpad.press('Control+Home')
      await nullpad.click(x, y)
      expect(await nullpad.status(), `click at x=${Math.round(x)}`).toEqual({
        line: 2,
        column: 6,
        lineCount: 2,
      })
    }
  })

  test('a click in the line number gutter, out to the window edge, puts the cursor at the row start', async ({
    nullpad,
  }) => {
    const screen = await nullpad.screen()
    const row = screen.rows[1]
    const y = ((row?.top ?? 0) + (row?.bottom ?? 0)) / 2
    for (const x of [(row?.left ?? 0) - 20, 2]) {
      await nullpad.press('Control+End')
      await nullpad.click(x, y)
      const after = await nullpad.screen()
      expect(
        { line: after.status.line, column: after.status.column },
        `click at x=${Math.round(x)}`,
      ).toEqual({
        line: 1,
        column: (row?.start ?? 0) + 1,
      })
      expect(after.cursor?.row).toBe(1)
    }
  })

  test('a click below the text puts the cursor at the end of the text, as a textarea does', async ({
    nullpad,
  }) => {
    const screen = await nullpad.screen()
    for (const x of [screen.area.left + 1, screen.area.left + 200]) {
      await nullpad.press('Control+Home')
      await nullpad.click(x, (screen.rows.at(-1)?.bottom ?? 0) + 200)
      expect(await nullpad.status(), `click at x=${Math.round(x)}`).toEqual({
        line: 2,
        column: 6,
        lineCount: 2,
      })
    }
  })

  test('after clicks on the text and on the status line, typing still lands', async ({
    nullpad,
  }) => {
    const screen = await nullpad.screen()
    await clickAt(nullpad, pointIn(screen, 3, 0))
    const status = await nullpad.page.locator('.status').boundingBox()
    await nullpad.click(
      (status?.x ?? 0) + 300,
      (status?.y ?? 0) + (status?.height ?? 0) / 2,
    )
    await nullpad.type('Z')
    expect(linesOf(await nullpad.screen()).at(-1)).toBe('Zshort')
  })
})

test('the wheel scrolls, may leave the cursor off screen, stops at the last line, and typing brings the cursor back', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(200))
  await nullpad.press('Control+Home')
  const start = await nullpad.screen()
  await nullpad.page.mouse.move(400, 300)
  await nullpad.wheel(start.rowHeight * 40)
  const down = await nullpad.screen()
  expect(Number(down.rows[0]?.number), 'scrolled down').toBeGreaterThan(30)
  expect(down.cursor, 'cursor scrolled off screen').toBeNull()
  expectNumberedLinesIntact(down, 'scrolled down')
  await nullpad.wheel(-start.rowHeight * 20)
  expect(
    Number((await nullpad.screen()).rows[0]?.number),
    'back up part of the way',
  ).toBeLessThan(Number(down.rows[0]?.number))
  await nullpad.wheel(start.rowHeight * 1000)
  const bottom = await nullpad.screen()
  expect(
    bottom.rows.at(-1)?.number,
    'the last line sits on the bottom row',
  ).toBe('200')
  expect(bottom.rows.length).toBe(start.rows.length)
  await nullpad.type('x')
  const typed = await nullpad.screen()
  expect(typed.cursor?.inside, 'typing brings the cursor back').toBe(true)
  expect(linesOf(typed)[0]).toBe('xline 1')
})

test('one huge wheel turn on a 20,000-line note scrolls without a crash and keeps the text intact', async ({
  nullpad,
  pageErrors,
}) => {
  await nullpad.paste(numberedLines(20_000))
  await nullpad.press('Control+Home')
  const { rowHeight } = await nullpad.screen()
  await nullpad.page.mouse.move(400, 300)
  await nullpad.wheel(rowHeight * 6000)
  const down = await nullpad.screen()
  expect(down.rows[0]?.number, '6,000 rows down').toBe('6001')
  expectNumberedLinesIntact(down, '6,000 rows down')
  expect(down.status.lineCount).toBe(20_000)
  await nullpad.wheel(-rowHeight * 6000)
  const back = await nullpad.screen()
  expect(back.rows[0]?.number, 'back at the top').toBe('1')
  expectNumberedLinesIntact(back, 'back at the top')
  expect(back.status.lineCount).toBe(20_000)
  expect(pageErrors).toEqual([])
})

test('after another element on the page takes the keyboard, a click on the text gives it back', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.page.evaluate(() => {
    const other = document.createElement('input')
    other.id = 'other'
    other.style.cssText =
      'position: fixed; right: 8px; bottom: 40px; width: 120px; z-index: 1'
    document.body.append(other)
  })
  const other = await nullpad.page.locator('#other').boundingBox()
  await nullpad.click(
    (other?.x ?? 0) + (other?.width ?? 0) / 2,
    (other?.y ?? 0) + (other?.height ?? 0) / 2,
  )
  await nullpad.type('xy')
  expect(await nullpad.text(), 'the note did not take the typing').toBe('ab')
  const screen = await nullpad.screen()
  await clickAt(nullpad, pointIn(screen, 0, 1))
  await nullpad.type('Z')
  expect(await nullpad.text(), 'typing after the click lands in the note').toBe(
    'aZb',
  )
})

test('a click on the right half of the last character of a wrapped row puts the cursor at the row end', async ({
  nullpad,
}) => {
  await nullpad.paste('x'.repeat(100))
  await nullpad.press('Control+Home')
  const screen = await nullpad.screen()
  const first = screen.rows[0]
  await nullpad.click(
    (first?.left ?? 0) + 75.6 * screen.cell,
    ((first?.top ?? 0) + (first?.bottom ?? 0)) / 2,
  )
  const cursor = await nullpad.cursor()
  expect({ row: cursor?.row, cell: cursor?.cell }).toEqual({ row: 0, cell: 76 })
  await nullpad.type('Z')
  expect(await nullpad.text()).toBe(`${'x'.repeat(76)}Z${'x'.repeat(24)}`)
})

const joinedLine = async (nullpad: Nullpad, upper: string, lower: string) => {
  await nullpad.paste(`top\n${upper}\n${lower}`)
  await nullpad.press('Home')
  await nullpad.press('Backspace')
}

for (const { name, upper, lower, cell, joined } of [
  { name: 'a flag', upper: 'ab🇵', lower: '🇸cd', cell: 3.5, joined: 'ab🇵Z🇸cd' },
  {
    name: 'é',
    upper: 'abe',
    lower: '\u0301cd',
    cell: 2.7,
    joined: 'abeZ\u0301cd',
  },
]) {
  test(`a click on the right half of the character before a line join inside ${name} puts the cursor at the join, as a textarea does`, async ({
    nullpad,
  }) => {
    await joinedLine(nullpad, upper, lower)
    await nullpad.press('Control+Home')
    const screen = await nullpad.screen()
    const row = screen.rows[1]
    await nullpad.click(
      (row?.left ?? 0) + cell * screen.cell,
      ((row?.top ?? 0) + (row?.bottom ?? 0)) / 2,
    )
    await nullpad.type('Z')
    expect(await nullpad.text()).toBe(`top\n${joined}`)
  })
}

test('a click sent right after typing lands by the text as typed, not by the frame still on screen', async ({
  nullpad,
}) => {
  for (let trial = 1; trial <= 5; trial++) {
    await nullpad.page.reload()
    await nullpad.page.locator('#caret').waitFor()
    const screen = await nullpad.screen()
    const left = screen.rows[0]?.left ?? 0
    await nullpad.page.keyboard.type('line one\nline two\n# Heading')
    await nullpad.page.mouse.click(
      left + 300,
      screen.area.top + 2.5 * screen.rowHeight,
    )
    await nullpad.type('|')
    expect(
      await nullpad.text(),
      `trial ${trial}: the click past the end of the third line`,
    ).toBe('line one\nline two\n# Heading|')
  }
})
