import { type Nullpad, expect, openFresh, settle, test } from './nullpad'

const SAVED = 1500
const ROWS_PER_TEST = 10
const CLIPBOARD_WAIT = 2500
const BLOCKED = 'clipboard blocked, use Ctrl-V'

const toggle = 'Control+,'

type Row = Readonly<{
  text: keyof typeof texts
  at: readonly [number, number]
  keys: string
  after: string
  line: number
  column: number
  clip?: string
}>

type Group = Readonly<{ name: string; rows: ReadonlyArray<Row> }>

const texts = {
  C: 'a b\nc d\ne f',
  E: 'abcdefgh\nijklmnop\nqrstuvwx\nyz012345',
  F: 'foo bar baz\nfoo bar baz\nfoo bar baz\nfoo bar baz',
  H: 'first line\nsecond line\nthird line\nfourth line\nfifth line',
  K: 'abc\n\nd',
  M: 'one two\nthree four\nfive six\nseven',
  N: '  indented line\n\nlast',
} as const

const groups: ReadonlyArray<Group> = [
  {
    name: 'a named register takes a yank, delete or change, and p and P put it',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyjj"ap',
        after: 'one two\nthree four\nfive six\none two\nseven',
        line: 4,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayw$"ap',
        after: 'one twoone \nthree four\nfive six\nseven',
        line: 1,
        column: 11,
      },
      {
        text: 'M',
        at: [1, 5],
        keys: '"addj"ap',
        after: 'three four\nfive six\none two\nseven',
        line: 3,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 5],
        keys: '"axj"ap',
        after: 'one wo\nthreet four\nfive six\nseven',
        line: 2,
        column: 6,
      },
      {
        text: 'M',
        at: [1, 5],
        keys: '"bdwj"bP',
        after: 'one \nthrtwoee four\nfive six\nseven',
        line: 2,
        column: 6,
      },
      {
        text: 'M',
        at: [1, 5],
        keys: '"cciwnew<Esc>j"cp',
        after: 'one new\nthree ftwoour\nfive six\nseven',
        line: 2,
        column: 10,
      },
    ],
  },
  {
    name: 'a named register keeps its kind: letters stay letters, whole lines stay whole lines',
    rows: [
      {
        text: 'M',
        at: [2, 3],
        keys: '"ayjG"ap',
        after: 'one two\nthree four\nfive six\nseven\nthree four\nfive six',
        line: 5,
        column: 1,
      },
      {
        text: 'M',
        at: [2, 3],
        keys: '"ayiwG"ap',
        after: 'one two\nthree four\nfive six\nsthreeeven',
        line: 4,
        column: 6,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayy$"ap',
        after: 'one two\none two\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"adwG"ap',
        after: 'two\nthree four\nfive six\nsone even',
        line: 4,
        column: 5,
      },
    ],
  },
  {
    name: 'counts before the quote, after the register, or both',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: '2"add',
        after: 'five six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"a2dd',
        after: 'five six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '2"ayyG"ap',
        after: 'one two\nthree four\nfive six\nseven\none two\nthree four',
        line: 5,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayw3"ap',
        after: 'oone one one ne two\nthree four\nfive six\nseven',
        line: 1,
        column: 13,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '2"a3x',
        after: 'o\nthree four\nfive six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '2"ad3w',
        after: 'seven',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: 'an uppercase name adds to the end of the register',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: '"aywj"Aywj"ap',
        after: 'one two\nthree four\nfone three ive six\nseven',
        line: 3,
        column: 11,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayywj"Ayyj"ap',
        after: 'one two\nthree four\nfive six\none two\nthree four\nseven',
        line: 4,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj"Aywk"ap',
        after: 'one two\none two\nthree \nthree four\nfive six\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"aywj"Ayyj"ap',
        after: 'one two\nthree four\nfive six\none \nthree four\nseven',
        line: 4,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"Ayyj"ap',
        after: 'one two\nthree four\none two\nfive six\nseven',
        line: 3,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"adwj"Adw"aP',
        after: 'two\none three four\nfive six\nseven',
        line: 2,
        column: 10,
      },
    ],
  },
  {
    name: '0 holds the last plain yank, a named yank and every delete leave it',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: 'yiwjdd"0P',
        after: 'one two\nonefive six\nseven',
        line: 2,
        column: 3,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'yiwjdw"0p',
        after: 'one two\nfoneour\nfive six\nseven',
        line: 2,
        column: 4,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'yiwj"ayyk"0P',
        after: 'oneone two\nthree four\nfive six\nseven',
        line: 1,
        column: 3,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayiw"0p',
        after: 'one two\nthree four\nfive six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'dd"0p',
        after: 'three four\nfive six\nseven',
        line: 1,
        column: 1,
      },
    ],
  },
  {
    name: '"" is the unnamed register, and a named command fills it too',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj""P',
        after: 'one two\none two\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '""ddp',
        after: 'three four\none two\nfive six\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyjp',
        after: 'one two\nthree four\none two\nfive six\nseven',
        line: 3,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"adwjP',
        after: 'two\none three four\nfive six\nseven',
        line: 2,
        column: 4,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"cciwX<Esc>jp',
        after: 'X two\ntonehree four\nfive six\nseven',
        line: 2,
        column: 4,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj"byw""p',
        after: 'one two\ntthree hree four\nfive six\nseven',
        line: 2,
        column: 7,
      },
    ],
  },
  {
    name: 'the black hole changes no register',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: 'yiwj"_ddp',
        after: 'one two\nfoneive six\nseven',
        line: 2,
        column: 4,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'yiw"_xp',
        after: 'nonee two\nthree four\nfive six\nseven',
        line: 1,
        column: 4,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'yiwj"_cwX<Esc>p',
        after: 'one two\nXone four\nfive six\nseven',
        line: 2,
        column: 4,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'ddj"_ddp',
        after: 'three four\nseven\none two',
        line: 3,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj"_dd"ap',
        after: 'one two\nfive six\none two\nseven',
        line: 3,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'yyj"_dd"0p',
        after: 'one two\nfive six\none two\nseven',
        line: 3,
        column: 1,
      },
    ],
  },
  {
    name: 'put from an empty register, and a key after the quote that names no register',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: '"zp',
        after: 'one two\nthree four\nfive six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'x"zp',
        after: 'ne two\nthree four\nfive six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"!x',
        after: 'ne two\nthree four\nfive six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"!dd',
        after: 'three four\nfive six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"<Esc>x',
        after: 'ne two\nthree four\nfive six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ajx',
        after: 'one two\nhree four\nfive six\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayy"!p',
        after: 'one two\none two\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
      },
    ],
  },
  {
    name: 'dot repeats a change with the register it named',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj"ap.',
        after: 'one two\nthree four\none two\none two\nfive six\nseven',
        line: 4,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj"ap3.',
        after:
          'one two\nthree four\none two\none two\none two\none two\nfive six\nseven',
        line: 4,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"aywj"aP.',
        after: 'one two\noneone  three four\nfive six\nseven',
        line: 2,
        column: 7,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"_dd.',
        after: 'five six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'yyj"_dd.p',
        after: 'one two\nseven\none two',
        line: 3,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"add."ap',
        after: 'five six\nthree four\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"acwX<Esc>w."ap',
        after: 'X Xtwo\nthree four\nfive six\nseven',
        line: 1,
        column: 6,
      },
    ],
  },
  {
    name: 'u and Ctrl-R over named registers and the black hole',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj"apu',
        after: 'one two\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj"apu<C-r>',
        after: 'one two\nthree four\none two\nfive six\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"addu<C-r>"ap',
        after: 'three four\none two\nfive six\nseven',
        line: 2,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"_ddu<C-r>',
        after: 'three four\nfive six\nseven',
        line: 1,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"ayyj"ap.u',
        after: 'one two\nthree four\none two\nfive six\nseven',
        line: 3,
        column: 1,
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"adwu"ap',
        after: 'oone ne two\nthree four\nfive six\nseven',
        line: 1,
        column: 5,
      },
    ],
  },
  {
    name: 'a change that removes nothing on a blank line empties the unnamed register',
    rows: [
      {
        text: 'K',
        at: [1, 1],
        keys: 'xjC<Esc>P',
        after: 'bc\n\nd',
        line: 2,
        column: 1,
      },
      {
        text: 'K',
        at: [1, 1],
        keys: 'xjC<Esc>p',
        after: 'bc\n\nd',
        line: 2,
        column: 1,
      },
      {
        text: 'K',
        at: [1, 1],
        keys: 'xjS<Esc>P',
        after: 'bc\n\n\nd',
        line: 2,
        column: 1,
      },
      {
        text: 'K',
        at: [1, 1],
        keys: 'xjcc<Esc>P',
        after: 'bc\n\n\nd',
        line: 2,
        column: 1,
      },
      {
        text: 'K',
        at: [1, 1],
        keys: 'xjs<Esc>P',
        after: 'bc\na\nd',
        line: 2,
        column: 1,
      },
      {
        text: 'N',
        at: [1, 3],
        keys: 'xjC<Esc>P',
        after: '  ndented line\n\nlast',
        line: 2,
        column: 1,
      },
      {
        text: 'K',
        at: [3, 1],
        keys: 'xkC<Esc>P',
        after: 'abc\n\n',
        line: 2,
        column: 1,
      },
    ],
  },
  {
    name: 'the system clipboard is put by "+ and "*',
    rows: [
      {
        text: 'M',
        at: [1, 1],
        keys: '"+p',
        after: 'oZZne two\nthree four\nfive six\nseven',
        line: 1,
        column: 3,
        clip: 'ZZ',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+P',
        after: 'ZZone two\nthree four\nfive six\nseven',
        line: 1,
        column: 2,
        clip: 'ZZ',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"*p',
        after: 'oZZne two\nthree four\nfive six\nseven',
        line: 1,
        column: 3,
        clip: 'ZZ',
      },
      {
        text: 'M',
        at: [1, 3],
        keys: '2"+p',
        after: 'oneZZZZ two\nthree four\nfive six\nseven',
        line: 1,
        column: 7,
        clip: 'ZZ',
      },
      {
        text: 'M',
        at: [1, 3],
        keys: '"+pj"+p',
        after: 'oneZZ two\nthreeZZ four\nfive six\nseven',
        line: 2,
        column: 7,
        clip: 'ZZ',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+p',
        after: 'one two\nZZ\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
        clip: 'ZZ\n',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+P',
        after: 'ZZ\none two\nthree four\nfive six\nseven',
        line: 1,
        column: 1,
        clip: 'ZZ\n',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"*p',
        after: 'one two\nZZ\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
        clip: 'ZZ\n',
      },
      {
        text: 'M',
        at: [2, 4],
        keys: '2"+p',
        after: 'one two\nthree four\nZZ\nZZ\nfive six\nseven',
        line: 3,
        column: 1,
        clip: 'ZZ\n',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+p',
        after: 'one two\na\nb\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
        clip: 'a\nb\n',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+p',
        after: 'oa\nbne two\nthree four\nfive six\nseven',
        line: 1,
        column: 2,
        clip: 'a\nb',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+P',
        after: 'a\nbone two\nthree four\nfive six\nseven',
        line: 1,
        column: 1,
        clip: 'a\nb',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+px',
        after: 'oZne two\nthree four\nfive six\nseven',
        line: 1,
        column: 3,
        clip: 'ZZ',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+pjx',
        after: 'oZZne two\nthee four\nfive six\nseven',
        line: 2,
        column: 3,
        clip: 'ZZ',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: 'x"+p',
        after: 'nZZe two\nthree four\nfive six\nseven',
        line: 1,
        column: 3,
        clip: 'ZZ',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+pdd',
        after: 'one two\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
        clip: 'ZZ\n',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+pjx',
        after: 'one two\nZZ\nhree four\nfive six\nseven',
        line: 3,
        column: 1,
        clip: 'ZZ\n',
      },
      {
        text: 'M',
        at: [1, 1],
        keys: '"+pyyP',
        after: 'one two\nZZ\nZZ\nthree four\nfive six\nseven',
        line: 2,
        column: 1,
        clip: 'ZZ\n',
      },
    ],
  },
]

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Tab>': 'Tab',
  '<C-r>': 'Control+r',
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .pending').innerText()
}

const noticeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const notice = nullpad.page.locator('.status .notice')
  return (await notice.count()) === 0 ? '' : (await notice.innerText()).trim()
}

const clipboardOf = (nullpad: Nullpad) =>
  nullpad.page.evaluate(() => navigator.clipboard.readText())

const setClipboard = (nullpad: Nullpad, text: string) =>
  nullpad.page.evaluate(value => navigator.clipboard.writeText(value), text)

const wait = (nullpad: Nullpad, ms = SAVED) => nullpad.page.waitForTimeout(ms)

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of keys.match(/<[A-Za-z-]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
}

const vimOn = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press(toggle)
  await settle(nullpad.page)
}

const startWith = async (nullpad: Nullpad, text: string) => {
  await openFresh(nullpad.page)
  await nullpad.paste(text)
  await nullpad.reload()
  await nullpad.press('Control+Home')
}

const placeAt = async (nullpad: Nullpad, line: number, column: number) => {
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', line - 1)
  await nullpad.press('Home')
  await nullpad.press('ArrowRight', column - 1)
}

const untilScreen = async (
  nullpad: Nullpad,
  text: string,
  line: number,
  column: number,
) => {
  const deadline = Date.now() + CLIPBOARD_WAIT
  for (;;) {
    const status = await nullpad.status()
    if (
      (await nullpad.text()) === text &&
      status.line === line &&
      status.column === column
    ) {
      return
    }
    if (Date.now() > deadline) {
      return
    }
    await nullpad.page.waitForTimeout(50)
  }
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  const label = `${row.text} at ${row.at.join(':')}${row.clip === undefined ? '' : ` clipboard ${JSON.stringify(row.clip)}`} keys ${row.keys}`
  await startWith(nullpad, texts[row.text])
  await placeAt(nullpad, row.at[0], row.at[1])
  await vimOn(nullpad)
  if (row.clip !== undefined) {
    await setClipboard(nullpad, row.clip)
  }
  await play(nullpad, row.keys)
  if (row.clip !== undefined) {
    await untilScreen(nullpad, row.after, row.line, row.column)
  }
  expect.soft(await nullpad.text(), `${label}: text`).toBe(row.after)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line: row.line, column: row.column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe('NORMAL')
  if (row.clip !== undefined) {
    expect.soft(await noticeOf(nullpad), `${label}: no notice`).toBe('')
  }
}

