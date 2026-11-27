import {
  type JumpLabel,
  type JumpMatch,
  type Nullpad,
  expect,
  numberedLines,
  settle,
  startVimRow,
  test,
} from './nullpad'

const begin = async (
  nullpad: Nullpad,
  text: string,
  at: readonly [number, number] = [1, 1],
) => {
  await startVimRow(nullpad, text, at[0], at[1])
}

const keys = async (nullpad: Nullpad, text: string) => {
  for (const key of [...text]) {
    await nullpad.page.keyboard.press(key)
  }
  await settle(nullpad.page)
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const pending = nullpad.page.locator('.status .pending')
  return (await pending.count()) === 0 ? '' : (await pending.innerText()).trim()
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const expectPending = (nullpad: Nullpad, expected: string, label: string) =>
  expect.poll(() => pendingOf(nullpad), { message: label }).toBe(expected)

const expectJumping = (nullpad: Nullpad, expected: boolean, label: string) =>
  expect.poll(() => nullpad.isJumping(), { message: label }).toBe(expected)

const drawnOf = (labels: ReadonlyArray<JumpLabel>) =>
  [...labels]
    .sort((a, b) => a.line - b.line || a.column - b.column)
    .map(({ label, line, column }) => [label, line, column])

const matchesOf = (matches: ReadonlyArray<JumpMatch>) =>
  matches.map(({ line, from, to }) => `${line},${from},${to}`).sort()

const alphabet = 'asdfghjklqwertyuiopzxcvbnm'
const allLabels = alphabet + alphabet.toUpperCase()

const plain = 'abc xyz def'

test('s in NORMAL starts a jump: pending reads s, the surface is jumping, the mode stays', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 's')
  await expectPending(nullpad, 's', 'after s')
  await expectJumping(nullpad, true, 'the surface has .jumping')
  expect(await modeOf(nullpad), 'mode after s').toBe('NORMAL')
})

for (const [name, open, mode] of [
  ['VISUAL', 'v', 'VISUAL'],
  ['V-LINE', 'V', 'V-LINE'],
  ['V-BLOCK', 'Control+v', 'V-BLOCK'],
] as const) {
  test(`s in ${name} starts a jump and the mode stays ${mode}`, async ({
    nullpad,
  }) => {
    await begin(nullpad, plain)
    await nullpad.press(open)
    expect(await modeOf(nullpad), `${name} before s`).toBe(mode)
    await keys(nullpad, 's')
    await expectPending(nullpad, 's', `pending after s in ${name}`)
    await expectJumping(nullpad, true, `jumping in ${name}`)
    expect(await modeOf(nullpad), `${name} after s`).toBe(mode)
  })
}

for (const prefix of ['d', 'c', 'y']) {
  test(`s after ${prefix} starts a jump: pending reads ${prefix}s`, async ({
    nullpad,
  }) => {
    await begin(nullpad, plain)
    await keys(nullpad, `${prefix}s`)
    await expectPending(nullpad, `${prefix}s`, `pending after ${prefix}s`)
    await expectJumping(nullpad, true, `jumping after ${prefix}s`)
    expect(await nullpad.text(), `text after ${prefix}s`).toBe(plain)
  })
}

test('typed letters build the pattern in pending and the cursor does not move', async ({
  nullpad,
}) => {
  await begin(nullpad, plain, [1, 2])
  await keys(nullpad, 'sxy')
  await expectPending(nullpad, 'sxy', 'pattern xy after s')
  expect(await nullpad.status(), 'cursor while typing').toMatchObject({
    line: 1,
    column: 2,
  })
  await nullpad.press('Escape')
  await keys(nullpad, 'dsxy')
  await expectPending(nullpad, 'dsxy', 'pattern after an operator')
})

