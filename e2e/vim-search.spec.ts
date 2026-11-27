import { type Nullpad, expect, settle, startVimRow, test } from './nullpad'
import {
  type Row,
  collectionRows,
  countRows,
  defectRows,
  findingRows,
  groups,
  noteC,
  noteD,
  repeatedGroups,
} from './vim-rows/vim-search.ts'

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
  '<C-r>': 'Control+r',
  '<C-[>': 'Control+[',
  '<C-v>': 'Control+v',
  '<C-c>': 'Control+c',
  '<C-u>': 'Control+u',
  '<C-e>': 'Control+e',
  '<C-p>': 'Control+p',
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

const promptOf = async (nullpad: Nullpad): Promise<string | null> => {
  await settle(nullpad.page)
  const prompt = nullpad.page.locator('.status .prompt')
  return (await prompt.count()) === 0 ? null : await prompt.innerText()
}

const noticeOf = async (nullpad: Nullpad) => (await nullpad.notice()).trim()

const begin = async (
  nullpad: Nullpad,
  text: string,
  at: readonly [number, number] = [1, 1],
) => {
  await startVimRow(nullpad, text, at[0], at[1])
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
    notice,
  ] = row
  await begin(nullpad, text, at)
  await play(nullpad, keys)
  const label = `row ${id} (${why}) keys ${keys} at ${at.join(':')}`
  expect.soft(await nullpad.text(), `${label}: text`).toBe(after ?? text)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line, column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe(mode)
  expect.soft(await promptOf(nullpad), `${label}: no prompt is open`).toBeNull()
  if (selection !== null) {
    expect
      .soft(await nullpad.selection(), `${label}: selected letters`)
      .toBe(selection)
  }
  if (notice !== null) {
    expect.soft(await noticeOf(nullpad), `${label}: notice`).toBe(notice)
  }
  if (afterP !== null) {
    await play(nullpad, 'P')
    expect
      .soft(await nullpad.text(), `${label}: P puts the unnamed register`)
      .toBe(afterP)
  }
}

const rowsPerTest = 20

for (const group of groups) {
  for (let from = 0; from < group.rows.length; from += rowsPerTest) {
    const rows = group.rows.slice(from, from + rowsPerTest)
    test(
      `search ${group.name} as in Vim (rows ${rows.map(row => row[0]).join(', ')})`,
      { tag: '@vim-table' },
      async ({ nullpad }) => {
        for (const row of rows) {
          await playRow(nullpad, row)
        }
      },
    )
  }
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

const noteB = 'one two three\ntwo four two\nfive\nsix two'

const expectUntouched = async (
  nullpad: Nullpad,
  label: string,
  text: string,
  line: number,
  column: number,
) => {
  expect.soft(await nullpad.text(), `${label}: text`).toBe(text)
  expect
    .soft(await nullpad.status(), `${label}: cursor`)
    .toMatchObject({ line, column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe('NORMAL')
  expect.soft(await promptOf(nullpad), `${label}: prompt`).toBeNull()
}

test('/ and ? open a prompt in the status line that shows what is typed, and the mode stays NORMAL', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  expect(await promptOf(nullpad), 'no prompt before /').toBeNull()
  await play(nullpad, '/')
  expect(await promptOf(nullpad), '/ alone').toBe('/')
  expect(await modeOf(nullpad), 'NORMAL while the prompt is open').toBe(
    'NORMAL',
  )
  await play(nullpad, 'tw')
  expect(await promptOf(nullpad), 'typed letters follow the slash').toBe('/tw')
  await play(nullpad, 'o')
  expect(await promptOf(nullpad), 'a third letter').toBe('/two')
  await play(nullpad, '<Esc>?')
  expect(await promptOf(nullpad), '? opens its own prompt').toBe('?')
  await play(nullpad, 'one')
  expect(await promptOf(nullpad), '? and its text').toBe('?one')
  await play(nullpad, '<CR>')
  expect(await promptOf(nullpad), 'Enter closes the prompt').toBeNull()
})

test('keys typed in the prompt do not change the note, move the cursor or start commands', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [2, 3])
  await play(nullpad, '/xddjkhlp0$u')
  expect(await promptOf(nullpad), 'every key went to the prompt').toBe(
    '/xddjkhlp0$u',
  )
  expect(await nullpad.text(), 'the note is as it was').toBe(noteB)
  expect(await nullpad.status(), 'the cursor has not moved').toMatchObject({
    line: 2,
    column: 3,
  })
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
  await play(nullpad, '<Esc>')
  await expectUntouched(nullpad, 'after Esc', noteB, 2, 3)
})

