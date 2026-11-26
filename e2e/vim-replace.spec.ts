import { type Nullpad, expect, settle, startVimRow, test } from './nullpad'
import { type Row, notes, groups } from './vim-rows/vim-replace.ts'

const ROWS_PER_TEST = 12

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Del>': 'Delete',
  '<Tab>': 'Tab',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Up>': 'ArrowUp',
  '<Down>': 'ArrowDown',
  '<Home>': 'Home',
  '<End>': 'End',
  '<PageUp>': 'PageUp',
  '<PageDown>': 'PageDown',
  '<C-r>': 'Control+r',
  '<C-[>': 'Control+[',
  '<C-v>': 'Control+v',
  '<C-c>': 'Control+c',
  '<C-a>': 'Control+a',
  '<C-x>': 'Control+x',
}

const segmenter = new Intl.Segmenter()

const tokensOf = (keys: string): ReadonlyArray<string> =>
  keys
    .split(/(<[A-Za-z-[\]]+>)/u)
    .flatMap(part =>
      part in keyNames
        ? [part]
        : [...segmenter.segment(part)].map(piece => piece.segment),
    )

const isPlainKey = (token: string) => /^[\x20-\x7e]$/u.test(token)

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of tokensOf(keys)) {
    if (token in keyNames) {
      await nullpad.page.keyboard.press(keyNames[token] ?? token)
    } else if (isPlainKey(token)) {
      await nullpad.page.keyboard.press(token)
    } else {
      await nullpad.page.keyboard.insertText(token)
    }
  }
  await settle(nullpad.page)
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const pending = nullpad.page.locator('.status .pending')
  return (await pending.count()) === 0 ? '' : (await pending.innerText()).trim()
}

const vimOn = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
}

const begin = async (
  nullpad: Nullpad,
  text: string,
  at: readonly [number, number] = [1, 1],
) => {
  await startVimRow(nullpad, text, at[0], at[1])
}

const expectScreen = async (
  nullpad: Nullpad,
  label: string,
  state: Readonly<{
    text: string
    line: number
    column: number
    mode: string
    selection?: string
  }>,
) => {
  expect.soft(await nullpad.text(), `${label}: text`).toBe(state.text)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line: state.line, column: state.column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe(state.mode)
  if (state.selection !== undefined) {
    expect
      .soft(await nullpad.selection(), `${label}: selected letters`)
      .toBe(state.selection)
  }
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  await begin(nullpad, notes[row.note], row.at)
  await play(nullpad, row.keys)
  await expectScreen(
    nullpad,
    `row ${row.id} (${row.why}) keys ${row.keys} at ${row.at.join(':')}`,
    row,
  )
}

for (const group of groups) {
  for (let from = 0; from < group.rows.length; from += ROWS_PER_TEST) {
    const rows = group.rows.slice(from, from + ROWS_PER_TEST)
    test(
      `r ${group.name} as in Vim (rows ${rows.map(row => row.id).join(', ')})`,
      { tag: '@vim-table' },
      async ({ nullpad }) => {
        for (const row of rows) {
          await playRow(nullpad, row)
        }
      },
    )
  }
}

const typeKeyWithText = async (nullpad: Nullpad, text: string) => {
  await nullpad.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: text,
    text,
    unmodifiedText: text,
  })
  await nullpad.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: text })
  await settle(nullpad.page)
}

test('r waits for a letter and .status .pending reads r, with the count before it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef')
  await play(nullpad, 'r')
  expect(await pendingOf(nullpad), 'r alone').toBe('r')
  await play(nullpad, 'x')
  expect(await pendingOf(nullpad), 'nothing pending after the letter').toBe('')
  expect(await nullpad.text(), 'rx').toBe('xbcdef')
  await play(nullpad, '3r')
  expect(await pendingOf(nullpad), 'a count before r').toBe('3r')
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'Esc empties it').toBe('')
  await play(nullpad, 'vr')
  expect(await modeOf(nullpad), 'still VISUAL while r waits').toBe('VISUAL')
  expect(await pendingOf(nullpad), 'r in VISUAL').toBe('r')
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'Esc after r in VISUAL keeps VISUAL').toBe(
    'VISUAL',
  )
  expect(await pendingOf(nullpad), 'and drops r').toBe('')
  expect(await nullpad.selection(), 'and keeps the selection').toBe('x')
})

