import {
  type Nullpad,
  type Screen,
  expect,
  rowStartsOf,
  test,
  textareaRowStarts,
} from './nullpad'

const rowTexts = (screen: Screen) => screen.rows.map(row => row.text)

const caretAt = (screen: Screen) => ({
  row: screen.cursor?.row,
  cell: screen.cursor?.cell,
  column: screen.status.column,
})

const exactly76 = `${'abcde fghij '.repeat(6)}klmn`

test('a space typed after a word that ends at the wrap edge hangs past it, and the next word starts the next row, as in a textarea', async ({
  nullpad,
}) => {
  await nullpad.type(exactly76)
  await nullpad.type(' ')
  const hung = await nullpad.screen()
  expect(rowTexts(hung), 'the space stays on the first row').toEqual([
    `${exactly76} `,
  ])
  expect(caretAt(hung), 'the cursor waits at the wrap edge').toEqual({
    row: 0,
    cell: 76,
    column: 78,
  })
  await nullpad.type('  next')
  expect(
    rowTexts(await nullpad.screen()),
    'all three spaces hang and the word starts the next row',
  ).toEqual([`${exactly76}   `, 'next'])
  await nullpad.press('ArrowUp')
  expect(caretAt(await nullpad.screen()), 'ArrowUp keeps the cell').toEqual({
    row: 0,
    cell: 4,
    column: 5,
  })
  await nullpad.press('End')
  expect(
    caretAt(await nullpad.screen()),
    'End lands after the hanging spaces, drawn at the wrap edge',
  ).toEqual({ row: 0, cell: 76, column: 80 })
  await nullpad.type('Z')
  expect(await nullpad.text()).toBe(`${exactly76}   Znext`)
  expect(rowTexts(await nullpad.screen())).toEqual([`${exactly76}   `, 'Znext'])
})

test('every space at a row end hangs, and Home, End and the arrows step through them as in a textarea', async ({
  nullpad,
}) => {
  await nullpad.type(`${'x'.repeat(75)}   yy`)
  expect(rowTexts(await nullpad.screen())).toEqual([
    `${'x'.repeat(75)}   `,
    'yy',
  ])
  const path = []
  for (const key of [
    'Home',
    'ArrowUp',
    'End',
    'ArrowLeft',
    'ArrowRight',
    'ArrowDown',
    'ArrowUp',
  ]) {
    await nullpad.press(key)
    path.push({ key, ...caretAt(await nullpad.screen()) })
  }
  expect(path).toEqual([
    { key: 'Home', row: 1, cell: 0, column: 79 },
    { key: 'ArrowUp', row: 0, cell: 0, column: 1 },
    { key: 'End', row: 0, cell: 76, column: 79 },
    { key: 'ArrowLeft', row: 0, cell: 76, column: 78 },
    { key: 'ArrowRight', row: 1, cell: 0, column: 79 },
    { key: 'ArrowDown', row: 1, cell: 2, column: 81 },
    { key: 'ArrowUp', row: 0, cell: 0, column: 1 },
  ])
})

test('a line of spaces longer than a row hangs whole, and the next word starts the next row', async ({
  nullpad,
}) => {
  await nullpad.type(' '.repeat(100))
  const spaces = await nullpad.screen()
  expect(rowTexts(spaces)).toEqual([' '.repeat(100)])
  expect(caretAt(spaces), 'the cursor waits at the wrap edge').toEqual({
    row: 0,
    cell: 76,
    column: 101,
  })
  await nullpad.type('z')
  expect(rowTexts(await nullpad.screen())).toEqual([' '.repeat(100), 'z'])
  await nullpad.press('ArrowUp')
  expect((await nullpad.screen()).status.column).toBe(2)
})

test('an indent before a word too long for the rest of its row stays on that row alone, as in a textarea', async ({
  nullpad,
}) => {
  await nullpad.paste(`      ${'x'.repeat(72)}`)
  expect(rowTexts(await nullpad.screen())).toEqual(['      ', 'x'.repeat(72)])
})

/**
 * Text that puts a pair of characters at the wrap edge, so where the line breaks shows whether a textarea
 * may break between them: hyphens and dashes, URLs, markdown links and emphasis, brackets, quotes,
 * punctuation, numbers, no-break spaces, CJK and emoji.
 */
