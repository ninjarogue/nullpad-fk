import {
  type Nullpad,
  type Screen,
  expect,
  expectNumberedLinesIntact,
  linesOf,
  numberedLines,
  openFresh,
  test,
} from './nullpad'

const words = Array.from(
  { length: 40 },
  (_, i) => `w${String(i).padStart(2, '0')}`,
).join(' ')

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

const rowKey = (row: Screen['rows'][number]) => `${row.lineId}:${row.start}`

const textMoved = (before: Screen, after: Screen): number => {
  const shared = before.rows.find(row =>
    after.rows.some(other => rowKey(other) === rowKey(row)),
  )
  const same = after.rows.find(
    row => shared !== undefined && rowKey(row) === rowKey(shared),
  )
  if (shared === undefined || same === undefined) {
    throw new Error('no row is on screen both before and after the turn')
  }
  return shared.top - same.top
}

test('wheel turns over a note whose wrapped lines scroll out of the drawn lines move the text as far as the wheel asked, down and back up', async ({
  nullpad,
}) => {
  await nullpad.paste(
    Array.from({ length: 300 }, (_, index) =>
      index % 7 === 0 ? 'x'.repeat(150) : `line ${index + 1}`,
    ).join('\n'),
  )
  await nullpad.press('Control+Home')
  await nullpad.page.mouse.move(400, 300)
  for (const delta of [100, -100]) {
    let moved = 0
    let before = await nullpad.screen()
    for (let turn = 0; turn < 60; turn++) {
      await nullpad.wheel(delta)
      const after = await nullpad.screen()
      moved += textMoved(before, after)
      before = after
    }
    expect(moved, `60 turns of ${delta} px`).toBe(60 * delta)
  }
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
    await openFresh(nullpad.page)
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

const longNoteAtTop = async (nullpad: Nullpad) => {
  await nullpad.paste(numberedLines(400))
  await nullpad.press('Control+Home')
  await nullpad.page.mouse.move(400, 300)
  return nullpad.screen()
}

const wheelThenKeys = (
  nullpad: Nullpad,
  deltaY: number,
  keys: ReadonlyArray<'x' | 'ArrowDown' | 'ArrowUp'>,
) =>
  Promise.all([
    nullpad.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 400,
      y: 300,
      deltaX: 0,
      deltaY,
    }),
    ...keys.flatMap(key => {
      const event =
        key === 'x'
          ? { key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, text: 'x' }
          : {
              key,
              code: key,
              windowsVirtualKeyCode: key === 'ArrowUp' ? 38 : 40,
            }
      return [
        nullpad.cdp.send('Input.dispatchKeyEvent', {
          type: key === 'x' ? 'keyDown' : 'rawKeyDown',
          ...event,
        }),
        nullpad.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event }),
      ]
    }),
  ])

const settleScroll = async (nullpad: Nullpad) => {
  await nullpad.page.waitForTimeout(600)
  await nullpad.screen()
  return nullpad.screen()
}

test('a letter typed right after a big wheel turn brings the cursor and the letter back on screen', async ({
  nullpad,
}) => {
  const start = await longNoteAtTop(nullpad)
  for (let trial = 1; trial <= 4; trial++) {
    await nullpad.press('Control+Home')
    await wheelThenKeys(nullpad, start.rowHeight * 40, ['x'])
    const after = await settleScroll(nullpad)
    expect(
      after.cursor?.inside,
      `trial ${trial}: the cursor is on screen`,
    ).toBe(true)
    expect(
      linesOf(after)[0],
      `trial ${trial}: the letter's line is on screen`,
    ).toMatch(/^x+line 1$/)
    await nullpad.press('Backspace')
  }
})

test('a letter and ArrowDown sent right after a big wheel turn leave the cursor on line 2', async ({
  nullpad,
}) => {
  const start = await longNoteAtTop(nullpad)
  for (let trial = 1; trial <= 4; trial++) {
    await nullpad.press('Control+Home')
    await wheelThenKeys(nullpad, start.rowHeight * 200, ['x', 'ArrowDown'])
    const after = await settleScroll(nullpad)
    expect(after.status.line, `trial ${trial}: the cursor line`).toBe(2)
    expect(
      after.cursor?.inside,
      `trial ${trial}: the cursor is on screen`,
    ).toBe(true)
    await nullpad.press('Control+Home')
    await nullpad.press('Delete')
  }
})

