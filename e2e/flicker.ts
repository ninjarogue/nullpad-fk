import type {
  Browser,
  BrowserContext,
  CDPSession,
  Page,
} from '@playwright/test'

import type { Nullpad } from './nullpad'

export const flickerNote = Array.from(
  { length: 20_000 },
  (_, i) =>
    `line ${i + 1}: lorem ipsum dolor sit amet, consectetur adipiscing elit` +
    (i % 7 === 0
      ? ' sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'
      : ''),
).join('\n')

type Area = Readonly<{ x: number; y: number; width: number; height: number }>

export type Watched = Readonly<{
  name: string
  page: Page
  cdp: CDPSession
  area: Area
}>

type Painted = Readonly<{ ink: number; blankStrip: number }>

const areaOf = (page: Page, selector: string): Promise<Area> =>
  page.evaluate(selector => {
    const element = document.querySelector<HTMLElement>(selector)
    if (element === null) {
      throw new Error(`no ${selector}`)
    }
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const top = Math.ceil(box.top + Number.parseFloat(style.paddingTop))
    return {
      x: Math.ceil(box.left),
      y: top,
      width: Math.floor(box.width),
      height: Math.floor(box.bottom) - top,
    }
  }, selector)

export const watchNullpad = async (nullpad: Nullpad): Promise<Watched> => {
  await nullpad.paste(flickerNote)
  await nullpad.press('Control+Home')
  return {
    name: 'nullpad',
    page: nullpad.page,
    cdp: nullpad.cdp,
    area: await areaOf(nullpad.page, '.surface'),
  }
}

export const watchTextarea = async (
  browser: Browser,
  nullpad: Nullpad,
): Promise<Readonly<{ watched: Watched; context: BrowserContext }>> => {
  const stylesheet = await nullpad.page.evaluate(
    () =>
      document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.href ??
      '',
  )
  const viewport = nullpad.page.viewportSize() ?? { width: 1000, height: 600 }
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.setContent(
    [
      `<link rel="stylesheet" href="${stylesheet}">`,
      '<textarea id="t" spellcheck="false" style="position:fixed;inset:0 0 22px 0;width:calc(76ch + 6ch);height:calc(100% - 22px);box-sizing:border-box;margin:0;padding:10px 2ch 0;border:0;outline:0;resize:none;font:inherit;color:inherit;background:transparent;white-space:pre-wrap;overflow-wrap:break-word;overflow-y:auto"></textarea>',
    ].join(''),
  )
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.evaluate(text => {
    const area = document.querySelector('textarea')
    if (area === null) {
      throw new Error('no textarea')
    }
    area.value = text
    area.focus()
    area.setSelectionRange(0, 0)
    area.scrollTop = 0
  }, flickerNote)
  return {
    watched: {
      name: 'textarea',
      page,
      cdp: await context.newCDPSession(page),
      area: await areaOf(page, 'textarea'),
    },
    context,
  }
}

export const wheelTurns =
  (pixels: number, count: number, everyMs: number) =>
  async ({ cdp, area }: Watched): Promise<void> => {
    const start = Date.now()
    const sent: Array<Promise<unknown>> = []
    for (let turn = 0; turn < count; turn++) {
      sent.push(
        cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: area.x + area.width / 2,
          y: area.y + area.height / 2,
          deltaX: 0,
          deltaY: pixels,
        }),
      )
      const wait = start + (turn + 1) * everyMs - Date.now()
      if (wait > 0) {
        await new Promise(resolve => setTimeout(resolve, wait))
      }
    }
    await Promise.all(sent)
  }

export const keyPress =
  (combo: string) =>
  async ({ page }: Watched): Promise<void> => {
    await page.keyboard.press(combo)
  }

export const thenType =
  (act: (watched: Watched) => Promise<void>) =>
  async (watched: Watched): Promise<void> => {
    await act(watched)
    await watched.page.waitForTimeout(150)
    await watched.page.keyboard.type('x')
  }

