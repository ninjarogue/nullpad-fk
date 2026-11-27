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

export const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>(resolve =>
        setTimeout(() =>
          requestAnimationFrame(() => setTimeout(() => resolve(), 0)),
        ),
      ),
  )

const statusIn = (position: string): Status => {
  const match = /^(\d+):(\d+) (\d+)L$/.exec(position)
  if (match === null) {
    throw new Error(`status position reads "${position}"`)
  }
  return {
    line: Number(match[1]),
    column: Number(match[2]),
    lineCount: Number(match[3]),
  }
}

const readScreen = async (page: Page): Promise<Screen> => {
  const { position, ...screen } = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    const position = document.querySelector('.pos')
    if (surface === null || position === null) {
      throw new Error('nullpad is not on screen: no .surface or .pos')
    }
    const style = getComputedStyle(surface)
    const padding = getComputedStyle(surface.querySelector('.sheet') ?? surface)
    const context = document.createElement('canvas').getContext('2d')
    if (context === null) {
      throw new Error('no 2d canvas to measure a cell')
    }
    context.font = `${style.fontSize} ${style.fontFamily}`
    const cell = context.measureText('0').width
    const rowHeight = Number.parseFloat(style.lineHeight)
    const box = surface.getBoundingClientRect()
    const area = {
      left: box.left + Number.parseFloat(padding.paddingLeft),
      right: box.right - Number.parseFloat(padding.paddingRight),
      top: box.top + Number.parseFloat(padding.paddingTop),
      bottom: box.bottom - Number.parseFloat(padding.paddingBottom),
    }
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    })
    const range = document.createRange()
    type Drawn = {
      top: number
      left: number
      right: number
      text: string
      start: number
      ink: boolean
    }
    type Row = {
      lineId: string
      start: number
      number: string | null
      text: string
      top: number
      bottom: number
      left: number
      inkRight: number
      drawn: Array<Drawn>
    }
    const allRows: Array<Row> = []
    for (const line of surface.querySelectorAll<HTMLElement>('.line')) {
      const lineBox = line.getBoundingClientRect()
      const left =
        lineBox.left + Number.parseFloat(getComputedStyle(line).paddingLeft)
      const rowTop = (top: number) =>
        lineBox.top +
        Math.floor((top - lineBox.top + rowHeight / 2) / rowHeight) * rowHeight
      const drawn: Array<Drawn> = []
      let column = 0
      for (const node of line.childNodes) {
        if (node instanceof Text) {
          for (const { segment, index } of segmenter.segment(node.data)) {
            range.setStart(node, index)
            range.setEnd(node, index + segment.length)
            const rect = range.getClientRects()[0]
            if (rect !== undefined) {
              drawn.push({
                top: rowTop(rect.top),
                left: rect.left,
                right: rect.right,
                text: segment,
                start: column + index,
                ink: /\S/u.test(segment),
              })
            }
          }
          column += node.length
        } else if (node instanceof HTMLElement) {
          for (const rect of node.getClientRects()) {
            drawn.push({
              top: rowTop(rect.top),
              left: rect.left,
              right: rect.right,
              text: '',
              start: column,
              ink: false,
            })
          }
        }
      }
      const rows: Array<Row> = []
      for (const item of drawn) {
        const row = rows.find(
          candidate => Math.abs(candidate.top - item.top) < rowHeight / 2,
        )
        if (row === undefined) {
          rows.push({
            lineId: line.dataset['lineId'] ?? '',
            start: item.start,
            number: null,
            text: item.text,
            top: item.top,
            bottom: item.top + rowHeight,
            left,
            inkRight: item.ink ? item.right : left,
            drawn: [item],
          })
        } else {
          row.text += item.text
          row.drawn.push(item)
          if (item.ink) {
            row.inkRight = Math.max(row.inkRight, item.right)
          }
        }
      }
      if (rows.length === 0) {
        rows.push({
          lineId: line.dataset['lineId'] ?? '',
          start: 0,
          number: null,
          text: '',
          top: lineBox.top,
          bottom: lineBox.top + rowHeight,
          left,
          inkRight: left,
          drawn: [],
        })
      }
      rows.sort((a, b) => a.top - b.top)
      const [first] = rows
      if (first !== undefined) {
        first.number = line.dataset['n'] ?? null
      }
      allRows.push(...rows)
    }
    const visible = allRows.filter(
      row => row.top >= area.top - 0.5 && row.bottom <= area.bottom + 0.5,
    )
    const caret = document.getElementById('caret')
    const caretTop = caret?.getBoundingClientRect().top ?? 0
    const cursor =
      caret === null ||
      caret.style.display === 'none' ||
      !visible.some(row => Math.abs(row.top - caretTop) < rowHeight / 2)
        ? null
        : (() => {
            const rect = caret.getBoundingClientRect()
            const rowIndex = visible.findIndex(
              row => Math.abs(row.top - rect.top) < rowHeight / 2,
            )
            const row =
              visible[rowIndex] ??
              allRows.find(
                candidate => Math.abs(candidate.top - rect.top) < rowHeight / 2,
              )
            const under = row?.drawn.find(
              item => item.text !== '' && Math.abs(item.left - rect.left) < 1,
            )
            return {
              row: rowIndex,
              cell:
                Math.round((rect.left - (row?.left ?? area.left)) / cell) || 0,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              char: under?.text ?? ' ',
              inside:
                rect.top >= area.top - 0.5 &&
                rect.bottom <= box.bottom + 0.5 &&
                rect.left >= area.left - 0.5 &&
                rect.right <= area.right + 0.5,
            }
          })()
    return {
      rows: visible.map(({ drawn: _, ...row }) => row),
      cursor,
      position: position.textContent ?? '',
      cell,
      rowHeight,
      area,
    }
  })
  return { ...screen, status: statusIn(position) }
}

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

