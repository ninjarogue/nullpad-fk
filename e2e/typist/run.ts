import type { Browser, Page } from '@playwright/test'

import { screenOf, textOf } from '../nullpad'
import { type Script, type Step, acceptedDifference } from './script'

export type Snapshot = Readonly<{ text: string; line: number; column: number }>

export type Divergence = Readonly<{
  at: number
  step: Step
  nullpad: Snapshot
  textarea: Snapshot
  before: string
  accepted: string | undefined
}>

const oracleHtml =
  '<!doctype html><meta charset="utf-8"><textarea id="t" wrap="off" cols="400" rows="4" spellcheck="false"></textarea>'

/** nullpad and a plain textarea, each in its own browser context so neither runs as a throttled background tab. */
export type Pair = Readonly<{
  nullpad: Page
  textarea: Page
  close: () => Promise<void>
}>

export const openPair = async (
  browser: Browser,
  baseURL: string,
): Promise<Pair> => {
  const nullpadContext = await browser.newContext({
    baseURL,
    viewport: { width: 1000, height: 600 },
  })
  const textareaContext = await browser.newContext()
  const nullpad = await nullpadContext.newPage()
  const textarea = await textareaContext.newPage()
  await textarea.setContent(oracleHtml)
  return {
    nullpad,
    textarea,
    close: async () => {
      await nullpadContext.close()
      await textareaContext.close()
    },
  }
}

const apply = async (page: Page, step: Step) => {
  if (step.kind === 'key') {
    await page.keyboard.press(step.key)
  } else if (/^[ -~]$/.test(step.text)) {
    await page.keyboard.type(step.text)
  } else {
    await page.keyboard.insertText(step.text)
  }
}

const nullpadSnapshot = async (page: Page): Promise<Snapshot> => {
  const screen = await screenOf(page)
  return {
    text: textOf(screen),
    line: screen.status.line,
    column: screen.status.column,
  }
}

/** The textarea's caret as nullpad's status line shows one: line, then graphemes before it plus one. */
const textareaSnapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
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

const same = (a: Snapshot, b: Snapshot) =>
  a.text === b.text && a.line === b.line && a.column === b.column

/** Types `script` into both from empty and returns the first step after which text or caret differ. */
export const compare = async (
  pair: Pair,
  script: Script,
): Promise<Divergence | null> => {
  await pair.nullpad.goto('/')
  await pair.nullpad.locator('#caret').waitFor()
  await pair.textarea.evaluate(() => {
    const area = document.querySelector('textarea')
    if (area !== null) {
      area.value = ''
      area.focus()
    }
  })
  let before = ''
  for (const [at, step] of script.entries()) {
    await apply(pair.nullpad, step)
    await apply(pair.textarea, step)
    const [nullpad, textarea] = [
      await nullpadSnapshot(pair.nullpad),
      await textareaSnapshot(pair.textarea),
    ]
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
