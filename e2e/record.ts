import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { type Browser } from '@playwright/test'

import { type Step } from './steps.ts'

export type Cue = Readonly<{ at: number; caption: string; note: string }>

export const pace = {
  betweenKeys: 90,
  afterStep: 700,
  atEnd: 2500,
  readFloor: 1500,
  readPerCharacter: 55,
} as const

export const readingTime = (cue: Cue): number =>
  Math.max(
    pace.readFloor,
    (cue.caption.length + cue.note.length) * pace.readPerCharacter,
  )

export const pauseAfter = (step: Step): number =>
  'expect' in step ? 0 : pace.afterStep

export const keyByKey = (step: Step): ReadonlyArray<Step> => {
  if ('type' in step) {
    return Array.from(step.type, character => ({ type: character }))
  }
  if ('press' in step) {
    return Array.from({ length: step.times ?? 1 }, () => ({
      press: step.press,
    }))
  }
  return [step]
}

export const hasFfmpeg = (): boolean => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const strip = { height: 96, minWidth: 960, background: '#171726' }

const frameWidth = (videoWidth: number): number =>
  Math.ceil(Math.max(videoWidth, strip.minWidth) / 2) * 2

const stripPage = `<!doctype html>
<style>
  body { margin: 0; }
  #strip {
    box-sizing: border-box;
    height: ${strip.height}px;
    padding: 0 28px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: ${strip.background};
    border-bottom: 3px solid #4a90e2;
    font-family: Inter, system-ui, sans-serif;
    color: #fff;
  }
  #strip div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #caption { font-size: 26px; line-height: 34px; font-weight: 600; }
  #note { font-size: 20px; line-height: 30px; color: #bfe0ff; }
</style>
<div id="strip"><div id="caption"></div><div id="note"></div></div>`

export const drawCaptions = async (
  browser: Browser,
  cues: ReadonlyArray<Cue>,
  videoWidth: number,
  folder: string,
): Promise<ReadonlyArray<string>> => {
  mkdirSync(folder, { recursive: true })
  const page = await browser.newPage({
    viewport: { width: frameWidth(videoWidth), height: strip.height },
    deviceScaleFactor: 1,
  })
  await page.setContent(stripPage)
  const images: Array<string> = []
  for (const [index, cue] of cues.entries()) {
    await page.locator('#caption').evaluate((element, text) => {
      element.textContent = text
    }, cue.caption)
    await page.locator('#note').evaluate((element, text) => {
      element.textContent = text
    }, cue.note)
    const image = join(folder, `caption-${index}.png`)
    await page.locator('#strip').screenshot({ path: image })
    images.push(image)
  }
  await page.close()
  return images
}

const seconds = (ms: number): string => (ms / 1000).toFixed(3)

const filterFor = (cues: ReadonlyArray<Cue>, videoWidth: number): string => {
  const padded = `[0:v]pad=w=${frameWidth(videoWidth)}:h='ceil((ih+${strip.height})/2)*2':x='(ow-iw)/2':y=${strip.height}:color=${strip.background.replace('#', '0x')}[v0]`
  const overlays = cues.map((cue, index) => {
    const next = cues[index + 1]
    const during =
      next === undefined
        ? `gte(t,${seconds(cue.at)})`
        : `between(t,${seconds(cue.at)},${seconds(next.at)})`
    return `[v${index}][${index + 1}:v]overlay=0:0:enable='${during}'[v${index + 1}]`
  })
  return [padded, ...overlays].join(';')
}

export const burnCaptions = (
  options: Readonly<{
    video: string
    videoWidth: number
    cues: ReadonlyArray<Cue>
    images: ReadonlyArray<string>
    out: string
  }>,
): void => {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      options.video,
      ...options.images.flatMap(image => ['-i', image]),
      '-filter_complex',
      filterFor(options.cues, options.videoWidth),
      '-map',
      `[v${options.cues.length}]`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      options.out,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
}