test('r then Ctrl-C cancels, the keydown is cancelled so the browser does not take it, and x then runs alone', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef')
  await nullpad.page.evaluate(() => {
    const seen: Array<{ key: string; prevented: boolean }> = []
    Object.assign(window, { keysSeen: seen })
    window.addEventListener('keydown', event =>
      seen.push({ key: event.key, prevented: event.defaultPrevented }),
    )
  })
  await play(nullpad, 'r<C-c>')
  const seen = await nullpad.page.evaluate(
    () =>
      (
        window as unknown as {
          keysSeen: Array<{ key: string; prevented: boolean }>
        }
      ).keysSeen,
  )
  expect(
    seen.find(entry => entry.key === 'c'),
    'the Ctrl-C keydown was cancelled',
  ).toEqual({ key: 'c', prevented: true })
  await expectScreen(nullpad, 'after r and Ctrl-C', {
    text: 'abcdef',
    line: 1,
    column: 1,
    mode: 'NORMAL',
  })
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x runs on its own and deletes').toBe('bcdef')
})

test('VISUAL r then Ctrl-E opens the read view, and Esc comes back to NORMAL with nothing selected', async ({
  nullpad,
}) => {
  await begin(nullpad, 'hello world\nsecond line')
  await play(nullpad, 'ggvjr')
  await nullpad.page.keyboard.press('Control+e')
  expect(await modeOf(nullpad), 'Ctrl-E opens the read view').toBe('READ')
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'back in NORMAL').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'r is gone').toBe('')
  expect(await nullpad.selection(), 'nothing selected').toBe('')
})

test('VISUAL r then Ctrl-P opens the finder, and Esc comes back to NORMAL with nothing selected', async ({
  nullpad,
}) => {
  await begin(nullpad, 'hello world\nsecond line')
  await play(nullpad, 'ggvjr')
  await nullpad.page.keyboard.press('Control+p')
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'back in NORMAL').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'r is gone').toBe('')
  expect(await nullpad.selection(), 'nothing selected').toBe('')
})

test('Ctrl-E and Ctrl-P leave VISUAL whatever key waits, and drop a key waiting in NORMAL', async ({
  nullpad,
}) => {
  await begin(nullpad, 'hello world\nsecond line')
  const waiting = ['f', 'F', 't', 'T', 'm', "'", '`', '@', 'q', 'z', '[', ']']
  const starts = ['v', 'V', '<C-v>']
  const chords = ['Control+e', 'Control+p']
  for (const [index, key] of [...waiting, 'i', 'g', '"', '2'].entries()) {
    const start = starts[index % starts.length] ?? 'v'
    const chord = chords[index % chords.length] ?? 'Control+e'
    const label = `${start}j${key} then ${chord}`
    await play(nullpad, `gg${start}j${key}`)
    await nullpad.page.keyboard.press(chord)
    await play(nullpad, '<Esc>')
    expect.soft(await modeOf(nullpad), `${label}: mode`).toBe('NORMAL')
    expect.soft(await pendingOf(nullpad), `${label}: pending`).toBe('')
    expect.soft(await nullpad.selection(), `${label}: selection`).toBe('')
  }
  for (const chord of ['Control+e', 'Control+p']) {
    await play(nullpad, 'gg2r')
    await nullpad.page.keyboard.press(chord)
    await play(nullpad, '<Esc>')
    expect.soft(await modeOf(nullpad), `r then ${chord}: mode`).toBe('NORMAL')
    expect.soft(await pendingOf(nullpad), `r then ${chord}: pending`).toBe('')
    await play(nullpad, 'x')
    expect
      .soft(await nullpad.text(), `r then ${chord}: x runs alone`)
      .toBe('ello world\nsecond line')
    await play(nullpad, 'u')
  }
  await play(nullpad, '2r')
  await vimOn(nullpad)
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'r then the vim toggle twice').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'r is gone after the toggle').toBe('')
})

