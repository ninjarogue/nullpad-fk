import {
  type Nullpad,
  expect,
  openTab,
  settle,
  startVimRow,
  test,
} from './nullpad'

type Row = readonly [
  id: number,
  why: string,
  text: string,
  at: readonly [number, number],
  keys: string,
  line: number,
  column: number,
  notice: string,
]

const addressRows: ReadonlyArray<Row> = [
  [
    1,
    'a number goes to that line',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':3<CR>',
    3,
    1,
    '',
  ],
  [
    2,
    'line 1 from further down',
    'one\n  two\nthree\n\n\tfive\nsix',
    [6, 3],
    ':1<CR>',
    1,
    1,
    '',
  ],
  [
    3,
    'a number lands on the first non-blank (spaces)',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':2<CR>',
    2,
    3,
    '',
  ],
  [
    4,
    'a number lands on the first non-blank (tab)',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':5<CR>',
    5,
    2,
    '',
  ],
  [
    5,
    'an empty line is column 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [3, 4],
    ':4<CR>',
    4,
    1,
    '',
  ],
  [
    6,
    'the line you are on stays, column moves to first non-blank',
    'one\n  two\nthree\n\n\tfive\nsix',
    [2, 5],
    ':2<CR>',
    2,
    3,
    '',
  ],
  [
    7,
    'a number past the end goes to the last line',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':99<CR>',
    6,
    1,
    '',
  ],
  [
    8,
    'one past the end',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':7<CR>',
    6,
    1,
    '',
  ],
  [
    9,
    '0 goes to line 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [3, 2],
    ':0<CR>',
    1,
    1,
    '',
  ],
  [
    10,
    '00 goes to line 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [3, 2],
    ':00<CR>',
    1,
    1,
    '',
  ],
  [
    11,
    'leading zeros',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':003<CR>',
    3,
    1,
    '',
  ],
  [
    12,
    '$ is the last line',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':$<CR>',
    6,
    1,
    '',
  ],
  [
    13,
    '$ on a blank-indented last line',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [1, 1],
    ':$<CR>',
    8,
    1,
    '',
  ],
  [
    14,
    '. stays on the line, first non-blank',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [2, 9],
    ':.<CR>',
    2,
    5,
    '',
  ],
  [
    15,
    '. on a tab-indented line',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [5, 6],
    ':.<CR>',
    5,
    3,
    '',
  ],
  [
    16,
    '+ alone is 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 3],
    ':+<CR>',
    2,
    3,
    '',
  ],
  [
    17,
    '- alone is 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [3, 3],
    ':-<CR>',
    2,
    3,
    '',
  ],
  [18, '+N', 'one\n  two\nthree\n\n\tfive\nsix', [1, 1], ':+2<CR>', 3, 1, ''],
  [19, '-N', 'one\n  two\nthree\n\n\tfive\nsix', [5, 3], ':-3<CR>', 2, 3, ''],
  [20, '.+N', 'one\n  two\nthree\n\n\tfive\nsix', [2, 1], ':.+2<CR>', 4, 1, ''],
  [21, '.-N', 'one\n  two\nthree\n\n\tfive\nsix', [4, 1], ':.-1<CR>', 3, 1, ''],
  [
    22,
    '++ is 2',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':++<CR>',
    3,
    1,
    '',
  ],
  [
    23,
    '-- is 2',
    'one\n  two\nthree\n\n\tfive\nsix',
    [5, 1],
    ':--<CR>',
    3,
    1,
    '',
  ],
  [
    24,
    '+2-1 chain',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':+2-1<CR>',
    2,
    3,
    '',
  ],
  [
    25,
    'a number then +1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':3+1<CR>',
    4,
    1,
    '',
  ],
  [26, '$-2', 'one\n  two\nthree\n\n\tfive\nsix', [1, 1], ':$-2<CR>', 4, 1, ''],
  [
    27,
    '$-N lands on a tab line',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':$-1<CR>',
    5,
    2,
    '',
  ],
  [
    28,
    '+ then a number',
    'one\n  two\nthree\n\n\tfive\nsix',
    [2, 1],
    ':+1+1<CR>',
    4,
    1,
    '',
  ],
  [
    29,
    'a long chain',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [1, 1],
    ':+3+2-1+1<CR>',
    6,
    3,
    '',
  ],
  [
    30,
    '0+3 is line 3',
    'one\n  two\nthree\n\n\tfive\nsix',
    [6, 1],
    ':0+3<CR>',
    3,
    1,
    '',
  ],
  [
    31,
    'a relative address past the last line goes to the last line (Vim)',
    'one\n  two\nthree\n\n\tfive\nsix',
    [5, 1],
    ':+5<CR>',
    6,
    1,
    '',
  ],
  [
    32,
    'a relative address past the last line from the last line goes to its indent (Vim)',
    'one\n  two\nthree\n\n\tfive\nsix',
    [6, 3],
    ':+<CR>',
    6,
    1,
    '',
  ],
  [
    33,
    '$+1 goes to the last line (Vim)',
    'one\n  two\nthree\n\n\tfive\nsix',
    [2, 3],
    ':$+1<CR>',
    6,
    1,
    '',
  ],
  [
    34,
    'a relative address before line 0 is E16',
    'one\n  two\nthree\n\n\tfive\nsix',
    [2, 3],
    ':-5<CR>',
    2,
    3,
    'E16: Invalid range',
  ],
  [
    35,
    '- on line 1 is line 0, which is line 1 (Vim)',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 2],
    ':-<CR>',
    1,
    1,
    '',
  ],
  [
    36,
    'a chain that dips below 0 and comes back is fine',
    'one\n  two\nthree\n\n\tfive\nsix',
    [2, 1],
    ':-5+4<CR>',
    1,
    1,
    '',
  ],
  [
    37,
    'a chain that goes past the end and comes back',
    'one\n  two\nthree\n\n\tfive\nsix',
    [5, 1],
    ':+9-8<CR>',
    6,
    1,
    '',
  ],
  [
    38,
    'a space before the address',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ': 3<CR>',
    3,
    1,
    '',
  ],
  [
    39,
    'a colon before the address',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    '::3<CR>',
    3,
    1,
    '',
  ],
  [
    40,
    'spaces and colons mixed',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ': : 3<CR>',
    3,
    1,
    '',
  ],
  [
    41,
    'spaces after the address',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':3  <CR>',
    3,
    1,
    '',
  ],
  [
    42,
    'a space inside a chain',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':2 + 2<CR>',
    5,
    2,
    '',
  ],
  [
    43,
    'a number past 2^31 goes to the last line',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':4294967297<CR>',
    6,
    1,
    '',
  ],
  [
    44,
    'j after :N keeps the landing column (tab line)',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [1, 3],
    ':5<CR>j',
    6,
    3,
    '',
  ],
  [
    45,
    'k after :N keeps the landing column (indented)',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [1, 1],
    ':2<CR>k',
    1,
    5,
    '',
  ],
  [
    46,
    'j after :N on an empty line lands col 1 then keeps it',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [1, 1],
    ':4<CR>j',
    5,
    1,
    '',
  ],
  [
    47,
    'j after :7 onto the last line',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [1, 1],
    ':7<CR>j',
    8,
    1,
    '',
  ],
  [
    48,
    'j keeps the first non-blank column after a long line start',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [7, 10],
    ':2<CR>j',
    3,
    5,
    '',
  ],
  [
    49,
    'k after a failed relative keeps the old column',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [7, 10],
    ':+9<CR>k',
    7,
    1,
    '',
  ],
  [
    50,
    'two jumps in a row',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':3<CR>:5<CR>',
    5,
    2,
    '',
  ],
  [
    51,
    'jump back with a chain from the new place',
    'one\n  two\nthree\n\n\tfive\nsix',
    [1, 1],
    ':4<CR>:-2<CR>',
    2,
    3,
    '',
  ],
  [
    52,
    'a jump from the middle of a line goes to the indent, not the column',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [7, 9],
    ':2<CR>',
    2,
    5,
    '',
  ],
  [53, 'a wide letters note', '世界\n  😀 x\nabc', [1, 2], ':2<CR>', 2, 3, ''],
  [54, 'on a note of one line', 'solo', [1, 3], ':5<CR>', 1, 1, ''],
  [55, 'on a note of one line, + fails', 'solo', [1, 3], ':+<CR>', 1, 1, ''],
  [56, 'an empty note', '', [1, 1], ':3<CR>', 1, 1, ''],
  [57, 'lines of only blanks', '\n\n  \nx', [1, 1], ':3<CR>', 3, 2, ''],
  [
    58,
    'a line of only spaces lands on its last space',
    'alpha beta\n    indented line\nshort\n\n\t\ttabs here\n   \nlast line here\nx',
    [1, 1],
    ':6<CR>',
    6,
    3,
    '',
  ],
  [
    59,
    '-2 from line 2 is line 0: line 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [2, 1],
    ':-2<CR>',
    1,
    1,
    '',
  ],
  [
    60,
    '-3 from line 2 is E16',
    'one\n  two\nthree\n\n\tfive\nsix',
    [2, 1],
    ':-3<CR>',
    2,
    1,
    'E16: Invalid range',
  ],
  [
    61,
    '-3 from line 3 is line 0: line 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [3, 2],
    ':-3<CR>',
    1,
    1,
    '',
  ],
  [
    62,
    '1- is line 0: line 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [4, 1],
    ':1-<CR>',
    1,
    1,
    '',
  ],
  [
    63,
    '$-99 is E16',
    'one\n  two\nthree\n\n\tfive\nsix',
    [4, 1],
    ':$-99<CR>',
    4,
    1,
    'E16: Invalid range',
  ],
  [
    64,
    '$-5 from a six line note is line 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [4, 1],
    ':$-5<CR>',
    1,
    1,
    '',
  ],
  [
    65,
    '$-6 is line 0: line 1',
    'one\n  two\nthree\n\n\tfive\nsix',
    [4, 1],
    ':$-6<CR>',
    1,
    1,
    '',
  ],
  [
    66,
    '$-7 is E16',
    'one\n  two\nthree\n\n\tfive\nsix',
    [4, 1],
    ':$-7<CR>',
    4,
    1,
    'E16: Invalid range',
  ],
  [
    67,
    'E16 keeps the column j and k keep',
    'abcdefghijklmnopqrstuvwxyz\n\t\txyz\n  abcdefghijklmnopqrstuvwxyz\nabcdefghijklmnopqrstuvwxyz',
    [1, 20],
    ':-9<CR>j',
    2,
    5,
    '',
  ],
  [
    68,
    'j after :N onto an indent of two tabs keeps the tab column',
    'abcdefghijklmnopqrstuvwxyz\n\t\txyz\n  abcdefghijklmnopqrstuvwxyz\nabcdefghijklmnopqrstuvwxyz',
    [1, 20],
    ':2<CR>j',
    3,
    17,
    '',
  ],
  [
    69,
    'k after :N onto an indent of two tabs keeps the tab column',
    'abcdefghijklmnopqrstuvwxyz\n\t\txyz\n  abcdefghijklmnopqrstuvwxyz\nabcdefghijklmnopqrstuvwxyz',
    [4, 20],
    ':2<CR>k',
    1,
    17,
    '',
  ],
  [
    70,
    'j after :N onto an indent of two spaces',
    'abcdefghijklmnopqrstuvwxyz\n\t\txyz\n  abcdefghijklmnopqrstuvwxyz\nabcdefghijklmnopqrstuvwxyz',
    [1, 20],
    ':3<CR>j',
    4,
    3,
    '',
  ],
  [
    71,
    'k after :N onto an indent of two spaces',
    'abcdefghijklmnopqrstuvwxyz\n\t\txyz\n  abcdefghijklmnopqrstuvwxyz\nabcdefghijklmnopqrstuvwxyz',
    [4, 20],
    ':3<CR>k',
    2,
    1,
    '',
  ],
  [
    72,
    'j after $ then :N: the old end column is gone',
    'abcdefghijklmnopqrstuvwxyz\n\t\txyz\n  abcdefghijklmnopqrstuvwxyz\nabcdefghijklmnopqrstuvwxyz',
    [1, 5],
    '$:3<CR>j',
    4,
    3,
    '',
  ],
  [
    73,
    'j after :. on a long line',
    'abcdefghijklmnopqrstuvwxyz\n\t\txyz\n  abcdefghijklmnopqrstuvwxyz\nabcdefghijklmnopqrstuvwxyz',
    [1, 20],
    ':.<CR>j',
    2,
    1,
    '',
  ],
]

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
  '<C-[>': 'Control+[',
  '<C-c>': 'Control+c',
  '<C-u>': 'Control+u',
  '<C-v>': 'Control+v',
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

