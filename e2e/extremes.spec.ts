import {
  expect,
  expectNumberedLinesIntact,
  expectNumbersClearOfText,
  expectRowsFit,
  linesOf,
  numberedLines,
  test,
} from './nullpad'

test('typing at the end of a 2,000-line note keeps the cursor on screen', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(2_000, ' of a long note'))
  await nullpad.type(' typed at the end')
  const screen = await nullpad.screen()
  expect(screen.cursor?.inside, 'cursor on screen').toBe(true)
  expect(linesOf(screen).at(-1)).toBe(
    'line 2000 of a long note typed at the end',
  )
  expect(screen.status).toEqual({ line: 2000, column: 42, lineCount: 2000 })
})

test('giant and reversed wheel turns stop at the first and last lines', async ({
  nullpad,
  pageErrors,
}) => {
  await nullpad.paste(numberedLines(5_000))
  await nullpad.press('Control+Home')
  const { rows } = await nullpad.screen()
  await nullpad.page.mouse.move(400, 300)
  await nullpad.wheel(1e9)
  const bottom = await nullpad.screen()
  expect(
    bottom.rows.at(-1)?.number,
    'a 1e9 px turn stops at the last line',
  ).toBe('5000')
  expect(bottom.rows.length).toBe(rows.length)
  expectNumberedLinesIntact(bottom, 'after a 1e9 px turn')
  await nullpad.wheel(-1e9)
  expect(
    (await nullpad.screen()).rows[0]?.number,
    'a -1e9 px turn stops at the first line',
  ).toBe('1')
  await nullpad.wheel(1e300)
  expect(
    (await nullpad.screen()).rows.at(-1)?.number,
    'a 1e300 px turn stops at the last line',
  ).toBe('5000')
  expect(pageErrors).toEqual([])
})

test('a 120,000-line paste lands whole, with the cursor after it and both ends readable', async ({
  nullpad,
}) => {
  await nullpad.paste(numberedLines(120_000))
  const end = await nullpad.screen()
  expect(end.status, 'cursor after the paste').toEqual({
    line: 120_000,
    column: 12,
    lineCount: 120_000,
  })
  expect(end.cursor?.inside).toBe(true)
  expectNumberedLinesIntact(end, 'end of the note')
  expectRowsFit(end, 'end of the note')
  await nullpad.press('Control+Home')
  const start = await nullpad.screen()
  expect(start.rows[0]?.number).toBe('1')
  expectNumberedLinesIntact(start, 'start of the note')
})

for (const { from, to } of [
  { from: 9_999, to: 10_000 },
  { from: 99_999, to: 100_000 },
]) {
  test(`a note that grows from ${from} to ${to} lines and back keeps its numbers clear of the text`, async ({
    nullpad,
  }) => {
    await nullpad.paste(numberedLines(from))
    const check = async (label: string, lineCount: number) => {
      const screen = await nullpad.screen()
      expect(screen.status.lineCount, label).toBe(lineCount)
      expect(
        screen.rows.at(-1)?.number,
        `${label}: last line number on screen`,
      ).toBe(String(lineCount))
      expect(screen.cursor?.inside, `${label}: cursor on screen`).toBe(true)
      expectRowsFit(screen, label)
      await expectNumbersClearOfText(nullpad, label)
    }
    await check(`${from} lines`, from)
    await nullpad.press('Enter')
    await check(`Enter makes ${to} lines`, to)
    await nullpad.press('Backspace')
    await check(`Backspace makes ${from} lines again`, from)
  })
}

const longLines = [
  { name: 'ASCII', grapheme: 'x', count: 200_000 },
  { name: 'CJK', grapheme: '漢', count: 50_000 },
  { name: 'emoji', grapheme: '👍🏽', count: 20_000 },
]

for (const { name, grapheme, count } of longLines) {
  test(`a single ${name} line of ${count.toLocaleString('en')} characters wraps, edits and moves end to end`, async ({
    nullpad,
  }) => {
    await nullpad.paste(grapheme.repeat(count))
    const end = await nullpad.screen()
    expect(end.status, 'cursor after the last character').toEqual({
      line: 1,
      column: count + 1,
      lineCount: 1,
    })
    expect(end.cursor?.inside).toBe(true)
    expectRowsFit(end, 'at the end')
    const started = Date.now()
    await nullpad.type('Z')
    const typeMs = Date.now() - started
    const typed = await nullpad.screen()
    expect(
      typed.rows.at(-1)?.text.endsWith(`${grapheme}Z`),
      'Z lands after the last character',
    ).toBe(true)
    expect(typeMs, 'one keystroke on the long line, in ms').toBeLessThan(1_000)
    await nullpad.press('Control+Home')
    const home = await nullpad.screen()
    expect(home.status.column).toBe(1)
    expect(home.cursor?.row, 'Ctrl+Home shows the first row').toBe(0)
    expect(home.rows[0]?.number).toBe('1')
    expectRowsFit(home, 'at the start')
    await nullpad.press('Backspace')
    await nullpad.press('Delete')
    await nullpad.press('Control+End')
    expect(
      (await nullpad.screen()).status.column,
      'Delete at the start took one character',
    ).toBe(count + 1)
  })
}