test('nothing moves until Enter: the cursor stays on the line of the text typed in the prompt', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/five')
  expect(await nullpad.status(), 'still at the start').toMatchObject({
    line: 1,
    column: 1,
  })
  await play(nullpad, '<CR>')
  expect(await nullpad.status(), 'Enter runs the search').toMatchObject({
    line: 3,
    column: 1,
  })
})

test('Left, Right, Home, End, Backspace, Delete and Ctrl-U edit the prompt', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two<Left><Left>X')
  expect(await promptOf(nullpad), 'two Lefts then X (Vim: /tXwo)').toBe('/tXwo')
  await play(nullpad, '<Home>Y')
  expect(await promptOf(nullpad), 'Home is after the slash (Vim: /YtXwo)').toBe(
    '/YtXwo',
  )
  await play(nullpad, '<End>Z')
  expect(await promptOf(nullpad), 'End (Vim: /YtXwoZ)').toBe('/YtXwoZ')
  await play(nullpad, '<Left><Left><BS>')
  expect(await promptOf(nullpad), 'Backspace deletes the letter before').toBe(
    '/YtXoZ',
  )
  await play(nullpad, '<Right><Right><Right><BS>')
  expect(await promptOf(nullpad), 'Right moves on, Backspace at the end').toBe(
    '/YtXo',
  )
  await play(nullpad, '<Home><Del><Del>')
  expect(await promptOf(nullpad), 'Delete deletes the letter after').toBe('/Xo')
  await play(nullpad, '<Right><Right><Right>Q')
  expect(await promptOf(nullpad), 'Right stops at the end').toBe('/XoQ')
  await play(nullpad, '<End><C-u>')
  expect(
    await promptOf(nullpad),
    'Ctrl-U empties it and the prompt stays open (Vim: /)',
  ).toBe('/')
  await play(nullpad, 'ab<Home><Del>')
  expect(await promptOf(nullpad), 'Home then Delete (Vim: /b)').toBe('/b')
  await play(nullpad, '<C-u>ab<C-u>c')
  expect(
    await promptOf(nullpad),
    'Ctrl-U deletes only before the cursor: the b stays (Vim: /cb)',
  ).toBe('/cb')
  expect(await nullpad.text(), 'the note is as it was').toBe(noteB)
})

test('Backspace takes a whole letter, an emoji or a wide letter, out of the prompt', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/a😀世')
  expect(await promptOf(nullpad), 'letters of every width').toBe('/a😀世')
  await play(nullpad, '<BS>')
  expect(await promptOf(nullpad), 'a wide letter goes whole').toBe('/a😀')
  await play(nullpad, '<BS>')
  expect(await promptOf(nullpad), 'an emoji goes whole (Vim: /a)').toBe('/a')
})

test('Backspace on an empty prompt closes it, with text it deletes and the empty prompt stays', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [1, 5])
  await play(nullpad, '/<BS>')
  await expectUntouched(nullpad, '/ then Backspace', noteB, 1, 5)
  await play(nullpad, '?<BS>')
  await expectUntouched(nullpad, '? then Backspace', noteB, 1, 5)
  await play(nullpad, '/tw<BS><BS>')
  expect(await promptOf(nullpad), 'the empty prompt stays (Vim)').toBe('/')
  await play(nullpad, '<BS>')
  await expectUntouched(nullpad, 'the third Backspace', noteB, 1, 5)
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x then deletes one letter').toBe(
    noteB.replace('two', 'wo'),
  )
})

for (const [name, keys] of [
  ['Esc', '<Esc>'],
  ['Ctrl-[', '<C-[>'],
  ['Ctrl-C', '<C-c>'],
] as const) {
  test(`${name} closes the prompt, runs nothing, and the next key runs alone`, async ({
    nullpad,
  }) => {
    await begin(nullpad, noteB, [1, 1])
    await play(nullpad, `3/two${keys}`)
    await expectUntouched(nullpad, `3/two then ${name}`, noteB, 1, 1)
    expect(await pendingOf(nullpad), 'nothing pending').toBe('')
    await play(nullpad, 'x')
    expect(
      await nullpad.text(),
      'x deletes one letter, the 3 did not carry (Vim: ne two three)',
    ).toBe(noteB.slice(1))
    await play(nullpad, 'n')
    expect(
      await noticeOf(nullpad),
      'the closed prompt set no last pattern',
    ).toBe('E35: No previous regular expression')
  })
}

