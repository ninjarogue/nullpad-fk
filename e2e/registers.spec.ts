import {
  type Nullpad,
  expect,
  openFresh,
  settle,
  test,
  startVimRow,
} from './nullpad'
import { type Row, texts, groups } from './vim-rows/registers.ts'

const SAVED = 1500
const ROWS_PER_TEST = 10
const CLIPBOARD_WAIT = 2500
const BLOCKED = 'clipboard blocked, use Ctrl-Shift-V'

const toggle = 'Control+,'

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Tab>': 'Tab',
  '<C-r>': 'Control+r',
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .pending').innerText()
}

const noticeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const notice = nullpad.page.locator('.status .notice')
  return (await notice.count()) === 0 ? '' : (await notice.innerText()).trim()
}

const clipboardOf = (nullpad: Nullpad) =>
  nullpad.page.evaluate(() => navigator.clipboard.readText())

const setClipboard = (nullpad: Nullpad, text: string) =>
  nullpad.page.evaluate(value => navigator.clipboard.writeText(value), text)

const wait = (nullpad: Nullpad, ms = SAVED) => nullpad.page.waitForTimeout(ms)

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of keys.match(/<[A-Za-z-]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
}

const vimOn = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press(toggle)
  await settle(nullpad.page)
}

const placeAt = async (nullpad: Nullpad, line: number, column: number) => {
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', line - 1)
  await nullpad.press('Home')
  await nullpad.press('ArrowRight', column - 1)
}

const untilScreen = async (
  nullpad: Nullpad,
  text: string,
  line: number,
  column: number,
) => {
  const deadline = Date.now() + CLIPBOARD_WAIT
  for (;;) {
    const status = await nullpad.status()
    if (
      (await nullpad.text()) === text &&
      status.line === line &&
      status.column === column
    ) {
      return
    }
    if (Date.now() > deadline) {
      return
    }
    await nullpad.page.waitForTimeout(50)
  }
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  const label = `${row.text} at ${row.at.join(':')}${row.clip === undefined ? '' : ` clipboard ${JSON.stringify(row.clip)}`} keys ${row.keys}`
  await startVimRow(nullpad, texts[row.text], row.at[0], row.at[1])
  if (row.clip !== undefined) {
    await setClipboard(nullpad, row.clip)
  }
  await play(nullpad, row.keys)
  if (row.clip !== undefined) {
    await untilScreen(nullpad, row.after, row.line, row.column)
  }
  expect.soft(await nullpad.text(), `${label}: text`).toBe(row.after)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line: row.line, column: row.column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe('NORMAL')
  if (row.clip !== undefined) {
    expect.soft(await noticeOf(nullpad), `${label}: no notice`).toBe('')
  }
}

for (const group of groups) {
  for (let from = 0; from < group.rows.length; from += ROWS_PER_TEST) {
    const rows = group.rows.slice(from, from + ROWS_PER_TEST)
    test(
      `vim ${group.name} act as in Vim (rows ${from + 1} to ${from + rows.length})`,
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

const begin = async (nullpad: Nullpad, text: string) => {
  await nullpad.paste(text)
  await nullpad.press('Control+Home')
  await vimOn(nullpad)
}

const blocked = async (nullpad: Nullpad) => {
  await expect
    .poll(() => noticeOf(nullpad), {
      message: 'the status line says the clipboard is blocked',
      timeout: 6000,
    })
    .toBe(BLOCKED)
}

test('the status shows the register while it waits, and Esc drops it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc def\nghi')
  await nullpad.press('"')
  expect(await pendingOf(nullpad), 'a quote waits for a name').toBe('"')
  await nullpad.press('a')
  expect(await pendingOf(nullpad), 'the register is named').toBe('"a')
  await nullpad.press('d')
  expect(await pendingOf(nullpad), 'the operator waits with the register').toBe(
    '"ad',
  )
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Esc drops the register').toBe('')
  expect(await nullpad.text(), 'Esc changed nothing').toBe('abc def\nghi')
  expect(await modeOf(nullpad), 'NORMAL after Esc').toBe('NORMAL')

  await play(nullpad, '2"a3d')
  expect(await pendingOf(nullpad), 'counts, register and operator wait').toBe(
    '2"a3d',
  )
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Esc drops all of it').toBe('')
  expect(await nullpad.text(), 'nothing was deleted').toBe('abc def\nghi')
  await play(nullpad, 'x')
  expect(
    await nullpad.text(),
    'the next x is a plain x, with no register',
  ).toBe('bc def\nghi')

  await play(nullpad, '"+')
  expect(await pendingOf(nullpad), 'the clipboard register is named').toBe('"+')
  await nullpad.press('Escape')
  await play(nullpad, '"_')
  expect(await pendingOf(nullpad), 'the black hole is named').toBe('"_')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'nothing pending after Esc').toBe('')

  await play(nullpad, '"!')
  expect(
    await pendingOf(nullpad),
    'a key that names no register drops it',
  ).toBe('')
  expect(await nullpad.text(), 'and changes nothing').toBe('bc def\nghi')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'the next key is a plain command').toBe(
    'c def\nghi',
  )
  await play(nullpad, '"')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'a lone quote and Esc').toBe('')
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
})