/** Windows reports AltGr as Ctrl+Alt, so no printable Ctrl+Alt keydown may be cancelled. */
test('no printable Ctrl+Alt keydown is cancelled, and every Ctrl-only letter chord is', async ({
  nullpad,
}) => {
  const printable = [
    ...Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)),
    '€',
    'ł',
    'ß',
    'µ',
    '²',
  ]
  const cancelledOf = (key: string, modifiers: number) =>
    nullpad.page
      .evaluateHandle(() => {
        const box: { cancelled: boolean | null } = { cancelled: null }
        window.addEventListener(
          'keydown',
          event => (box.cancelled = event.defaultPrevented),
          { once: true },
        )
        return box
      })
      .then(async box => {
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
        return box.evaluate(seen => seen.cancelled)
      })
  const cancelledWithCtrlAlt: Array<string> = []
  for (const key of printable) {
    if (await cancelledOf(key, 3)) {
      cancelledWithCtrlAlt.push(key)
    }
  }
  expect(cancelledWithCtrlAlt, 'Ctrl+Alt keydowns that were cancelled').toEqual(
    [],
  )
  const keptWithCtrl: Array<string> = []
  for (const key of 'abcdfghijkmopsuxyz') {
    if (!(await cancelledOf(key, 2))) {
      keptWithCtrl.push(key)
    }
  }
  expect(keptWithCtrl, 'Ctrl chords left to the browser').toEqual([])
  expect(await nullpad.text(), 'no chord typed anything').toBe('')
})

type Composition = Readonly<{
  name: string
  before: string
  left: number
  updates: ReadonlyArray<string>
  end: Readonly<{ commit: string }> | 'cancel'
  expected: string
}>

const compositions: ReadonlyArray<Composition> = [
  {
    name: 'Japanese kana to kanji mid-line',
    before: 'ab',
    left: 1,
    updates: ['に', 'にほ', 'にほん'],
    end: { commit: '日本' },
    expected: 'a日本b',
  },
  {
    name: 'Korean jamo building one syllable at the line end',
    before: 'x',
    left: 0,
    updates: ['ㅎ', '하', '한'],
    end: { commit: '한' },
    expected: 'x한',
  },
  {
    name: 'Chinese pinyin at the document start',
    before: 'end',
    left: 3,
    updates: ['n', 'ni', 'nih', 'nihao'],
    end: { commit: '你好' },
    expected: '你好end',
  },
  {
    name: 'a composition after an emoji',
    before: '👍🏽',
    left: 0,
    updates: ['ka'],
    end: { commit: 'か' },
    expected: '👍🏽か',
  },
  {
    name: 'a composition on an empty note, cancelled',
    before: '',
    left: 0,
    updates: ['a', 'ab'],
    end: 'cancel',
    expected: '',
  },
  {
    name: 'a composition between lines, cancelled',
    before: 'one\ntwo',
    left: 4,
    updates: ['ちゃ'],
    end: 'cancel',
    expected: 'one\ntwo',
  },
  {
    name: 'a commit that differs from the last preedit',
    before: 'q',
    left: 0,
    updates: ['abc'],
    end: { commit: 'Z' },
    expected: 'qZ',
  },
]

for (const composition of compositions) {
  test(`IME: ${composition.name}`, async ({ nullpad }) => {
    if (composition.before !== '') {
      await nullpad.paste(composition.before)
    }
    await nullpad.press('ArrowLeft', composition.left)
    const before = await nullpad.text()
    for (const update of composition.updates) {
      await nullpad.compose(update)
      expect(await nullpad.preedit(), 'preedit drawn').toBe(update)
      expect(await nullpad.text(), 'text unchanged while composing').toBe(
        before,
      )
    }
    if (composition.end === 'cancel') {
      await nullpad.compose('')
    } else {
      await nullpad.commit(composition.end.commit)
    }
    expect(
      await nullpad.preedit(),
      'no preedit after the composition ends',
    ).toBe('')
    expect(await nullpad.text()).toBe(composition.expected)
    expect((await nullpad.cursor())?.inside).toBe(true)
  })
}
