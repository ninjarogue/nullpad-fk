import { type Nullpad, expect, settle, startVimRow, test } from './nullpad'
import { type Row, groups } from './vim-rows/vim-find.ts'

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Del>': 'Delete',
  '<Tab>': 'Tab',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Home>': 'Home',
  '<End>': 'End',
  '<C-r>': 'Control+r',
  '<C-[>': 'Control+[',
  '<C-v>': 'Control+v',
  '<C-c>': 'Control+c',
  '<C-a>': 'Control+a',
  '<C-x>': 'Control+x',
}

const tokensOf = (keys: string): ReadonlyArray<string> =>
  keys
    .split(/(<[A-Za-z-[\]]+>)/u)
    .flatMap(part =>
      part in keyNames
        ? [part]
        : (part.match(/[\x20-\x7e]|[^\x20-\x7e]+/gu) ?? []),
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
  const [
    id,
    why,
    text,
    at,
    keys,
    after,
    line,
    column,
    mode,
    selection,
    afterP,
  ] = row
  await begin(nullpad, text, at)
  await play(nullpad, keys)
  const label = `row ${id} (${why}) keys ${keys} at ${at.join(':')}`
  await expectScreen(nullpad, label, {
    text: after ?? text,
    line,
    column,
    mode,
    ...(selection === null ? {} : { selection }),
  })
  if (afterP !== null) {
    await play(nullpad, 'P')
    expect
      .soft(await nullpad.text(), `${label}: P puts the unnamed register`)
      .toBe(afterP)
  }
}

for (const group of groups) {
  const half = Math.ceil(group.rows.length / 2)
  const parts =
    group.rows.length > 16
      ? [group.rows.slice(0, half), group.rows.slice(half)]
      : [group.rows]
  for (const rows of parts) {
    test(
      `find ${group.name} as in Vim (rows ${rows.map(row => row[0]).join(', ')})`,
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
  await nullpad.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: text,
  })
  await settle(nullpad.page)
}

const openFinder = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
}

const startNote = async (nullpad: Nullpad, firstLine: string) => {
  await openFinder(nullpad)
  await nullpad.type(firstLine)
  for (let i = 0; i < 20; i++) {
    const selected = (await nullpad.finder())?.rows.find(row => row.selected)
    if (selected?.text.startsWith('+ new note')) {
      break
    }
    await nullpad.press('ArrowDown')
  }
  await nullpad.press('Enter')
}

test('a find waits for its letter and .status .pending reads f, 2f, 2df and the VISUAL f', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'f')
  expect(await pendingOf(nullpad), 'f alone').toBe('f')
  await play(nullpad, 'c')
  expect(await pendingOf(nullpad), 'nothing pending after the letter').toBe('')
  await play(nullpad, '2f')
  expect(await pendingOf(nullpad), 'a count before f').toBe('2f')
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'Esc empties it').toBe('')
  await play(nullpad, '2df')
  expect(await pendingOf(nullpad), 'a count, d and f').toBe('2df')
  await play(nullpad, '<Esc>')
  for (const key of ['F', 't', 'T']) {
    await play(nullpad, key)
    expect(await pendingOf(nullpad), `${key} alone`).toBe(key)
    await play(nullpad, '<Esc>')
  }
  await play(nullpad, 'vf')
  expect(await modeOf(nullpad), 'still VISUAL while f waits').toBe('VISUAL')
  expect(await pendingOf(nullpad), 'f in VISUAL').toBe('f')
  await play(nullpad, 'c')
  expect(await pendingOf(nullpad), 'done').toBe('')
  expect(
    await nullpad.selection(),
    'the selection grew from the c that fc left the cursor on to the next c (Vim: VISUAL from 1:3 to 1:6)',
  ).toBe('cabc')
})

