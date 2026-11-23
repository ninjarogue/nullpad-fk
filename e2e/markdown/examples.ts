import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

export type Example = Readonly<{
  number: number
  section: string
  markdown: string
  html: string
}>

export const specVersion = '0.31.2'

export const exampleCount = 652

const withTabs = (text: string): string => text.replaceAll('→', '\t')

export const examples = (): ReadonlyArray<Example> => {
  const spec = readFileSync(
    createRequire(import.meta.url).resolve('commonmark-spec/spec.txt'),
    'utf8',
  )
    .replace(/\r\n?/g, '\n')
    .replace(/^<!-- END TESTS -->[^]*/m, '')
  const found: Array<Example> = []
  let section = ''
  for (const [, markdown, html, heading] of spec.matchAll(
    /^`{32} example\n([^]*?)^\.\n([^]*?)^`{32}$|^#{1,6} *(.*)$/gm,
  )) {
    if (heading !== undefined) {
      section = heading
    } else {
      found.push({
        number: found.length + 1,
        section,
        markdown: withTabs(markdown ?? ''),
        html: withTabs(html ?? ''),
      })
    }
  }
  return found
}