test('registers live through another note and through vim off and on', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one\ntwo')
  await play(nullpad, '"ayyj"byiw')
  expect(await nullpad.text(), 'yanks change no text').toBe('one\ntwo')
  expect(await modeOf(nullpad), 'NORMAL after the yanks').toBe('NORMAL')
  await wait(nullpad)

  await startNote(nullpad, 'second')
  expect(await nullpad.text(), 'the second note').toBe('second')
  expect(await modeOf(nullpad), 'NORMAL in the second note').toBe('NORMAL')
  await play(nullpad, '"ap')
  expect(await nullpad.text(), 'a holds the line from the first note').toBe(
    'second\none',
  )
  await play(nullpad, '"bP')
  expect(await nullpad.text(), 'b holds the word from the first note').toBe(
    'second\ntwoone',
  )
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'the unnamed register is the last yank').toBe(
    'second\ntwotwoone',
  )

  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  await nullpad.press('Control+End')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  await play(nullpad, 'gg"ap')
  expect(await nullpad.text(), 'a lived through vim off and on').toBe(
    'second\none\ntwotwoone',
  )
  await play(nullpad, '"bp')
  expect(await nullpad.text(), 'b lived through vim off and on').toBe(
    'second\notwone\ntwotwoone',
  )
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'the unnamed register lived too').toBe(
    'second\notwotwone\ntwotwoone',
  )
})

test('a reload leaves the registers empty', async ({ nullpad }) => {
  await begin(nullpad, 'one\ntwo')
  await play(nullpad, '"ayy"byiwyy')
  expect(await nullpad.text(), 'yanks change no text').toBe('one\ntwo')
  expect(await modeOf(nullpad), 'NORMAL after the yanks').toBe('NORMAL')
  await wait(nullpad)
  await nullpad.reload()
  expect(await modeOf(nullpad), 'vim stays on after a reload').toBe('NORMAL')
  expect(await nullpad.text(), 'the note came back').toBe('one\ntwo')
  await play(nullpad, 'gg"ap')
  expect(await nullpad.text(), 'a is empty after a reload').toBe('one\ntwo')
  await play(nullpad, '"bP')
  expect(await nullpad.text(), 'b is empty after a reload').toBe('one\ntwo')
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'the unnamed register is empty').toBe('one\ntwo')
  await play(nullpad, 'yyp')
  expect(await nullpad.text(), 'a new yank puts as before').toBe(
    'one\none\ntwo',
  )
})