for (const key of [
  'Escape',
  'Control+[',
  'Home',
  'End',
  'ArrowRight',
  'ArrowLeft',
  'Delete',
  'Backspace',
  'Control+x',
]) {
  test(`r then ${key} changes nothing and the next key runs on its own`, async ({
    nullpad,
  }) => {
    await begin(nullpad, 'abcdef', [1, 3])
    await play(nullpad, '2r')
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await nullpad.text(), 'text after the cancelled r').toBe('abcdef')
    expect(await pendingOf(nullpad), 'nothing pending, the count is gone').toBe(
      '',
    )
    expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
    await play(nullpad, 'x')
    const text = await nullpad.text()
    expect(text.length, 'x deleted one letter, the count did not carry').toBe(5)
    expect(text.includes('x'), 'x was not put as the letter of r').toBe(false)
  })
}

test('r writes no register, a register name before it is ignored, and a put gives back the yank', async ({
  nullpad,
}) => {
  await begin(nullpad, 'foo bar')
  await play(nullpad, 'yiwwrx')
  expect(await nullpad.text(), 'rx over b').toBe('foo xar')
  await play(nullpad, '0p')
  expect(await nullpad.text(), 'p puts the yanked word, not x').toBe(
    'ffoooo xar',
  )
  await begin(nullpad, 'foo bar')
  await play(nullpad, 'yiwwvlrx0p')
  expect(await nullpad.text(), 'a VISUAL r leaves the registers too').toBe(
    'ffoooo xxr',
  )
  await begin(nullpad, 'abcdef')
  await play(nullpad, 'dl')
  await play(nullpad, 'rxp')
  expect(await nullpad.text(), 'the delete stays in the unnamed register').toBe(
    'xacdef',
  )
  await begin(nullpad, 'abcdef')
  await play(nullpad, '"arx"ap')
  expect(await nullpad.text(), '"a before r writes nothing into "a').toBe(
    'xbcdef',
  )
  await begin(nullpad, 'abcdef')
  await nullpad.page.evaluate(() => navigator.clipboard.writeText('KEEP'))
  await play(nullpad, '"+rx')
  expect(await nullpad.text(), '"+rx replaces the letter').toBe('xbcdef')
  expect(
    await nullpad.page.evaluate(() => navigator.clipboard.readText()),
    'the system clipboard is as it was',
  ).toBe('KEEP')
})

test('a letter chosen in an IME after r replaces the letter, and IME text counts only while r waits', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef')
  await play(nullpad, 'r')
  await nullpad.compose('n')
  await nullpad.compose('に')
  await nullpad.commit('に')
  await expectScreen(nullpad, 'r then an IME に', {
    text: 'にbcdef',
    line: 1,
    column: 1,
    mode: 'NORMAL',
  })
  expect(await pendingOf(nullpad), 'r is done').toBe('')
  await play(nullpad, '3r')
  await nullpad.commit('ほ')
  await expectScreen(nullpad, '3r then an IME ほ', {
    text: 'ほほほdef',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
  await nullpad.commit('ん')
  expect(await nullpad.text(), 'IME text with no r waiting does nothing').toBe(
    'ほほほdef',
  )
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u brings the 3 letters back').toBe(
    'にbcdef',
  )
  await play(nullpad, 'r')
  await nullpad.compose('ね')
  await nullpad.compose('')
  expect(await pendingOf(nullpad), 'a cancelled composition keeps r').toBe('r')
  await nullpad.commit('xy')
  expect(await nullpad.text(), 'two letters while r waits put nothing').toBe(
    'にbcdef',
  )
  expect(await pendingOf(nullpad), 'and drop r').toBe('')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x then runs on its own').toBe('bcdef')
  await play(nullpad, 'vlf')
  await nullpad.commit('ab')
  await play(nullpad, 'd')
  expect(await nullpad.text(), 'two letters after VISUAL f drop it too').toBe(
    'def',
  )
})

test('a single letter that arrives as a typed key with text, such as a dead key makes, replaces the letter', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef')
  await play(nullpad, 'r')
  await typeKeyWithText(nullpad, 'é')
  await expectScreen(nullpad, 'r then é', {
    text: 'ébcdef',
    line: 1,
    column: 1,
    mode: 'NORMAL',
  })
  await play(nullpad, 'l2r')
  await typeKeyWithText(nullpad, '^')
  await expectScreen(nullpad, '2r then ^', {
    text: 'é^^def',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
})

test('after r the column j and k keep is the letter put, even after $', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef\nabcdefgh\nab')
  await play(nullpad, '$rxj')
  await expectScreen(nullpad, '$rxj', {
    text: 'abcdex\nabcdefgh\nab',
    line: 2,
    column: 6,
    mode: 'NORMAL',
  })
  await play(nullpad, 'j')
  expect(await nullpad.status(), 'the short line clamps').toMatchObject({
    line: 3,
    column: 2,
  })
  await play(nullpad, 'k')
  expect(
    await nullpad.status(),
    'k goes back to the column of the letter put, not the line end',
  ).toMatchObject({ line: 2, column: 6 })
  await play(nullpad, 'kk')
  expect(await nullpad.status(), 'k from line 1 stays and fails').toMatchObject(
    {
      line: 1,
      column: 6,
    },
  )
})

