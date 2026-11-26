import { expect, linesOf, numberedLines, test } from './nullpad'

test('an IME composition shows its preedit at the cursor without changing the text, then commits once', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.press('ArrowLeft')
  await nullpad.compose('にほん')
  expect(await nullpad.preedit(), 'preedit drawn').toBe('にほん')
  expect(await nullpad.text(), 'text unchanged while composing').toBe('ab')
  expect((await nullpad.cursor())?.char, 'cursor still on b').toBe('b')
  const preeditBox = await nullpad.page
    .locator('[data-ghost]:not(#caret)')
    .first()
    .boundingBox()
  const cursorBefore = await nullpad.cursor()
  expect(
    preeditBox !== null &&
      cursorBefore !== null &&
      preeditBox.x + preeditBox.width <= cursorBefore.left + 0.5,
    'preedit sits before the cursor',
  ).toBe(true)
  await nullpad.commit('日本')
  expect(await nullpad.text(), 'commit inserts once at the cursor').toBe(
    'a日本b',
  )
  expect(await nullpad.preedit(), 'preedit gone after commit').toBe('')
  expect(await nullpad.status()).toEqual({ line: 1, column: 4, lineCount: 1 })
  await nullpad.type('z')
  expect(await nullpad.text(), 'typing works after a commit').toBe('a日本zb')
})

test('a cancelled IME composition leaves the text as it was', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.compose('かな')
  expect(await nullpad.preedit()).toBe('かな')
  await nullpad.compose('')
  expect(await nullpad.preedit(), 'preedit gone after cancel').toBe('')
  expect(await nullpad.text()).toBe('ab')
  await nullpad.type('c')
  expect(await nullpad.text(), 'typing works after a cancel').toBe('abc')
})

test('a composition an IME ends by committing no text leaves the text as it was, and the next key runs', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.compose('かな')
  await nullpad.commit('')
  await nullpad.type('c')
  expect(await nullpad.text(), 'typing works after an empty commit').toBe('abc')
  await nullpad.press('Control+,')
  await nullpad.press('Home')
  await nullpad.compose('か')
  await nullpad.commit('')
  expect(await nullpad.text(), 'IME text in NORMAL changes nothing').toBe('abc')
  await nullpad.type('x')
  expect(await nullpad.text(), 'x in NORMAL deletes the letter').toBe('bc')
  expect(await nullpad.status()).toEqual({ line: 1, column: 1, lineCount: 1 })
})

test('an IME composition at the start of a line and on an empty line commits in place', async ({
  nullpad,
}) => {
  await nullpad.type('xy')
  await nullpad.press('Enter')
  await nullpad.compose('한')
  await nullpad.compose('한글')
  await nullpad.commit('한글')
  await nullpad.press('Control+Home')
  await nullpad.compose('ㅎ')
  await nullpad.commit('하')
  expect(await nullpad.text()).toBe('하xy\n한글')
  expect(await nullpad.status()).toEqual({ line: 1, column: 2, lineCount: 2 })
})

test('a preedit that wraps the cursor onto a new row below the screen scrolls that row into view', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(200))
  await nullpad.press('Control+Home')
  const visible = (await nullpad.screen()).rows.length
  await nullpad.press('ArrowDown', visible - 1)
  await nullpad.press('End')
  await nullpad.paste(` ${'x'.repeat(60)}`)
  const before = await nullpad.screen()
  expect(
    { row: before.cursor?.row, top: before.rows[0]?.number },
    'the cursor ends the bottom row',
  ).toEqual({ row: visible - 1, top: '1' })
  await nullpad.compose('にほんごにゅうりょく')
  const composing = await nullpad.screen()
  expect(
    { inside: composing.cursor?.inside, row: composing.cursor?.row },
    'the cursor after the preedit is on screen, on the bottom row',
  ).toEqual({ inside: true, row: visible - 1 })
  expect(await nullpad.preedit()).toBe('にほんごにゅうりょく')
  await nullpad.commit('日本語入力')
  expect(
    (await nullpad.cursor())?.inside,
    'cursor on screen after commit',
  ).toBe(true)
})