test('"+ and "* write the system clipboard, and the unnamed register has the text too', async ({
  nullpad,
}) => {
  const text = 'first line\nsecond line\nthird line\nfourth line\nfifth line'
  await begin(nullpad, text)
  const written = async (keys: string, expected: string, label: string) => {
    await setClipboard(nullpad, 'SENTINEL')
    await play(nullpad, keys)
    await expect
      .poll(() => clipboardOf(nullpad), {
        message: `${label}: the system clipboard`,
        timeout: 3000,
      })
      .toBe(expected)
    expect(await noticeOf(nullpad), `${label}: no notice`).toBe('')
  }
  await written('"+yy', 'first line\n', '"+yy')
  await written('"+yiw', 'first', '"+yiw')
  expect(await nullpad.text(), 'a yank leaves the text').toBe(text)
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'a plain p puts what "+yiw took').toBe(
    text.replace('first line', 'ffirstirst line'),
  )
  await play(nullpad, 'u')
  await written('j"+dd', 'second line\n', '"+dd')
  expect(await nullpad.text(), '"+dd deleted the line').toBe(
    'first line\nthird line\nfourth line\nfifth line',
  )
  await written('"+x', 't', '"+x')
  expect(await nullpad.text(), '"+x deleted a letter').toBe(
    'first line\nhird line\nfourth line\nfifth line',
  )
  await written('"*yy', 'hird line\n', '"*yy')
  await play(nullpad, 'jp')
  expect(await nullpad.text(), 'the unnamed register has the line').toBe(
    'first line\nhird line\nfourth line\nhird line\nfifth line',
  )
  await written('"+yw', 'hird ', '"+yw')
})

test('"+yy then "+p, and "*yy then "+p, put the line back through the system clipboard', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one\ntwo')
  await setClipboard(nullpad, 'SENTINEL')
  await play(nullpad, '"+yy')
  await expect
    .poll(() => clipboardOf(nullpad), { message: '"+yy wrote the line' })
    .toBe('one\n')
  await play(nullpad, 'j"+p')
  await expect
    .poll(() => nullpad.text(), { message: '"+p put the line "+yy took' })
    .toBe('one\ntwo\none')
  await play(nullpad, '"*yyG"+p')
  await expect
    .poll(() => nullpad.text(), { message: '"*yy and "+p are one clipboard' })
    .toBe('one\ntwo\none\none')
  await play(nullpad, 'ggjyy"+p')
  await expect
    .poll(() => nullpad.text(), { message: 'a plain yy did not change it' })
    .toBe('one\ntwo\none\none\none')
})

test('a plain y, d and p never touch the system clipboard, and Ctrl-V still pastes', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc\ndef\nghi')
  await setClipboard(nullpad, 'KEEP')
  await play(nullpad, 'yyjddp"ayyk"_ddP')
  await nullpad.page.waitForTimeout(400)
  expect(await clipboardOf(nullpad), 'the system clipboard is as it was').toBe(
    'KEEP',
  )
  expect(await nullpad.text(), 'plain commands ran on the registers').toBe(
    'abc\ndef\ndef',
  )
  expect(await noticeOf(nullpad), 'no notice').toBe('')
  await nullpad.paste('PP')
  expect(
    await nullpad.text(),
    'Ctrl-V in NORMAL pastes the clipboard text',
  ).toBe('abc\nPPdef\ndef')
  expect(await modeOf(nullpad), 'still NORMAL after Ctrl-V').toBe('NORMAL')
})

test('a dot after "+p puts what the clipboard holds then', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\nthree')
  await setClipboard(nullpad, 'AA')
  await play(nullpad, '"+p')
  await expect
    .poll(() => nullpad.text(), { message: '"+p put AA' })
    .toBe('oAAne two\nthree')
  await setClipboard(nullpad, 'BB')
  await play(nullpad, '.')
  await expect
    .poll(() => nullpad.text(), { message: 'dot put BB, not AA' })
    .toBe('oAABBne two\nthree')

  await setClipboard(nullpad, 'L1\n')
  await play(nullpad, '"+p')
  await expect
    .poll(() => nullpad.text(), { message: '"+p put the line' })
    .toBe('oAABBne two\nL1\nthree')
  await setClipboard(nullpad, 'L2\n')
  await play(nullpad, '.')
  await expect
    .poll(() => nullpad.text(), { message: 'dot put the new line' })
    .toBe('oAABBne two\nL1\nL2\nthree')
  expect(
    await nullpad.status(),
    'the cursor is on the last line put',
  ).toMatchObject({ line: 3, column: 1 })
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u takes back the dot').toBe(
    'oAABBne two\nL1\nthree',
  )
})