test('gv and . after a VISUAL r select and repeat on the same amount', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef', [1, 2])
  await play(nullpad, 'vllrxgv')
  await expectScreen(nullpad, 'gv after vllrx', {
    text: 'axxxef',
    line: 1,
    column: 4,
    mode: 'VISUAL',
    selection: 'xxx',
  })
  await play(nullpad, 'ry')
  await expectScreen(nullpad, 'ry over the brought-back selection', {
    text: 'ayyyef',
    line: 1,
    column: 2,
    mode: 'NORMAL',
  })
  await play(nullpad, 'l5.')
  await expectScreen(nullpad, 'l then 5. repeats ry on 3 letters', {
    text: 'ayyyyf',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
  await play(nullpad, 'u')
  await expectScreen(nullpad, 'u takes that repeat back', {
    text: 'ayyyef',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
})

test('r then Enter over VISUAL and V-LINE does nothing and keeps the selection', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdef', [1, 2])
  await play(nullpad, 'vlr<CR>')
  await expectScreen(nullpad, 'vlr then Enter', {
    text: 'abcdef',
    line: 1,
    column: 3,
    mode: 'VISUAL',
    selection: 'bc',
  })
  expect(await pendingOf(nullpad), 'r is dropped').toBe('')
  await play(nullpad, 'd')
  await expectScreen(nullpad, 'd takes the kept selection', {
    text: 'adef',
    line: 1,
    column: 2,
    mode: 'NORMAL',
  })
  await begin(nullpad, 'ab\ncd')
  await play(nullpad, 'Vjr<CR>')
  await expectScreen(nullpad, 'Vjr then Enter', {
    text: 'ab\ncd',
    line: 2,
    column: 1,
    mode: 'V-LINE',
    selection: 'ab\ncd\n',
  })
})

test('r then Page Down or Page Up pages and drops r', async ({ nullpad }) => {
  for (const key of ['PageDown', 'PageUp']) {
    await begin(nullpad, 'abcdef')
    await play(nullpad, 'r')
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await pendingOf(nullpad), `${key} drops r`).toBe('')
    expect(await nullpad.text(), `${key} puts nothing`).toBe('abcdef')
    await play(nullpad, 'x')
    const text = await nullpad.text()
    expect(text.length, `the key after ${key} runs alone`).toBe(5)
    expect(text.includes('x'), `${key} left no r waiting`).toBe(false)
  }
})

test('r with a long letter over 20,000 lines adds at most 4,000,000 units, from the top', async ({
  nullpad,
}) => {
  const note = Array.from({ length: 20_000 }, () => 'abcdefghij').join('\n')
  const letter = `e${'́'.repeat(200)}`
  const lineAt = async (number: number) => {
    const rows = (await nullpad.screen()).rows.filter(
      row => row.number === String(number),
    )
    return rows.map(row => row.text).join('')
  }
  for (const keys of ['VGr', '<C-v>G$r']) {
    await begin(nullpad, note)
    await play(nullpad, keys)
    await nullpad.commit(letter)
    expect(await modeOf(nullpad), `${keys}: back in NORMAL`).toBe('NORMAL')
    await play(nullpad, '2001G')
    expect(
      await lineAt(2000),
      `${keys}: line 2,000 took the letter, 2,000 lines of 2,000 added units each`,
    ).toBe(letter.repeat(10))
    expect(
      await lineAt(2001),
      `${keys}: line 2,001 would pass 4,000,000 units and stays`,
    ).toBe('abcdefghij')
    expect((await nullpad.status()).lineCount, `${keys}: no line added`).toBe(
      20_000,
    )
  }
})
