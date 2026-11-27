import {
  type Nullpad,
  type WhichKey,
  expect,
  numberedLines,
  settle,
  startVimRow,
  test,
} from './nullpad'

const begin = (nullpad: Nullpad, text: string) =>
  startVimRow(nullpad, text, 1, 1)

const keys = async (nullpad: Nullpad, text: string) => {
  for (const key of [...text]) {
    await nullpad.page.keyboard.press(key)
  }
  await settle(nullpad.page)
}

const panelOf = async (
  nullpad: Nullpad,
  pending: string,
  label: string,
): Promise<WhichKey> => {
  await expect
    .poll(async () => (await nullpad.whichKey())?.pending ?? null, {
      message: `${label}: the panel shows with its pending keys`,
    })
    .toBe(pending)
  const panel = await nullpad.whichKey()
  if (panel === null) {
    throw new Error(`${label}: the panel went away while it was read`)
  }
  return panel
}

const expectGone = async (nullpad: Nullpad, label: string) =>
  expect(await nullpad.whichKey(), label).toBeNull()

const expectQuiet = async (nullpad: Nullpad, label: string) => {
  await nullpad.page.waitForTimeout(700)
  expect(await nullpad.whichKey(), label).toBeNull()
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const pending = nullpad.page.locator('.status .pending')
  return (await pending.count()) === 0 ? '' : (await pending.innerText()).trim()
}

const keysOf = (panel: WhichKey) => panel.entries.map(entry => entry.key)

const entryOf = (panel: WhichKey, key: string) =>
  panel.entries.find(entry => entry.key === key)

type Appearances = Readonly<{
  presses: ReadonlyArray<number>
  shown: ReadonlyArray<Readonly<{ at: number; pending: string }>>
}>

const watchPanel = (nullpad: Nullpad) =>
  nullpad.page.evaluate(() => {
    const log: {
      presses: Array<number>
      shown: Array<{ at: number; pending: string }>
    } = { presses: [], shown: [] }
    addEventListener('keydown', () => log.presses.push(performance.now()), {
      capture: true,
    })
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            const panel = node.matches('.which-key')
              ? node
              : node.querySelector('.which-key')
            if (panel !== null) {
              log.shown.push({
                at: performance.now(),
                pending: panel.getAttribute('data-pending') ?? '',
              })
            }
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true })
    Reflect.set(globalThis, 'whichKeyLog', log)
  })

const appearances = (nullpad: Nullpad): Promise<Appearances> =>
  nullpad.page.evaluate(() => Reflect.get(globalThis, 'whichKeyLog'))

const plain = 'abc xyz def'

test('d shows the panel with data-pending d once the wait is over', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  const panel = await panelOf(nullpad, 'd', 'after d')
  expect(panel.rect.right - panel.rect.left, 'panel width').toBeGreaterThan(0)
  expect(panel.rect.bottom - panel.rect.top, 'panel height').toBeGreaterThan(0)
})

test('data-pending equals the status line pending keys', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, '2d')
  const panel = await panelOf(nullpad, '2d', 'after 2d')
  expect(await pendingOf(nullpad), 'status pending').toBe(panel.pending)
})

test('after d the panel lists the word motion, the line, the groups and the letter finds', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  const panel = await panelOf(nullpad, 'd', 'after d')
  for (const key of [
    'w',
    '$',
    'd',
    'i',
    'a',
    'f',
    't',
    'F',
    'T',
    '/',
    '?',
    's',
  ]) {
    expect(keysOf(panel), `after d lists ${key}`).toContain(key)
  }
})

test('after d, i and a are groups named +inside and +around', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  const panel = await panelOf(nullpad, 'd', 'after d')
  const inside = entryOf(panel, 'i')
  const around = entryOf(panel, 'a')
  expect(inside?.group, 'i is a group').toBe(true)
  expect(inside?.text, 'i reads +inside').toContain('+inside')
  expect(around?.group, 'a is a group').toBe(true)
  expect(around?.text, 'a reads +around').toContain('+around')
  expect(entryOf(panel, 'w')?.group, 'w is no group').toBe(false)
})

test('after d the text objects are not listed one by one', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  const panel = await panelOf(nullpad, 'd', 'after d')
  expect(keysOf(panel), 'paragraph object').not.toContain('p')
  expect(keysOf(panel), 'bracket object').not.toContain('(')
})