for (const key of [
  'Escape',
  'Control+[',
  'Control+c',
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Control+x',
]) {
  test(`f then ${key} changes nothing, drops the count, and the next key runs on its own`, async ({
    nullpad,
  }) => {
    await begin(nullpad, 'abcdef', [1, 3])
    await play(nullpad, '2f')
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await nullpad.text(), 'text after the cancelled f').toBe('abcdef')
    expect(await pendingOf(nullpad), 'nothing pending, the count is gone').toBe(
      '',
    )
    expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
    expect(
      await nullpad.status(),
      'the cursor stays on the c (Vim: column 3)',
    ).toMatchObject({ line: 1, column: 3 })
    await play(nullpad, 'x')
    expect(
      await nullpad.text(),
      'x deleted the c alone, the count did not carry (Vim: abdef)',
    ).toBe('abdef')
  })
}

test('a cancelled f keeps the Ctrl-C keydown from the browser and is no find', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'fc')
  await nullpad.page.evaluate(() => {
    const seen: Array<{ key: string; prevented: boolean }> = []
    Object.assign(window, { keysSeen: seen })
    window.addEventListener('keydown', event =>
      seen.push({ key: event.key, prevented: event.defaultPrevented }),
    )
  })
  await play(nullpad, 'f<C-c>')
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
  await play(nullpad, '0;')
  expect(
    await nullpad.status(),
    'the cancelled f left the last find as fc',
  ).toMatchObject({ line: 1, column: 3 })
})

test('f then Enter finds nothing and becomes the last find, so ; then finds nothing too', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'fc')
  await play(nullpad, 'f<CR>')
  expect(await nullpad.status(), 'Enter found nothing').toMatchObject({
    line: 1,
    column: 3,
  })
  expect(await pendingOf(nullpad), 'Enter was taken as the letter').toBe('')
  await play(nullpad, ';')
  expect(
    await nullpad.status(),
    '; looks for the Enter, not for the c',
  ).toMatchObject({ line: 1, column: 3 })
  expect(await nullpad.text(), 'no line break was typed').toBe('abcabc xax')
})

test('f then Ctrl-E opens the read view and f then Ctrl-P opens the finder, each dropping f', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'f')
  await nullpad.page.keyboard.press('Control+e')
  expect(await modeOf(nullpad), 'Ctrl-E opens the read view').toBe('READ')
  await play(nullpad, '<Esc>')
  expect(await modeOf(nullpad), 'back in NORMAL').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'f is gone').toBe('')
  await play(nullpad, 'f')
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'f is gone after the finder').toBe('')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x runs on its own').toBe('bcabc xax')
})

test('f then Page Down or Page Up pages and drops f', async ({ nullpad }) => {
  for (const key of ['PageDown', 'PageUp']) {
    await begin(nullpad, 'abcdef')
    await play(nullpad, 'f')
    await nullpad.page.keyboard.press(key)
    await settle(nullpad.page)
    expect(await pendingOf(nullpad), `${key} drops f`).toBe('')
    await play(nullpad, 'x')
    expect(
      (await nullpad.text()).length,
      `the key after ${key} runs alone`,
    ).toBe(5)
  }
})

test('the last find stays when another note is opened and when vim goes off and on, and a reload forgets it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'fc')
  await nullpad.page.waitForTimeout(1100)
  await startNote(nullpad, 'zzczzc')
  expect(await modeOf(nullpad), 'another note opens in NORMAL').toBe('NORMAL')
  expect(await nullpad.text(), 'the new note').toBe('zzczzc')
  await play(nullpad, 'gg0;')
  expect(
    await nullpad.status(),
    '; in the other note repeats fc',
  ).toMatchObject({ line: 1, column: 3 })
  await play(nullpad, '0')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  await play(nullpad, 'gg0;')
  expect(
    await nullpad.status(),
    '; after vim off and on repeats fc',
  ).toMatchObject({ line: 1, column: 3 })
  await nullpad.page.waitForTimeout(1100)
  await nullpad.reload()
  expect(await modeOf(nullpad), 'vim stays on after a reload').toBe('NORMAL')
  await play(nullpad, 'gg0;')
  expect(await nullpad.status(), 'a reload forgot the last find').toMatchObject(
    {
      line: 1,
      column: 1,
    },
  )
  await play(nullpad, ',')
  expect(await nullpad.status(), 'and , too').toMatchObject({
    line: 1,
    column: 1,
  })
})