for (const group of groups) {
  for (let from = 0; from < group.rows.length; from += ROWS_PER_TEST) {
    const rows = group.rows.slice(from, from + ROWS_PER_TEST)
    test(`vim ${group.name} act as in Vim (rows ${from + 1} to ${from + rows.length})`, async ({
      nullpad,
    }) => {
      for (const row of rows) {
        await playRow(nullpad, row)
      }
    })
  }
}

const openFinder = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
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

const begin = async (nullpad: Nullpad, text: string) => {
  await nullpad.paste(text)
  await nullpad.press('Control+Home')
  await vimOn(nullpad)
}

const blocked = async (nullpad: Nullpad) => {
  await expect
    .poll(() => noticeOf(nullpad), {
      message: 'the status line says the clipboard is blocked',
      timeout: 6000,
    })
    .toBe(BLOCKED)
}

test('the status shows the register while it waits, and Esc drops it', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc def\nghi')
  await nullpad.press('"')
  expect(await pendingOf(nullpad), 'a quote waits for a name').toBe('"')
  await nullpad.press('a')
  expect(await pendingOf(nullpad), 'the register is named').toBe('"a')
  await nullpad.press('d')
  expect(await pendingOf(nullpad), 'the operator waits with the register').toBe(
    '"ad',
  )
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Esc drops the register').toBe('')
  expect(await nullpad.text(), 'Esc changed nothing').toBe('abc def\nghi')
  expect(await modeOf(nullpad), 'NORMAL after Esc').toBe('NORMAL')

  await play(nullpad, '2"a3d')
  expect(await pendingOf(nullpad), 'counts, register and operator wait').toBe(
    '2"a3d',
  )
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Esc drops all of it').toBe('')
  expect(await nullpad.text(), 'nothing was deleted').toBe('abc def\nghi')
  await play(nullpad, 'x')
  expect(
    await nullpad.text(),
    'the next x is a plain x, with no register',
  ).toBe('bc def\nghi')

  await play(nullpad, '"+')
  expect(await pendingOf(nullpad), 'the clipboard register is named').toBe('"+')
  await nullpad.press('Escape')
  await play(nullpad, '"_')
  expect(await pendingOf(nullpad), 'the black hole is named').toBe('"_')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'nothing pending after Esc').toBe('')

  await play(nullpad, '"!')
  expect(
    await pendingOf(nullpad),
    'a key that names no register drops it',
  ).toBe('')
  expect(await nullpad.text(), 'and changes nothing').toBe('bc def\nghi')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'the next key is a plain command').toBe(
    'c def\nghi',
  )
  await play(nullpad, '"')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'a lone quote and Esc').toBe('')
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
})