const joints: ReadonlyArray<readonly [string, string]> = [
  ['state-of-', 'the-art'],
  ['well-', 'known'],
  ['page-', '12'],
  ['x-', '1'],
  ['.-', '1'],
  ['and/', 'or'],
  ['https://example.com/', 'path/to/page?x=1&y=2'],
  ['[a link]', '(https://example.com)'],
  ['(see', ' note)'],
  ['word', '(note)'],
  ['long', '—dash'],
  ['long—', 'dash'],
  ['range–', 'end'],
  ['why?', 'because'],
  ['wait!', 'now'],
  ['ok...', 'then'],
  ['end.', 'Next'],
  ['a,', 'b'],
  ['"quoted"', 'word'],
  ['“curly”', 'word'],
  ["it's", 'fine'],
  ['$', '100'],
  ['100', '%'],
  ['#', 'tag'],
  ['@', 'user'],
  ['**bold**', 'word'],
  ['`code`', 'word'],
  ['a=b', '+c'],
  ['<tag>', 'text'],
  ['{x}', 'y'],
  ['a\u00a0', 'b'],
  ['a', '\u00a0b'],
  ['漢字漢字', '漢字'],
  ['漢字', '。漢字'],
  ['漢字。', '漢字'],
  ['漢字「', '漢字」'],
  ['word', '漢字'],
  ['漢字', 'word'],
  ['word', '👍'],
  ['👍', '👍'],
  ['👍', 'word'],
  ['🇯🇵', '🇯🇵'],
  ['word', '✅'],
  ['word', '…'],
  ['1,', '000'],
  ['e.g.', 'this'],
  ['x', '\u200bzero'],
  ['カタカナ', 'ー'],
]

/** Each joint with the wrap edge just before it, at it, and one and two cells after it. */
const jointLines = (columns: number): ReadonlyArray<string> =>
  joints.flatMap(([left, right]) =>
    [-1, 0, 1, 2].map(
      offset =>
        `${'a'.repeat(Math.max(1, columns - [...left].length + offset))}${left}${right} tail`,
    ),
  )

const notes = [
  '# Weekly planning notes for the editor project and the release of the new version',
  '- [ ] fix the cursor at the end of wrapped rows so it never lands in the wrong place again',
  '- [x] **bold** and _italic_ and `code` spans with [a link](https://example.com/a/b?c=d)',
  '> a quote that is long enough to wrap around onto the next visual row of text here',
  'Meeting notes: we agreed to ship the new editor next week, pending a final review (maybe).',
  'The price is $1,000.50 (about 50%) - or "maybe" more... who knows? Not me! Really; truly.',
  'We should review the onboarding checklist together and agree on a state-of-the-art plan.',
  '会議のメモ：新しいエディタを来週出荷することに合意しました。最終レビューを待っています。よろしくお願いします。',
  '新的编辑器将在下周发布，“最终评审”之后。请大家（尽快）确认，谢谢！我们会在会议上讨论具体的细节和时间安排。',
  'Thanks 👍 for the fix ❤️ it works 😀 now and the team 👨‍👩‍👧 is happy 🎉🎉🎉 about the release today!',
]

const expectRowsLikeTextarea = async (
  nullpad: Nullpad,
  lines: ReadonlyArray<string>,
) => {
  await nullpad.resize(1000, 22 * (lines.length * 2 + 4))
  await nullpad.paste(lines.join('\n'))
  const screen = await nullpad.screen()
  expect(screen.status.lineCount, 'every line pasted').toBe(lines.length)
  const columns = [...(screen.rows[0]?.text ?? '')].length
  const textarea = await textareaRowStarts(
    nullpad.page,
    lines,
    columns,
    screen.cell,
  )
  const drawn = rowStartsOf(screen)
  const misses = lines.flatMap((line, index) =>
    JSON.stringify(drawn[index]) === JSON.stringify(textarea[index])
      ? []
      : [
          `${JSON.stringify(line)}: nullpad starts rows at ${JSON.stringify(drawn[index])}, a textarea at ${JSON.stringify(textarea[index])}`,
        ],
  )
  expect(
    misses,
    `${misses.length} of ${lines.length} lines wrap differently`,
  ).toEqual([])
}

test('a line breaks where a textarea of the same width breaks it, for each pair of characters at the wrap edge', async ({
  nullpad,
}) => {
  await expectRowsLikeTextarea(nullpad, ['a'.repeat(200), ...jointLines(76)])
})

test('lines of notes in English, Japanese, Chinese and emoji break where a textarea of the same width breaks them', async ({
  nullpad,
}) => {
  await expectRowsLikeTextarea(nullpad, ['a'.repeat(200), ...notes])
})
