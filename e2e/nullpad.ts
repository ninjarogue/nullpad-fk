import {
  type CDPSession,
  type Page,
  test as base,
  expect,
} from '@playwright/test'

export { expect }

export type Status = Readonly<{
  line: number
  column: number
  lineCount: number
}>

/** One drawn row. `text` and `inkRight` leave out the cursor past the end and the IME preedit, which are not text. */
export type ScreenRow = Readonly<{
  lineId: string
  start: number
  number: string | null
  text: string
  top: number
  bottom: number
  left: number
  inkRight: number
}>

/** The drawn block cursor. `cell` counts cells from its row's left edge. */
export type Cursor = Readonly<{
  row: number
  cell: number
  left: number
  top: number
  width: number
  char: string
  inside: boolean
}>

export type Screen = Readonly<{
  rows: ReadonlyArray<ScreenRow>
  cursor: Cursor | null
  status: Status
  cell: number
  rowHeight: number
  area: Readonly<{ left: number; right: number; top: number; bottom: number }>
}>

/** Waits until every input sent so far is drawn: the app updates in a task and draws in the next animation frame. */
export const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>(resolve =>
        setTimeout(() =>
          requestAnimationFrame(() => setTimeout(() => resolve(), 0)),
        ),
      ),
  )

const readScreen = (page: Page): Promise<Screen> =>
  page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    const position = document.querySelector('.pos')
    if (surface === null || position === null) {
      throw new Error('nullpad is not on screen: no .surface or .pos')
    }
    const style = getComputedStyle(surface)
    const context = document.createElement('canvas').getContext('2d')
    if (context === null) {
      throw new Error('no 2d canvas to measure a cell')
    }
    context.font = `${style.fontSize} ${style.fontFamily}`
    const cell = context.measureText('0').width
    const box = surface.getBoundingClientRect()
    const area = {
      left: box.left + Number.parseFloat(style.paddingLeft),
      right: box.right - Number.parseFloat(style.paddingRight),
      top: box.top + Number.parseFloat(style.paddingTop),
      bottom: box.bottom - Number.parseFloat(style.paddingBottom),
    }
    const isGhost = (node: Node) =>
      node instanceof HTMLElement && node.hasAttribute('data-ghost')
    const range = document.createRange()
    const elements = [
      ...surface.querySelectorAll<HTMLElement>('[data-line-id]'),
    ]
    const rows = elements.map(row => {
      const rect = row.getBoundingClientRect()
      let text = ''
      let inkRight = rect.left
      for (const node of row.childNodes) {
        if (!isGhost(node)) {
          range.selectNode(node)
          inkRight = Math.max(inkRight, range.getBoundingClientRect().right)
          text += node.textContent ?? ''
        }
      }
      return {
        lineId: row.dataset['lineId'] ?? '',
        start: Number(row.dataset['start']),
        number: row.dataset['n'] ?? null,
        text,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        inkRight,
      }
    })
    const caret = document.getElementById('caret')
    const caretRow = caret?.closest<HTMLElement>('[data-line-id]')
    const cursor =
      caret === null || caretRow === null || caretRow === undefined
        ? null
        : (() => {
            const rect = caret.getBoundingClientRect()
            const rowLeft = caretRow.getBoundingClientRect().left
            return {
              row: elements.indexOf(caretRow),
              cell: Math.round((rect.left - rowLeft) / cell),
              left: rect.left,
              top: rect.top,
              width: rect.width,
              char: caret.textContent ?? '',
              inside:
                rect.top >= area.top - 0.5 &&
                rect.bottom <= box.bottom + 0.5 &&
                rect.left >= area.left - 0.5 &&
                rect.right <= area.right + 0.5,
            }
          })()
    const match = /^(\d+):(\d+) (\d+)L$/.exec(position.textContent ?? '')
    if (match === null) {
      throw new Error(`status position reads "${position.textContent}"`)
    }
    return {
      rows,
      cursor,
      status: {
        line: Number(match[1]),
        column: Number(match[2]),
        lineCount: Number(match[3]),
      },
      cell,
      rowHeight: elements[0]?.getBoundingClientRect().height ?? 0,
      area,
    }
  })