test('registers live through another note and through vim off and on', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one\ntwo')
  await play(nullpad, '"ayyj"byiw')
  expect(await nullpad.text(), 'yanks change no text').toBe('one\ntwo')
  expect(await modeOf(nullpad), 'NORMAL after the yanks').toBe('NORMAL')
  await wait(nullpad)

  await startNote(nullpad, 'second')
  expect(await nullpad.text(), 'the second note').toBe('second')
  expect(await modeOf(nullpad), 'NORMAL in the second note').toBe('NORMAL')
  await play(nullpad, '"ap')
  expect(await nullpad.text(), 'a holds the line from the first note').toBe(
    'second\none',
  )
  await play(nullpad, '"bP')
  expect(await nullpad.text(), 'b holds the word from the first note').toBe(
    'second\ntwoone',
  )
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'the unnamed register is the last yank').toBe(
    'second\ntwotwoone',
  )

  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  await nullpad.press('Control+End')
  await vimOn(nullpad)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  await play(nullpad, 'gg"ap')
  expect(await nullpad.text(), 'a lived through vim off and on').toBe(
    'second\none\ntwotwoone',
  )
  await play(nullpad, '"bp')
  expect(await nullpad.text(), 'b lived through vim off and on').toBe(
    'second\notwone\ntwotwoone',
  )
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'the unnamed register lived too').toBe(
    'second\notwotwone\ntwotwoone',
  )
})

