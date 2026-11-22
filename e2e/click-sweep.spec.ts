import type { Browser, Page } from '@playwright/test'

import { expect, test } from './nullpad'

const note = [
  'short line',
  '',
  Array.from({ length: 30 }, (_, i) => `word${i}`).join(' '),
  'ab漢字cd漢 mixed',
  'x👍🏽y🇯🇵z👨‍👩‍👧 emoji',
  'é café marks',
  'a\tb tab',
  'trailing   ',
  '漢'.repeat(60),
  'last',
].join('\n')

const bands = 4

type Column = Readonly<{
  left: number
  right: number
  top: number
  stylesheet: string
}>

const openTextarea = async (
  browser: Browser,
  baseURL: string,
  text: string,
  { left, right, top, stylesheet }: Column,
): Promise<Readonly<{ page: Page; close: () => Promise<void> }>> => {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 600 },
  })
  const page = await context.newPage()
  const url = new URL('/click-oracle', baseURL).href
  await page.route(url, route =>
    route.fulfill({
      contentType: 'text/html',
      body: [
        '<!doctype html><meta charset="utf-8">',
        `<link rel="stylesheet" href="${stylesheet}">`,
        `<textarea spellcheck="false" style="position:absolute;left:${left}px;top:${top}px;width:${right - left}px;height:1000px;font:inherit;box-sizing:content-box;margin:0;padding:0;border:0;outline:0;resize:none;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word"></textarea>`,
      ].join(''),
    }),
  )
  await page.goto(url)
  await page.evaluate(async value => {
    await document.fonts.load('14px "JetBrains Mono"', value)
    const area = document.querySelector('textarea')
    if (area !== null) {
      area.value = value
    }
  }, text)
  return { page, close: () => context.close() }
}

const textareaCaret = (page: Page) =>
  page.evaluate(() => {
    const area = document.querySelector('textarea')
    if (area === null) {
      throw new Error('the oracle page has no textarea')
    }
    const before = area.value.slice(0, area.selectionStart)
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return {
      line: before.split('\n').length,
      column:
        [...segmenter.segment(before.slice(before.lastIndexOf('\n') + 1))]
          .length + 1,
    }
  })

test.describe.configure({ mode: 'parallel' })

for (let band = 0; band < bands; band++) {
  test(`click sweep, band ${band + 1} of ${bands}: every click lands the cursor where the same click lands it in a textarea, on the row under it`, async ({
    nullpad,
    browser,
    baseURL,
  }) => {
    test.setTimeout(180_000)
    await nullpad.paste(note)
    await nullpad.press('Control+Home')
    const screen = await nullpad.screen()
    const column: Column = await nullpad.page.evaluate(() => {
      const line = document.querySelector<HTMLElement>('.line')
      if (line === null) {
        throw new Error('no line drawn')
      }
      const box = line.getBoundingClientRect()
      return {
        left: box.left + Number.parseFloat(getComputedStyle(line).paddingLeft),
        right: box.right,
        top: box.top,
        stylesheet:
          document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')
            ?.href ?? '',
      }
    })
    const textarea = await openTextarea(browser, baseURL ?? '', note, column)
    const width = nullpad.page.viewportSize()?.width ?? 0
    const xs = [
      ...Array.from(
        { length: Math.ceil(column.left / 6) },
        (_, i) => 2 + i * 6,
      ),
      ...Array.from({ length: 70 }, (_, i) =>
        Math.round(column.left + i * 1.15 * screen.cell),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        Math.round(column.right + (i * (width - column.right)) / 8),
      ),
    ].filter(x => x < width - 1)
    const last = screen.rows.at(-1)
    const lastBottom = last?.bottom ?? 0
    const ys = [
      screen.area.top - 6,
      ...screen.rows.map(
        (row, index) =>
          row.top + ((index % 3) + 1) * 0.25 * (row.bottom - row.top),
      ),
      lastBottom + 3,
      lastBottom + 120,
      screen.area.bottom - 2,
    ]
      .map(Math.round)
      .filter((_, index) => index % bands === band)
    const misses: Array<string> = []
    let clicks = 0
    for (const y of ys) {
      const below = y >= lastBottom
      const rowUnder = below
        ? screen.rows.length - 1
        : Math.max(
            0,
            screen.rows.findIndex(row => y >= row.top && y < row.bottom),
          )
      const oracleY = Math.max(column.top + 1, y)
      for (const x of xs) {
        const oracleX = Math.min(column.right - 0.5, Math.max(column.left, x))
        await Promise.all([
          nullpad.click(x, y),
          textarea.page.mouse.click(oracleX, oracleY),
        ])
        clicks++
        const [after, want] = await Promise.all([
          nullpad.screen(),
          textareaCaret(textarea.page),
        ])
        const got = {
          line: after.status.line,
          column: after.status.column,
          row: after.cursor?.row,
        }
        if (
          got.line !== want.line ||
          got.column !== want.column ||
          got.row !== rowUnder
        ) {
          misses.push(
            `click (${x}, ${y}) on row ${rowUnder} ${JSON.stringify(screen.rows[rowUnder]?.text.slice(0, 20))}: textarea ${JSON.stringify({ ...want, row: rowUnder })}, nullpad ${JSON.stringify(got)}`,
          )
        }
      }
    }
    await textarea.close()
    console.log(`band ${band + 1}: ${clicks} clicks, ${misses.length} misses`)
    expect(clicks, 'clicks made').toBeGreaterThan(100)
    expect(
      misses.slice(0, 20),
      `${misses.length} of ${clicks} clicks missed`,
    ).toEqual([])
  })
}