test('Esc on a prompt closes it in VISUAL and keeps VISUAL and the selection', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, 'vl/two<Esc>')
  expect(await modeOf(nullpad), 'still VISUAL').toBe('VISUAL')
  expect(await promptOf(nullpad), 'closed').toBeNull()
  expect(await nullpad.selection(), 'the selection is as it was').toBe('on')
  await play(nullpad, '/two<C-c>')
  expect(await modeOf(nullpad), 'still VISUAL after Ctrl-C').toBe('VISUAL')
  expect(await nullpad.selection(), 'selection after Ctrl-C').toBe('on')
})

test('a selection stays drawn while the prompt is open, in each visual kind', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, 'vl/tw')
  expect(await modeOf(nullpad), 'VISUAL while the prompt is open').toBe(
    'VISUAL',
  )
  expect(await promptOf(nullpad), 'the prompt').toBe('/tw')
  expect(await nullpad.selection(), 'v selection is still drawn').toBe('on')
  await play(nullpad, '<Esc><Esc>')
  expect(await modeOf(nullpad), 'Esc leaves VISUAL').toBe('NORMAL')
  await play(nullpad, 'V?tw')
  expect(await modeOf(nullpad), 'V-LINE while the prompt is open').toBe(
    'V-LINE',
  )
  expect(await nullpad.selection(), 'V selection is still drawn').toBe(
    'one two three\n',
  )
  await play(nullpad, '<Esc><Esc>gg0<C-v>jl/tw')
  expect(await modeOf(nullpad), 'V-BLOCK while the prompt is open').toBe(
    'V-BLOCK',
  )
  expect(await nullpad.selection(), 'block selection is still drawn').toBe(
    'on\ntw',
  )
})

test('d shows in .status .pending while the prompt is open and goes when it closes', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, 'd/')
  expect(await pendingOf(nullpad), 'd while the prompt is open').toBe('d')
  expect(await promptOf(nullpad), 'the prompt').toBe('/')
  await play(nullpad, 'two')
  expect(await pendingOf(nullpad), 'd while typing').toBe('d')
  await play(nullpad, '<CR>')
  expect(await pendingOf(nullpad), 'nothing pending after Enter').toBe('')
  expect(await nullpad.text(), 'd/two deleted to the next two').toBe(
    noteB.replace('one ', ''),
  )
  await play(nullpad, 'y?')
  expect(await pendingOf(nullpad), 'y while a ? prompt is open').toBe('y')
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'Esc empties it').toBe('')
  await play(nullpad, 'c/')
  expect(await pendingOf(nullpad), 'c while the prompt is open').toBe('c')
  await play(nullpad, '<C-c>')
  expect(await pendingOf(nullpad), 'Ctrl-C empties it').toBe('')
})

test('Ctrl-E closes the prompt and opens the read view, Ctrl-P closes it and opens the finder', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  await nullpad.page.keyboard.press('Control+e')
  expect(await modeOf(nullpad), 'Ctrl-E opens the read view').toBe('READ')
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
  await play(nullpad, '<Esc>')
  await expectUntouched(nullpad, 'back from the read view', noteB, 1, 1)
  await play(nullpad, '/two')
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
  await play(nullpad, '<Esc>')
  await expectUntouched(nullpad, 'back from the finder', noteB, 1, 1)
  await play(nullpad, 'n')
  expect(await noticeOf(nullpad), 'the closed prompt set no pattern').toBe(
    'E35: No previous regular expression',
  )
})

test('a click on the text closes the prompt and moves the cursor there', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  const box = await nullpad.page.locator('.surface .line').nth(2).boundingBox()
  if (box === null) {
    throw new Error('the third line has no box')
  }
  await nullpad.click(box.x + 2, box.y + box.height / 2)
  expect(await promptOf(nullpad), 'the click closed the prompt').toBeNull()
  expect(await nullpad.status(), 'the click moved the cursor').toMatchObject({
    line: 3,
    column: 1,
  })
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
  await play(nullpad, 'n')
  expect(await noticeOf(nullpad), 'the closed prompt set no pattern').toBe(
    'E35: No previous regular expression',
  )
})