test('one typed text of several letters and a one-letter IME commit extend the pattern', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 's')
  await nullpad.page.keyboard.insertText('xy')
  await settle(nullpad.page)
  await expectPending(nullpad, 'sxy', 'text of two letters added whole')
  await nullpad.press('Escape')
  await keys(nullpad, 's')
  await nullpad.commit('x')
  await expectPending(nullpad, 'sx', 'one-letter commit added')
})

test('Backspace removes the last letter and on an empty pattern keeps waiting', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'sxy')
  await nullpad.press('Backspace')
  await expectPending(nullpad, 'sx', 'one Backspace')
  await nullpad.press('Backspace')
  await expectPending(nullpad, 's', 'second Backspace')
  await nullpad.press('Backspace')
  await expectPending(nullpad, 's', 'Backspace on empty pattern')
  await expectJumping(nullpad, true, 'still jumping after empty Backspace')
})

for (const key of ['Escape', 'Control+[', 'Control+c']) {
  test(`${key} ends the jump with nothing moved`, async ({ nullpad }) => {
    await begin(nullpad, plain, [1, 3])
    await keys(nullpad, 'sx')
    await nullpad.press(key)
    await expectJumping(nullpad, false, `jumping after ${key}`)
    await expectPending(nullpad, '', `pending after ${key}`)
    expect(await nullpad.status(), `cursor after ${key}`).toMatchObject({
      line: 1,
      column: 3,
    })
    expect(await nullpad.text(), `text after ${key}`).toBe(plain)
    expect(await modeOf(nullpad), `mode after ${key}`).toBe('NORMAL')
  })
}

test('Esc drops the pending operator: the next x deletes one letter only', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'dsxy')
  await nullpad.press('Escape')
  await expectPending(nullpad, '', 'pending after Esc')
  await keys(nullpad, 'x')
  expect(await nullpad.text(), 'x after the dropped operator').toBe(
    'bc xyz def',
  )
})

test('Esc in VISUAL ends the jump and the selection stays', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'vlls')
  await nullpad.press('Escape')
  await expectJumping(nullpad, false, 'jumping after Esc')
  expect(await modeOf(nullpad), 'mode after Esc').toBe('VISUAL')
  expect(await nullpad.selection(), 'selection after Esc').toBe('abc')
})

for (const key of [
  'ArrowRight',
  'Home',
  'End',
  'Tab',
  'Delete',
  'PageDown',
  'Control+x',
]) {
  test(`${key} ends the jump and does nothing else`, async ({ nullpad }) => {
    await begin(nullpad, plain, [1, 5])
    await keys(nullpad, 'sx')
    await nullpad.press(key)
    await expectJumping(nullpad, false, `jumping after ${key}`)
    await expectPending(nullpad, '', `pending after ${key}`)
    expect(await nullpad.text(), `text after ${key}`).toBe(plain)
    expect(await nullpad.status(), `cursor after ${key}`).toMatchObject({
      line: 1,
      column: 5,
    })
    expect(await modeOf(nullpad), `mode after ${key}`).toBe('NORMAL')
  })
}

test('a click ends the jump', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'sx')
  const screen = await nullpad.screen()
  const row = screen.rows[0]
  if (row === undefined) {
    throw new Error('no row drawn')
  }
  await nullpad.click(row.left + 2, row.top + 4)
  await expectJumping(nullpad, false, 'jumping after a click')
  await expectPending(nullpad, '', 'pending after a click')
})

test('Ctrl-E ends the jump and opens the read view; in VISUAL it leaves VISUAL', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'sx')
  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'mode after Ctrl-E').toBe('READ')
  await nullpad.press('Escape')
  await expectJumping(nullpad, false, 'jumping after returning')
  await keys(nullpad, 'vs')
  await nullpad.press('Control+e')
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 'VISUAL left by Ctrl-E').toBe('NORMAL')
  expect(await nullpad.selection(), 'nothing selected').toBe('')
})

