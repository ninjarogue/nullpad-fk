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
    await nullpad.page
      .locator('[data-line-id]')
      .filter({ visible: true })
      .count(),
    'no editor row is visible while reading',
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

test('closing the read view leaves the editor scrolled where it was, cursor off screen', async ({
  nullpad,
}) => {
  const note = Array.from(
    { length: 400 },
    (_, i) => `line ${i + 1} ${i % 3 === 0 ? 'word '.repeat(60) : 'short'}`,
  ).join('\n')
  await nullpad.paste(note)
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', 60)
  await nullpad.wheel(4000)
  await settle(nullpad.page)
  const firstDrawn = async () => {
    const screen = await nullpad.screen()
    return {
      numbers: screen.rows
        .filter(
          row => row.top >= screen.area.top && row.bottom <= screen.area.bottom,
        )
        .map(row => row.number),
      status: screen.status,
    }
  }
  const before = await firstDrawn()
  expect(
    before.numbers.includes(String(before.status.line)),
    'the cursor’s line is off screen before reading',
  ).toBe(false)
  await openRead(nullpad)
  await nullpad.page.keyboard.press('Control+e')
  await settle(nullpad.page)
  expect(
    await firstDrawn(),
    'the editor shows the same lines after Ctrl+E twice',
  ).toEqual(before)
})

const tap = (nullpad: Nullpad, key: Readonly<Record<string, unknown>>) =>
  Promise.all([
    nullpad.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key }),
    nullpad.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key }),
  ])

const ctrlEnd = {
  key: 'End',
  code: 'End',
  windowsVirtualKeyCode: 35,
  modifiers: 2,
}

const ctrlE = {
  key: 'e',
  code: 'KeyE',
  windowsVirtualKeyCode: 69,
  modifiers: 2,
}

test('Ctrl+End and Ctrl+E in one frame, then Esc, shows what Ctrl+End alone shows', async ({
  nullpad,
}) => {
  await nullpad.paste(
    Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join('\n'),
  )
  const linesOnScreen = async () => {
    const screen = await nullpad.screen()
    return {
      lines: screen.rows.map(row => row.number),
      cursorOnScreen: screen.cursor?.inside ?? false,
    }
  }
  await nullpad.press('Control+Home')
  await tap(nullpad, ctrlEnd)
  await settle(nullpad.page)
  await settle(nullpad.page)
  const alone = await linesOnScreen()
  await nullpad.press('Control+Home')
  await Promise.all([tap(nullpad, ctrlEnd), tap(nullpad, ctrlE)])
  await settle(nullpad.page)
  await expect(
    nullpad.page.locator('.read'),
    'Ctrl+E opens the read view',
  ).toBeVisible()
  await nullpad.press('Escape')
  await nullpad.page.waitForTimeout(1000)
  expect(await linesOnScreen(), 'one second after Esc').toEqual(alone)
})

const boxes = (nullpad: Nullpad) =>
  nullpad.page.locator('.read [role=checkbox]')

const states = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return boxes(nullpad).evaluateAll(list =>
    list.map(box => box.getAttribute('aria-checked')),
  )
}

test('clicking a task box flips only that item among look-alikes, in nested lists and quotes', async ({
  nullpad,
}) => {
  const note = (marks: ReadonlyArray<string>) =>
    [
      `- [${marks[0]}] a`,
      `- [${marks[1]}] a`,
      `  - [${marks[2]}] a`,
      `  - [${marks[3]}] a`,
      '',
      `> - [${marks[4]}] a`,
      `> - [${marks[5]}] a`,
    ].join('\n')
  await nullpad.paste(note([' ', ' ', ' ', 'X', ' ', ' ']))
  await openRead(nullpad)
  expect(await states(nullpad), 'six boxes at first').toEqual([
    'false',
    'false',
    'false',
    'true',
    'false',
    'false',
  ])
  const flipAndRead = async (index: number) => {
    await boxes(nullpad).nth(index).click()
    await settle(nullpad.page)
    const after = await states(nullpad)
    await expect(
      nullpad.page.locator('.read'),
      'the read view stays open after a click',
    ).toBeVisible()
    await nullpad.page.keyboard.press('Control+e')
    await settle(nullpad.page)
    const text = await nullpad.text()
    await openRead(nullpad)
    return { text, after }
  }
  const first = await flipAndRead(1)
  expect(first.text, 'second item checked, others untouched').toBe(
    note([' ', 'x', ' ', 'X', ' ', ' ']),
  )
  expect(first.after, 'boxes after the first click').toEqual([
    'false',
    'true',
    'false',
    'true',
    'false',
    'false',
  ])
  expect(
    (await flipAndRead(2)).text,
    'nested item checked, others untouched',
  ).toBe(note([' ', 'x', 'x', 'X', ' ', ' ']))
  expect((await flipAndRead(3)).text, 'capital X unchecked').toBe(
    note([' ', 'x', 'x', ' ', ' ', ' ']),
  )
  expect((await flipAndRead(5)).text, 'item in a quote checked').toBe(
    note([' ', 'x', 'x', ' ', ' ', 'x']),
  )
  expect((await flipAndRead(1)).text, 'x unchecked').toBe(
    note([' ', ' ', 'x', ' ', ' ', 'x']),
  )
})