test('a reload leaves the registers empty', async ({ nullpad }) => {
  await begin(nullpad, 'one\ntwo')
  await play(nullpad, '"ayy"byiwyy')
  expect(await nullpad.text(), 'yanks change no text').toBe('one\ntwo')
  expect(await modeOf(nullpad), 'NORMAL after the yanks').toBe('NORMAL')
  await wait(nullpad)
  await nullpad.reload()
  expect(await modeOf(nullpad), 'vim stays on after a reload').toBe('NORMAL')
  expect(await nullpad.text(), 'the note came back').toBe('one\ntwo')
  await play(nullpad, 'gg"ap')
  expect(await nullpad.text(), 'a is empty after a reload').toBe('one\ntwo')
  await play(nullpad, '"bP')
  expect(await nullpad.text(), 'b is empty after a reload').toBe('one\ntwo')
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'the unnamed register is empty').toBe('one\ntwo')
  await play(nullpad, 'yyp')
  expect(await nullpad.text(), 'a new yank puts as before').toBe(
    'one\none\ntwo',
  )
})

test('"+ and "* write the system clipboard, and the unnamed register has the text too', async ({
  nullpad,
}) => {
  const text = 'first line\nsecond line\nthird line\nfourth line\nfifth line'
  await begin(nullpad, text)
  const written = async (keys: string, expected: string, label: string) => {
    await setClipboard(nullpad, 'SENTINEL')
    await play(nullpad, keys)
    await expect
      .poll(() => clipboardOf(nullpad), {
        message: `${label}: the system clipboard`,
        timeout: 3000,
      })
      .toBe(expected)
    expect(await noticeOf(nullpad), `${label}: no notice`).toBe('')
  }
  await written('"+yy', 'first line\n', '"+yy')
  await written('"+yiw', 'first', '"+yiw')
  expect(await nullpad.text(), 'a yank leaves the text').toBe(text)
  await play(nullpad, 'p')
  expect(await nullpad.text(), 'a plain p puts what "+yiw took').toBe(
    text.replace('first line', 'ffirstirst line'),
  )
  await play(nullpad, 'u')
  await written('j"+dd', 'second line\n', '"+dd')
  expect(await nullpad.text(), '"+dd deleted the line').toBe(
    'first line\nthird line\nfourth line\nfifth line',
  )
  await written('"+x', 't', '"+x')
  expect(await nullpad.text(), '"+x deleted a letter').toBe(
    'first line\nhird line\nfourth line\nfifth line',
  )
  await written('"*yy', 'hird line\n', '"*yy')
  await play(nullpad, 'jp')
  expect(await nullpad.text(), 'the unnamed register has the line').toBe(
    'first line\nhird line\nfourth line\nhird line\nfifth line',
  )
  await written('"+yw', 'hird ', '"+yw')
})