const rowsPerTest = 20

for (let from = 0; from < addressRows.length; from += rowsPerTest) {
  const rows = addressRows.slice(from, from + rowsPerTest)
  test(
    `: line addresses as in Vim (rows ${rows.map(row => row[0]).join(', ')})`,
    { tag: '@vim-table' },
    async ({ nullpad }) => {
      for (const [id, why, text, at, keys, line, column, notice] of rows) {
        await begin(nullpad, text, at)
        await play(nullpad, keys)
        const label = `row ${id} (${why}) keys ${keys} at ${at.join(':')}`
        expect.soft(await nullpad.text(), `${label}: text`).toBe(text)
        expect
          .soft(await nullpad.status(), `${label}: line and column`)
          .toMatchObject({ line, column })
        expect.soft(await modeOf(nullpad), `${label}: mode`).toBe('NORMAL')
        expect
          .soft(await promptOf(nullpad), `${label}: no prompt is open`)
          .toBeNull()
        expect.soft(await noticeOf(nullpad), `${label}: notice`).toBe(notice)
      }
    },
  )
}

test(': opens a prompt in the status line that shows what is typed, and the mode stays NORMAL', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  expect(await promptOf(nullpad), 'no prompt before :').toBeNull()
  await play(nullpad, ':')
  expect(await promptOf(nullpad), ': alone').toBe(':')
  expect(await modeOf(nullpad), 'NORMAL while the prompt is open').toBe(
    'NORMAL',
  )
  await play(nullpad, '2')
  expect(await promptOf(nullpad), 'typed text follows the colon').toBe(':2')
  expect(await nullpad.status(), 'nothing moves until Enter').toMatchObject({
    line: 1,
    column: 1,
  })
  await play(nullpad, '<Left>X<Home>Y<End>Z')
  expect(await promptOf(nullpad), 'Left, Home and End edit as in search').toBe(
    ':YX2Z',
  )
  await play(nullpad, '<C-u>')
  expect(await promptOf(nullpad), 'Ctrl-U empties it and it stays open').toBe(
    ':',
  )
  await play(nullpad, '1<Tab>2')
  expect(await promptOf(nullpad), 'Tab types a tab').toBe(':1\t2')
  await play(nullpad, '<Esc>')
  expect(await promptOf(nullpad), 'Esc closes it').toBeNull()
})