test('the vim toggle closes the prompt', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
  expect(await nullpad.text(), 'nothing was typed into the note').toBe(noteB)
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  expect(await promptOf(nullpad), 'still no prompt').toBeNull()
  await play(nullpad, 'n')
  expect(await noticeOf(nullpad), 'the closed prompt set no pattern').toBe(
    'E35: No previous regular expression',
  )
})

test('the vim button closes the prompt', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  await nullpad.page.locator('.status .toggle-vim').click()
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
})

test('with vim off / types a slash and opens no prompt, and in the read view it does nothing', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  await play(nullpad, '/')
  expect(await promptOf(nullpad), 'no prompt with vim off').toBeNull()
  expect(await nullpad.text(), 'the slash is text').toBe('/abc')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  await begin(nullpad, noteB)
  await nullpad.page.keyboard.press('Control+e')
  expect(await modeOf(nullpad), 'READ').toBe('READ')
  await play(nullpad, '/')
  expect(await promptOf(nullpad), 'no prompt in the read view').toBeNull()
  expect(await modeOf(nullpad), 'still READ').toBe('READ')
})

test('a paste into the prompt takes the text up to its first line break', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/')
  await nullpad.paste('two\nfour')
  expect(await promptOf(nullpad), 'the first line only').toBe('/two')
  expect(await nullpad.text(), 'the note is as it was').toBe(noteB)
  await play(nullpad, '<Left>')
  await nullpad.paste('x')
  expect(await promptOf(nullpad), 'a paste lands at the cursor').toBe('/twxo')
  await play(nullpad, '<End><C-u>')
  await nullpad.paste('five')
  await play(nullpad, '<CR>')
  expect(
    await nullpad.status(),
    'the pasted pattern is searched',
  ).toMatchObject({ line: 3, column: 1 })
})

test('IME text typed into the prompt is part of the pattern', async ({
  nullpad,
}) => {
  await begin(nullpad, 'あいにえおにか')
  await play(nullpad, '/')
  await nullpad.compose('n')
  await nullpad.compose('に')
  await nullpad.commit('に')
  expect(await promptOf(nullpad), 'the committed letter').toBe('/に')
  expect(await nullpad.text(), 'the note is as it was').toBe('あいにえおにか')
  await play(nullpad, '<CR>')
  expect(await nullpad.status(), 'the search finds に').toMatchObject({
    line: 1,
    column: 3,
  })
  await play(nullpad, '/')
  await nullpad.compose('お')
  await nullpad.compose('')
  expect(await promptOf(nullpad), 'a cancelled composition adds nothing').toBe(
    '/',
  )
  await nullpad.commit('おに')
  expect(await promptOf(nullpad), 'two letters at once').toBe('/おに')
  await play(nullpad, '<CR>')
  expect(await nullpad.status(), 'the search finds おに').toMatchObject({
    line: 1,
    column: 5,
  })
})

test('the search history walks with Up and Down, newest first, and / and ? share it', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two<CR>/four<CR>/')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up: the newest (Vim: four)').toBe('/four')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up again (Vim: two)').toBe('/two')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up past the oldest stays').toBe('/two')
  await play(nullpad, '<Down>')
  expect(await promptOf(nullpad), 'Down (Vim: four)').toBe('/four')
  await play(nullpad, '<Down>')
  expect(
    await promptOf(nullpad),
    'Down past the newest is what was typed',
  ).toBe('/')
  await play(nullpad, '<Esc>?')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), '? shares the history (Vim: ?four)').toBe(
    '?four',
  )
  await play(nullpad, '<Esc>')
  await play(nullpad, '/ab<Up>')
  expect(
    await promptOf(nullpad),
    'no entry starts with ab: nothing changes',
  ).toBe('/ab')
  await play(nullpad, '<Esc>')
})

test('text typed before Up is a prefix the entries must start with, and Down brings the text back', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two<CR>/four<CR>/zzz<CR>')
  await play(nullpad, '/t<Up>')
  expect(await promptOf(nullpad), 'Up with the prefix t (Vim: /two)').toBe(
    '/two',
  )
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'no older entry starts with t').toBe('/two')
  await play(nullpad, '<Down>')
  expect(
    await promptOf(nullpad),
    'Down brings back what was typed (Vim: /t)',
  ).toBe('/t')
  await play(nullpad, '<Esc>/f<Up>')
  expect(await promptOf(nullpad), 'prefix f').toBe('/four')
  await play(nullpad, '<Esc>/two<Up>')
  expect(await promptOf(nullpad), 'a prefix that is the whole entry').toBe(
    '/two',
  )
  await play(nullpad, '<Esc>/tw<Up><Down>')
  expect(await promptOf(nullpad), 'Up then Down (Vim: /tw)').toBe('/tw')
})