test('Ctrl-P ends the jump and opens the finder', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'sx')
  await nullpad.press('Control+p')
  expect(await nullpad.finder(), 'finder is open').not.toBeNull()
  await nullpad.press('Escape')
  await expectJumping(nullpad, false, 'jumping after the finder')
  await expectPending(nullpad, '', 'pending after the finder')
})

test('the vim toggle ends the jump', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'sx')
  await nullpad.press('Control+,')
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  await expectJumping(nullpad, false, 'jumping after the toggle')
  await nullpad.press('Control+,')
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  await expectPending(nullpad, '', 'pending after the toggle')
})

test('a pattern with no match ends the jump silently and swallows that key', async ({
  nullpad,
}) => {
  await begin(nullpad, plain, [1, 2])
  await keys(nullpad, 'sz')
  await expectJumping(nullpad, false, 'jumping after no match')
  await expectPending(nullpad, '', 'z was swallowed, not taken as a command')
  expect(await nullpad.status(), 'cursor after no match').toMatchObject({
    line: 1,
    column: 2,
  })
  expect(await modeOf(nullpad), 'mode after no match').toBe('NORMAL')
  expect(await nullpad.notice(), 'no notice').toBe('')
  await keys(nullpad, 'sq')
  expect(await nullpad.text(), 'q key did nothing').toBe(plain)
})

test('a pattern with no match drops a pending operator and changes nothing', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'dsx')
  await expectPending(nullpad, 'dsx', 'x has matches')
  await nullpad.press('Escape')
  await keys(nullpad, 'dsq')
  await expectJumping(nullpad, false, 'jumping after no match under d')
  await expectPending(nullpad, '', 'operator dropped')
  expect(await nullpad.text(), 'text after no match under d').toBe(plain)
})

test('a pattern with no upper-case letter matches any case', async ({
  nullpad,
}) => {
  await begin(nullpad, 'xx Foo foo FOO')
  await keys(nullpad, 'sfoo')
  expect(matchesOf(await nullpad.jumpMatches()), 'matches of foo').toEqual(
    ['0,3,6', '0,7,10', '0,11,14'].sort(),
  )
})

test('a pattern with an upper-case letter matches exactly', async ({
  nullpad,
}) => {
  await begin(nullpad, 'xx Foo foo FOO')
  await keys(nullpad, 'sFo')
  expect(matchesOf(await nullpad.jumpMatches()), 'matches of Fo').toEqual([
    '0,3,5',
  ])
})

test('labels go to matches nearest first, a letter that continues a match is not a label', async ({
  nullpad,
}) => {
  await begin(nullpad, 'ab ac ad ae')
  await keys(nullpad, 'sa')
  expect(
    drawnOf(await nullpad.jumpLabels()),
    'labels over ab ac ad ae',
  ).toEqual([
    ['a', 0, 3],
    ['s', 0, 6],
    ['f', 0, 9],
  ])
})

test('with a lower-case pattern both cases of a continuing letter are out', async ({
  nullpad,
}) => {
  await begin(nullpad, 'xx fa fB')
  await keys(nullpad, 'sf')
  expect(drawnOf(await nullpad.jumpLabels()), 'labels over fa fB').toEqual([
    ['s', 0, 3],
    ['d', 0, 6],
  ])
})

test('on a tie in distance the match after the cursor gets the first label', async ({
  nullpad,
}) => {
  await begin(nullpad, 'a a a', [1, 3])
  await keys(nullpad, 'sa')
  expect(drawnOf(await nullpad.jumpLabels()), 'labels over a a a').toEqual([
    ['s', 0, 0],
    ['a', 0, 4],
  ])
  expect(
    matchesOf(await nullpad.jumpMatches()).includes('0,2,3'),
    'the cursor own match is highlighted',
  ).toBe(true)
})