test('a paste into the : prompt takes the text up to its first line break', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, ':')
  await nullpad.paste('3\nx')
  expect(await promptOf(nullpad), 'the first line only').toBe(':3')
  expect(await nullpad.text(), 'the note is not touched').toBe(noteB)
  await play(nullpad, '<CR>')
  expect(await nullpad.status(), 'the pasted address ran').toMatchObject({
    line: 3,
    column: 1,
  })
})

for (const [name, keys] of [
  ['Esc', '<Esc>'],
  ['Ctrl-[', '<C-[>'],
  ['Ctrl-C', '<C-c>'],
] as const) {
  test(`${name} closes the : prompt and runs nothing`, async ({ nullpad }) => {
    await begin(nullpad, noteB, [1, 1])
    await play(nullpad, `:3${keys}`)
    await expectUntouched(nullpad, `:3 then ${name}`, noteB, 1, 1)
    expect(await pendingOf(nullpad), 'nothing pending').toBe('')
    expect(await noticeOf(nullpad), 'no notice').toBe('')
    await play(nullpad, 'x')
    expect(await nullpad.text(), 'the next key runs alone').toBe(noteB.slice(1))
  })
}

test('Backspace on an empty : prompt closes it, with text it deletes and the prompt stays', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, ':3<BS>')
  expect(await promptOf(nullpad), 'the empty prompt stays').toBe(':')
  await play(nullpad, '<BS>')
  await expectUntouched(nullpad, 'Backspace on the empty prompt', noteB, 1, 1)
  await play(nullpad, ':<Del>')
  await expectUntouched(nullpad, 'Delete on the empty prompt', noteB, 1, 1)
  expect(await noticeOf(nullpad), 'no notice').toBe('')
})