export const screenOf = async (page: Page): Promise<Screen> => {
  await settle(page)
  return readScreen(page)
}

export const statusOf = async (page: Page): Promise<Status> => {
  await settle(page)
  return statusIn(
    await page.evaluate(
      () => document.querySelector('.pos')?.textContent ?? '',
    ),
  )
}

export const openTab = async (page: Page): Promise<Nullpad> => {
  const tab = await page.context().newPage()
  await tab.goto('/')
  await tab.locator('#caret').waitFor()
  await tab.evaluate(() => document.fonts.ready.then(() => undefined))
  return driver(tab, await page.context().newCDPSession(tab))
}

export const openFresh = async (page: Page, path = '/'): Promise<void> => {
  const { origin } = new URL(page.url())
  await page.goto('about:blank')
  if (origin !== 'null') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Storage.clearDataForOrigin', {
      origin,
      storageTypes: 'indexeddb,local_storage',
    })
    await cdp.detach()
  }
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        const look = () => {
          const box = document.getElementById('caret')?.getBoundingClientRect()
          if (box !== undefined && box.width > 0 && box.height > 0) {
            resolve()
          } else {
            requestAnimationFrame(look)
          }
        }
        look()
      }),
  )
}

export type JumpLabel = Readonly<{
  label: string
  line: number
  column: number
  from: number
  to: number
  left: number
  top: number
  width: number
  height: number
}>

export type JumpMatch = Readonly<{ line: number; from: number; to: number }>

export type FinderRow = Readonly<{
  text: string
  folder: string
  selected: boolean
}>

export type FinderScreen = Readonly<{
  mode: string
  query: string
  count: string
  header: string
  rows: ReadonlyArray<FinderRow>
  folders: ReadonlyArray<Readonly<{ name: string; on: boolean }>>
}>

const readFinder = (page: Page): Promise<FinderScreen | null> =>
  page.evaluate(() => {
    const finder = document.querySelector('.finder')
    if (finder === null) {
      return null
    }
    const text = (selector: string) =>
      finder.querySelector(selector)?.textContent ?? ''
    const query = [...(finder.querySelector('.query')?.childNodes ?? [])]
      .filter(
        node =>
          !(node instanceof HTMLElement) ||
          (!node.classList.contains('fcur') &&
            !node.classList.contains('placeholder')),
      )
      .map(node => node.textContent)
      .join('')
    return {
      mode: text('.prompt .bt'),
      query,
      count: text('.cnt'),
      header: text('.results .bt'),
      rows: [...finder.querySelectorAll('.rl .row')].map(row => ({
        text: row.querySelector('.t')?.textContent ?? '',
        folder: row.querySelector('.fd')?.textContent ?? '',
        selected: row.classList.contains('sel'),
      })),
      folders: [...finder.querySelectorAll('.folders button')].map(button => ({
        name: [...button.childNodes]
          .filter(node => node instanceof Text)
          .map(node => node.textContent)
          .join(''),
        on: button.classList.contains('on'),
      })),
    }
  })

export type ClipboardKind = 'read' | 'write'

/**
 * Headless Chromium keeps one clipboard for the whole browser, so a page of another context reads what this page wrote,
 * and about:blank has no clipboard, so the other page is an empty one of the app's own origin.
 */
const anotherApp = async (page: Page) => {
  const browser = page.context().browser()
  if (browser === null) {
    throw new Error('no browser to open another app in')
  }
  const context = await browser.newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const other = await context.newPage()
  await other.route('**/*', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>another app</title>',
    }),
  )
  await other.goto(new URL(page.url()).origin)
  return {
    copied: () => other.evaluate(() => navigator.clipboard.readText()),
    copy: (text: string) =>
      other.evaluate(value => navigator.clipboard.writeText(value), text),
    close: () => context.close(),
  }
}