test('square brackets that are not a task draw no checkbox', async ({
  nullpad,
}) => {
  await nullpad.paste(
    ['- [ ]x', '- [y] a', '- [] a', '- [  ] a', '', '[ ] a', '', '1. [x]'].join(
      '\n',
    ),
  )
  await openRead(nullpad)
  expect(await boxes(nullpad).count(), 'no checkbox for look-alikes').toBe(0)
  const text = await readText(nullpad)
  for (const shown of ['[ ]x', '[y] a', '[] a', '[ ] a', '[x]']) {
    expect(text, `"${shown}" is drawn as text`).toContain(shown)
  }
})

test('a flipped task box survives a reload and the cursor stays where it was', async ({
  nullpad,
}) => {
  await nullpad.paste('# Todo\n\n- [ ] one\n- [ ] two\n\nend')
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', 3)
  await nullpad.press('ArrowRight', 5)
  const before = await nullpad.status()
  await openRead(nullpad)
  await boxes(nullpad).nth(1).click()
  await settle(nullpad.page)
  expect(await states(nullpad), 'the box shows its new state').toEqual([
    'false',
    'true',
  ])
  await nullpad.page.keyboard.press('Control+e')
  await settle(nullpad.page)
  const expected = '# Todo\n\n- [ ] one\n- [x] two\n\nend'
  expect(await nullpad.text(), 'editor text after the click').toBe(expected)
  expect(await nullpad.status(), 'cursor where it was').toEqual(before)
  await nullpad.page.waitForTimeout(1500)
  await nullpad.reload()
  expect(await nullpad.text(), 'text after a reload').toBe(expected)
})

type Seen = Readonly<{ text: string; top: number; bottom: number }>

const onScreen = (nullpad: Nullpad) =>
  nullpad.page.evaluate(() => {
    const read = document.querySelector('.read')
    if (read === null) {
      throw new Error('no .read on screen')
    }
    const box = read.getBoundingClientRect()
    const range = document.createRange()
    const walker = document.createTreeWalker(read, NodeFilter.SHOW_TEXT)
    const seen: Array<{ text: string; top: number; bottom: number }> = []
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      if ((node.textContent ?? '').trim() === '') {
        continue
      }
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      if (rect.height > 0 && rect.bottom > box.top && rect.top < box.bottom) {
        seen.push({
          text: (node.textContent ?? '').trim(),
          top: rect.top,
          bottom: rect.bottom,
        })
      }
    }
    return { box: { top: box.top, bottom: box.bottom }, seen }
  })

const find = (seen: ReadonlyArray<Seen>, text: string) =>
  seen.find(item => item.text === text)

const blanks = (count: number) => '\n'.repeat(count)

const expectOutroOnFirstScreen = async (nullpad: Nullpad) => {
  await nullpad.press('Control+Home')
  await openRead(nullpad)
  const { box, seen } = await onScreen(nullpad)
  const outro = find(seen, 'Outro')
  expect(
    outro,
    'Outro is drawn on the first screen of the read view',
  ).toBeDefined()
  expect(outro?.top ?? Infinity, 'Outro is inside the read view').toBeLessThan(
    box.bottom,
  )
}

test('Outro is on the first screen after 300 blank lines', async ({
  nullpad,
}) => {
  await nullpad.paste(`Intro${blanks(301)}Outro`)
  await expectOutroOnFirstScreen(nullpad)
})

test('Outro is on the first screen after 400 link definitions', async ({
  nullpad,
}) => {
  const definitions = Array.from(
    { length: 400 },
    (_, i) => `[r${i}]: /u${i}`,
  ).join('\n')
  await nullpad.paste(`Intro\n\n${definitions}\n\nOutro`)
  await expectOutroOnFirstScreen(nullpad)
})