/** The lines on screen, rows of one line joined back together. */
export const linesOf = (screen: Screen): ReadonlyArray<string> =>
  screen.rows.reduce<Array<string>>((lines, row, index) => {
    const previous = screen.rows[index - 1]
    if (previous !== undefined && previous.lineId === row.lineId) {
      lines[lines.length - 1] += row.text
    } else {
      lines.push(row.text)
    }
    return lines
  }, [])

export const textOf = (screen: Screen): string => linesOf(screen).join('\n')

export type Nullpad = ReturnType<typeof driver>

/** The screen once every input sent so far is drawn. */
export const screenOf = async (page: Page): Promise<Screen> => {
  await settle(page)
  return readScreen(page)
}

const driver = (page: Page, cdp: CDPSession) => {
  const screen = () => screenOf(page)
  return {
    page,
    cdp,
    screen,
    text: async () => textOf(await screen()),
    status: async () => (await screen()).status,
    cursor: async () => (await screen()).cursor,
    type: async (text: string) => {
      await page.keyboard.type(text)
      await settle(page)
    },
    press: async (key: string, times = 1) => {
      for (let i = 0; i < times; i++) {
        await page.keyboard.press(key)
      }
      await settle(page)
    },
    /** One trusted Ctrl+V with the system clipboard holding `text`, as a user pastes. */
    paste: async (text: string) => {
      await page.evaluate(value => navigator.clipboard.writeText(value), text)
      const key = {
        key: 'v',
        code: 'KeyV',
        windowsVirtualKeyCode: 86,
        modifiers: 2,
      }
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        ...key,
        commands: ['paste'],
      })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
      await settle(page)
    },
    compose: async (text: string) => {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      })
      await settle(page)
    },
    commit: async (text: string) => {
      await cdp.send('Input.insertText', { text })
      await settle(page)
    },
    /** The window takes a new size, and the editor measures it on the next frame and redraws on the one after. */
    resize: async (width: number, height: number) => {
      await page.setViewportSize({ width, height })
      await settle(page)
      await settle(page)
    },
    wheel: async (deltaY: number) => {
      await page.mouse.wheel(0, deltaY)
      await settle(page)
    },
    click: async (x: number, y: number) => {
      await page.mouse.click(x, y)
      await settle(page)
    },
    /** Pixels in `clip` that differ from the page background, from a screenshot of what is drawn. */
    inkIn: async (
      clip: Readonly<{ x: number; y: number; width: number; height: number }>,
    ) => {
      await settle(page)
      const png = await page.screenshot({
        clip,
        animations: 'disabled',
        caret: 'hide',
      })
      return page.evaluate(async base64 => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        if (context === null) {
          throw new Error('no 2d canvas to read the screenshot')
        }
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(
          0,
          0,
          image.width,
          image.height,
        ).data
        const background = (
          getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? []
        ).map(Number)
        let ink = 0
        for (let i = 0; i < pixels.length; i += 4) {
          const distance = Math.max(
            Math.abs((pixels[i] ?? 0) - (background[0] ?? 0)),
            Math.abs((pixels[i + 1] ?? 0) - (background[1] ?? 0)),
            Math.abs((pixels[i + 2] ?? 0) - (background[2] ?? 0)),
          )
          if (distance > 8) {
            ink++
          }
        }
        return ink
      }, png.toString('base64'))
    },
    preedit: () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-ghost]:not(#caret)')]
          .map(node => node.textContent)
          .join(''),
      ),
  }
}

/** Every line on screen reads `line N` under its number N, as `numberedLines` wrote it. */
export const expectNumberedLinesIntact = (screen: Screen, label: string) => {
  const numbered = screen.rows.filter(row => row.number !== null)
  expect(numbered.length, `${label}: line numbers on screen`).toBeGreaterThan(0)
  expect(linesOf(screen), `${label}: each line reads as its number`).toEqual(
    numbered.map(row => `line ${row.number}`),
  )
}

export const expectRowsFit = (screen: Screen, label: string) =>
  expect(
    Math.max(...screen.rows.map(row => row.inkRight)),
    `${label}: widest row against the text area's right edge`,
  ).toBeLessThanOrEqual(screen.area.right + 0.5)