const isVimOff = async (page: Page): Promise<boolean> =>
  (await page.locator('.status .mode').innerText()) === 'EDIT'

export const driver = (page: Page, cdp: CDPSession) => {
  const screen = () => screenOf(page)
  return {
    page,
    cdp,
    screen,
    title: () => page.title(),
    file: async () => {
      await settle(page)
      return page.locator('.status .file').innerText()
    },
    finder: async () => {
      await settle(page)
      return readFinder(page)
    },
    reload: async () => {
      await page.reload()
      await page.locator('#caret').waitFor()
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      await settle(page)
    },
    text: async () => textOf(await screen()),
    status: () => statusOf(page),
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
    paste: async (text: string) => {
      await page.evaluate(value => navigator.clipboard.writeText(value), text)
      const key = (await isVimOff(page))
        ? { key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2 }
        : { key: 'V', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 10 }
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        ...key,
        commands: ['paste'],
      })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
      await settle(page)
    },
    compose: async (
      text: string,
      replacing?: Readonly<{ start: number; end: number }>,
    ) => {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
        ...(replacing === undefined
          ? {}
          : {
              replacementStart: replacing.start,
              replacementEnd: replacing.end,
            }),
      })
      await settle(page)
    },
    commit: async (text: string) => {
      await cdp.send('Input.insertText', { text })
      await settle(page)
    },
    resize: async (width: number, height: number) => {
      await page.setViewportSize({ width, height })
      await settle(page)
      await settle(page)
    },
    wheel: async (deltaY: number) => {
      const ended = page.evaluate(
        () =>
          new Promise<void>(resolve => {
            const surface = document.querySelector('.surface')
            const state = { scrolled: false, frames: 0 }
            surface?.addEventListener(
              'scroll',
              () => {
                state.scrolled = true
              },
              { once: true },
            )
            surface?.addEventListener('scrollend', () => resolve(), {
              once: true,
            })
            const tick = () => {
              state.frames += 1
              if (!state.scrolled && state.frames >= 10) {
                resolve()
              } else {
                requestAnimationFrame(tick)
              }
            }
            requestAnimationFrame(tick)
          }),
      )
      await page.mouse.wheel(0, deltaY)
      await ended
      await settle(page)
      await settle(page)
    },
    click: async (x: number, y: number) => {
      await page.mouse.click(x, y)
      await settle(page)
    },
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
    selection: async (): Promise<string> => {
      await settle(page)
      return page.evaluate(() => {
        const isBlock =
          document.querySelector('#selection')?.getAttribute('data-kind') ===
          'block'
        const placed = [...document.querySelectorAll('#selection > *')]
          .map(element => ({
            rect: element.getBoundingClientRect(),
            isLineBreak: element.hasAttribute('data-break'),
          }))
          .filter(({ rect }) => rect.height > 0)
        const boxes = placed.filter(({ rect }) => rect.width > 0)
        const covers = (isLineBreak: boolean, x: number, y: number) =>
          boxes.some(
            box =>
              box.isLineBreak === isLineBreak &&
              x > box.rect.left - 0.5 &&
              x < box.rect.right + 0.5 &&
              y > box.rect.top &&
              y < box.rect.bottom,
          )
        const segmenter = new Intl.Segmenter(undefined, {
          granularity: 'grapheme',
        })
        const range = document.createRange()
        let selected = ''
        const blockLines: Array<string> = []
        for (const line of document.querySelectorAll('.surface .line')) {
          const lineBox = line.getBoundingClientRect()
          const touched = placed.filter(
            ({ rect }) =>
              rect.top + rect.height / 2 > lineBox.top &&
              rect.top + rect.height / 2 < lineBox.bottom,
          )
          if (touched.length === 0) {
            continue
          }
          const before = selected.length
          for (const node of line.childNodes) {
            if (!(node instanceof Text)) {
              continue
            }
            for (const { segment, index } of segmenter.segment(node.data)) {
              range.setStart(node, index)
              range.setEnd(node, index + segment.length)
              const [rect] = range.getClientRects()
              if (
                rect !== undefined &&
                covers(
                  false,
                  (rect.left + rect.right) / 2,
                  (rect.top + rect.bottom) / 2,
                )
              ) {
                selected += segment
              }
            }
          }
          blockLines.push(selected.slice(before))
          if (touched.some(box => box.isLineBreak)) {
            selected += '\n'
          }
        }
        return isBlock ? blockLines.join('\n') : selected
      })
    },
    jumpLabels: async (): Promise<ReadonlyArray<JumpLabel>> => {
      await settle(page)
      return page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#jump > [data-label]')].map(
          element => {
            const rect = element.getBoundingClientRect()
            return {
              label: element.textContent ?? '',
              line: Number(element.dataset['line']),
              column: Number(element.dataset['column']),
              from: Number(element.dataset['from']),
              to: Number(element.dataset['to']),
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }
          },
        ),
      )
    },
    jumpMatches: async (): Promise<ReadonlyArray<JumpMatch>> => {
      await settle(page)
      const value = await page.evaluate(
        () =>
          document
            .querySelector('.surface')
            ?.getAttribute('data-jump-matches') ?? '',
      )
      return value === ''
        ? []
        : value.split(';').map(item => {
            const [line, from, to] = item.split(',').map(Number)
            return { line: line ?? NaN, from: from ?? NaN, to: to ?? NaN }
          })
    },
    isJumping: async (): Promise<boolean> => {
      await settle(page)
      return (await page.locator('.surface.jumping').count()) > 0
    },
    notice: async () => {
      await settle(page)
      return page
        .locator('.status .notice')
        .evaluateAll(found =>
          found.map(element => element.textContent).join(''),
        )
    },
    allowClipboard: async (kinds: ReadonlyArray<ClipboardKind>) => {
      await page.context().clearPermissions()
      await page
        .context()
        .grantPermissions(kinds.map(kind => `clipboard-${kind}`))
    },
    holdClipboardReads: () =>
      page.evaluate(() => {
        const { clipboard } = navigator
        const read = clipboard.readText.bind(clipboard)
        const gate = { open: () => {} }
        const opened = new Promise<void>(resolve => {
          gate.open = resolve
        })
        clipboard.readText = () => opened.then(read)
        Reflect.set(globalThis, 'nullpadReleaseClipboard', () => {
          clipboard.readText = read
          gate.open()
        })
      }),
    releaseClipboardReads: async () => {
      await page.evaluate(() => {
        const release: unknown = Reflect.get(
          globalThis,
          'nullpadReleaseClipboard',
        )
        if (typeof release === 'function') {
          release()
        }
      })
      await settle(page)
    },
    outside: () => anotherApp(page),
  }
}

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