export const paintedFrames = async (
  watched: Watched,
  reader: Page,
  act: (watched: Watched) => Promise<void>,
): Promise<ReadonlyArray<Painted>> => {
  const { cdp, area } = watched
  const frames: Array<string> = []
  const onFrame = (frame: { data: string; sessionId: number }) => {
    frames.push(frame.data)
    void cdp
      .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
      .catch(() => undefined)
  }
  cdp.on('Page.screencastFrame', onFrame)
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 85,
    everyNthFrame: 1,
  })
  await watched.page.waitForTimeout(150)
  await act(watched)
  await watched.page.waitForTimeout(400)
  await cdp.send('Page.stopScreencast')
  cdp.off('Page.screencastFrame', onFrame)
  return reader.evaluate(
    async ({ frames, area }) => {
      const measured: Array<Painted> = []
      for (const data of frames) {
        const image = await createImageBitmap(
          await (await fetch(`data:image/jpeg;base64,${data}`)).blob(),
        )
        const canvas = new OffscreenCanvas(area.width, area.height)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context === null) {
          throw new Error('no 2d context')
        }
        context.drawImage(
          image,
          area.x,
          area.y,
          area.width,
          area.height,
          0,
          0,
          area.width,
          area.height,
        )
        const { data: pixels } = context.getImageData(
          0,
          0,
          area.width,
          area.height,
        )
        const counts = new Map<number, number>()
        for (let at = 0; at < pixels.length; at += 4 * 7) {
          const key =
            (((pixels[at] ?? 0) >> 3) << 10) |
            (((pixels[at + 1] ?? 0) >> 3) << 5) |
            ((pixels[at + 2] ?? 0) >> 3)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        const background = [...counts].reduce((best, entry) =>
          entry[1] > best[1] ? entry : best,
        )[0]
        const red = ((background >> 10) & 31) << 3
        const green = ((background >> 5) & 31) << 3
        const blue = (background & 31) << 3
        const state = { ink: 0, strip: 0, blankStrip: 0 }
        for (let y = 0; y < area.height; y++) {
          let rowInk = 0
          for (let x = 0; x < area.width; x++) {
            const at = (y * area.width + x) * 4
            const distance =
              Math.abs((pixels[at] ?? 0) - red) +
              Math.abs((pixels[at + 1] ?? 0) - green) +
              Math.abs((pixels[at + 2] ?? 0) - blue)
            if (distance > 90) {
              rowInk += 1
            }
          }
          state.ink += rowInk
          state.strip = rowInk === 0 ? state.strip + 1 : 0
          state.blankStrip = Math.max(state.blankStrip, state.strip)
        }
        measured.push({
          ink: state.ink / (area.width * area.height),
          blankStrip: state.blankStrip,
        })
      }
      return measured
    },
    { frames, area },
  )
}

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[sorted.length >> 1] ?? 0
}

const neighborFrames = 4

const minInkAround = 0.005

const faintShareOfAround = 0.5

const maxBlankRows = 2

export const flickeringFrames = (
  frames: ReadonlyArray<Painted>,
  rowHeight: number,
): ReadonlyArray<string> =>
  frames.flatMap((frame, index) => {
    const around = median(
      [
        ...frames.slice(Math.max(0, index - neighborFrames), index),
        ...frames.slice(index + 1, index + 1 + neighborFrames),
      ].map(({ ink }) => ink),
    )
    const isFaint =
      around > minInkAround && frame.ink < around * faintShareOfAround
    const hasBlankStrip = frame.blankStrip > rowHeight * maxBlankRows
    return isFaint || hasBlankStrip
      ? [
          `frame ${index + 1} of ${frames.length}: ink ${(frame.ink * 100).toFixed(1)}% against ${(around * 100).toFixed(1)}% around it, blank strip ${frame.blankStrip} px`,
        ]
      : []
  })

export type Step = readonly [string, (watched: Watched) => Promise<void>]

export const flickerAgainstTextarea = async (
  browser: Browser,
  nullpad: Nullpad,
  steps: ReadonlyArray<Step>,
  throttle: number,
): Promise<ReadonlyArray<string>> => {
  const watched = await watchNullpad(nullpad)
  const { rowHeight } = await nullpad.screen()
  const textarea = await watchTextarea(browser, nullpad)
  const readerContext = await browser.newContext()
  const reader = await readerContext.newPage()
  const throttled = [watched, textarea.watched]
  for (const { cdp } of throttled) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  const failures: Array<string> = []
  for (const [name, act] of steps) {
    const ours = await paintedFrames(watched, reader, act)
    const theirs = await paintedFrames(textarea.watched, reader, act)
    const flickered = flickeringFrames(ours, rowHeight)
    const textareaFlickered = flickeringFrames(theirs, rowHeight)
    if (process.env['FLICKER_LOG'] !== undefined) {
      console.log(
        `${throttle}x ${name}: nullpad ${flickered.length}/${ours.length}, textarea ${textareaFlickered.length}/${theirs.length}`,
      )
    }
    if (ours.length < 2) {
      failures.push(`${name}: nullpad painted only ${ours.length} frame`)
    } else if (flickered.length > textareaFlickered.length) {
      failures.push(
        `${name}: ${flickered.length} of ${ours.length} frames blank or partly drawn, the textarea ${textareaFlickered.length} of ${theirs.length}\n  ${flickered.join('\n  ')}`,
      )
    }
  }
  for (const { cdp } of throttled) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  }
  await readerContext.close()
  await textarea.context.close()
  return failures
}