test('fewer lines away comes first, then the match after the cursor on a tie', async ({
  nullpad,
}) => {
  await begin(nullpad, 'k a\nk a\nk a', [2, 1])
  await keys(nullpad, 'sa')
  expect(
    drawnOf(await nullpad.jumpLabels()),
    'labels over three lines',
  ).toEqual([
    ['d', 0, 2],
    ['a', 1, 2],
    ['s', 2, 2],
  ])
})

test('matches past 52 get no label and labels run lower case then upper case', async ({
  nullpad,
}) => {
  await begin(nullpad, `x${' a'.repeat(60)}`)
  await keys(nullpad, 'sa')
  const labels = await nullpad.jumpLabels()
  expect(labels.length, 'label count').toBe(52)
  expect(
    [...labels]
      .sort((a, b) => a.column - b.column)
      .map(item => item.label)
      .join(''),
    'labels in nearness order',
  ).toBe(allLabels)
  await keys(nullpad, 'A')
  expect(
    await nullpad.status(),
    'upper-case A jumps to the 27th match',
  ).toMatchObject({ line: 1, column: 55 })
})

test('a lower-case label stays on its match while the pattern grows', async ({
  nullpad,
}) => {
  await begin(nullpad, 'x fa fo fb fo')
  await keys(nullpad, 'sf')
  expect(drawnOf(await nullpad.jumpLabels()), 'labels for f').toEqual([
    ['s', 0, 2],
    ['d', 0, 5],
    ['f', 0, 8],
    ['g', 0, 11],
  ])
  await keys(nullpad, 'o')
  expect(drawnOf(await nullpad.jumpLabels()), 'labels for fo').toEqual([
    ['d', 0, 5],
    ['g', 0, 11],
  ])
})

test('pressing a label jumps to its match and ends the jump', async ({
  nullpad,
}) => {
  await begin(nullpad, 'x fa fo fb fo')
  await keys(nullpad, 'sfg')
  expect(await nullpad.status(), 'cursor on the g match').toMatchObject({
    line: 1,
    column: 12,
  })
  await expectJumping(nullpad, false, 'jumping after a label')
  await expectPending(nullpad, '', 'pending after a label')
  expect(await nullpad.jumpLabels(), 'no labels drawn after').toEqual([])
  expect(await nullpad.jumpMatches(), 'no matches drawn after').toEqual([])
})

test('a label is drawn over the cell right after its match, at a line end too', async ({
  nullpad,
}) => {
  await begin(nullpad, 'x a b\nxa')
  await keys(nullpad, 'sa')
  const screen = await nullpad.screen()
  const labels = await nullpad.jumpLabels()
  expect(labels.length, 'two labels').toBe(2)
  for (const item of labels) {
    const row = screen.rows[item.line]
    if (row === undefined) {
      throw new Error(`no row for line ${item.line}`)
    }
    expect(item.from, `cell of the label on line ${item.line}`).toBe(
      item.column + 1,
    )
    expect(
      Math.abs(item.left - (row.left + item.from * screen.cell)),
      `left of the label on line ${item.line}`,
    ).toBeLessThan(2)
    expect(
      Math.abs(item.top - row.top),
      `row of the label on line ${item.line}`,
    ).toBeLessThan(2)
    expect(
      Math.abs(item.width - screen.cell),
      `width of the label on line ${item.line}`,
    ).toBeLessThan(2)
  }
})

test('a label over a wide letter covers it whole and over a tab one cell', async ({
  nullpad,
}) => {
  await begin(nullpad, 'x 漢字')
  await keys(nullpad, 's')
  await nullpad.page.keyboard.insertText('漢')
  await settle(nullpad.page)
  const screen = await nullpad.screen()
  const [wide] = await nullpad.jumpLabels()
  expect(wide?.from, 'label starts at the wide letter after').toBe(3)
  expect(wide?.width ?? 0, 'label width over a wide letter').toBeGreaterThan(
    screen.cell * 1.5,
  )
  await nullpad.press('Escape')
  await begin(nullpad, 'x a\tb')
  await keys(nullpad, 'sa')
  const [tab] = await nullpad.jumpLabels()
  expect(tab?.from, 'label starts at the tab').toBe(3)
  expect(
    Math.abs((tab?.width ?? 0) - screen.cell),
    'label width over a tab',
  ).toBeLessThan(2)
})

