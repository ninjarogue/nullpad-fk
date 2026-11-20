import { expect, test } from './nullpad'

test('an IME composition shows its preedit at the cursor without changing the text, then commits once', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.press('ArrowLeft')
  await nullpad.compose('にほん')
  expect(await nullpad.preedit(), 'preedit drawn').toBe('にほん')
  expect(await nullpad.text(), 'text unchanged while composing').toBe('ab')
  expect((await nullpad.cursor())?.char, 'cursor still on b').toBe('b')
  const preeditBox = await nullpad.page
    .locator('[data-ghost]:not(#caret)')
    .first()
    .boundingBox()
  const cursorBefore = await nullpad.cursor()
  expect(
    preeditBox !== null &&
      cursorBefore !== null &&
      preeditBox.x + preeditBox.width <= cursorBefore.left + 0.5,
    'preedit sits before the cursor',
  ).toBe(true)
  await nullpad.commit('日本')
  expect(await nullpad.text(), 'commit inserts once at the cursor').toBe(
    'a日本b',
  )
  expect(await nullpad.preedit(), 'preedit gone after commit').toBe('')
  expect(await nullpad.status()).toEqual({ line: 1, column: 4, lineCount: 1 })
  await nullpad.type('z')
  expect(await nullpad.text(), 'typing works after a commit').toBe('a日本zb')
})

test('a cancelled IME composition leaves the text as it was', async ({
  nullpad,
}) => {
  await nullpad.type('ab')
  await nullpad.compose('かな')
  expect(await nullpad.preedit()).toBe('かな')
  await nullpad.compose('')
  expect(await nullpad.preedit(), 'preedit gone after cancel').toBe('')
  expect(await nullpad.text()).toBe('ab')
  await nullpad.type('c')
  expect(await nullpad.text(), 'typing works after a cancel').toBe('abc')
})

test('an IME composition at the start of a line and on an empty line commits in place', async ({
  nullpad,
}) => {
  await nullpad.type('xy')
  await nullpad.press('Enter')
  await nullpad.compose('한')
  await nullpad.compose('한글')
  await nullpad.commit('한글')
  await nullpad.press('Control+Home')
  await nullpad.compose('ㅎ')
  await nullpad.commit('하')
  expect(await nullpad.text()).toBe('하xy\n한글')
  expect(await nullpad.status()).toEqual({ line: 1, column: 2, lineCount: 2 })
})