/** No ink in the two blank cells between the line numbers and the text, and some ink left of them. */
export const expectNumbersClearOfText = async (
  nullpad: Nullpad,
  label: string,
) => {
  const screen = await nullpad.screen()
  const textLeft = screen.rows[0]?.left ?? 0
  const top = screen.rows[0]?.top ?? 0
  const height = (screen.rows.at(-1)?.bottom ?? 0) - top
  const gap = {
    x: textLeft - 2 * screen.cell + 1,
    y: top,
    width: 2 * screen.cell - 2,
    height,
  }
  expect(
    await nullpad.inkIn(gap),
    `${label}: the blank cells left of the text stay blank`,
  ).toBe(0)
  const numbers = {
    x: screen.area.left,
    y: top,
    width: gap.x - screen.area.left,
    height,
  }
  expect(
    await nullpad.inkIn(numbers),
    `${label}: line numbers are drawn`,
  ).toBeGreaterThan(0)
}

/** `lines` numbered lines, `line 1` to `line N`, each followed by `suffix`. */
export const numberedLines = (lines: number, suffix = ''): string =>
  Array.from({ length: lines }, (_, i) => `line ${i + 1}${suffix}`).join('\n')

/** A grapheme the terminal grid gives two cells: an East Asian wide character or an emoji. */
const wideGrapheme =
  /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\ufe0f|[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6])/u

/**
 * Where a textarea of the screen's wrap width breaks each line, in the editor's font and with each wide
 * character two cells wide, as on the terminal grid. A div outside the app takes the textarea's wrap rules
 * (pre-wrap, break-word); a margin pads each non-ASCII character to its cells, which moves no break.
 */
export const textareaRowStarts = (
  page: Page,
  lines: ReadonlyArray<string>,
  columns: number,
  cell: number,
): Promise<ReadonlyArray<ReadonlyArray<number>>> =>
  page.evaluate(
    ({ lines, columns, cell, wide }) => {
      const wideGrapheme = new RegExp(wide, 'u')
      const segmenter = new Intl.Segmenter(undefined, {
        granularity: 'grapheme',
      })
      const mirror = document.createElement('div')
      Object.assign(mirror.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        visibility: 'hidden',
        width: `${columns * cell + 0.5}px`,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        wordBreak: 'normal',
      })
      document.body.append(mirror)
      const range = document.createRange()
      const starts = lines.map(line => {
        mirror.replaceChildren()
        const pieces: Array<{ node: Node; index: number }> = []
        for (const { segment, index } of segmenter.segment(line)) {
          if (/^[\x20-\x7e]$/.test(segment)) {
            mirror.append(segment)
            pieces.push({ node: mirror.lastChild ?? mirror, index })
          } else {
            const span = document.createElement('span')
            span.textContent = segment
            mirror.append(span)
            const cells = wideGrapheme.test(segment) ? 2 : 1
            span.style.marginLeft = `${cells * cell - span.getBoundingClientRect().width}px`
            pieces.push({ node: span, index })
          }
        }
        const rowStarts = [0]
        let top: number | null = null
        for (const { node, index } of pieces) {
          range.selectNodeContents(node)
          const rect = range.getClientRects()[0]
          if (rect !== undefined) {
            if (top !== null && rect.top > top + cell && index > 0) {
              rowStarts.push(index)
            }
            top = rect.top
          }
        }
        return rowStarts
      })
      mirror.remove()
      return starts
    },
    { lines, columns, cell, wide: wideGrapheme.source },
  )

/** Where each line on screen starts its rows, as columns of the line. */
export const rowStartsOf = (
  screen: Screen,
): ReadonlyArray<ReadonlyArray<number>> =>
  screen.rows.reduce<Array<Array<number>>>((lines, row, index) => {
    if (screen.rows[index - 1]?.lineId === row.lineId) {
      lines.at(-1)?.push(row.start)
    } else {
      lines.push([row.start])
    }
    return lines
  }, [])

export const test = base.extend<{
  nullpad: Nullpad
  pageErrors: Array<string>
}>({
  pageErrors: async ({ page }, use) => {
    const errors: Array<string> = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    await use(errors)
  },
  nullpad: async ({ page, context, pageErrors }, use, testInfo) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await page.locator('#caret').waitFor()
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const cdp = await context.newCDPSession(page)
    await use(driver(page, cdp))
    if (pageErrors.length > 0 && testInfo.status === testInfo.expectedStatus) {
      throw new Error(`page errors:\n${pageErrors.join('\n')}`)
    }
  },
})