test("the IME's candidate window sits on the preedit: the editor reports each preedit character's box to the browser", async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(3))
  await nullpad.press('ArrowUp')
  await nullpad.compose('にほんご')
  const { reported, drawn } = await nullpad.page.evaluate(() => {
    const port = document.getElementById('port')
    const bounds =
      port !== null && 'editContext' in port && port.editContext !== null
        ? (port.editContext as { characterBounds(): ReadonlyArray<DOMRect> })
            .characterBounds()
            .map(({ left, top, width, height }) => ({
              left,
              top,
              width,
              height,
            }))
        : []
    const preedit = document.querySelector('[data-ghost]:not(#caret)')
    const node = preedit?.firstChild
    const range = document.createRange()
    const boxes =
      node === null || node === undefined
        ? []
        : [...(node.textContent ?? '')].map((_, index) => {
            range.setStart(node, index)
            range.setEnd(node, index + 1)
            const { left, top, width, height } = range.getBoundingClientRect()
            return { left, top, width, height }
          })
    return { reported: bounds, drawn: boxes }
  })
  expect(drawn.length, 'four preedit characters drawn').toBe(4)
  const edges = (box: {
    left: number
    top: number
    width: number
    height: number
  }) => [box.left, box.top, box.left + box.width, box.top + box.height]
  expect(reported.length, 'a box for each preedit character').toBe(4)
  expect(
    reported.flatMap((box, index) => {
      const want = edges(drawn[index] ?? box)
      return edges(box).flatMap((edge, side) =>
        Math.abs(edge - (want[side] ?? 0)) > 1
          ? [`box ${index} side ${side}: ${edge} for ${want[side]}`]
          : [],
      )
    }),
    'the boxes reported to the browser are the drawn ones, to the whole pixel the browser keeps',
  ).toEqual([])
})

test('an IME that converts text already typed replaces it, as in a textarea', async ({
  nullpad,
}) => {
  await nullpad.type('first\nword かんじ tail')
  await nullpad.press('ArrowLeft', 5)
  await nullpad.compose('漢字', { start: 5, end: 8 })
  expect(await nullpad.preedit(), 'the conversion drawn as a preedit').toBe(
    '漢字',
  )
  expect(
    await nullpad.text(),
    'the converted letters gone while composing',
  ).toBe('first\nword  tail')
  await nullpad.commit('漢字')
  expect(await nullpad.text(), 'the conversion replaces them once').toBe(
    'first\nword 漢字 tail',
  )
  expect(await nullpad.status()).toEqual({ line: 2, column: 8, lineCount: 2 })
  await nullpad.type('!')
  expect(await nullpad.text(), 'typing goes after the conversion').toBe(
    'first\nword 漢字! tail',
  )
})

test('an IME that converts a word before the caret, not next to it, replaces that word and leaves the rest', async ({
  nullpad,
}) => {
  await nullpad.type('one two three')
  await nullpad.compose('2', { start: 4, end: 7 })
  expect(await nullpad.preedit(), 'the conversion drawn as a preedit').toBe('2')
  expect(await nullpad.text(), 'only the converted word gone').toBe(
    'one  three',
  )
  await nullpad.commit('2')
  expect(await nullpad.text()).toBe('one 2 three')
  expect(await nullpad.status(), 'the cursor after the conversion').toEqual({
    line: 1,
    column: 6,
    lineCount: 1,
  })
})

test('a click while composing commits the composition where it was composed and moves the cursor to the click', async ({
  nullpad,
}) => {
  await nullpad.paste('hello world')
  await nullpad.press('Control+Home')
  await nullpad.compose('か')
  expect(await nullpad.preedit(), 'preedit drawn').toBe('か')
  const screen = await nullpad.screen()
  const row = screen.rows[0]
  await nullpad.click(
    (row?.inkRight ?? 0) + 3 * screen.cell,
    ((row?.top ?? 0) + (row?.bottom ?? 0)) / 2,
  )
  expect(await nullpad.preedit(), 'no preedit left').toBe('')
  expect(await nullpad.text(), 'the composition committed in place').toBe(
    'かhello world',
  )
  expect(await nullpad.status(), 'cursor at the click').toEqual({
    line: 1,
    column: 13,
    lineCount: 1,
  })
})

test('a click right after a wheel turn made while composing commits the composition on its own line and lands on the line the turn scrolled under the pointer', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(400))
  await nullpad.page.mouse.move(400, 300)
  const start = await nullpad.screen()
  const turn = 40
  for (let trial = 1; trial <= 3; trial++) {
    await nullpad.press('Control+End')
    await nullpad.compose('かな')
    const target = start.rows[4 * trial]
    if (target === undefined || target.number === null) {
      throw new Error('no numbered row to click')
    }
    await nullpad.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 400,
      y: 300,
      deltaX: 0,
      deltaY: -start.rowHeight * turn,
    })
    await nullpad.click(
      target.left + 2.25 * start.cell,
      (target.top + target.bottom) / 2,
    )
    expect(await nullpad.preedit(), `trial ${trial}: no preedit left`).toBe('')
    const after = await nullpad.screen()
    expect(
      after.status.line,
      `trial ${trial}: the cursor is on the line the turn scrolled there`,
    ).toBe(Number(target.number) - turn)
    expect(
      after.cursor?.inside,
      `trial ${trial}: the cursor is on screen`,
    ).toBe(true)
    await nullpad.press('Control+End')
    expect(
      linesOf(await nullpad.screen()).at(-1),
      `trial ${trial}: the composition committed on the last line`,
    ).toBe(`line 400${'かな'.repeat(trial)}`)
  }
})