test('Enter on an empty : line only closes the prompt', async ({ nullpad }) => {
  await begin(nullpad, noteB, [2, 5])
  await play(nullpad, ':<CR>')
  await expectUntouched(nullpad, 'empty line', noteB, 2, 5)
  expect(await noticeOf(nullpad), 'no notice for an empty line').toBe('')
  await play(nullpad, ': : <CR>')
  await expectUntouched(nullpad, 'spaces and colons only', noteB, 2, 5)
  expect(await noticeOf(nullpad), 'no notice for colons and spaces').toBe('')
})

test('a click on the text closes the : prompt and moves the cursor there, with no command run', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, ':4')
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
  expect(await noticeOf(nullpad), 'nothing ran').toBe('')
})

test('Ctrl-E closes the : prompt and opens the read view, Ctrl-P closes it and opens the finder', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, ':3<C-e>')
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
  expect(await modeOf(nullpad), 'READ').toBe('READ')
  await play(nullpad, '<Esc>')
  expect(await nullpad.status(), 'the closed prompt ran nothing').toMatchObject(
    {
      line: 1,
      column: 1,
    },
  )
  await play(nullpad, ':3<C-p>')
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
  expect(await nullpad.finder(), 'the finder is open').not.toBeNull()
})

test('the : history walks with Up and Down, newest first, and is separate from the search history', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, ':2<CR>:3<CR>/four<CR>:')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up: the newest : line, not the search').toBe(
    ':3',
  )
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up again').toBe(':2')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up past the oldest stays').toBe(':2')
  await play(nullpad, '<Down>')
  expect(await promptOf(nullpad), 'Down').toBe(':3')
  await play(nullpad, '<Down>')
  expect(
    await promptOf(nullpad),
    'Down past the newest is what was typed',
  ).toBe(':')
  await play(nullpad, '<Esc>/<Up>')
  expect(await promptOf(nullpad), 'the search history has no : line').toBe(
    '/four',
  )
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'and nothing older').toBe('/four')
  await play(nullpad, '<Esc>')
})