for (const operator of ['d', 'c', 'y']) {
  test(`after ${operator} the operator's own key comes first, then the groups i and a`, async ({
    nullpad,
  }) => {
    await begin(nullpad, plain)
    await keys(nullpad, operator)
    const panel = await panelOf(nullpad, operator, `after ${operator}`)
    expect(
      keysOf(panel).slice(0, 3),
      `first entries after ${operator}`,
    ).toEqual([operator, 'i', 'a'])
  })
}

test('after d no digit is listed', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  const panel = await panelOf(nullpad, 'd', 'after d')
  expect(
    keysOf(panel).filter(key => /^[0-9]$/.test(key)),
    'digit entries after d',
  ).toEqual([])
})

test('after di the panel lists the text objects and no groups', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'di')
  const panel = await panelOf(nullpad, 'di', 'after di')
  for (const key of ['w', 'p', '"', '(']) {
    expect(keysOf(panel), `after di lists ${key}`).toContain(key)
  }
  expect(
    panel.entries.filter(entry => entry.group),
    'groups after di',
  ).toEqual([])
})

test('once the panel shows, the next key changes it in the same frame', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  await panelOf(nullpad, 'd', 'after d')
  await keys(nullpad, 'i')
  const panel = await nullpad.whichKey()
  expect(panel?.pending, 'panel right after i, no second wait').toBe('di')
  expect(
    panel?.entries.map(entry => entry.key),
    'objects right after i',
  ).toContain('w')
})

test('after g the panel lists g and v', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'g')
  const panel = await panelOf(nullpad, 'g', 'after g')
  expect(keysOf(panel), 'after g lists g').toContain('g')
  expect(keysOf(panel), 'after g lists v').toContain('v')
})

test('after " with empty registers the panel lists a-z named, black hole and clipboard', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, '"')
  const panel = await panelOf(nullpad, '"', 'after "')
  expect(entryOf(panel, 'a-z')?.text, 'a-z entry').toContain('named')
  expect(entryOf(panel, '_')?.text, '_ entry').toContain('black hole')
  expect(entryOf(panel, '+')?.text, '+ entry').toContain('clipboard')
  expect(keysOf(panel), 'no lettered entry while all are empty').not.toContain(
    'a',
  )
})

test('after a yank into "a the register panel previews its text', async ({
  nullpad,
}) => {
  await begin(nullpad, 'hello world\nsecond')
  await keys(nullpad, '"ayw')
  await keys(nullpad, '"')
  const panel = await panelOf(nullpad, '"', 'after "')
  expect(entryOf(panel, 'a')?.text, 'preview of "a').toContain('hello')
  expect(keysOf(panel), 'a-z stays for the rest').toContain('a-z')
})

test('a preview shows a line break as ↵', async ({ nullpad }) => {
  await begin(nullpad, 'hello\nsecond\nthird')
  await keys(nullpad, '"ayj')
  await keys(nullpad, '"')
  const panel = await panelOf(nullpad, '"', 'after "')
  expect(entryOf(panel, 'a')?.text, 'preview with a line break').toContain(
    'hello↵second',
  )
})

test('after " the panel hides once the register is named and the next operator waits again', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, '"')
  await panelOf(nullpad, '"', 'after "')
  await keys(nullpad, 'a')
  await expectGone(nullpad, 'right after "a')
  await keys(nullpad, 'd')
  const panel = await panelOf(nullpad, '"ad', 'after "ad')
  expect(keysOf(panel), 'operator panel after "ad').toContain('w')
})

for (const key of ['f', 'r', 't', 'F', 'T']) {
  test(`${key} shows one any letter entry`, async ({ nullpad }) => {
    await begin(nullpad, plain)
    await keys(nullpad, key)
    const panel = await panelOf(nullpad, key, `after ${key}`)
    expect(keysOf(panel), `entries after ${key}`).toEqual(['any letter'])
  })
}

test('df shows the any letter entry', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'df')
  const panel = await panelOf(nullpad, 'df', 'after df')
  expect(keysOf(panel), 'entries after df').toEqual(['any letter'])
})

test('in VISUAL, i shows the text objects', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'vi')
  const panel = await panelOf(nullpad, 'i', 'after vi')
  expect(keysOf(panel), 'objects after vi').toContain('w')
})