const oldFrameWindowMs = 12

const letterThenClick = async (
  nullpad: Nullpad,
  point: Readonly<{ x: number; y: number }>,
) => {
  await nullpad.page.mouse.move(point.x, point.y)
  const sent = performance.now()
  await nullpad.page.keyboard.press('x')
  await nullpad.page.mouse.down()
  const clickedOldFrame = performance.now() - sent < oldFrameWindowMs
  await nullpad.page.mouse.up()
  return clickedOldFrame
}

const expectSomeCounted = (trials: number) =>
  expect(
    trials,
    `trials whose click left within ${oldFrameWindowMs} ms of the letter`,
  ).toBeGreaterThan(0)

test('a click sent right after a letter lands on the line that was on screen where it clicked', async ({
  nullpad,
}) => {
  const start = await longNoteAtTop(nullpad)
  let counted = 0
  for (let trial = 1; trial <= 4; trial++) {
    await nullpad.press('Control+Home')
    await nullpad.wheel(start.rowHeight * 40)
    const scrolled = await nullpad.screen()
    expect(scrolled.cursor, `trial ${trial}: line 1 is off screen`).toBeNull()
    const target = scrolled.rows[Math.floor(scrolled.rows.length / 2)]
    if (target === undefined || target.number === null) {
      throw new Error('no numbered row in the middle of the screen')
    }
    const clickedOldFrame = await letterThenClick(nullpad, {
      x: target.left + 2.25 * scrolled.cell,
      y: (target.top + target.bottom) / 2,
    })
    const after = await settleScroll(nullpad)
    if (clickedOldFrame) {
      counted += 1
      expect(
        after.status.line,
        `trial ${trial}: the cursor is on the line clicked`,
      ).toBe(Number(target.number))
    }
    await nullpad.press('Control+Home')
    expect(
      linesOf(await nullpad.screen())[0],
      `trial ${trial}: the letter`,
    ).toBe('xline 1')
    await nullpad.press('Delete')
  }
  expectSomeCounted(counted)
})

const longNoteAtEnd = async (nullpad: Nullpad) => {
  await nullpad.paste(numberedLines(400))
  await nullpad.page.mouse.move(400, 300)
  return nullpad.screen()
}

const turnWheelNoWait = (nullpad: Nullpad, deltaY: number) =>
  nullpad.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: 400,
    y: 300,
    deltaX: 0,
    deltaY,
  })

const numberedRow = (screen: Screen, row: number) => {
  const drawn = screen.rows[row]
  if (drawn === undefined || drawn.number === null) {
    throw new Error(`no numbered row ${row} on screen`)
  }
  return {
    number: Number(drawn.number),
    x: drawn.left + 2.25 * screen.cell,
    y: (drawn.top + drawn.bottom) / 2,
  }
}

test('a click right after a wheel turn lands on the line the turn scrolled under the pointer', async ({
  nullpad,
}) => {
  const start = await longNoteAtTop(nullpad)
  const turn = 10
  for (let trial = 1; trial <= 4; trial++) {
    await nullpad.press('Control+Home')
    await nullpad.wheel(start.rowHeight * turn)
    const target = numberedRow(await nullpad.screen(), 4 * trial)
    await turnWheelNoWait(nullpad, start.rowHeight * turn)
    await nullpad.page.mouse.click(target.x, target.y)
    const after = await settleScroll(nullpad)
    expect(
      after.status.line,
      `trial ${trial}: the cursor is on the line the turn scrolled there`,
    ).toBe(target.number + turn)
    expect(
      after.cursor?.inside,
      `trial ${trial}: the cursor is on screen`,
    ).toBe(true)
  }
})

test('a click right after a wheel turn too far to be drawn at once lands on a line that was under the pointer', async ({
  nullpad,
}) => {
  const start = await longNoteAtTop(nullpad)
  const far = 136
  for (let trial = 1; trial <= 4; trial++) {
    await nullpad.press('Control+Home')
    await nullpad.press('ArrowDown')
    await nullpad.wheel(start.rowHeight * far)
    const target = numberedRow(await nullpad.screen(), 4 * trial)
    await turnWheelNoWait(nullpad, start.rowHeight * far)
    await nullpad.page.mouse.click(target.x, target.y)
    const after = await settleScroll(nullpad)
    expect(
      [target.number, target.number + far],
      `trial ${trial}: the cursor is on the line under the pointer before the turn or after it`,
    ).toContain(after.status.line)
    expect(
      after.cursor?.inside,
      `trial ${trial}: the cursor is on screen`,
    ).toBe(true)
  }
})

