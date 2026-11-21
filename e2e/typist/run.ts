import type { Browser, Page } from '@playwright/test'

import { rowStartsOf, screenOf, textOf, textareaRowStarts } from '../nullpad'
import { type Script, type Step, acceptedDifference } from './script'

/** `rows` holds where each line starts its rows, and is left out when nullpad's screen does not show the whole text. */
export type Snapshot = Readonly<{
  text: string
  line: number
  column: number
  rows: ReadonlyArray<ReadonlyArray<number>> | undefined
}>

export type Divergence = Readonly<{
  at: number
  step: Step
  nullpad: Snapshot
  textarea: Snapshot
  before: string
  accepted: string | undefined
}>

/** nullpad's wrap width, in cells and pixels per cell, so the oracle textarea wraps where nullpad does. */
type Measure = Readonly<{ columns: number; cell: number; stylesheet: string }>

/** A textarea in nullpad's font, as wide as nullpad's text column, so it wraps at the same edge. */
const oracleHtml = ({ columns, cell, stylesheet }: Measure) =>
  [
    '<!doctype html><meta charset="utf-8">',
    `<link rel="stylesheet" href="${stylesheet}">`,
    `<textarea id="t" spellcheck="false" style="display:block;font:inherit;width:${columns * cell + 0.5}px;height:2000px;box-sizing:content-box;margin:0;padding:0;border:0;outline:0;resize:none;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word"></textarea>`,
  ].join('')

/** nullpad and a textarea that wraps at nullpad's edge, each in its own browser context so neither runs as a throttled background tab. */
export type Pair = Readonly<{
  nullpad: Page
  textarea: Page
  measure: Measure
  close: () => Promise<void>
}>

const measureNullpad = async (page: Page): Promise<Measure> => {
  await page.goto('/')
  await page.locator('#caret').waitFor()
  await page.keyboard.insertText('x'.repeat(300))
  const screen = await screenOf(page)
  const stylesheet = await page.evaluate(
    () =>
      document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.href ??
      '',
  )
  return {
    columns: [...(screen.rows[0]?.text ?? '')].length,
    cell: screen.cell,
    stylesheet,
  }
}

export const openPair = async (
  browser: Browser,
  baseURL: string,
): Promise<Pair> => {
  const nullpadContext = await browser.newContext({
    baseURL,
    viewport: { width: 1000, height: 600 },
  })
  const textareaContext = await browser.newContext({
    viewport: { width: 1000, height: 600 },
  })
  const nullpad = await nullpadContext.newPage()
  const textarea = await textareaContext.newPage()
  const measure = await measureNullpad(nullpad)
  const oracle = new URL('/typist-oracle', baseURL).href
  await textarea.route(oracle, route =>
    route.fulfill({ contentType: 'text/html', body: oracleHtml(measure) }),
  )
  await textarea.goto(oracle)
  await textarea.evaluate(() =>
    document.fonts.load('14px "JetBrains Mono"', 'a\u2014\u2026\u201c'),
  )
  return {
    nullpad,
    textarea,
    measure,
    close: async () => {
      await nullpadContext.close()
      await textareaContext.close()
    },
  }
}

const apply = async (page: Page, step: Step) => {
  if (step.kind === 'key') {
    await page.keyboard.press(step.key)
  } else if (step.kind === 'text' && /^[ -~]+$/.test(step.text)) {
    await page.keyboard.type(step.text)
  } else {
    await page.keyboard.insertText(step.text)
  }
}

const nullpadSnapshot = async (page: Page): Promise<Snapshot> => {
  const screen = await screenOf(page)
  const rows = rowStartsOf(screen)
  const first = screen.rows[0]
  const last = screen.rows.at(-1)
  const whole =
    first?.number === '1' &&
    first.start === 0 &&
    last !== undefined &&
    last.bottom + screen.rowHeight <= screen.area.bottom &&
    rows.length === screen.status.lineCount
  return {
    text: textOf(screen),
    line: screen.status.line,
    column: screen.status.column,
    rows: whole ? rows : undefined,
  }
}

/**
 * The textarea's caret as nullpad's status line shows one: line, then graphemes before it plus one, and where its
 * lines wrap. A line of at most a third as many UTF-16 units as the row has cells cannot wrap, as no grapheme in
 * the scripts is wider than three cells per unit, so text of only such lines is not measured.
 */
const textareaSnapshot = async (
  page: Page,
  { columns, cell }: Measure,
): Promise<Snapshot> => {
  const caret = await page.evaluate(() => {
    const area = document.querySelector('textarea')
    if (area === null) {
      throw new Error('the oracle page has no textarea')
    }
    const before = area.value.slice(0, area.selectionStart)
    const lineStart = before.lastIndexOf('\n') + 1
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return {
      text: area.value,
      line: before.split('\n').length,
      column: [...segmenter.segment(before.slice(lineStart))].length + 1,
    }
  })
  const lines = caret.text.split('\n')
  return {
    ...caret,
    rows: lines.some(line => line.length * 3 > columns)
      ? await textareaRowStarts(page, lines, columns, cell)
      : lines.map(() => [0]),
  }
}

const same = (a: Snapshot, b: Snapshot) =>
  a.text === b.text &&
  a.line === b.line &&
  a.column === b.column &&
  (a.rows === undefined ||
    b.rows === undefined ||
    JSON.stringify(a.rows) === JSON.stringify(b.rows))

/**
 * Types `script` into both from empty and returns the first step after which text, caret or row breaks differ.
 * The two pages are independent, so each step goes to both at once.
 */
export const compare = async (
  pair: Pair,
  script: Script,
): Promise<Divergence | null> => {
  await Promise.all([
    pair.nullpad.goto('/').then(() => pair.nullpad.locator('#caret').waitFor()),
    pair.textarea.evaluate(() => {
      const area = document.querySelector('textarea')
      if (area !== null) {
        area.value = ''
        area.focus()
      }
    }),
  ])
  let before = ''
  for (const [at, step] of script.entries()) {
    const [nullpad, textarea] = await Promise.all([
      apply(pair.nullpad, step).then(() => nullpadSnapshot(pair.nullpad)),
      apply(pair.textarea, step).then(() =>
        textareaSnapshot(pair.textarea, pair.measure),
      ),
    ])
    if (!same(nullpad, textarea)) {
      return {
        at,
        step,
        nullpad,
        textarea,
        before,
        accepted: acceptedDifference([before, textarea.text, nullpad.text]),
      }
    }
    before = textarea.text
  }
  return null
}