test('with the clipboard permission withdrawn, "+p changes nothing and says so', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc\ndef')
  await setClipboard(nullpad, 'ZZ\n')
  await nullpad.page.context().clearPermissions()
  const refused = await nullpad.page.evaluate(() =>
    navigator.clipboard.readText().then(
      () => 'allowed',
      (error: unknown) => String(error),
    ),
  )
  expect(refused, 'the browser refuses a read now').toContain('NotAllowedError')

  await play(nullpad, '"+p')
  await blocked(nullpad)
  expect(await nullpad.text(), 'the note did not change').toBe('abc\ndef')
  expect(await nullpad.status(), 'the cursor did not move').toMatchObject({
    line: 1,
    column: 1,
  })
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')

  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears the notice').toBe('')
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'later keys still work').toBe('bc\ndef')
  expect(await noticeOf(nullpad), 'and show no notice').toBe('')

  await play(nullpad, '"+P')
  await blocked(nullpad)
  expect(await nullpad.text(), 'a refused "+P changes nothing').toBe('bc\ndef')
  await play(nullpad, 'j')
  expect(await noticeOf(nullpad), 'j clears it').toBe('')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x after it').toBe('bc\nef')
})

test('with the clipboard permission withdrawn, "+yy says so and the unnamed register still has the line', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc\ndef')
  await nullpad.page.context().clearPermissions()
  await play(nullpad, '"+yy')
  await blocked(nullpad)
  expect(await nullpad.text(), 'a yank changes no text').toBe('abc\ndef')
  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears the notice').toBe('')
  await play(nullpad, 'jp')
  expect(await nullpad.text(), 'the unnamed register has the line').toBe(
    'abc\ndef\nabc',
  )
  await play(nullpad, '"+dd')
  await blocked(nullpad)
  expect(await nullpad.text(), 'the delete itself still happened').toBe(
    'abc\ndef',
  )
  await play(nullpad, 'p')
  expect(await noticeOf(nullpad), 'a plain key clears the notice').toBe('')
  expect(
    await nullpad.text(),
    'and the deleted line is in the unnamed register',
  ).toBe('abc\ndef\nabc')
})

const answeringClipboard = async (nullpad: Nullpad, delay: number | null) => {
  await nullpad.page.addInitScript(delay => {
    if (navigator.clipboard === undefined) {
      return
    }
    const later = <T>(value: () => T) =>
      delay === null
        ? new Promise<T>(() => undefined)
        : new Promise<T>(resolve => setTimeout(() => resolve(value()), delay))
    Object.defineProperty(navigator.clipboard, 'readText', {
      value: () => later(() => 'ZZ'),
    })
    Object.defineProperty(navigator.clipboard, 'read', {
      value: () =>
        later(() => [
          new ClipboardItem({
            'text/plain': new Blob(['ZZ'], { type: 'text/plain' }),
          }),
        ]),
    })
  }, delay)
  await openFresh(nullpad.page)
}

test('keys typed after "+p wait for a slow clipboard and then run in order', async ({
  nullpad,
}) => {
  await answeringClipboard(nullpad, 1200)
  await begin(nullpad, 'one two')
  await play(nullpad, '"+px')
  expect(await nullpad.text(), 'while the clipboard is slow nothing ran').toBe(
    'one two',
  )
  await expect
    .poll(() => nullpad.text(), {
      message: 'the put ran first, then x took its last letter',
      timeout: 5000,
    })
    .toBe('oZne two')
  expect(await nullpad.status(), 'the cursor').toMatchObject({
    line: 1,
    column: 3,
  })
  expect(await noticeOf(nullpad), 'no notice').toBe('')
})

test('a clipboard that never answers is given up after about 3 seconds', async ({
  nullpad,
}) => {
  await answeringClipboard(nullpad, null)
  await begin(nullpad, 'abcdef')
  await setClipboard(nullpad, 'ZZ')
  await play(nullpad, '"+p')
  await nullpad.page.waitForTimeout(1000)
  expect(await noticeOf(nullpad), 'no notice while it waits').toBe('')
  expect(await nullpad.text(), 'the note is as it was').toBe('abcdef')
  await blocked(nullpad)
  expect(await nullpad.text(), 'the note did not change').toBe('abcdef')
  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears the notice').toBe('')
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'later keys still work').toBe('bcdef')

  await play(nullpad, '"+pxx')
  await nullpad.page.waitForTimeout(1000)
  expect(await nullpad.text(), 'keys typed while it waits wait').toBe('bcdef')
  await expect
    .poll(() => nullpad.text(), {
      message:
        'after the give-up both x ran, in order, and the put added nothing',
      timeout: 6000,
    })
    .toBe('def')
})