test('a line closed with Esc is in the history, and an empty prompt with no history stays empty on Up', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/<Up>')
  expect(await promptOf(nullpad), 'no history: nothing happens (Vim: /)').toBe(
    '/',
  )
  await play(nullpad, '<Esc>/two<Esc>')
  await play(nullpad, '/<Up>')
  expect(
    await promptOf(nullpad),
    'a line left with Esc is in the history',
  ).toBe('/two')
  await play(nullpad, '<Esc>n')
  expect(await noticeOf(nullpad), 'but it is not the last pattern').toBe(
    'E35: No previous regular expression',
  )
})

test('the history holds 50 entries', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  for (let i = 0; i < 60; i++) {
    await play(nullpad, `/s${i}<CR>`)
  }
  await play(nullpad, '/')
  for (let i = 0; i < 50; i++) {
    await nullpad.page.keyboard.press('ArrowUp')
  }
  expect(
    await promptOf(nullpad),
    'fifty Up reach the oldest kept (Vim: /s10)',
  ).toBe('/s10')
  await play(nullpad, '<Up><Up>')
  expect(await promptOf(nullpad), 'the oldest stays (Vim: /s10)').toBe('/s10')
})

test('the three notices read as Vim words them, and the next input clears the notice', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [4, 5])
  await play(nullpad, '/two<CR>')
  expect(await noticeOf(nullpad), 'a wrap at the end').toBe(
    'search hit BOTTOM, continuing at TOP',
  )
  expect(await nullpad.status(), 'and the cursor wrapped').toMatchObject({
    line: 1,
    column: 5,
  })
  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears it').toBe('')
  await play(nullpad, 'gg0?two<CR>')
  expect(await noticeOf(nullpad), 'a wrap at the top').toBe(
    'search hit TOP, continuing at BOTTOM',
  )
  await play(nullpad, '/zzz<CR>')
  expect(await noticeOf(nullpad), 'no match').toBe(
    'E486: Pattern not found: zzz',
  )
  expect(await nullpad.status(), 'the cursor stays').toMatchObject({
    line: 4,
    column: 5,
  })
  await play(nullpad, 'j')
  expect(await noticeOf(nullpad), 'cleared').toBe('')
  await play(nullpad, 'ggn')
  expect(await noticeOf(nullpad), 'zzz is the last pattern').toBe(
    'E486: Pattern not found: zzz',
  )
})

test('no previous pattern and no word under the cursor give E35 and E348', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one\n\ntwo', [2, 1])
  await play(nullpad, 'n')
  expect(await noticeOf(nullpad), 'n with no pattern').toBe(
    'E35: No previous regular expression',
  )
  await play(nullpad, 'N')
  expect(await noticeOf(nullpad), 'N with no pattern').toBe(
    'E35: No previous regular expression',
  )
  await play(nullpad, '/<CR>')
  expect(await noticeOf(nullpad), 'an empty pattern with no last one').toBe(
    'E35: No previous regular expression',
  )
  await play(nullpad, '*')
  expect(await noticeOf(nullpad), '* on an empty line').toBe(
    'E348: No string under cursor',
  )
  await play(nullpad, '#')
  expect(await noticeOf(nullpad), '# on an empty line').toBe(
    'E348: No string under cursor',
  )
  expect(await nullpad.status(), 'the cursor stays').toMatchObject({
    line: 2,
    column: 1,
  })
})

test('a failed search is still the last pattern, an empty pattern repeats it, and a found match leaves no notice', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/zzz<CR>')
  expect(await noticeOf(nullpad), 'E486').toBe('E486: Pattern not found: zzz')
  await play(nullpad, '/<CR>')
  expect(await noticeOf(nullpad), 'an empty pattern is zzz again').toBe(
    'E486: Pattern not found: zzz',
  )
  await play(nullpad, '/two<CR>')
  expect(await noticeOf(nullpad), 'a found match leaves no notice').toBe('')
})