test('"+yy then "+p, and "*yy then "+p, put the line back through the system clipboard', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one\ntwo')
  await setClipboard(nullpad, 'SENTINEL')
  await play(nullpad, '"+yy')
  await expect
    .poll(() => clipboardOf(nullpad), { message: '"+yy wrote the line' })
    .toBe('one\n')
  await play(nullpad, 'j"+p')
  await expect
    .poll(() => nullpad.text(), { message: '"+p put the line "+yy took' })
    .toBe('one\ntwo\none')
  await play(nullpad, '"*yyG"+p')
  await expect
    .poll(() => nullpad.text(), { message: '"*yy and "+p are one clipboard' })
    .toBe('one\ntwo\none\none')
  await play(nullpad, 'ggjyy"+p')
  await expect
    .poll(() => nullpad.text(), { message: 'a plain yy did not change it' })
    .toBe('one\ntwo\none\none\none')
})

test('a plain y, d and p never touch the system clipboard, and Ctrl-V still pastes', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc\ndef\nghi')
  await setClipboard(nullpad, 'KEEP')
  await play(nullpad, 'yyjddp"ayyk"_ddP')
  await nullpad.page.waitForTimeout(400)
  expect(await clipboardOf(nullpad), 'the system clipboard is as it was').toBe(
    'KEEP',
  )
  expect(await nullpad.text(), 'plain commands ran on the registers').toBe(
    'abc\ndef\ndef',
  )
  expect(await noticeOf(nullpad), 'no notice').toBe('')
  await nullpad.paste('PP')
  expect(
    await nullpad.text(),
    'Ctrl-V in NORMAL pastes the clipboard text',
  ).toBe('abc\nPPdef\ndef')
  expect(await modeOf(nullpad), 'still NORMAL after Ctrl-V').toBe('NORMAL')
})

test('a dot after "+p puts what the clipboard holds then', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\nthree')
  await setClipboard(nullpad, 'AA')
  await play(nullpad, '"+p')
  await expect
    .poll(() => nullpad.text(), { message: '"+p put AA' })
    .toBe('oAAne two\nthree')
  await setClipboard(nullpad, 'BB')
  await play(nullpad, '.')
  await expect
    .poll(() => nullpad.text(), { message: 'dot put BB, not AA' })
    .toBe('oAABBne two\nthree')

  await setClipboard(nullpad, 'L1\n')
  await play(nullpad, '"+p')
  await expect
    .poll(() => nullpad.text(), { message: '"+p put the line' })
    .toBe('oAABBne two\nL1\nthree')
  await setClipboard(nullpad, 'L2\n')
  await play(nullpad, '.')
  await expect
    .poll(() => nullpad.text(), { message: 'dot put the new line' })
    .toBe('oAABBne two\nL1\nL2\nthree')
  expect(
    await nullpad.status(),
    'the cursor is on the last line put',
  ).toMatchObject({ line: 3, column: 1 })
  await play(nullpad, 'u')
  expect(await nullpad.text(), 'one u takes back the dot').toBe(
    'oAABBne two\nL1\nthree',
  )
})