test('a put from the clipboard typed right after a yank to it puts the yanked text', async ({
  nullpad,
}) => {
  await begin(nullpad, 'alpha beta\ngamma')
  await placeAt(nullpad, 2, 1)
  await setClipboard(nullpad, 'OLD')
  await play(nullpad, '"+yiw"+p')
  await expect
    .poll(() => nullpad.text(), {
      message: '"+p put the word "+yiw just took, not what the clipboard held',
      timeout: 5000,
    })
    .toBe('alpha beta\nggammaamma')
  await expect
    .poll(() => clipboardOf(nullpad), {
      message: 'the system clipboard holds the yanked word',
      timeout: 3000,
    })
    .toBe('gamma')
  expect(await noticeOf(nullpad), 'no notice').toBe('')
})

test('keys typed ahead of a slow clipboard read run in order, a yank to it included', async ({
  nullpad,
}) => {
  await begin(nullpad, 'alpha beta\ngamma')
  await setClipboard(nullpad, 'OLD')
  await nullpad.holdClipboardReads()
  await play(nullpad, '"+Pj"+yiw"+p')
  expect(await nullpad.text(), 'while the read is held nothing ran').toBe(
    'alpha beta\ngamma',
  )
  await nullpad.releaseClipboardReads()
  await expect
    .poll(() => nullpad.text(), {
      message:
        'the first put gave OLDalpha beta, then the yank and the put ran in order',
      timeout: 5000,
    })
    .toBe('OLDalpha beta\nggammaamma')
  await expect
    .poll(() => clipboardOf(nullpad), {
      message: 'the system clipboard holds the yanked word',
      timeout: 3000,
    })
    .toBe('gamma')
  expect(await noticeOf(nullpad), 'no notice').toBe('')
})

test('a clipboard answer that is not text is a blocked clipboard', async ({
  nullpad,
}) => {
  await nullpad.page.addInitScript(() => {
    if (navigator.clipboard === undefined) {
      return
    }
    Object.defineProperty(navigator.clipboard, 'readText', {
      value: () => Promise.resolve(null),
    })
  })
  await openFresh(nullpad.page)
  await begin(nullpad, 'abc\ndef')
  await play(nullpad, '"+p')
  await blocked(nullpad)
  expect(await nullpad.text(), 'the note did not change').toBe('abc\ndef')
  expect(await nullpad.status(), 'the cursor did not move').toMatchObject({
    line: 1,
    column: 1,
  })
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'later keys still work').toBe('bc\ndef')
  expect(await noticeOf(nullpad), 'the next key clears the notice').toBe('')
})

test('while Chrome asks for clipboard permission, "+p waits for the answer', async ({
  nullpad,
}) => {
  await nullpad.page.addInitScript(() => {
    if (navigator.clipboard === undefined) {
      return
    }
    const query = navigator.permissions.query.bind(navigator.permissions)
    Object.defineProperty(navigator.permissions, 'query', {
      value: (descriptor: { name: string }) =>
        String(descriptor.name) === 'clipboard-read'
          ? Promise.resolve({ state: 'prompt' })
          : query(descriptor as PermissionDescriptor),
    })
    Object.defineProperty(navigator.clipboard, 'readText', {
      value: () =>
        new Promise<string>(resolve =>
          setTimeout(() => resolve('HELLO'), 5000),
        ),
    })
  })
  await openFresh(nullpad.page)
  await begin(nullpad, 'abcdef')
  await play(nullpad, '"+p')
  await nullpad.page.waitForTimeout(4000)
  expect(await noticeOf(nullpad), 'no notice while the prompt is open').toBe('')
  expect(await nullpad.text(), 'the note is as it was while it waits').toBe(
    'abcdef',
  )
  await expect
    .poll(() => nullpad.text(), {
      message: 'the put ran with the answer when it came',
      timeout: 6000,
    })
    .toBe('aHELLObcdef')
  expect(await noticeOf(nullpad), 'no notice after the answer').toBe('')
})
