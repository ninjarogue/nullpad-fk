import { Array } from 'effect'

export type SourceLine = Readonly<{ text: string }>

export type Document = Readonly<{ lines: ReadonlyArray<SourceLine> }>

export const parse = (lines: ReadonlyArray<SourceLine>): Document => ({ lines })

export const toHtml = (document: Document): string =>
  Array.join(
    Array.map(document.lines, line => `<p>${line.text}</p>\n`),
    '',
  )

export const outline = (document: Document): string =>
  Array.join(
    Array.map(
      document.lines,
      (line, index) =>
        `Paragraph ${index + 1}:0-${index + 1}:${line.text.length}`,
    ),
    '\n',
  )