test('matches and labels count letters: emoji and the jump column', async ({
  nullpad,
}) => {
  await begin(nullpad, '\u{1f600} x \u{1f600} x')
  await keys(nullpad, 'sx')
  expect(matchesOf(await nullpad.jumpMatches()), 'matches after emoji').toEqual(
    ['0,3,4', '0,8,9'].sort(),
  )
  expect(drawnOf(await nullpad.jumpLabels()), 'labels after emoji').toEqual([
    ['a', 0, 3],
    ['s', 0, 8],
  ])
  await keys(nullpad, 's')
  expect(await nullpad.status(), 'cursor on the second x').toMatchObject({
    line: 1,
    column: 7,
  })
})

test('NORMAL jump lands on the first letter and j and k keep that column', async ({
  nullpad,
}) => {
  await begin(nullpad, `${plain}\n0123456789012`)
  await keys(nullpad, 'sxy')
  await nullpad.press('Enter')
  expect(await nullpad.status(), 'cursor on the match').toMatchObject({
    line: 1,
    column: 5,
  })
  await keys(nullpad, 'j')
  expect(await nullpad.status(), 'j keeps the match column').toMatchObject({
    line: 2,
    column: 5,
  })
})

test('Enter jumps to the first match after the cursor, wrapping to the first on screen', async ({
  nullpad,
}) => {
  await begin(nullpad, 'fo fo fo', [1, 4])
  await keys(nullpad, 'sfo')
  await nullpad.press('Enter')
  expect(await nullpad.status(), 'Enter goes forward').toMatchObject({
    column: 7,
  })
  await keys(nullpad, 'sfo')
  await nullpad.press('Enter')
  expect(await nullpad.status(), 'Enter wraps').toMatchObject({ column: 1 })
})

test('Enter with an empty pattern ends the jump', async ({ nullpad }) => {
  await begin(nullpad, plain, [1, 3])
  await keys(nullpad, 's')
  await nullpad.press('Enter')
  await expectJumping(nullpad, false, 'jumping after empty Enter')
  await expectPending(nullpad, '', 'pending after empty Enter')
  expect(await nullpad.status(), 'cursor after empty Enter').toMatchObject({
    column: 3,
  })
})

test('a match at the cursor is highlighted with no label and Enter then ends the jump', async ({
  nullpad,
}) => {
  await begin(nullpad, 'foo')
  await keys(nullpad, 'sfo')
  await expectJumping(nullpad, true, 'jump stays on')
  expect(await nullpad.jumpLabels(), 'no label for the cursor match').toEqual(
    [],
  )
  expect(
    matchesOf(await nullpad.jumpMatches()),
    'cursor match highlighted',
  ).toEqual(['0,0,2'])
  await nullpad.press('Enter')
  await expectJumping(nullpad, false, 'Enter ended it')
  expect(await nullpad.status(), 'nothing moved').toMatchObject({
    line: 1,
    column: 1,
  })
})

test('a jump is no undo step: u after it undoes the change before it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\nthree')
  await keys(nullpad, 'x')
  expect(await nullpad.text(), 'after x').toBe('ne two\nthree')
  await keys(nullpad, 'sth')
  await nullpad.press('Enter')
  expect(await nullpad.status(), 'jumped').toMatchObject({
    line: 2,
    column: 1,
  })
  await keys(nullpad, 'u')
  expect(await nullpad.text(), 'u undid the x').toBe('one two\nthree')
})

test('a jump leaves dot as it was', async ({ nullpad }) => {
  await begin(nullpad, 'one two\nthree')
  await keys(nullpad, 'x')
  await keys(nullpad, 'sth')
  await nullpad.press('Enter')
  await keys(nullpad, '.')
  expect(await nullpad.text(), 'dot repeats x at the new place').toBe(
    'ne two\nhree',
  )
})

