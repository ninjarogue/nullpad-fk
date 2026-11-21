import {
  expect,
  expectNumbersClearOfText,
  expectRowsFit,
  numberedLines,
  test,
} from './nullpad'

test('5- and 6-digit line numbers stay clear of the text', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(100_000))
  await expectNumbersClearOfText(nullpad, 'lines 99,9xx to 100,000')
  await nullpad.press('Control+Home')
  await nullpad.page.mouse.move(400, 300)
  await nullpad.wheel((await nullpad.screen()).rowHeight * 50_000)
  expect(
    (await nullpad.screen()).rows.some(row => row.number?.length === 5),
    '5-digit numbers on screen',
  ).toBe(true)
  await expectNumbersClearOfText(nullpad, '5-digit numbers in a 6-digit note')
})

test('no drawn row is wider than the text area, at any window width', async ({
  nullpad,
}) => {
  const cjk = '漢'.repeat(40)
  await nullpad.paste(
    [
      ` a${cjk}`,
      `${'ab '.repeat(30)}${cjk}`,
      `👍🏽${'字x'.repeat(50)}`,
      'x'.repeat(300),
    ].join('\n'),
  )
  for (const width of [1000, 720, 640, 500, 360, 200]) {
    await nullpad.resize(width, 600)
    expectRowsFit(await nullpad.screen(), `at a ${width}px window`)
  }
})

test('the cursor past the end of a row that fills the text area stays on screen', async ({
  nullpad,
}) => {
  await nullpad.paste('x'.repeat(300))
  for (const width of [1000, 720, 500]) {
    await nullpad.resize(width, 600)
    expect(
      (await nullpad.cursor())?.inside,
      `cursor inside the text area at a ${width}px window`,
    ).toBe(true)
  }
})

test('a space never sits alone on a row when the text after it could join it, at any narrow width', async ({
  nullpad,
}) => {
  await nullpad.paste('hello world a bb ccc dddd eeeee ffffff ggggggg hhhhhhhh')
  for (let width = 104; width <= 264; width += 8) {
    await nullpad.resize(width, 600)
    const screen = await nullpad.screen()
    expect(
      screen.rows.length,
      `the line wraps at a ${width}px window`,
    ).toBeGreaterThan(1)
    expect(
      screen.rows
        .filter(row => row.text.trim() === '')
        .map(row => JSON.stringify(row.text)),
      `rows holding only spaces at a ${width}px window`,
    ).toEqual([])
    expectRowsFit(screen, `at a ${width}px window`)
  }
})

test('a resize wraps the text to the new width and keeps the cursor on screen', async ({
  nullpad,
}) => {
  const words = Array.from({ length: 300 }, (_, i) => `word${i}`)
    .join(' ')
    .slice(0, 200)
  await nullpad.paste(Array.from({ length: 30 }, () => words).join('\n'))
  const wide = await nullpad.screen()
  await nullpad.resize(480, 360)
  const narrow = await nullpad.screen()
  expect(narrow.area.right - narrow.area.left).toBeLessThan(
    wide.area.right - wide.area.left,
  )
  expectRowsFit(narrow, 'narrow window')
  expect(narrow.cursor?.inside, 'cursor on screen after narrowing').toBe(true)
  expect(
    narrow.rows.at(-1)?.bottom ?? 0,
    'the last row fits',
  ).toBeLessThanOrEqual(nullpad.page.viewportSize()?.height ?? 0)
  await nullpad.resize(1000, 700)
  const back = await nullpad.screen()
  expect(back.cursor?.inside, 'cursor on screen after widening').toBe(true)
  expect(back.rows.length).toBeGreaterThan(narrow.rows.length)
})

test('typing ASCII, CJK and emoji mid-line moves no row and leaves the cursor on the next character', async ({
  nullpad,
}) => {
  await nullpad.paste('first line\nsecond line\nthird line\nfourth line')
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown')
  await nullpad.press('ArrowRight', 3)
  const before = await nullpad.screen()
  await nullpad.page.keyboard.type('xyz')
  await nullpad.page.keyboard.insertText('日本')
  await nullpad.page.keyboard.insertText('👍🏽')
  const after = await nullpad.screen()
  expect(
    after.rows.map(row => [row.top, row.bottom]),
    'rows keep their place and height',
  ).toEqual(before.rows.map(row => [row.top, row.bottom]))
  expect(after.rows.map(row => row.left)).toEqual(
    before.rows.map(row => row.left),
  )
  expect(after.cursor?.char).toBe('o')
  expect(after.status).toEqual({ line: 2, column: 10, lineCount: 4 })
})

test('a keycap emoji takes two cells and wraps whole to the next row', async ({
  nullpad,
}) => {
  await nullpad.page.keyboard.insertText('1️⃣abc')
  expect(
    (await nullpad.cursor())?.cell,
    'cursor after a two-cell keycap and three letters',
  ).toBe(5)
  await nullpad.press('Home')
  await nullpad.page.keyboard.insertText('x'.repeat(75))
  await nullpad.press('Control+End')
  const screen = await nullpad.screen()
  expect(
    screen.rows.map(row => row.text),
    'the keycap does not fit after 75 cells, so it starts the next row',
  ).toEqual(['x'.repeat(75), '1️⃣abc'])
  expectRowsFit(screen, 'keycap at the wrap edge')
})

test('ArrowDown from after a keycap keeps the column its two cells give', async ({
  nullpad,
}) => {
  await nullpad.page.keyboard.insertText('1️⃣abc')
  await nullpad.press('Enter')
  await nullpad.type('0123456')
  await nullpad.press('ArrowUp')
  await nullpad.press('Home')
  await nullpad.press('ArrowRight', 2)
  await nullpad.press('ArrowDown')
  expect(await nullpad.status()).toEqual({ line: 2, column: 4, lineCount: 2 })
})

test('every emoji of a ZWJ sequence the font has no single glyph for is drawn', async ({
  nullpad,
}) => {
  await nullpad.page.keyboard.insertText('👩')
  await nullpad.press('Enter')
  await nullpad.page.keyboard.insertText('👨‍👩')
  await nullpad.press('Enter')
  const screen = await nullpad.screen()
  const cellBox = (row: number, from: number, cells: number) => ({
    x: (screen.rows[row]?.left ?? 0) + from * screen.cell,
    y: screen.rows[row]?.top ?? 0,
    width: cells * screen.cell,
    height: screen.rowHeight,
  })
  const alone = await nullpad.inkIn(cellBox(0, 0, 2))
  expect(alone, 'a lone woman emoji is drawn').toBeGreaterThan(50)
  expect(
    await nullpad.inkIn(cellBox(1, 2, 2)),
    'the woman after man and ZWJ is drawn in the two cells after the man',
  ).toBeGreaterThan(alone / 2)
})
