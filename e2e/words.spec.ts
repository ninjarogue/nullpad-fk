import type { Page } from '@playwright/test'

import { expect, openFresh, screenOf, statusOf, test, textOf } from './nullpad'
import { type Pair, openPair } from './typist/run'

test.describe.configure({ mode: 'parallel' })

const longProse = Array.from(
  { length: 6 },
  () =>
    'The quick brown fox, jumps over the lazy dog. Don’t panic: it’s (mostly) harmless!',
).join(' ')

const texts: ReadonlyArray<string> = [
  'foo bar baz',
  'foo.bar baz foo-bar foo_bar',
  "don't stop, it's a dog's life",
  'a  b   c    d',
  'see https://example.com/a?b=1&c=d#e ok',
  'mail foo.bar@example.com today',
  '**bold** `code` _it_ __u__ ~~s~~',
  '# Heading\n\n- [ ] task one\n- [x] done\n\n> quote, here',
  '[link](http://a.b/c) ![img](x.png) <b>tag</b>',
  'x, y; z! (q) [r] {s} "quoted" «guill» “curly”',
  '3.14 1,000 v2 1.2.3 10:30 -5 +7 50% $100 €5',
  'a+b a$b a©b a→b a°b 1+2=3 a × b a·b a...b a--b a—b',
  'snake_case camelCase kebab-case obj.method().prop',
  "_a a_ _Z_( __a__. 1_' x a_b.",
  'é café naïve résumé, Straße! ÆØÅ',
  'é café. naïve',
  '日本語のテキストです。漢字とカタカナ、ひらがな。',
  '中文文本没有空格，对吧？好的！',
  '한국어 텍스트 입니다. 그는 "안녕"이라고 말했다.',
  'ภาษาไทยไม่มีช่องว่าง',
  'Привет, мир! مرحبا بالعالم',
  'a👍b 👍👍 c🇯🇵d x 🇺🇸🇯🇵 y',
  '👨‍👩‍👧 family ❤️ heart 👍🏽 tone 1️⃣ keycap',
  'a😀.b 😀😀😀 ❤️. x ❤️❤️ y',
  'Ⅻ roman ½ frac ²³ sup ٣٤ digits ＿＿ fullwidth',
  'tab\there nb sp ideo　space em space',
  '  lead\ntrail  \n  both  \n',
  'ab\n\n\ncd\n \n.\n.cd\nef gh\n',
  'ab.\n.cd\nab  \n  cd\nx  \n\ny',
  '\n\nfirst\n\n',
  longProse,
  `${'aaaaaaaaaa'.repeat(14)} tail and ${'b'.repeat(130)}.end`,
  `${'日本語のテキストです'.repeat(12)}\n${'漢字'.repeat(70)}`,
  `start https://example.com/${'segment/'.repeat(30)}end done`,
  `${'word '.repeat(40)}\n${'  spaced   out   '.repeat(10)}`,
]

const keys = [
  'Control+ArrowRight',
  'Control+ArrowLeft',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
] as const
type Key = (typeof keys)[number]

const nonWordKeys = keys.slice(2)