export const numberedLines = (lines: number, suffix = ''): string =>
  Array.from({ length: lines }, (_, i) => `line ${i + 1}${suffix}`).join('\n')

/**
 * A div outside the app takes the textarea's wrap rules (pre-wrap, break-word), which wraps exactly as a textarea does.
 */
export const textareaRowStarts = (
  page: Page,
  lines: ReadonlyArray<string>,
  columns: number,
  cell: number,
): Promise<ReadonlyArray<ReadonlyArray<number>>> =>
  page.evaluate(
    ({ lines, columns, cell }) => {
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
        tabSize: '8',
      })
      document.body.append(mirror)
      const range = document.createRange()
      const starts = lines.map(line => {
        mirror.textContent = line
        const node = mirror.firstChild
        const rowStarts = [0]
        if (node === null) {
          return rowStarts
        }
        let top: number | null = null
        for (const { segment, index } of segmenter.segment(line)) {
          range.setStart(node, index)
          range.setEnd(node, index + segment.length)
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
    { lines, columns, cell },
  )

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

export const startVimRow = async (
  nullpad: Nullpad,
  text: string,
  line: number,
  column: number,
): Promise<void> => {
  const { page } = nullpad
  const mode = page.locator('.status .mode')
  await settle(page)
  if ((await mode.innerText()) === 'EDIT') {
    await page.keyboard.press('Control+,')
  }
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(mode, 'vim is on before the row is pasted').toHaveText('NORMAL')
  for (const key of ['g', 'g', 'd', 'G']) {
    await page.keyboard.press(key)
  }
  await nullpad.paste(text)
  const lineCount = text.split('\n').length
  await expect
    .poll(
      async () =>
        lineCount <= 40
          ? await textOf(await screenOf(page))
          : (await statusOf(page)).lineCount,
      { message: 'the pasted note is in the editor before the reload' },
    )
    .toBe(lineCount <= 40 ? text : lineCount)
  await nullpad.reload()
  const keys = [
    'g',
    'g',
    ...(line > 1 ? [...String(line - 1), 'j'] : []),
    '0',
    ...(column > 1 ? [...String(column - 1), 'l'] : []),
  ]
  for (const key of keys) {
    await page.keyboard.press(key)
  }
  await settle(page)
  const status = await statusOf(page)
  expect(status.lineCount, 'the row starts with its line count').toBe(lineCount)
  if (lineCount <= 40) {
    expect(
      await textOf(await screenOf(page)),
      'the row starts on its note',
    ).toBe(text)
  }
  expect(await mode.innerText(), 'the row starts in NORMAL').toBe('NORMAL')
  expect(status.line, 'the row starts on its line').toBe(line)
}