test('paragraphs after a 600-item list fill the screen when the list ends mid-screen', async ({
  nullpad,
}) => {
  const items = Array.from({ length: 600 }, (_, i) => `- item ${i + 1}`)
  const paragraphs = Array.from({ length: 200 }, (_, i) => `para ${i + 1}`)
  await nullpad.paste([...items, '', paragraphs.join('\n\n')].join('\n'))
  await nullpad.press('Control+Home')
  await openRead(nullpad)
  await nullpad.page.locator('.read').hover()
  const stepUnderHalfTheView = 250
  const turnsPastTheList = 150
  let now = await onScreen(nullpad)
  for (let i = 0; i < turnsPastTheList; i++) {
    const end = find(now.seen, 'item 600')
    if (end !== undefined && end.top < (now.box.top + now.box.bottom) / 2) {
      break
    }
    await nullpad.page.mouse.wheel(0, stepUnderHalfTheView)
    await settle(nullpad.page)
    now = await onScreen(nullpad)
  }
  const end = find(now.seen, 'item 600')
  expect(end, 'the end of the list is on screen').toBeDefined()
  expect(
    end?.top ?? Infinity,
    'the list ends above the middle of the screen',
  ).toBeLessThan((now.box.top + now.box.bottom) / 2)
  expect(
    now.seen.filter(item => /^para \d+$/.test(item.text)).length,
    'paragraphs after the list are on screen',
  ).toBeGreaterThan(0)
  expect(
    Math.max(...now.seen.map(item => item.bottom)),
    'text reaches the bottom of the screen, no blank area',
  ).toBeGreaterThan(now.box.bottom - 80)
})

test('the first screen is filled with text when each paragraph is followed by 30 blank lines', async ({
  nullpad,
}) => {
  const note = Array.from({ length: 100 }, (_, i) => `para ${i + 1}`).join(
    blanks(31),
  )
  await nullpad.paste(note)
  await nullpad.press('Control+Home')
  await openRead(nullpad)
  const { box, seen } = await onScreen(nullpad)
  expect(
    seen.length,
    'more than one paragraph fits on the first screen',
  ).toBeGreaterThan(1)
  expect(
    Math.max(...seen.map(item => item.bottom)),
    'text reaches the bottom of the first screen',
  ).toBeGreaterThan(box.bottom - 120)
})

test('a 5,000-item list opens at the cursor’s item and draws under 2,000 elements', async ({
  nullpad,
}) => {
  const items = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `- item ${from + i}`)
  await nullpad.paste(items(1365, 5000).join('\n'))
  await nullpad.press('Control+Home')
  await nullpad.paste(`${items(1, 1364).join('\n')}\n`)
  expect((await nullpad.status()).line, 'cursor on item 1365').toBe(1365)
  await openRead(nullpad)
  const { box, seen } = await onScreen(nullpad)
  const first = seen.find(item => item.top >= box.top - 1)
  expect(first?.text, 'the first item on screen is the cursor’s item').toBe(
    'item 1365',
  )
  expect(
    await nullpad.page.locator('.read *').count(),
    'elements drawn in the read view',
  ).toBeLessThan(2000)
})

const opensAtBlockStartingOnNextLine = async (
  nullpad: Nullpad,
  target: ReadonlyArray<string>,
  upFromEnd: number,
  shown: string | null,
) => {
  const paragraph = Array.from({ length: 400 }, (_, i) => `word ${i + 1}`)
  const after = Array.from({ length: 200 }, (_, i) => `after ${i + 1}`)
  await nullpad.paste([...paragraph, '', ...target, '', ...after].join('\n'))
  await nullpad.press('Control+End')
  await nullpad.press('ArrowUp', after.length + 1 + upFromEnd)
  const { line } = await nullpad.status()
  expect(line, 'cursor on the first line of the target block').toBe(402)
  await openRead(nullpad)
  const top = await nullpad.page.evaluate(() => {
    const read = document.querySelector('.read')
    const readTop = read?.getBoundingClientRect().top ?? 0
    const first = Array.from(
      document.querySelectorAll<HTMLElement>('.read [data-source-line]'),
    ).find(element => element.getBoundingClientRect().bottom > readTop + 1)
    return first === undefined
      ? null
      : {
          line: Number(first.dataset['sourceLine']),
          offset: first.getBoundingClientRect().top - readTop,
        }
  })
  expect(top, 'a block is drawn at the top of the read view').not.toBeNull()
  expect(
    top?.line,
    'the block at the top starts in the target block, not the paragraph above',
  ).toBeGreaterThanOrEqual(402)
  expect(
    top?.line,
    'the block at the top starts in the target block, not after it',
  ).toBeLessThanOrEqual(403)
  expect(
    Math.abs(top?.offset ?? 0),
    'the target block sits at the top of the read view',
  ).toBeLessThan(80)
  if (shown !== null) {
    await expect(
      nullpad.page.locator('.read').getByText(shown),
      'the target block’s text is on screen',
    ).toBeInViewport()
  }
}

test('opening the read view on an opening code fence puts the code block at the top', async ({
  nullpad,
}) => {
  await opensAtBlockStartingOnNextLine(
    nullpad,
    ['```', 'fenced body', '```'],
    2,
    'fenced body',
  )
})

test('opening the read view on a bare > line puts the quote at the top', async ({
  nullpad,
}) => {
  await opensAtBlockStartingOnNextLine(
    nullpad,
    ['>', '> quoted words'],
    1,
    'quoted words',
  )
})

