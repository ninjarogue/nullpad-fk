import { expect, test } from './nullpad'

test('a paste with CRLF line ends and a tab lands as lines at the cursor, cursor after it', async ({
  nullpad,
}) => {
  await nullpad.type('[]')
  await nullpad.press('ArrowLeft')
  await nullpad.paste('one\r\ntwo\n\tthree')
  expect(await nullpad.text()).toBe('[one\ntwo\n\tthree]')
  expect(await nullpad.status()).toEqual({ line: 3, column: 7, lineCount: 3 })
  expect((await nullpad.cursor())?.char, 'cursor on the closing bracket').toBe(
    ']',
  )
})

test('an empty paste changes nothing and a lone CR pastes as one line break', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.paste('')
  expect(await nullpad.text()).toBe('ab')
  await nullpad.paste('\r')
  expect(
    (await nullpad.status()).lineCount,
    'a lone CR is one line break',
  ).toBe(2)
})