const mulberry32 = (seed: number) => {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const keysFor = (text: string, seed: number): ReadonlyArray<Key> => {
  const stops = text.split(/\s+/u).length + text.split('\n').length + 4
  const forward = Array.from({ length: stops }, (): Key => 'Control+ArrowRight')
  const backward = Array.from({ length: stops }, (): ReadonlyArray<Key> => [
    'Control+ArrowLeft',
    'Control+ArrowLeft',
    'ArrowLeft',
  ]).flat()
  const random = mulberry32(seed)
  const mixed = Array.from({ length: 60 }, (): Key => {
    const roll = random()
    return roll < 0.3
      ? 'Control+ArrowRight'
      : roll < 0.6
        ? 'Control+ArrowLeft'
        : (nonWordKeys[Math.floor(random() * nonWordKeys.length)] ??
          'ArrowLeft')
  })
  return [...forward, ...backward, ...mixed]
}

type Caret = Readonly<{ line: number; column: number }>

const nullpadCaret = async (page: Page): Promise<Caret> => {
  const { line, column } = await statusOf(page)
  return { line, column }
}

const textareaCaret = (page: Page): Promise<Caret> =>
  page.evaluate(() => {
    const area = document.querySelector('textarea')
    if (area === null) {
      throw new Error('the oracle page has no textarea')
    }
    const before = area.value.slice(0, area.selectionStart)
    const lineStart = before.lastIndexOf('\n') + 1
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return {
      line: before.split('\n').length,
      column: [...segmenter.segment(before.slice(lineStart))].length + 1,
    }
  })

const textareaPressAsNullpad = async (page: Page, key: Key): Promise<Caret> => {
  const before = await textareaCaret(page)
  await page.keyboard.press(key)
  const after = await textareaCaret(page)
  const stuckAtLineStart =
    key === 'Control+ArrowLeft' &&
    after.column === 1 &&
    after.line > 1 &&
    after.line === before.line &&
    after.column === before.column
  if (!stuckAtLineStart) {
    return after
  }
  await page.keyboard.press('ArrowLeft')
  return textareaCaret(page)
}

const load = async (pair: Pair, text: string) => {
  await Promise.all([
    openFresh(pair.nullpad)
      .then(() => pair.nullpad.keyboard.insertText(text))
      .then(() => pair.nullpad.keyboard.press('Control+Home')),
    pair.textarea.evaluate(value => {
      const area = document.querySelector('textarea')
      if (area !== null) {
        area.value = value
        area.focus()
        area.setSelectionRange(0, 0)
      }
    }, text),
  ])
}

const show = (key: Key) => `<${key.replace('Control+', 'C-')}>`

const firstDifference = async (
  pair: Pair,
  text: string,
  keys: ReadonlyArray<Key>,
): Promise<string | null> => {
  await load(pair, text)
  const loaded = await screenOf(pair.nullpad)
  expect(textOf(loaded), 'nullpad holds the text').toBe(text)
  expect(loaded.status, 'nullpad starts at the start of the text').toEqual(
    expect.objectContaining({ line: 1, column: 1 }),
  )
  for (const [at, key] of keys.entries()) {
    const [nullpad, textarea] = await Promise.all([
      pair.nullpad.keyboard.press(key).then(() => nullpadCaret(pair.nullpad)),
      textareaPressAsNullpad(pair.textarea, key),
    ])
    if (nullpad.line !== textarea.line || nullpad.column !== textarea.column) {
      return [
        `text ${JSON.stringify(text)}`,
        `  keys: ${keys
          .slice(0, at + 1)
          .map(show)
          .join(' ')}`,
        `  after step ${at + 1} ${show(key)}: textarea ${textarea.line}:${textarea.column}, nullpad ${nullpad.line}:${nullpad.column}`,
      ].join('\n')
    }
  }
  return null
}

test('Ctrl+Right stops at the end of each word and Ctrl+Left at its start, as on Linux', async ({
  nullpad,
}) => {
  await nullpad.type('foo bar.baz')
  await nullpad.press('Control+Home')
  const columns: Array<number> = []
  for (let i = 0; i < 5; i++) {
    await nullpad.press('Control+ArrowRight')
    columns.push((await nullpad.status()).column)
  }
  expect(columns, 'Ctrl+Right from the start').toEqual([4, 8, 9, 12, 12])
  columns.length = 0
  for (let i = 0; i < 5; i++) {
    await nullpad.press('Control+ArrowLeft')
    columns.push((await nullpad.status()).column)
  }
  expect(columns, 'Ctrl+Left from the end').toEqual([9, 8, 5, 1, 1])
})

test('Ctrl+Left at the start of a line goes to the end of the line above, where a textarea stays put', async ({
  nullpad,
}) => {
  await nullpad.paste('ab cd\nef gh')
  await nullpad.press('Home')
  await nullpad.press('Control+ArrowLeft')
  expect(await nullpad.status(), 'end of the line above').toEqual(
    expect.objectContaining({ line: 1, column: 6 }),
  )
  await nullpad.press('Control+Home')
  await nullpad.press('Control+ArrowLeft')
  expect(await nullpad.status(), 'the first line start stays').toEqual(
    expect.objectContaining({ line: 1, column: 1 }),
  )
})

const shards = 6
const shardsOnEveryPush: ReadonlySet<number> = new Set([3, 4, 5])
const onDemand = process.env['NULLPAD_ALL'] !== undefined

for (let shard = 0; shard < shards; shard++) {
  test(`word moves, shard ${shard + 1} of ${shards}: Ctrl+Left and Ctrl+Right land where they land in a textarea, among letter, row and line moves`, async ({
    browser,
    baseURL,
  }) => {
    test.skip(
      !onDemand && !shardsOnEveryPush.has(shard + 1),
      'runs on demand, pnpm test:all',
    )
    test.setTimeout(180_000)
    const pair = await openPair(browser, baseURL ?? '')
    const failures: Array<string> = []
    for (const [index, text] of texts.entries()) {
      if (index % shards !== shard) {
        continue
      }
      const difference = await firstDifference(
        pair,
        text,
        keysFor(text, index + 1),
      )
      if (difference !== null) {
        failures.push(difference)
      }
    }
    await pair.close()
    expect(failures, failures.join('\n\n')).toEqual([])
  })
}