test('a letter typed right after a wheel turn far up from the end of the note brings the cursor back on screen', async ({
  nullpad,
}) => {
  const start = await longNoteAtEnd(nullpad)
  for (let trial = 1; trial <= 4; trial++) {
    await nullpad.press('Control+End')
    await turnWheelNoWait(nullpad, -start.rowHeight * 230)
    await nullpad.page.keyboard.type('x')
    const after = await settleScroll(nullpad)
    expect(
      after.cursor?.inside,
      `trial ${trial}: the cursor is on screen`,
    ).toBe(true)
    expect(
      linesOf(after).at(-1),
      `trial ${trial}: the letter's line is on screen`,
    ).toMatch(/^line 400x+$/)
  }
})

test('a click sent right after a letter that scrolled the screen far lands on the line that was on screen where it clicked', async ({
  nullpad,
}) => {
  const start = await longNoteAtEnd(nullpad)
  let counted = 0
  for (const [trial, rows] of [136, 136, 270, 270].entries()) {
    await nullpad.press('Control+End')
    await nullpad.wheel(-start.rowHeight * rows)
    const scrolled = await nullpad.screen()
    expect(scrolled.cursor, `trial ${trial}: line 400 is off screen`).toBeNull()
    const target = numberedRow(scrolled, 3 + 5 * trial)
    const clickedOldFrame = await letterThenClick(nullpad, target)
    const after = await settleScroll(nullpad)
    if (clickedOldFrame) {
      counted += 1
      expect(
        after.status.line,
        `trial ${trial}: the cursor is on the line clicked`,
      ).toBe(target.number)
    }
    expect(
      after.cursor?.inside,
      `trial ${trial}: the cursor is on screen`,
    ).toBe(true)
  }
  expectSomeCounted(counted)
})

test('a click made once a key has brought the cursor back on screen after a wheel turn lands on the line shown where it clicked', async ({
  nullpad,
}) => {
  const start = await longNoteAtEnd(nullpad)
  for (const [trial, key] of (
    ['x', 'ArrowLeft', 'ArrowDown', 'x', 'ArrowLeft', 'ArrowDown'] as const
  ).entries()) {
    await nullpad.press('Control+End')
    await nullpad.press('ArrowUp')
    await turnWheelNoWait(nullpad, -start.rowHeight * 90)
    await nullpad.page.keyboard.press(key)
    const revealed = await nullpad.screen()
    expect(
      revealed.cursor?.inside,
      `trial ${trial}: ${key} brought the cursor on screen`,
    ).toBe(true)
    const target = numberedRow(revealed, 3 + 2 * trial)
    await nullpad.page.mouse.click(target.x, target.y)
    const after = await settleScroll(nullpad)
    expect(
      after.status.line,
      `trial ${trial}: the cursor is on the line shown where it clicked`,
    ).toBe(target.number)
  }
})

test('a wheel turn dropped for a key that could not move the cursor stays dropped when the next turn comes', async ({
  nullpad,
}) => {
  const start = await longNoteAtTop(nullpad)
  for (let trial = 1; trial <= 4; trial++) {
    await nullpad.press('Control+Home')
    await wheelThenKeys(nullpad, start.rowHeight * 200, ['ArrowUp'])
    await turnWheelNoWait(nullpad, start.rowHeight * 3)
    const after = await settleScroll(nullpad)
    expect(
      after.rows[0]?.number,
      `trial ${trial}: only the second turn scrolled`,
    ).toBe('4')
  }
})

test('a wheel turn right after a key scrolls the screen', async ({
  nullpad,
}) => {
  const start = await longNoteAtTop(nullpad)
  for (let trial = 1; trial <= 4; trial++) {
    await nullpad.press('Control+Home')
    await nullpad.page.keyboard.press('ArrowUp')
    await turnWheelNoWait(nullpad, start.rowHeight * 3)
    const after = await settleScroll(nullpad)
    expect(
      after.rows[0]?.number,
      `trial ${trial}: the turn scrolled three rows`,
    ).toBe('4')
  }
})