test('a letter chosen in an IME after f, F, t and df is the letter, and IME text of two letters cancels f', async ({
  nullpad,
}) => {
  await begin(nullpad, 'あいにえおにか')
  await play(nullpad, 'f')
  await nullpad.compose('n')
  await nullpad.compose('に')
  await nullpad.commit('に')
  await expectScreen(nullpad, 'f then an IME に', {
    text: 'あいにえおにか',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
  expect(await pendingOf(nullpad), 'f is done').toBe('')
  await play(nullpad, '0t')
  await nullpad.commit('に')
  expect(await nullpad.status(), 't then an IME に').toMatchObject({
    line: 1,
    column: 2,
  })
  await play(nullpad, '$F')
  await nullpad.commit('に')
  expect(await nullpad.status(), 'F then an IME に').toMatchObject({
    line: 1,
    column: 6,
  })
  await play(nullpad, ';')
  expect(
    await nullpad.status(),
    '; repeats the IME letter backwards',
  ).toMatchObject({
    line: 1,
    column: 3,
  })
  await play(nullpad, '0df')
  await nullpad.commit('に')
  await expectScreen(nullpad, 'df then an IME に', {
    text: 'えおにか',
    line: 1,
    column: 1,
    mode: 'NORMAL',
  })
  await play(nullpad, 'f')
  await nullpad.compose('ね')
  await nullpad.compose('')
  expect(await pendingOf(nullpad), 'a cancelled composition keeps f').toBe('f')
  await nullpad.commit('おに')
  expect(await pendingOf(nullpad), 'two letters while f waits drop f').toBe('')
  expect(await nullpad.text(), 'and change nothing').toBe('えおにか')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x then runs on its own').toBe('おにか')
  await play(nullpad, 'vf')
  await nullpad.commit('か')
  expect(await modeOf(nullpad), 'VISUAL f with an IME letter').toBe('VISUAL')
  expect(await nullpad.selection(), 'selects to か').toBe('おにか')
})

test('a single letter that arrives as a typed key with text, such as a dead key makes, is the letter', async ({
  nullpad,
}) => {
  await begin(nullpad, 'ab^cd^e')
  await play(nullpad, 'f')
  await typeKeyWithText(nullpad, '^')
  await expectScreen(nullpad, 'f then ^', {
    text: 'ab^cd^e',
    line: 1,
    column: 3,
    mode: 'NORMAL',
  })
  await play(nullpad, ';')
  expect(await nullpad.status(), '; finds the second ^').toMatchObject({
    line: 1,
    column: 6,
  })
})

test('after a find k and j keep the column of the letter found: the last column of a tab, the first of a wide letter', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcdefghijkl\na\tbx\ty', [2, 1])
  await play(nullpad, 'f<Tab>k')
  await expectScreen(nullpad, 'f Tab then k', {
    text: 'abcdefghijkl\na\tbx\ty',
    line: 1,
    column: 8,
    mode: 'NORMAL',
  })
  await play(nullpad, 'j0')
  await play(nullpad, '2f<Tab>k')
  expect(
    await nullpad.status(),
    'the second tab ends at column 16, the line above ends at 12',
  ).toMatchObject({ line: 1, column: 12 })
  await begin(nullpad, 'abcdefghi\na世bcdef', [2, 1])
  await play(nullpad, 'f世k')
  expect(await nullpad.status(), 'f of a wide letter then k').toMatchObject({
    line: 1,
    column: 2,
  })
  await begin(nullpad, 'abcdef\nabcdefgh', [1, 1])
  await play(nullpad, '$fzj')
  expect(
    await nullpad.status(),
    'a failed find keeps the line end after $',
  ).toMatchObject({ line: 2, column: 8 })
  await play(nullpad, 'k')
  expect(await nullpad.status(), 'and k too').toMatchObject({
    line: 1,
    column: 6,
  })
})

test('a find that fails leaves the column that j and k keep, and one that works sets it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax\nabcdefghijklm\nabcdefghijklm', [1, 1])
  await play(nullpad, 'fxjj')
  expect(await nullpad.status(), 'fx then j j').toMatchObject({
    line: 3,
    column: 8,
  })
  await play(nullpad, 'fqk')
  expect(
    await nullpad.status(),
    'a failed fq keeps the column of the x',
  ).toMatchObject({ line: 2, column: 8 })
})

