import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

const strip = { height: 96, least: 960, ground: '0x171726', rule: '0x4a90e2' }

const seconds = (ms: number): string => (ms / 1000).toFixed(3)

const filterFor = (cues: ReadonlyArray<Cue>, end: number): string => {
  const shown = cues.flatMap((cue, index) => {
    const until = cues[index + 1]?.at ?? end
    const during = `enable='between(t,${seconds(cue.at)},${seconds(until)})'`
    return [
      `drawtext=expansion=none:textfile=caption-${index}.txt:fontsize=26:fontcolor=white:x=28:y=16:${during}`,
      ...(cue.note === ''
        ? []
        : [
            `drawtext=expansion=none:textfile=note-${index}.txt:fontsize=20:fontcolor=0xbfe0ff:x=28:y=56:${during}`,
          ]),
    ]
  })
  return [
    `pad=w='ceil(max(iw,${strip.least})/2)*2':h='ceil((ih+${strip.height})/2)*2':x='(ow-iw)/2':y=${strip.height}:color=${strip.ground}`,
    `drawbox=x=0:y=${strip.height - 3}:w=iw:h=3:color=${strip.rule}:t=fill`,
    ...shown,
  ].join(',')
}

export const burnCaptions = (
  options: Readonly<{
    video: string
    cues: ReadonlyArray<Cue>
    end: number
    scratch: string
    out: string
  }>,
): void => {
  const work = join(options.scratch, 'cues')
  mkdirSync(work, { recursive: true })
  for (const [index, cue] of options.cues.entries()) {
    writeFileSync(join(work, `caption-${index}.txt`), cue.caption)
    writeFileSync(join(work, `note-${index}.txt`), cue.note)
  }
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      options.video,
      '-vf',
      filterFor(options.cues, options.end),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      options.out,
    ],
    { cwd: work, stdio: ['ignore', 'ignore', 'inherit'] },
  )
}
