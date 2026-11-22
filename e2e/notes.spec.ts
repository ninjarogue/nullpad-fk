import { type Nullpad, expect, openTab, test } from './nullpad'

const SAVED = 1100

const waitSaved = (nullpad: Nullpad) => nullpad.page.waitForTimeout(SAVED)

const openFinder = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press('Control+p')
  const finder = await nullpad.finder()
  expect(finder, 'Ctrl-P opens the finder').not.toBeNull()
}

const rowTexts = async (nullpad: Nullpad) =>
  (await nullpad.finder())?.rows.map(row => row.text) ?? []

const listNotes = async (nullpad: Nullpad) => {
  await openFinder(nullpad)
  const rows = await rowTexts(nullpad)
  await nullpad.press('Escape')
  return rows
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

const moveNote = async (nullpad: Nullpad, title: string, folder: string) => {
  await openFinder(nullpad)
  await nullpad.type(title)
  await nullpad.page.keyboard.press('Control+g')
  await nullpad.type(folder)
  await nullpad.press('Enter')
  if ((await nullpad.finder()) !== null) {
    await nullpad.press('Escape')
  }
}

test('a reload opens the note edited last, and the tab and status line show its title', async ({
  nullpad,
}) => {
  await nullpad.type('\n\n## Plan the week\nsecond line')
  expect(await nullpad.title(), 'tab title skips blank lines and the #').toBe(
    'Plan the week',
  )
  expect(await nullpad.file(), 'status file name').toMatch(/\.md$/)
  await waitSaved(nullpad)
  await startNote(nullpad, 'Second note')
  await nullpad.type('!')
  await waitSaved(nullpad)
  await nullpad.reload()
  expect(await nullpad.text(), 'after reload the last edited note').toBe(
    'Second note!',
  )
  expect(await nullpad.title(), 'tab title after reload').toBe('Second note!')

  const titles: ReadonlyArray<readonly [string, string]> = [
    ['> quoted words', 'quoted words'],
    ['- [x] done item', 'done item'],
    ['1. numbered', 'numbered'],
    ['* star item', 'star item'],
    ['+ plus item', 'plus item'],
    ['[ ] open box', 'open box'],
    ['abcdefghij'.repeat(7), ''],
    ['#', 'Untitled'],
  ]
  for (const [line] of titles) {
    await startNote(nullpad, line)
    await nullpad.press('End')
  }
  await waitSaved(nullpad)
  await openFinder(nullpad)
  const shown = await rowTexts(nullpad)
  expect(shown.slice(0, 8), 'empty query lists the newest edit first').toEqual(
    [...titles]
      .reverse()
      .map(([, title]) => title)
      .map(title => (title === '' ? shown[1] : title)),
  )
  const long = shown[1] ?? ''
  expect(long.endsWith('…'), 'a 70 letter title ends in an ellipsis').toBe(true)
  expect(
    long.length,
    'the long title is cut near 60 letters',
  ).toBeGreaterThanOrEqual(60)
  expect(
    long.length,
    'the long title is cut near 60 letters',
  ).toBeLessThanOrEqual(61)
  expect(
    long.startsWith('abcdefghij'.repeat(5)),
    'the long title keeps its start',
  ).toBe(true)
  expect(shown.slice(8), 'the older notes follow').toEqual([
    'Second note!',
    'Plan the week',
  ])
})

test('a blank note is never saved and a note emptied to blank is removed', async ({
  nullpad,
}) => {
  await nullpad.type('  \n \n')
  await waitSaved(nullpad)
  await nullpad.reload()
  expect(await listNotes(nullpad), 'a blank note is not listed').toEqual([])

  await nullpad.type('gone soon')
  await waitSaved(nullpad)
  await nullpad.reload()
  expect(await nullpad.text(), 'the note came back').toBe('gone soon')
  expect(await listNotes(nullpad), 'listed once saved').toEqual(['gone soon'])

  await nullpad.press('Control+End')
  await nullpad.press('Backspace', 'gone soon'.length)
  expect(await nullpad.text(), 'emptied').toBe('')
  await waitSaved(nullpad)
  await nullpad.reload()
  expect(await nullpad.text(), 'empty editor after the reload').toBe('')
  expect(await listNotes(nullpad), 'no such note in the finder').toEqual([])
})

test('an edit survives an immediate reload and an immediately closed tab', async ({
  nullpad,
}) => {
  await nullpad.type('typed just now')
  await nullpad.reload()
  expect(await nullpad.text(), 'reload right after typing').toBe(
    'typed just now',
  )

  await nullpad.press('Control+End')
  await nullpad.type(' tail')
  const { page } = nullpad
  const context = page.context()
  await page.close({ runBeforeUnload: true })
  const next = await openTab(await context.newPage())
  expect(await next.text(), 'closing the tab right after typing').toBe(
    'typed just now tail',
  )
})

test('the finder filters, moves its highlight, makes a new note and keeps typing out of the editor', async ({
  nullpad,
}) => {
  await nullpad.type('apple pie')
  await waitSaved(nullpad)
  await startNote(nullpad, 'banana split')
  await startNote(nullpad, 'cherry tart')
  await waitSaved(nullpad)

  await openFinder(nullpad)
  expect(await rowTexts(nullpad), 'empty query, newest first').toEqual([
    'cherry tart',
    'banana split',
    'apple pie',
  ])
  await nullpad.press('ArrowDown')
  let rows = (await nullpad.finder())?.rows ?? []
  expect(
    rows.findIndex(row => row.selected),
    'Down moves the highlight to the second row',
  ).toBe(1)
  await nullpad.page.keyboard.press('Control+p')
  rows = (await nullpad.finder())?.rows ?? []
  expect(
    rows.findIndex(row => row.selected),
    'Ctrl-P with the finder open moves the highlight up',
  ).toBe(0)
  await nullpad.press('ArrowDown')
  await nullpad.press('ArrowDown')
  await nullpad.press('Enter')
  expect(await nullpad.text(), 'Enter opens the highlighted note').toBe(
    'apple pie',
  )
  expect(await nullpad.finder(), 'the finder closed').toBeNull()

  await openFinder(nullpad)
  await nullpad.type('bnn')
  const found = await nullpad.finder()
  expect(found?.rows[0]?.text, 'a fuzzy query ranks the match first').toBe(
    'banana split',
  )
  expect(
    found?.rows.some(row => row.text.startsWith('+ new note')),
    'a query shows the new note row',
  ).toBe(true)
  await nullpad.press('Escape')
  expect(await nullpad.finder(), 'Escape closes').toBeNull()
  expect(await nullpad.text(), 'text typed in the finder stayed out').toBe(
    'apple pie',
  )

  await startNote(nullpad, 'dragonfruit')
  expect(await nullpad.text(), 'new note first line is the query').toBe(
    'dragonfruit',
  )
  expect(await nullpad.title(), 'new note title').toBe('dragonfruit')
})

test('name/ enters a folder by prefix, Backspace goes up and Tab cycles the folders', async ({
  nullpad,
}) => {
  await nullpad.type('acme invoice')
  await waitSaved(nullpad)
  await moveNote(nullpad, 'acme invoice', 'clients')
  await startNote(nullpad, 'internal memo')
  await waitSaved(nullpad)
  await moveNote(nullpad, 'internal memo', 'internal')
  await startNote(nullpad, 'loose note')
  await waitSaved(nullpad)

  await openFinder(nullpad)
  const noteRows = async () =>
    (await nullpad.finder())?.rows.filter(row => !row.text.startsWith('▸')) ??
    []
  expect((await noteRows()).length, 'all three notes').toBe(3)
  await nullpad.type('cl/')
  let finder = await nullpad.finder()
  expect(
    finder?.rows.map(row => row.text),
    'cl/ shows clients only',
  ).toEqual(['acme invoice'])
  expect(finder?.header, 'the folder shows in the results header').toContain(
    'clients',
  )
  await nullpad.press('Backspace')
  finder = await nullpad.finder()
  expect(finder?.query, 'the prompt is empty one level up').toBe('')
  expect((await noteRows()).length, 'back to every note').toBe(3)

  const folderNames = (await nullpad.finder())?.folders.map(f => f.name) ?? []
  expect(folderNames, 'a button for all and each folder').toEqual(
    expect.arrayContaining(['all', 'clients', 'internal']),
  )
  const seen = new Set<string>()
  for (let i = 0; i < folderNames.length; i++) {
    await nullpad.press('Tab')
    const on = (await nullpad.finder())?.folders.find(f => f.on)?.name ?? ''
    seen.add(on)
  }
  expect(seen.size, 'Tab visits every top-level folder').toBe(
    folderNames.length,
  )
  await nullpad.press('Shift+Tab')
  const back = (await nullpad.finder())?.folders.find(f => f.on)?.name
  expect(back, 'Shift-Tab from the first folder wraps to the last').toBe(
    folderNames.at(-1),
  )
  await nullpad.press('Escape')

  await startNote(nullpad, 'odd path')
  await moveNote(nullpad, 'odd path', 'a/./b//../c')
  expect(
    await nullpad.file(),
    'a folder path drops ., .. and empty parts',
  ).toMatch(/^a\/b\/c\/[^/]+\.md$/)
})

test('Ctrl-G moves the highlighted note, not the first one, and Escape backs out a level', async ({
  nullpad,
}) => {
  await nullpad.type('first note')
  await waitSaved(nullpad)
  await startNote(nullpad, 'second note')
  await waitSaved(nullpad)
  await startNote(nullpad, 'third note')
  await waitSaved(nullpad)

  await openFinder(nullpad)
  await nullpad.press('ArrowDown')
  await nullpad.page.keyboard.press('Control+g')
  let finder = await nullpad.finder()
  expect(finder?.mode, 'move mode names a different prompt').not.toBe('notes')
  expect(finder?.header, 'move mode names the highlighted note').toContain(
    'second note',
  )
  await nullpad.press('Escape')
  finder = await nullpad.finder()
  expect(finder?.mode, 'Escape in move mode returns to find mode').toBe('notes')
  await nullpad.press('ArrowDown')
  expect(
    (await nullpad.finder())?.rows.findIndex(row => row.selected),
    'the highlight is on the second note again',
  ).toBe(1)
  await nullpad.page.keyboard.press('Control+g')
  await nullpad.type('archive')
  await nullpad.press('Enter')
  await waitSaved(nullpad)
  if ((await nullpad.finder()) !== null) {
    await nullpad.press('Escape')
  }

  await openFinder(nullpad)
  const rows = (await nullpad.finder())?.rows ?? []
  const folderOf = (title: string) =>
    rows.find(row => row.text === title)?.folder
  expect(folderOf('second note'), 'the highlighted note moved').toBe('archive/')
  expect(folderOf('third note'), 'the first note stayed').toBe('')
  expect(folderOf('first note'), 'the last note stayed').toBe('')
  await nullpad.press('Escape')
  expect(await nullpad.finder(), 'Escape in find mode closes').toBeNull()
})

test('a title match ranks above a match that is only in the folder path', async ({
  nullpad,
}) => {
  await nullpad.type('acme')
  await waitSaved(nullpad)
  await startNote(nullpad, 'unrelated stuff')
  await waitSaved(nullpad)
  await moveNote(nullpad, 'unrelated stuff', 'acme')
  await waitSaved(nullpad)

  await openFinder(nullpad)
  await nullpad.type('acme')
  const rows = ((await nullpad.finder())?.rows ?? [])
    .map(row => row.text)
    .filter(text => !text.startsWith('▸') && !text.startsWith('+'))
  expect(rows, 'the exact title match beats the newer path-only match').toEqual(
    ['acme', 'unrelated stuff'],
  )
})

test('a save in one tab updates the other, and two edits at once keep both texts', async ({
  nullpad,
}) => {
  await nullpad.type('shared base')
  await waitSaved(nullpad)
  const other = await openTab(nullpad.page)
  expect(await other.text(), 'the second tab opens the note').toBe(
    'shared base',
  )

  await nullpad.page.bringToFront()
  await nullpad.type('!')
  await waitSaved(nullpad)
  expect(await other.text(), 'an idle tab reloads the saved note').toBe(
    'shared base!',
  )
  expect(await listNotes(other), 'its list shows the new title').toEqual([
    'shared base!',
  ])

  await nullpad.page.bringToFront()
  await nullpad.press('Control+End')
  await nullpad.type(' A')
  await other.page.bringToFront()
  await other.press('Control+End')
  await other.type(' B')
  await other.page.waitForTimeout(2500)

  const titles = await listNotes(other)
  expect(titles.length, 'one note and one conflict copy').toBe(2)
  const copy = titles.find(title => title.endsWith(' (conflict copy)'))
  expect(copy, 'the tab that lost the race made a conflict copy').toBeDefined()
  const original = titles.find(title => title !== copy) ?? ''
  const texts: Array<string> = []
  for (const title of [original, copy ?? '']) {
    await openFinder(other)
    const rows = (await other.finder())?.rows ?? []
    const index = rows.findIndex(row => row.text === title)
    await other.press('ArrowDown', index)
    await other.press('Enter')
    texts.push(await other.text())
  }
  const [originalText = '', copyText = ''] = texts
  expect(
    [originalText, copyText.replace(' (conflict copy)', '')].sort(),
    'neither edit was lost, each text kept whole',
  ).toEqual(['shared base! A', 'shared base! B'])
  expect(await listNotes(nullpad), 'both tabs list the same notes').toEqual(
    await listNotes(other),
  )
})
