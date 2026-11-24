import { type Nullpad, expect, settle, test } from './nullpad'

const readText = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.read').innerText()
}

const mode = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const openRead = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press('Control+e')
  await settle(nullpad.page)
  await expect(
    nullpad.page.locator('.read'),
    'Ctrl+E opens the read view',
  ).toBeVisible()
}

test('raw HTML and unsafe links read as text, a safe link opens a new tab', async ({
  nullpad,
}) => {
  await nullpad.paste(
    [
      'say <b>x</b> here',
      '',
      '<div onclick=alert(1)>hi</div>',
      '',
      '[safe](https://example.com/ok) [bad](javascript:alert(1)) [v](VBScript:x) [f](file:///etc/passwd) [d](DATA:text/html,x)',
    ].join('\n'),
  )
  await openRead(nullpad)
  const read = nullpad.page.locator('.read')
  const text = await readText(nullpad)
  expect(text, 'inline raw HTML is drawn as text').toContain('<b>x</b>')
  expect(text, 'block raw HTML is drawn as text').toContain(
    '<div onclick=alert(1)>hi</div>',
  )
  expect(await read.locator('b').count(), 'no b element from the note').toBe(0)
  expect(
    await read.locator('[onclick]').count(),
    'no element with the note’s onclick',
  ).toBe(0)
  for (const word of ['bad', 'v', 'f', 'd']) {
    expect(text, `unsafe link text "${word}" still shows`).toContain(word)
  }
  const links = read.locator('a')
  expect(await links.count(), 'only the safe link is a link').toBe(1)
  const link = links.first()
  expect(await link.getAttribute('href'), 'safe link destination').toBe(
    'https://example.com/ok',
  )
  expect(await link.getAttribute('target'), 'link opens in a new tab').toBe(
    '_blank',
  )
  expect(
    (await link.getAttribute('rel')) ?? '',
    'link carries noopener',
  ).toContain('noopener')
})

test('the read view is read-only and Ctrl+E returns to the same text and cursor', async ({
  nullpad,
}) => {
  await nullpad.paste('# Title\n\nsome *words* here\nsecond line')
  await nullpad.press('ArrowUp')
  await nullpad.press('ArrowLeft', 3)
  const before = await nullpad.status()
  const textBefore = await nullpad.text()
  await openRead(nullpad)
  expect(await mode(nullpad), 'mode label while reading').toBe('READ')
  expect(
    await nullpad.page.locator('[data-line-id]').count(),
    'no editor rows while reading',
  ).toBe(0)
  const shown = await readText(nullpad)
  await nullpad.type('zzz')
  await nullpad.press('Enter')
  await nullpad.press('Backspace')
  await nullpad.paste('pasted')
  expect(
    await readText(nullpad),
    'typing in the read view changes nothing',
  ).toBe(shown)
  await nullpad.page.keyboard.press('Control+e')
  await settle(nullpad.page)
  expect(await nullpad.text(), 'text after Ctrl+E').toBe(textBefore)
  expect(await nullpad.status(), 'cursor after Ctrl+E').toEqual(before)
  await openRead(nullpad)
  await nullpad.press('Escape')
  expect(await nullpad.text(), 'text after Esc').toBe(textBefore)
  expect(await nullpad.status(), 'cursor after Esc').toEqual(before)
})

test('opening the read view puts the cursor’s block at the top', async ({
  nullpad,
}) => {
  const note = Array.from({ length: 300 }, (_, i) => `para ${i + 1}`).join(
    '\n\n',
  )
  await nullpad.paste(note)
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', 200)
  const { line } = await nullpad.status()
  expect(line, 'cursor on a paragraph line').toBe(201)
  await openRead(nullpad)
  const tops = await nullpad.page.evaluate(line => {
    const read = document.querySelector('.read')
    const block = document.querySelector(`.read [data-source-line="${line}"]`)
    return {
      read: read?.getBoundingClientRect().top ?? null,
      block: block?.getBoundingClientRect().top ?? null,
    }
  }, line)
  expect(tops.block, 'the cursor’s block exists').not.toBeNull()
  expect(
    Math.abs((tops.block ?? 0) - (tops.read ?? 0)),
    'the block sits at the top of the read view',
  ).toBeLessThan(80)
})

test('the status line button opens and closes the read view', async ({
  nullpad,
}) => {
  await nullpad.paste('# Hi\n\nbody')
  const textBefore = await nullpad.text()
  await nullpad.page.locator('.status .toggle-read').click()
  await settle(nullpad.page)
  await expect(
    nullpad.page.locator('.read'),
    'the button opens the read view',
  ).toBeVisible()
  expect(await mode(nullpad), 'mode label after the button').toBe('READ')
  await nullpad.page.locator('.status .toggle-read').click()
  await settle(nullpad.page)
  await expect(
    nullpad.page.locator('.read'),
    'the button closes the read view',
  ).toHaveCount(0)
  expect(await nullpad.text(), 'text after closing').toBe(textBefore)
})