test('a jump leaves the registers as they were', async ({ nullpad }) => {
  await begin(nullpad, 'one two\nthree')
  await keys(nullpad, 'yw')
  await keys(nullpad, 'sth')
  await nullpad.press('Enter')
  await keys(nullpad, 'P')
  expect(await nullpad.text(), 'register still holds the yank').toBe(
    'one two\none three',
  )
})

for (const [name, open, keysAfter, expected] of [
  ['VISUAL', 'v', 'sxy', 'abc x'],
  ['V-LINE', 'V', 'sxy', 'abc xyz def\n'],
] as const) {
  test(`in ${name} the cursor end jumps and the anchor stays`, async ({
    nullpad,
  }) => {
    await begin(nullpad, plain)
    await keys(nullpad, open)
    await keys(nullpad, keysAfter)
    await nullpad.press('Enter')
    expect(await modeOf(nullpad), `${name} stays`).toBe(name)
    expect(await nullpad.selection(), `${name} selection`).toBe(expected)
  })
}

test('in V-BLOCK the cursor corner jumps', async ({ nullpad }) => {
  await begin(nullpad, 'abcd\nefgh')
  await nullpad.press('Control+v')
  await keys(nullpad, 'sg')
  await nullpad.press('Enter')
  expect(await modeOf(nullpad), 'mode').toBe('V-BLOCK')
  expect(await nullpad.selection(), 'block selection').toBe('abc\nefg')
})

test('d takes the range from the cursor through the first letter of a match after it', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'dsxya')
  expect(await nullpad.text(), 'text after dsxy').toBe('yz def')
  expect(await modeOf(nullpad), 'mode after d').toBe('NORMAL')
})

test('d takes the range from a match before the cursor through the cursor letter', async ({
  nullpad,
}) => {
  await begin(nullpad, plain, [1, 9])
  await keys(nullpad, 'dsxya')
  expect(await nullpad.text(), 'text after backward dsxy').toBe('abc ef')
})

test('c after a jump enters INSERT as any change', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'csxya')
  expect(await modeOf(nullpad), 'mode after cs').toBe('INSERT')
  expect(await nullpad.text(), 'text after csxy').toBe('yz def')
})

test('y forward keeps the cursor, y backward puts it on the match', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'ysxya')
  expect(await nullpad.status(), 'cursor after forward ys').toMatchObject({
    column: 1,
  })
  await keys(nullpad, '$p')
  expect(await nullpad.text(), 'forward yank put at the end').toBe(
    'abc xyz defabc x',
  )
  await begin(nullpad, plain, [1, 9])
  await keys(nullpad, 'ysxya')
  expect(await nullpad.status(), 'cursor after backward ys').toMatchObject({
    column: 5,
  })
  await keys(nullpad, 'P')
  expect(await nullpad.text(), 'backward yank is inclusive both ways').toBe(
    'abc xyz dxyz def',
  )
})

test('an operator range is charwise across lines in both directions', async ({
  nullpad,
}) => {
  await begin(nullpad, 'ab cd\nef gh', [1, 4])
  await keys(nullpad, 'dsgha')
  expect(await nullpad.text(), 'forward across lines').toBe('ab h')
  await begin(nullpad, 'ab cd\nef gh', [2, 5])
  await keys(nullpad, 'dscda')
  expect(await nullpad.text(), 'backward across lines').toBe('ab ')
})

test('a register before ds goes to the operator and a count is dropped', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, '2"ads')
  await expectPending(nullpad, '2"ads', 'count and register as typed')
  await keys(nullpad, 'xya')
  expect(await nullpad.text(), 'count did not change the range').toBe('yz def')
  await keys(nullpad, '"aP')
  expect(await nullpad.text(), 'register a holds the deleted text').toBe(plain)
})

