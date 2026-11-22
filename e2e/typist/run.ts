import type { Browser, CDPSession, Page } from '@playwright/test'

import {
  openFresh,
  rowStartsOf,
  screenOf,
  settle,
  textOf,
  textareaRowStarts,
} from '../nullpad'
import { type Script, type Step, acceptedDifference } from './script'

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

type Measure = Readonly<{ columns: number; cell: number; stylesheet: string }>

const oracleHtml = ({ columns, cell, stylesheet }: Measure) =>
  [
    '<!doctype html><meta charset="utf-8">',
    `<link rel="stylesheet" href="${stylesheet}">`,
    `<textarea id="t" spellcheck="false" style="display:block;font:inherit;width:${columns * cell + 0.5}px;height:2000px;box-sizing:content-box;margin:0;padding:0;border:0;outline:0;resize:none;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word"></textarea>`,
  ].join('')

/**
 * nullpad, a textarea that wraps at nullpad's edge, and a bare EditContext element that decides what Backspace takes,
 * each in its own browser context so none runs as a throttled background tab and the textarea never loses focus.
 */
export type Pair = Readonly<{
  nullpad: Page
  textarea: Page
  textareaDom: CDPSession
  letters: Page
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
  const lettersContext = await browser.newContext()
  const nullpad = await nullpadContext.newPage()
  const textarea = await textareaContext.newPage()
  const letters = await lettersContext.newPage()
  await letters.setContent('<div id="letters" tabindex="0"></div>')
  await letters.evaluate(() => {
    const element = document.querySelector<HTMLElement>('#letters')
    const EditContext: unknown = Reflect.get(globalThis, 'EditContext')
    if (element === null || typeof EditContext !== 'function') {
      throw new Error('this browser has no EditContext')
    }
    Reflect.set(element, 'editContext', Reflect.construct(EditContext, []))
    element.focus()
  })
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
    textareaDom: await textareaContext.newCDPSession(textarea),
    letters,
    measure,
    close: async () => {
      await nullpadContext.close()
      await textareaContext.close()
      await lettersContext.close()
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

type DomNode = Readonly<{
  nodeId: number
  nodeName: string
  children?: ReadonlyArray<DomNode>
  shadowRoots?: ReadonlyArray<DomNode>
}>

const findTextarea = (node: DomNode): DomNode | undefined =>
  node.nodeName === 'TEXTAREA'
    ? node
    : (node.children ?? []).map(findTextarea).find(found => found !== undefined)

/**
 * Chrome keeps the two halves of a line that Backspace or Delete joined in separate text nodes, as nullpad keeps a
 * join. They sit in the textarea's user-agent shadow root, which only the DevTools protocol reaches, and
 * DOM.getDocument leaves out text nodes of only spaces, so they are read from the editor element itself.
 */
const textareaNodes = async (
  dom: CDPSession,
): Promise<ReadonlyArray<string>> => {
  const { root } = await dom.send('DOM.getDocument', {
    depth: -1,
    pierce: true,
  })
  const editor = findTextarea(root)?.shadowRoots?.[0]?.children?.[0]
  if (editor === undefined) {
    throw new Error("the oracle page's textarea has no editor element")
  }
  const { object } = await dom.send('DOM.resolveNode', {
    nodeId: editor.nodeId,
  })
  const { result } = await dom.send('Runtime.callFunctionOn', {
    objectId: object.objectId ?? '',
    functionDeclaration:
      'function () { return Array.from(this.childNodes, node => node.nodeType === Node.TEXT_NODE ? node.data : "\\n") }',
    returnByValue: true,
  })
  return result.value
}

const pieceBefore = async (
  dom: CDPSession,
  value: string,
  caret: number,
): Promise<Readonly<{ start: number; end: number }>> => {
  const nodes = await textareaNodes(dom)
  const drawn = nodes.join('')
  if (drawn !== value && drawn !== `${value}\n`) {
    throw new Error(
      `the textarea's text nodes ${JSON.stringify(nodes)} do not spell its value ${JSON.stringify(value)}`,
    )
  }
  let offset = 0
  for (const node of nodes) {
    const end = offset + node.length
    if (offset < caret && caret <= end) {
      const lineEnd = value.indexOf('\n', caret)
      return {
        start: Math.max(offset, value.lastIndexOf('\n', caret - 1) + 1),
        end: Math.min(end, lineEnd === -1 ? value.length : lineEnd),
      }
    }
    offset = end
  }
  return { start: caret, end: caret }
}

/** The part of an EditContext the oracle uses, which TypeScript's DOM library does not declare. */
type Letters = HTMLElement &
  Readonly<{
    editContext: Readonly<{
      text: string
      updateText: (from: number, to: number, text: string) => void
      updateSelection: (start: number, end: number) => void
    }>
  }>

const textareaCaret = (page: Page) =>
  page.evaluate(() => {
    const area = document.querySelector('textarea')
    if (area === null) {
      throw new Error('the oracle page has no textarea')
    }
    return { value: area.value, caret: area.selectionStart }
  })

const editContextBackspace = async (
  letters: Page,
  piece: string,
  caret: number,
): Promise<Readonly<{ from: number; to: number }>> => {
  const before = await letters.evaluate(
    ({ piece, caret }) => {
      const context = document.querySelector<Letters>('#letters')?.editContext
      if (context === undefined) {
        throw new Error('the letters page has no EditContext element')
      }
      const grapheme = new Intl.Segmenter(undefined, {
        granularity: 'grapheme',
      })
        .segment(piece)
        .containing(caret)
      const settled =
        grapheme === undefined || grapheme.index === caret
          ? caret
          : grapheme.index + grapheme.segment.length
      const before = piece.slice(0, settled)
      context.updateText(0, context.text.length, before)
      context.updateSelection(before.length, before.length)
      return before
    },
    { piece, caret },
  )
  await letters.keyboard.press('Backspace')
  const left = await letters.evaluate(
    () => document.querySelector<Letters>('#letters')?.editContext.text ?? '',
  )
  if (!before.startsWith(left)) {
    throw new Error(
      `Backspace turned ${JSON.stringify(before)} into ${JSON.stringify(left)} in the EditContext`,
    )
  }
  return { from: left.length, to: before.length }
}

/**
 * The textarea keeps its own Backspace where the two agree, so its column for Up and Down survives; where the
 * EditContext takes more, the rest goes as a selection.
 */
type JudgedPiece = string

const backspaceAsEditContext = async (
  pair: Pair,
): Promise<JudgedPiece | undefined> => {
  const { value, caret } = await textareaCaret(pair.textarea)
  const piece = await pieceBefore(pair.textareaDom, value, caret)
  const judgedPiece = value.slice(piece.start, piece.end)
  const [letter] = await Promise.all([
    piece.start === caret
      ? Promise.resolve(undefined)
      : editContextBackspace(
          pair.letters,
          value.slice(piece.start, piece.end),
          caret - piece.start,
        ),
    pair.textarea.keyboard.press('Backspace'),
  ])
  if (letter === undefined) {
    return undefined
  }
  const from = piece.start + letter.from
  const to = piece.start + letter.to
  const head = value.slice(0, from)
  const tail = value.slice(to)
  const { value: taken } = await textareaCaret(pair.textarea)
  const leftInLetter = taken.length - head.length - tail.length
  if (!taken.startsWith(head) || !taken.endsWith(tail) || leftInLetter < 0) {
    if (acceptedDifference([value]) !== undefined) {
      return judgedPiece
    }
    throw new Error(
      `Backspace turned ${JSON.stringify(value)} into ${JSON.stringify(taken)} in the textarea, outside the letter the EditContext took from ${from} to ${to}`,
    )
  }
  if (leftInLetter > 0) {
    await pair.textarea.evaluate(
      ([from, to]) =>
        document.querySelector('textarea')?.setSelectionRange(from, to),
      [from, from + leftInLetter] as const,
    )
    await pair.textarea.keyboard.press('Backspace')
  }
  return judgedPiece
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
    rows: lines.some(line => mayWrap(line, columns))
      ? await textareaRowStarts(page, lines, columns, cell)
      : lines.map(() => [0]),
  }
}

const maxCellsPerUnit = 3

const mayWrap = (line: string, columns: number): boolean =>
  line.length * maxCellsPerUnit > columns

const same = (a: Snapshot, b: Snapshot) =>
  a.text === b.text &&
  a.line === b.line &&
  a.column === b.column &&
  (a.rows === undefined ||
    b.rows === undefined ||
    JSON.stringify(a.rows) === JSON.stringify(b.rows))

const applyToTextarea = (
  pair: Pair,
  step: Step,
): Promise<JudgedPiece | undefined> =>
  step.kind === 'key' && step.key === 'Backspace'
    ? backspaceAsEditContext(pair)
    : apply(pair.textarea, step).then(() => undefined)

export const compare = async (
  pair: Pair,
  script: Script,
  compareFrom = 0,
): Promise<Divergence | null> => {
  await Promise.all([
    openFresh(pair.nullpad),
    pair.textarea.evaluate(() => {
      const area = document.querySelector('textarea')
      if (area !== null) {
        area.value = ''
        area.focus()
      }
    }),
  ])
  const skipped = script.slice(0, compareFrom)
  await Promise.all([
    (async () => {
      for (const step of skipped) {
        await apply(pair.nullpad, step)
      }
      await settle(pair.nullpad)
    })(),
    (async () => {
      for (const step of skipped) {
        await applyToTextarea(pair, step)
      }
    })(),
  ])
  let before =
    compareFrom === 0
      ? ''
      : await pair.textarea.evaluate(
          () => document.querySelector('textarea')?.value ?? '',
        )
  for (const [offset, step] of script.slice(compareFrom).entries()) {
    const at = compareFrom + offset
    const [nullpad, { judgedPiece, textarea }] = await Promise.all([
      apply(pair.nullpad, step).then(() => nullpadSnapshot(pair.nullpad)),
      applyToTextarea(pair, step).then(async judgedPiece => ({
        judgedPiece,
        textarea: await textareaSnapshot(pair.textarea, pair.measure),
      })),
    ])
    if (!same(nullpad, textarea)) {
      return {
        at,
        step,
        nullpad,
        textarea,
        before,
        accepted: acceptedDifference([
          before,
          textarea.text,
          ...(judgedPiece === undefined ? [] : [judgedPiece]),
        ]),
      }
    }
    before = textarea.text
  }
  return null
}
