import { expect, test } from './pane'

test('a note opened without a pane flag shows no pane', async ({ nullpad }) => {
  await nullpad.paste('# title\n\ntext')
  expect(
    await nullpad.page.locator('.pane').count(),
    'panes on the default screen',
  ).toBe(0)
})

test('the outline pane shows one row per node with its place in the note', async ({
  pane,
}) => {
  const shown = await pane.paste(
    '# t\n\nsee *this*\n[here](/url)\n\n- `a`',
    'outline',
  )
  expect(shown, 'rows after the paste').toBe(
    [
      'Heading 1:0-1:3',
      '  Text 1:2-1:3 "t"',
      'Paragraph 3:0-4:12',
      '  Text 3:0-3:4 "see "',
      '  Emphasis 3:4-3:10',
      '    Text 3:5-3:9 "this"',
      '  SoftBreak 3:10-3:10',
      '  Link 4:0-4:12 "/url"',
      '    Text 4:1-4:5 "here"',
      'List 6:0-6:5',
      '  Item 6:0-6:5',
      '    Paragraph 6:2-6:5',
      '      Code 6:2-6:5 "a"',
    ].join('\n'),
  )
})

test('the outline pane keeps a line break inside a text on its own row', async ({
  pane,
}) => {
  const shown = await pane.paste('```\na "b"\nc\n```', 'outline')
  expect(shown, 'the row of the code block').toBe(
    'CodeBlock 1:0-4:3 "a \\"b\\"\\nc\\n"',
  )
})

test('the HTML pane draws raw HTML as text and makes no element of it', async ({
  pane,
}) => {
  const shown = await pane.paste('<b id="planted">x</b>')
  expect(shown, 'the text of the pane').toBe('<p><b id="planted">x</b></p>\n')
  expect(
    await pane.nullpad.page.locator('#planted').count(),
    'elements made from the pasted tag',
  ).toBe(0)
})