const refused: ReadonlyArray<readonly [string, string, string]> = [
  ['\\n', '\\n', 'exact'],
  ['\\zs', '\\zs', 'exact'],
  ['\\ze', '\\ze', 'exact'],
  ['\\&', '\\&', 'exact'],
  ['~', '~', 'exact'],
  ['\\%V', '\\%V', 'contains'],
  ['\\_s', '\\_', 'contains'],
  ['a\\@=', '\\@', 'contains'],
  ['\\(a\\)\\1', '\\1', 'contains'],
  ['[[:alpha:]]', '[:alpha:]', 'contains'],
]

test('tokens a search does not read are refused with a notice and the cursor stays', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  for (const [pattern, token, how] of refused) {
    await play(nullpad, `/${pattern}<CR>`)
    const notice = await noticeOf(nullpad)
    if (how === 'exact') {
      expect
        .soft(notice, `/${pattern}: the notice names the token`)
        .toBe(`not supported in a search: ${token}`)
    } else {
      expect
        .soft(notice, `/${pattern}: the notice starts as the contract says`)
        .toMatch(/^not supported in a search: /u)
      expect
        .soft(notice, `/${pattern}: the notice names the token`)
        .toContain(token)
    }
    await expectUntouched(nullpad, `/${pattern}`, noteB, 1, 1)
  }
})

test('a ; offset is refused with a notice and the cursor stays', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two/;/five<CR>')
  expect(await noticeOf(nullpad), 'the notice names the ;').toBe(
    'not supported in a search: ;',
  )
  await expectUntouched(nullpad, '/two/;/five', noteB, 1, 1)
})

test('repeated groups, bars and stacked repeats find what Vim finds', async ({
  nullpad,
}) => {
  await begin(nullpad, noteC)
  for (const [pattern, line, column, notice] of repeatedGroups) {
    await play(nullpad, `gg0/${pattern}<CR>`)
    expect
      .soft(await nullpad.status(), `/${pattern}: cursor`)
      .toMatchObject({ line, column })
    expect.soft(await noticeOf(nullpad), `/${pattern}: notice`).toBe(notice)
  }
})

const freezing: ReadonlyArray<
  readonly [pattern: string, unit: string, times: number]
> = [
  ['a*a*a*a*a*b', 'a', 5000],
  ['\\(a\\|a\\)*b', 'a', 5000],
  ['\\(x\\+x\\+\\)\\+y', 'x', 5000],
  ['.*.*.*.*x', 'a', 5000],
  ['\\w*\\w*\\w*\\w*x', 'a', 200],
  ['a*a*a*a*b', 'a', 50000],
  ['.\\{-}c', 'ab ', 16000],
  ['\\(ab \\)\\+c', 'ab ', 16000],
]

for (const [pattern, unit, times] of freezing) {
  test(`${pattern} on one line of ${(unit.length * times).toLocaleString('en-US')} letters answers at once`, async ({
    nullpad,
  }) => {
    test.setTimeout(30_000)
    await begin(nullpad, 'q')
    await play(nullpad, 'i')
    await nullpad.paste(unit.repeat(times))
    await play(nullpad, '<Esc>gg0/')
    await nullpad.page.keyboard.insertText(pattern)
    const started = Date.now()
    await nullpad.page.keyboard.press('Enter')
    await nullpad.page.locator('.status .notice').waitFor({ timeout: 25_000 })
    const took = Date.now() - started
    expect(await noticeOf(nullpad), 'no match').toBe(
      `E486: Pattern not found: ${pattern}`,
    )
    expect(took, 'milliseconds from Enter to the notice').toBeLessThan(1000)
  })
}

test('a group with a bar, repeated or not, still searches', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  for (const pattern of ['\\(f\\|x\\)\\+our', '\\(t\\|f\\)\\=our']) {
    await play(nullpad, `gg0/${pattern}<CR>`)
    expect.soft(await noticeOf(nullpad), `/${pattern}: no notice`).toBe('')
    expect
      .soft(await nullpad.status(), `/${pattern}: lands on four`)
      .toMatchObject({ line: 2, column: 5 })
  }
})