test('in VISUAL, a key that waits for a key and does nothing shows no panel', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'vm')
  await expectQuiet(nullpad, 'panel after vm')
})

test('3d shows what d shows', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  const alone = await panelOf(nullpad, 'd', 'after d')
  await nullpad.press('Escape')
  await expectGone(nullpad, 'after Esc')
  await keys(nullpad, '3d')
  const counted = await panelOf(nullpad, '3d', 'after 3d')
  expect(counted.entries, 'entries of 3d').toEqual(alone.entries)
})

test('a count alone shows nothing', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, '3')
  await expectQuiet(nullpad, 'panel after 3')
})

test('with nothing pending the panel never shows', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await nullpad.press('l')
  await expectQuiet(nullpad, 'panel with nothing pending')
})

test('the panel is gone in the same frame the command runs', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  await panelOf(nullpad, 'd', 'after d')
  await keys(nullpad, 'w')
  await expectGone(nullpad, 'right after dw')
  expect(await nullpad.text(), 'text after dw').toBe('xyz def')
})

test('the panel is gone in the same frame Esc is pressed', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  await panelOf(nullpad, 'd', 'after d')
  await nullpad.press('Escape')
  await expectGone(nullpad, 'right after Esc')
})

test('the panel is gone in the same frame a key with no row is pressed', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  await panelOf(nullpad, 'd', 'after d')
  await keys(nullpad, '.')
  await expectGone(nullpad, 'right after d.')
})

test('the panel is gone in the same frame of a click', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  await panelOf(nullpad, 'd', 'after d')
  const screen = await nullpad.screen()
  const row = screen.rows[0]
  if (row === undefined) {
    throw new Error('no row on screen')
  }
  await nullpad.click(row.left + 2, row.top + 3)
  await expectGone(nullpad, 'right after the click')
})

for (const [name, chord, leave] of [
  ['Ctrl-E', 'Control+e', 'Escape'],
  ['Ctrl-P', 'Control+p', 'Escape'],
  ['the vim toggle', 'Control+,', 'Control+,'],
] as const) {
  test(`the panel is gone in the same frame of ${name}`, async ({
    nullpad,
  }) => {
    await begin(nullpad, plain)
    await keys(nullpad, 'd')
    await panelOf(nullpad, 'd', 'after d')
    await nullpad.press(chord)
    await expectGone(nullpad, `right after ${name}`)
    await nullpad.press(leave)
  })
}

test('the panel never shows in INSERT', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'id')
  await expectQuiet(nullpad, 'panel in INSERT')
})

test('the panel never shows with vim off', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await nullpad.press('Control+,')
  await expect(nullpad.page.locator('.status .mode')).toHaveText('EDIT')
  await keys(nullpad, 'd')
  await expectQuiet(nullpad, 'panel with vim off')
})

test('the panel never shows while a / prompt is open', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd/')
  await expect(nullpad.page.locator('.status .prompt')).toBeVisible()
  await expectQuiet(nullpad, 'panel in the prompt')
})

test('the panel never shows during a jump', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'ds')
  await expect(nullpad.page.locator('.surface.jumping')).toHaveCount(1)
  await expectQuiet(nullpad, 'panel during the jump')
})

test('typing dw at speed never shows the panel, and a held d shows it once', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await watchPanel(nullpad)
  await nullpad.page.keyboard.press('d')
  await nullpad.page.keyboard.press('w')
  await nullpad.page.waitForTimeout(700)
  expect((await appearances(nullpad)).shown, 'appearances after dw').toEqual([])
  await nullpad.page.keyboard.press('d')
  await panelOf(nullpad, 'd', 'after the held d')
  const { shown } = await appearances(nullpad)
  expect(shown.length, 'appearances after d').toBe(1)
  expect(shown[0]?.pending, 'pending at the appearance').toBe('d')
})

test('d2 restarts the wait', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  await nullpad.page.waitForTimeout(150)
  await keys(nullpad, '2')
  await nullpad.page.waitForTimeout(100)
  await expectGone(nullpad, '250 ms after d, 100 ms after 2')
  await panelOf(nullpad, 'd2', 'after d2')
})