test('with the clipboard permission withdrawn, "+p changes nothing and says so', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc\ndef')
  await setClipboard(nullpad, 'ZZ\n')
  await nullpad.page.context().clearPermissions()
  const refused = await nullpad.page.evaluate(() =>
    navigator.clipboard.readText().then(
      () => 'allowed',
      (error: unknown) => String(error),
    ),
  )
  expect(refused, 'the browser refuses a read now').toContain('NotAllowedError')

  await play(nullpad, '"+p')
  await blocked(nullpad)
  expect(await nullpad.text(), 'the note did not change').toBe('abc\ndef')
  expect(await nullpad.status(), 'the cursor did not move').toMatchObject({
    line: 1,
    column: 1,
  })
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')

  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears the notice').toBe('')
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'later keys still work').toBe('bc\ndef')
  expect(await noticeOf(nullpad), 'and show no notice').toBe('')

  await play(nullpad, '"+P')
  await blocked(nullpad)
  expect(await nullpad.text(), 'a refused "+P changes nothing').toBe('bc\ndef')
  await play(nullpad, 'j')
  expect(await noticeOf(nullpad), 'j clears it').toBe('')
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x after it').toBe('bc\nef')
})

test('with the clipboard permission withdrawn, "+yy says so and the unnamed register still has the line', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc\ndef')
  await nullpad.page.context().clearPermissions()
  await play(nullpad, '"+yy')
  await blocked(nullpad)
  expect(await nullpad.text(), 'a yank changes no text').toBe('abc\ndef')
  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears the notice').toBe('')
  await play(nullpad, 'jp')
  expect(await nullpad.text(), 'the unnamed register has the line').toBe(
    'abc\ndef\nabc',
  )
  await play(nullpad, '"+dd')
  await blocked(nullpad)
  expect(await nullpad.text(), 'the delete itself still happened').toBe(
    'abc\ndef',
  )
  await play(nullpad, 'p')
  expect(await noticeOf(nullpad), 'a plain key clears the notice').toBe('')
  expect(
    await nullpad.text(),
    'and the deleted line is in the unnamed register',
  ).toBe('abc\ndef\nabc')
})

const answeringClipboard = async (nullpad: Nullpad, delay: number | null) => {
  await nullpad.page.addInitScript(delay => {
    if (navigator.clipboard === undefined) {
      return
    }
    const later = <T>(value: () => T) =>
      delay === null
        ? new Promise<T>(() => undefined)
        : new Promise<T>(resolve => setTimeout(() => resolve(value()), delay))
    Object.defineProperty(navigator.clipboard, 'readText', {
      value: () => later(() => 'ZZ'),
    })
    Object.defineProperty(navigator.clipboard, 'read', {
      value: () =>
        later(() => [
          new ClipboardItem({
            'text/plain': new Blob(['ZZ'], { type: 'text/plain' }),
          }),
        ]),
    })
  }, delay)
  await openFresh(nullpad.page)
}

test('keys typed after "+p wait for a slow clipboard and then run in order', async ({
  nullpad,
}) => {
  await answeringClipboard(nullpad, 1200)
  await begin(nullpad, 'one two')
  await play(nullpad, '"+px')
  expect(await nullpad.text(), 'while the clipboard is slow nothing ran').toBe(
    'one two',
  )
  await expect
    .poll(() => nullpad.text(), {
      message: 'the put ran first, then x took its last letter',
      timeout: 5000,
    })
    .toBe('oZne two')
  expect(await nullpad.status(), 'the cursor').toMatchObject({
    line: 1,
    column: 3,
  })
  expect(await noticeOf(nullpad), 'no notice').toBe('')
})

test('a clipboard that never answers is given up after about 3 seconds', async ({
  nullpad,
}) => {
  await answeringClipboard(nullpad, null)
  await begin(nullpad, 'abcdef')
  await setClipboard(nullpad, 'ZZ')
  await play(nullpad, '"+p')
  await nullpad.page.waitForTimeout(1000)
  expect(await noticeOf(nullpad), 'no notice while it waits').toBe('')
  expect(await nullpad.text(), 'the note is as it was').toBe('abcdef')
  await blocked(nullpad)
  expect(await nullpad.text(), 'the note did not change').toBe('abcdef')
  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears the notice').toBe('')
  await play(nullpad, '0x')
  expect(await nullpad.text(), 'later keys still work').toBe('bcdef')

  await play(nullpad, '"+pxx')
  await nullpad.page.waitForTimeout(1000)
  expect(await nullpad.text(), 'keys typed while it waits wait').toBe('bcdef')
  await expect
    .poll(() => nullpad.text(), {
      message:
        'after the give-up both x ran, in order, and the put added nothing',
      timeout: 6000,
    })
    .toBe('def')
})