test('a refused token in a ? search, with an operator and in VISUAL stops the search and the operator', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [4, 5])
  await play(nullpad, '?\\zs<CR>')
  expect(await noticeOf(nullpad), '? with a refused token').toBe(
    'not supported in a search: \\zs',
  )
  await expectUntouched(nullpad, '?\\zs', noteB, 4, 5)
  await begin(nullpad, noteB)
  await play(nullpad, 'd/\\n<CR>')
  expect(await noticeOf(nullpad), 'd/ with a refused token').toBe(
    'not supported in a search: \\n',
  )
  await expectUntouched(nullpad, 'd/\\n', noteB, 1, 1)
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'the key after it runs alone').toBe(
    noteB.slice(1),
  )
  await begin(nullpad, noteB)
  await play(nullpad, 'v/\\zs<CR>')
  expect(await modeOf(nullpad), 'VISUAL stays').toBe('VISUAL')
  expect(await noticeOf(nullpad), 'the notice').toBe(
    'not supported in a search: \\zs',
  )
  expect(await nullpad.selection(), 'the selection is as it was').toBe('o')
})

test('the last pattern and the history stay when another note is opened and when vim goes off and on, and a reload forgets them', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\ntwo')
  await play(nullpad, '/two<CR>')
  await nullpad.page.waitForTimeout(1100)
  await startNote(nullpad, 'zz two zz two')
  expect(await modeOf(nullpad), 'another note opens in NORMAL').toBe('NORMAL')
  expect(await nullpad.text(), 'the new note').toBe('zz two zz two')
  await play(nullpad, 'gg0n')
  expect(
    await nullpad.status(),
    'n in the other note searches for two',
  ).toMatchObject({ line: 1, column: 4 })
  await play(nullpad, '/')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'the history came along').toBe('/two')
  await play(nullpad, '<Esc>0')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  await play(nullpad, 'gg0n')
  expect(
    await nullpad.status(),
    'n after vim off and on still searches for two',
  ).toMatchObject({ line: 1, column: 4 })
  await play(nullpad, '/<Up>')
  expect(await promptOf(nullpad), 'the history after vim off and on').toBe(
    '/two',
  )
  await play(nullpad, '<Esc>')
  await nullpad.page.waitForTimeout(1100)
  await nullpad.reload()
  expect(await modeOf(nullpad), 'vim stays on after a reload').toBe('NORMAL')
  await play(nullpad, 'gg0n')
  expect(await noticeOf(nullpad), 'a reload forgot the last pattern').toBe(
    'E35: No previous regular expression',
  )
  await play(nullpad, '/<Up>')
  expect(await promptOf(nullpad), 'and the history').toBe('/')
})

const defectsPerTest = 9

for (let from = 0; from < defectRows.length; from += defectsPerTest) {
  const rows = defectRows.slice(from, from + defectsPerTest)
  test(`the defects the interrogate pass found answer as Vim does (${from + 1} to ${from + rows.length})`, async ({
    nullpad,
  }) => {
    for (const [why, text, at, keys, after, line, column, mode] of rows) {
      await begin(nullpad, text, at)
      await play(nullpad, keys)
      expect.soft(await nullpad.text(), `${why}: text`).toBe(after)
      expect
        .soft(await nullpad.status(), `${why}: cursor`)
        .toMatchObject({ line, column })
      expect.soft(await modeOf(nullpad), `${why}: mode`).toBe(mode)
    }
  })
}

test('a failed search, an unclosed [, an offset off the edge and a refused pattern answer as Vim does', async ({
  nullpad,
}) => {
  for (const [
    why,
    text,
    at,
    keys,
    after,
    line,
    column,
    notice,
  ] of findingRows) {
    await begin(nullpad, text, at)
    await play(nullpad, keys)
    expect.soft(await nullpad.text(), `${why}: text`).toBe(after)
    expect
      .soft(await nullpad.status(), `${why}: cursor`)
      .toMatchObject({ line, column })
    expect.soft(await noticeOf(nullpad), `${why}: notice`).toBe(notice)
  }
})

test('chords with Shift, Alt or Meta do not clear or close the prompt, and E and P still open the read view and the finder over it', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  for (const chord of [
    'Control+Shift+U',
    'Control+Alt+u',
    'Meta+u',
    'Alt+Control+p',
  ]) {
    await nullpad.page.keyboard.press(chord)
    await settle(nullpad.page)
    expect.soft(await promptOf(nullpad), `${chord}: the prompt`).toBe('/two')
    expect.soft(await modeOf(nullpad), `${chord}: the mode`).toBe('NORMAL')
  }
  for (const chord of ['Meta+e', 'Control+Shift+E']) {
    await nullpad.page.keyboard.press(chord)
    expect
      .soft(await modeOf(nullpad), `${chord}: opens the read view`)
      .toBe('READ')
    await nullpad.page.keyboard.press('Escape')
    expect.soft(await promptOf(nullpad), `${chord}: the prompt`).toBe('/two')
    expect.soft(await modeOf(nullpad), `${chord}: back in`).toBe('NORMAL')
  }
  for (const chord of ['Meta+p']) {
    await nullpad.page.keyboard.press(chord)
    await settle(nullpad.page)
    expect
      .soft(await nullpad.finder(), `${chord}: opens the finder`)
      .not.toBeNull()
    await nullpad.page.keyboard.press('Escape')
    await settle(nullpad.page)
    expect.soft(await promptOf(nullpad), `${chord}: the prompt`).toBe('/two')
  }
})