test('the panel shows about 300 ms after the last key', async ({ nullpad }) => {
  await begin(nullpad, plain)
  await watchPanel(nullpad)
  await nullpad.page.keyboard.press('d')
  await panelOf(nullpad, 'd', 'after d')
  const { presses, shown } = await appearances(nullpad)
  const pressed = presses.at(-1) ?? NaN
  const appeared = shown[0]?.at ?? NaN
  expect(appeared - pressed, 'ms from the key to the panel').toBeGreaterThan(
    280,
  )
  expect(appeared - pressed, 'ms from the key to the panel').toBeLessThan(3000)
})

const roomed = (panel: WhichKey) =>
  panel.rect.bottom <= panel.caret.top || panel.rect.top >= panel.caret.bottom

for (const [name, size] of [
  ['1000x600', [1000, 600]],
  ['390x844', [390, 844]],
] as const) {
  test(`at ${name} the panel stays off the cursor's row on the first line`, async ({
    nullpad,
  }) => {
    await nullpad.resize(size[0], size[1])
    await begin(nullpad, numberedLines(200))
    await keys(nullpad, 'd')
    const panel = await panelOf(nullpad, 'd', 'after d on line 1')
    expect(
      roomed(panel),
      `panel ${JSON.stringify(panel.rect)} clear of the cursor ${JSON.stringify(panel.caret)}`,
    ).toBe(true)
  })

  test(`at ${name} the panel stays off the cursor's row on the last screen row`, async ({
    nullpad,
  }) => {
    await nullpad.resize(size[0], size[1])
    await begin(nullpad, numberedLines(200))
    const rows = (await nullpad.screen()).rows.length
    await keys(nullpad, `${rows - 1}j`)
    await keys(nullpad, 'd')
    const panel = await panelOf(nullpad, 'd', 'after d on the last row')
    expect(
      roomed(panel),
      `panel ${JSON.stringify(panel.rect)} clear of the cursor ${JSON.stringify(panel.caret)}`,
    ).toBe(true)
  })

  test(`at ${name} the panel is under half the surface's height`, async ({
    nullpad,
  }) => {
    await nullpad.resize(size[0], size[1])
    await begin(nullpad, plain)
    await keys(nullpad, 'd')
    const panel = await panelOf(nullpad, 'd', 'after d')
    expect(
      panel.rect.bottom - panel.rect.top,
      'panel height against half the surface',
    ).toBeLessThan(panel.surfaceHeight / 2)
  })
}

test('at phone width the panel ends with … N more after d', async ({
  nullpad,
}) => {
  await nullpad.resize(390, 844)
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  const panel = await panelOf(nullpad, 'd', 'after d')
  expect(panel.more, 'the more line').toMatch(/^… \d+ more$/)
})

test('the panel does not move the text or the scroll', async ({ nullpad }) => {
  await begin(nullpad, numberedLines(200))
  await keys(nullpad, '10j')
  const before = await nullpad.screen()
  await keys(nullpad, 'd')
  await panelOf(nullpad, 'd', 'after d')
  const after = await nullpad.screen()
  expect(
    after.rows.map(row => [row.lineId, row.top, row.left]),
    'rows with the panel on screen',
  ).toEqual(before.rows.map(row => [row.lineId, row.top, row.left]))
})

test('a click on the text under the panel lands on the text', async ({
  nullpad,
}) => {
  await begin(nullpad, numberedLines(100))
  await keys(nullpad, 'd')
  const panel = await panelOf(nullpad, 'd', 'after d')
  const x = (panel.rect.left + panel.rect.right) / 2
  const y = (panel.rect.top + panel.rect.bottom) / 2
  const row = (await nullpad.screen()).rows.find(
    each => each.top <= y && y < each.bottom,
  )
  expect(row?.number, 'a numbered row under the panel').not.toBeNull()
  await nullpad.click(x, y)
  expect((await nullpad.status()).line, 'line after the click').toBe(
    Number(row?.number),
  )
})

test('typing dw with the panel never shown still deletes a word', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await nullpad.page.keyboard.press('d')
  await nullpad.page.keyboard.press('w')
  await settle(nullpad.page)
  expect(await nullpad.text(), 'text after fast dw').toBe('xyz def')
})

test('dw typed with the panel shown deletes the same word', async ({
  nullpad,
}) => {
  await begin(nullpad, plain)
  await keys(nullpad, 'd')
  await panelOf(nullpad, 'd', 'after d')
  await keys(nullpad, 'w')
  expect(await nullpad.text(), 'text after dw through the panel').toBe(
    'xyz def',
  )
})