test('opening the read view on a bare - marker puts the list at the top', async ({
  nullpad,
}) => {
  await opensAtBlockStartingOnNextLine(
    nullpad,
    ['-', '  item words'],
    1,
    'item words',
  )
})

test('opening the read view on the fence of an empty code block puts it at the top', async ({
  nullpad,
}) => {
  await opensAtBlockStartingOnNextLine(nullpad, ['```', '```'], 1, null)
})

test('opening the read view on a fence with an info string shows the info line', async ({
  nullpad,
}) => {
  const paragraph = Array.from({ length: 400 }, (_, i) => `word ${i + 1}`)
  const after = Array.from({ length: 200 }, (_, i) => `after ${i + 1}`)
  await nullpad.paste(
    [...paragraph, '', '```js', 'let a = 1', '```', '', ...after].join('\n'),
  )
  await nullpad.press('Control+End')
  await nullpad.press('ArrowUp', after.length + 3)
  expect((await nullpad.status()).line, 'cursor on the fence').toBe(402)
  await openRead(nullpad)
  await expect(
    nullpad.page.locator('.read pre[data-info="js"]'),
    'the code block with its info line is on screen',
  ).toBeInViewport({ ratio: 1 })
})

test('one huge wheel turn down in the read view shows the end of a note whose last block is taller than the screen', async ({
  nullpad,
}) => {
  const paragraphs = Array.from({ length: 1000 }, (_, i) => `para ${i + 1}`)
  const last = `${Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ')} THEEND`
  await nullpad.paste([...paragraphs, last].join('\n\n'))
  await openRead(nullpad)
  const box = await nullpad.page.locator('.read').boundingBox()
  expect(box, 'the read view has a box').not.toBeNull()
  await nullpad.page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  )
  await nullpad.page.mouse.wheel(0, 3_000_000)
  await nullpad.page.waitForTimeout(800)
  await settle(nullpad.page)
  await expect
    .poll(
      () =>
        nullpad.page.evaluate(() => {
          const read = document.querySelector('.read')
          if (read === null) {
            return false
          }
          const view = read.getBoundingClientRect()
          const walker = document.createTreeWalker(read, NodeFilter.SHOW_TEXT)
          const range = document.createRange()
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const at = node.textContent?.indexOf('THEEND') ?? -1
            if (at >= 0) {
              range.setStart(node, at)
              range.setEnd(node, at + 6)
              const rect = range.getBoundingClientRect()
              return rect.bottom > view.top && rect.top < view.bottom
            }
          }
          return false
        }),
      {
        message: 'THEEND is in the viewport after one huge wheel turn',
        timeout: 3000,
      },
    )
    .toBe(true)
})

test('opening the read view on line 1 draws the title where Ctrl+Home leaves it', async ({
  nullpad,
}) => {
  const note = [
    '# Title',
    ...Array.from({ length: 200 }, (_, i) => `para ${i + 1}`),
  ].join('\n\n')
  await nullpad.paste(note)
  await nullpad.press('Control+Home')
  await openRead(nullpad)
  const offset = () =>
    nullpad.page.evaluate(() => {
      const read = document.querySelector('.read')
      const title = document.querySelector('.read h1')
      if (read === null || title === null) {
        return null
      }
      return (
        title.getBoundingClientRect().top - read.getBoundingClientRect().top
      )
    })
  await settle(nullpad.page)
  const opened = await offset()
  await nullpad.page.keyboard.press('Control+Home')
  await settle(nullpad.page)
  await settle(nullpad.page)
  const home = await offset()
  expect(opened, 'the title is drawn after opening').not.toBeNull()
  expect(home, 'the title is drawn after Ctrl+Home').not.toBeNull()
  expect(
    Math.abs((opened ?? 0) - (home ?? 0)),
    `title offset after opening (${opened}) equals the offset after Ctrl+Home (${home})`,
  ).toBeLessThanOrEqual(1)
})

test('a task in a numbered list keeps its number and draws its box', async ({
  nullpad,
}) => {
  await nullpad.paste('1. [ ] first\n2. [x] second')
  await openRead(nullpad)
  const items = await nullpad.page.evaluate(() =>
    Array.from(document.querySelectorAll('.read ol > li')).map(item => ({
      listStyleType: getComputedStyle(item).listStyleType,
      boxes: item.querySelectorAll('[role=checkbox]').length,
      text: (item as HTMLElement).innerText,
    })),
  )
  expect(items.length, 'two numbered items').toBe(2)
  for (const [index, item] of items.entries()) {
    expect(
      item.listStyleType,
      `item ${index + 1} is drawn as a numbered item`,
    ).not.toBe('none')
    expect(item.boxes, `item ${index + 1} draws its box`).toBe(1)
  }
})