test('Ctrl-U alone clears the prompt', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two<C-u>')
  expect(await promptOf(nullpad), 'the prompt').toBe('/')
})

test('a collection reads its escapes as Vim does', async ({ nullpad }) => {
  for (const [pattern, text, column] of collectionRows) {
    await begin(nullpad, `zzz\n${text}`)
    await play(nullpad, `/${pattern}<CR>`)
    const label = `${pattern} on ${JSON.stringify(text)}`
    expect.soft(await noticeOf(nullpad), `${label}: no notice`).toBe('')
    expect
      .soft(await nullpad.status(), `${label}: lands on the match`)
      .toMatchObject({ line: 2, column })
  }
})

test('a collection with \\n is refused as typed and \\s there is a backslash or s', async ({
  nullpad,
}) => {
  await begin(nullpad, 'zzz\nx y')
  await play(nullpad, '/[\\n]<CR>')
  expect(await noticeOf(nullpad), 'the notice').toBe(
    'not supported in a search: [\\n]',
  )
  await play(nullpad, '/[\\s]<CR>')
  expect(await noticeOf(nullpad), 'the space is not a match').toBe(
    'E486: Pattern not found: [\\s]',
  )
})

test('a count that wraps many times lands and warns as Vim does', async ({
  nullpad,
}) => {
  for (const [text, at, keys, line, column, notice] of countRows) {
    await begin(nullpad, text, at)
    await play(nullpad, keys)
    expect
      .soft(await nullpad.status(), `${keys}: cursor`)
      .toMatchObject({ line, column })
    expect.soft(await noticeOf(nullpad), `${keys}: notice`).toBe(notice)
  }
})

test('9999999/line on a note where every line matches answers at once', async ({
  nullpad,
}) => {
  test.setTimeout(30_000)
  await begin(nullpad, 'q')
  await play(nullpad, 'i')
  await nullpad.paste(
    Array.from(
      { length: 60_000 },
      (_, index) => `line ${index + 1} é😀 text`,
    ).join('\n'),
  )
  await play(nullpad, '<Esc>gg0/')
  await nullpad.page.keyboard.insertText('line')
  const started = Date.now()
  await nullpad.page.keyboard.press('Enter')
  await play(nullpad, '9999999n')
  await nullpad.page.locator('.status .notice').waitFor({ timeout: 25_000 })
  expect(
    Date.now() - started,
    'milliseconds for the search and the count',
  ).toBeLessThan(3000)
  expect(await nullpad.status(), 'cursor').toMatchObject({
    line: 40001,
    column: 1,
  })
})

test('a long prompt in a narrow window keeps its / and its cursor in view', async ({
  nullpad,
}) => {
  await nullpad.resize(400, 600)
  await begin(nullpad, noteB)
  await play(nullpad, '/')
  await nullpad.page.keyboard.insertText('long '.repeat(30))
  await settle(nullpad.page)
  const rects = await nullpad.page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect()
      return rect === undefined
        ? null
        : { left: rect.left, right: rect.right, width: rect.width }
    }
    return {
      prompt: box('.status .prompt'),
      lead: box('.status .prompt-lead'),
      caret: box('.status .prompt-caret'),
    }
  })
  expect(rects.prompt, 'the prompt is drawn').not.toBeNull()
  expect(rects.lead?.left, 'the / is at the left edge of the prompt').toBe(
    rects.prompt?.left,
  )
  expect(
    rects.caret?.right ?? Infinity,
    'the cursor is inside the prompt',
  ).toBeLessThanOrEqual((rects.prompt?.right ?? 0) + 0.5)
  expect(await promptOf(nullpad), 'the text is all there').toBe(
    `/${'long '.repeat(30)}`,
  )
})