test('text typed before Up is a prefix in the : history, and a line closed with Esc is in it', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, ':2<CR>:$<CR>:+1<CR>')
  await play(nullpad, ':$<Up>')
  expect(await promptOf(nullpad), 'a prefix that is the whole entry').toBe(':$')
  await play(nullpad, '<Esc>:+<Up>')
  expect(await promptOf(nullpad), 'prefix +').toBe(':+1')
  await play(nullpad, '<Esc>:x<Up>')
  expect(await promptOf(nullpad), 'no entry starts with x').toBe(':x')
  await play(nullpad, '<Esc>:2<Up><Down>')
  expect(await promptOf(nullpad), 'Up then Down brings the text back').toBe(
    ':2',
  )
  await play(nullpad, '<Esc>:4<Esc>:<Up>')
  expect(
    await promptOf(nullpad),
    'a line closed with Esc is in the history',
  ).toBe(':4')
  await play(nullpad, '<Esc>')
})

test('an unknown command gives E492 with the line as typed and changes nothing', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [2, 5])
  for (const [typed, shown] of [
    ['foo', 'foo'],
    ['  ::q', 'q'],
    ['wq', 'wq'],
    ['x', 'x'],
    ['noh', 'noh'],
    ['s/two/2/', 's/two/2/'],
    ['d', 'd'],
    ['1,3d', '1,3d'],
    ["'a", "'a"],
    ['/four/', '/four/'],
    ['3foo bar', '3foo bar'],
  ] as const) {
    await play(nullpad, `:${typed}<CR>`)
    const label = `:${typed}`
    expect(await noticeOf(nullpad), `${label}: notice`).toBe(
      `E492: Not an editor command: ${shown}`,
    )
    await expectUntouched(nullpad, label, noteB, 2, 5)
  }
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'no register was written').toBe(noteB)
})

test('the notice clears on the next act', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  await play(nullpad, ':foo<CR>')
  expect(await noticeOf(nullpad), 'the notice shows').toBe(
    'E492: Not an editor command: foo',
  )
  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears it').toBe('')
})

test('a count before : is dropped and the prompt opens empty', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '3:')
  expect(await promptOf(nullpad), 'an empty prompt, no .,.+2').toBe(':')
  expect(await pendingOf(nullpad), 'the count went').toBe('')
  await play(nullpad, '2<CR>')
  expect(await nullpad.status(), ':2 runs with no count').toMatchObject({
    line: 2,
    column: 1,
  })
  expect(await noticeOf(nullpad), 'no notice').toBe('')
})

test('d: opens nothing, drops the pending keys and the next key runs alone', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, 'd:')
  expect(await promptOf(nullpad), 'no prompt after an operator').toBeNull()
  expect(await pendingOf(nullpad), 'd is dropped').toBe('')
  expect(await nullpad.text(), 'nothing deleted').toBe(noteB)
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x runs alone').toBe(noteB.slice(1))
})

for (const [name, keys, mode] of [
  ['v', 'v', 'VISUAL'],
  ['V', 'V', 'V-LINE'],
  ['Ctrl-V', '<C-v>', 'V-BLOCK'],
] as const) {
  test(`: in ${name} does nothing`, async ({ nullpad }) => {
    await begin(nullpad, noteB)
    await play(nullpad, `${keys}l:`)
    expect(await promptOf(nullpad), 'no prompt').toBeNull()
    expect(await modeOf(nullpad), 'the mode stays').toBe(mode)
    expect(await nullpad.text(), 'the note is untouched').toBe(noteB)
    await play(nullpad, '<Esc>')
    expect(await modeOf(nullpad), 'Esc leaves').toBe('NORMAL')
  })
}