test('dfx and yfx write the unnamed register, and a failed df writes none', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'dfcp')
  await expectScreen(nullpad, 'dfc then p', {
    text: 'aabcbc xax',
    line: 1,
    column: 4,
    mode: 'NORMAL',
  })
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'yfc$p')
  await expectScreen(nullpad, 'yfc then $p', {
    text: 'abcabc xaxabc',
    line: 1,
    column: 13,
    mode: 'NORMAL',
  })
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'yfcdtb"0p')
  await expectScreen(nullpad, 'yfc, dtb, then "0p puts the yank', {
    text: 'babccabc xax',
    line: 1,
    column: 4,
    mode: 'NORMAL',
  })
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'yfcdtbp')
  expect(await nullpad.text(), 'p puts the delete').toBe('bacabc xax')
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'yldfzp')
  expect(
    await nullpad.text(),
    'a failed dfz wrote no register, so p puts the yank',
  ).toBe('aabcabc xax')
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, '"adfc$"ap')
  expect(await nullpad.text(), '"a takes the delete').toBe('abc xaxabc')
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, '$yFa0P')
  expect(await nullpad.text(), 'yFa put back before the first letter').toBe(
    'aabcabc xax',
  )
})

test('after yFx and yTx the cursor goes back to where the yank starts, after yfx and ytx it stays', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax', [1, 10])
  await play(nullpad, 'yFa')
  expect(await nullpad.status(), 'yFa').toMatchObject({ line: 1, column: 9 })
  await begin(nullpad, 'abcabc xax', [1, 10])
  await play(nullpad, 'yTc')
  expect(await nullpad.status(), 'yTc').toMatchObject({ line: 1, column: 7 })
  await begin(nullpad, 'abcabc xax', [1, 4])
  await play(nullpad, 'yfc')
  expect(await nullpad.status(), 'yfc stays').toMatchObject({
    line: 1,
    column: 4,
  })
})

test('a count before and after d multiply, a failing find cancels d and the key after it runs alone', async ({
  nullpad,
}) => {
  await begin(nullpad, 'a-a-a-a-a-a')
  await play(nullpad, '2d2fa')
  expect(await nullpad.text(), '2d2fa finds the fourth a').toBe('-a')
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'd9fcx')
  expect(await nullpad.text(), 'd9fc fails, then x runs alone').toBe(
    'bcabc xax',
  )
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')
})

test('. repeats a delete with a find with its own letter, and a count before . is kept for the next .', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabcabc xax')
  await play(nullpad, 'dfcfb.')
  expect(await nullpad.text(), 'dfc, fb moves, . deletes to the next c').toBe(
    'aabc xax',
  )
  await begin(nullpad, 'a-a-a-a-a-a-a')
  await play(nullpad, 'dfa3.')
  expect(await nullpad.text(), 'dfa then 3. deletes three a').toBe('-a-a')
  await play(nullpad, '.')
  expect(
    await nullpad.text(),
    'the next . keeps the 3 and fails or deletes what is left',
  ).toBe('-a-a')
})

test('a find in VISUAL then Esc or Ctrl-C keeps the selection, and the find made there is the last find after leaving', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abcabc xax')
  await play(nullpad, 'vlf<Esc>')
  await expectScreen(nullpad, 'vlf then Esc keeps the selection', {
    text: 'abcabc xax',
    line: 1,
    column: 2,
    mode: 'VISUAL',
    selection: 'ab',
  })
  await play(nullpad, 'f<C-c>')
  expect(await modeOf(nullpad), 'f then Ctrl-C keeps VISUAL').toBe('VISUAL')
  expect(await nullpad.selection(), 'and the selection').toBe('ab')
  await play(nullpad, 'tc<Esc>0;')
  expect(
    await nullpad.status(),
    'tc made there is the last find',
  ).toMatchObject({
    line: 1,
    column: 2,
  })
})
