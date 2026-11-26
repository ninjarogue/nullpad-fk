import { type Nullpad, expect, settle, test } from './nullpad'

const NOTE = 'abcdef\nghijkl\nmnopqr'

const keyNames: Readonly<Record<string, string>> = {
  '<C-v>': 'Control+v',
}

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of keys.match(/<[A-Za-z-]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
}

const putThenUndo = async (
  nullpad: Nullpad,
  selecting: string,
  put: string,
) => {
  await play(nullpad, `gg0${selecting}${put}`)
  await expect
    .poll(() => nullpad.text(), { message: `${put} put over the selection` })
    .not.toBe(NOTE)
  await play(nullpad, 'u')
  return { text: await nullpad.text(), status: await nullpad.status() }
}

const compare = async (nullpad: Nullpad, selecting: string) => {
  await nullpad.paste(NOTE)
  await nullpad.press('Control+Home')
  await nullpad.press('Control+,')
  await nullpad.page.evaluate(() => navigator.clipboard.writeText('a'))
  await play(nullpad, 'gg0"ayl')
  const named = await putThenUndo(nullpad, selecting, '"ap')
  const clipboard = await putThenUndo(nullpad, selecting, '"+p')
  return { named, clipboard }
}

test('u after "+p over a block puts the cursor where u after a named put does', async ({
  nullpad,
}) => {
  const { named, clipboard } = await compare(nullpad, '$<C-v>jl')
  expect(named, 'u after "ap over the block, as Vim leaves it').toEqual({
    text: NOTE,
    status: { line: 1, column: 6, lineCount: 3 },
  })
  expect(clipboard, 'u after "+p over the same block').toEqual(named)
})

test('u after "+p over a v selection puts the cursor where u after a named put does', async ({
  nullpad,
}) => {
  const { named, clipboard } = await compare(nullpad, '$vj')
  expect(named, 'u after "ap over the selection, as Vim leaves it').toEqual({
    text: NOTE,
    status: { line: 1, column: 6, lineCount: 3 },
  })
  expect(clipboard, 'u after "+p over the same selection').toEqual(named)
})