test('with vim off and in INSERT : types a colon', async ({ nullpad }) => {
  await begin(nullpad, 'abc')
  await play(nullpad, 'i:')
  expect(await promptOf(nullpad), 'no prompt in INSERT').toBeNull()
  expect(await nullpad.text(), 'the colon is text').toBe(':abc')
  await play(nullpad, '<Esc>')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  await play(nullpad, ':')
  expect(await promptOf(nullpad), 'no prompt with vim off').toBeNull()
  expect(await nullpad.text(), 'the colon is text').toBe('::abc')
})

test(':N is a motion: u undoes the change before it, . repeats it, and the registers are as they were', async ({
  nullpad,
}) => {
  const note = 'one two\nthree\nfour'
  await begin(nullpad, note)
  await play(nullpad, 'x:3<CR>')
  expect(await nullpad.text(), 'the jump changed nothing').toBe(
    'ne two\nthree\nfour',
  )
  await play(nullpad, '.')
  expect(await nullpad.text(), '. repeats the x on the new line').toBe(
    'ne two\nthree\nour',
  )
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'u undoes the repeat, not the jump').toBe(
    'ne two\nthree\nfour',
  )
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'the second u undoes the first x').toBe(note)
  await begin(nullpad, note)
  await play(nullpad, 'x:2<CR>p')
  expect(await nullpad.text(), 'the register still holds the o').toBe(
    'ne two\ntohree\nfour',
  )
})

test(':N shows the cursor line on screen in a long note', async ({
  nullpad,
}) => {
  const note = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n')
  await begin(nullpad, note)
  await play(nullpad, ':150<CR>')
  expect(await nullpad.status(), 'the cursor').toMatchObject({
    line: 150,
    column: 1,
  })
  const screen = await nullpad.screen()
  expect(
    screen.rows.some(row => row.number === '150'),
    'line 150 is drawn',
  ).toBe(true)
  await play(nullpad, ':$<CR>')
  expect(
    (await nullpad.screen()).rows.some(row => row.number === '200'),
    'the last line is drawn',
  ).toBe(true)
})

test('a number of any length goes to the last line and neither hangs nor throws', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, `:${'9'.repeat(40)}<CR>`)
  expect(
    await nullpad.status(),
    'a 40 digit number is the last line',
  ).toMatchObject({
    line: 4,
    column: 1,
  })
  expect(await promptOf(nullpad), 'closed').toBeNull()
})

test(':w saves now, reads written, and with nothing unsaved reads written at once', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, ':w<CR>')
  expect(await noticeOf(nullpad), 'nothing unsaved').toBe('written')
  expect(await promptOf(nullpad), 'closed').toBeNull()
  await expectUntouched(nullpad, ':w', noteB, 1, 1)
  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the notice clears').toBe('')
  await play(nullpad, ':write<CR>')
  expect(await noticeOf(nullpad), ':write is :w').toBe('written')
  await play(nullpad, ':  w  <CR>')
  expect(await noticeOf(nullpad), 'spaces around :w').toBe('written')
})

test(':w puts the edit in the store before the 800 ms wait: another tab opens it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc')
  await play(nullpad, 'x:w<CR>')
  await expect
    .poll(() => noticeOf(nullpad), { message: 'written shows once it landed' })
    .toBe('written')
  const started = Date.now()
  const other = await openTab(nullpad.page)
  expect(await other.text(), 'a second tab opens the note with the edit').toBe(
    'bc',
  )
  expect(
    Date.now() - started,
    'the second tab read it before the autosave wait could have saved it',
  ).toBeLessThan(2000)
  await other.page.close()
})

for (const [typed, shown] of [
  ['w foo', 'w foo'],
  ['w!', 'w!'],
  ['w >>', 'w >>'],
  ['write foo ', 'write foo'],
  ['  w  foo  bar', 'w  foo  bar'],
] as const) {
  test(`:${typed} is not supported`, async ({ nullpad }) => {
    await begin(nullpad, noteB, [2, 3])
    await play(nullpad, `:${typed}<CR>`)
    expect(await noticeOf(nullpad), 'notice').toBe(`not supported: ${shown}`)
    await expectUntouched(nullpad, `:${typed}`, noteB, 2, 3)
  })
}