test('dot is not changed by ds and u undoes the ds as one change', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'x')
  await keys(nullpad, 'dsxya')
  expect(await nullpad.text(), 'after x and dsxy').toBe('yz def')
  await keys(nullpad, '.')
  expect(await nullpad.text(), 'dot repeats x, not the jump').toBe('z def')
  await keys(nullpad, 'u')
  await keys(nullpad, 'u')
  expect(await nullpad.text(), 'u undoes dot then ds').toBe('bc xyz def')
})

test('only letters on screen are searched', async ({ nullpad }) => {
  await begin(nullpad, numberedLines(200), [3, 1])
  const screen = await nullpad.screen()
  const lastLine = Number(screen.rows.at(-1)?.number)
  expect(lastLine, 'the screen ends before line 100').toBeLessThan(100)
  await keys(nullpad, 'sline 1')
  const lines = (await nullpad.jumpMatches()).map(match => match.line)
  const visible = Array.from({ length: lastLine }, (_, i) => i + 1).filter(n =>
    `line ${n}`.startsWith('line 1'),
  )
  for (const number of visible) {
    expect(lines, `line ${number} on screen is matched`).toContain(number - 1)
  }
  expect(Math.max(...lines), 'no match past the screen').toBeLessThanOrEqual(
    lastLine,
  )
  await nullpad.press('Escape')
  await keys(nullpad, 'sline 150')
  await expectJumping(nullpad, false, 'off-screen word is no match')
})

test('s with the cursor off screen first brings the cursor on screen', async ({
  nullpad,
}) => {
  await begin(nullpad, numberedLines(200))
  await keys(nullpad, 'G')
  await nullpad.wheel(-100000)
  expect(await nullpad.cursor(), 'cursor is off screen before s').toBeNull()
  await keys(nullpad, 's')
  await expectJumping(nullpad, true, 'jumping')
  expect(await nullpad.cursor(), 'cursor on screen after s').not.toBeNull()
})

test('a scroll during the jump changes no match and no label', async ({
  nullpad,
}) => {
  await begin(nullpad, numberedLines(200))
  await keys(nullpad, 'sine 1')
  const before = {
    labels: drawnOf(await nullpad.jumpLabels()),
    matches: matchesOf(await nullpad.jumpMatches()),
  }
  expect(before.matches.length, 'there are matches').toBeGreaterThan(1)
  await nullpad.wheel(600)
  await expectJumping(nullpad, true, 'jump survives the scroll')
  expect(drawnOf(await nullpad.jumpLabels()), 'labels after scroll').toEqual(
    before.labels,
  )
  expect(
    matchesOf(await nullpad.jumpMatches()),
    'matches after scroll',
  ).toEqual(before.matches)
})

test('S keeps substituting the line and s no longer substitutes', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'S')
  expect(await modeOf(nullpad), 'S enters INSERT').toBe('INSERT')
  expect(await nullpad.text(), 'S cleared the line').toBe('')
  await nullpad.press('Escape')
  await keys(nullpad, 'u')
  await keys(nullpad, 's')
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 's then Esc stays NORMAL').toBe('NORMAL')
  expect(await nullpad.text(), 's changed nothing').toBe(plain)
})

test('everything a jump draws goes away when it ends', async ({ nullpad }) => {
  await begin(nullpad, 'x fa fo fb fo')
  await keys(nullpad, 'sf')
  expect(
    (await nullpad.jumpLabels()).length,
    'labels while jumping',
  ).toBeGreaterThan(0)
  expect(
    (await nullpad.jumpMatches()).length,
    'matches while jumping',
  ).toBeGreaterThan(0)
  await nullpad.press('Escape')
  await expectJumping(nullpad, false, 'class removed')
  expect(await nullpad.jumpLabels(), 'labels gone').toEqual([])
  expect(await nullpad.jumpMatches(), 'matches gone').toEqual([])
})
