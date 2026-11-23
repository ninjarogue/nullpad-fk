import { Array } from 'effect'

import type { SourceLine } from './tree'

export type Reader = Readonly<{
  text: string
  offset: number
  column: number
  owedSpaces: number
  nonspace: number
  nonspaceColumn: number
}>

const tabStop = 4

export const codeIndent = 4

export const matchAt = (
  pattern: RegExp,
  text: string,
  offset: number,
): RegExpExecArray | null => {
  pattern.lastIndex = offset
  return pattern.exec(text)
}

export const endAt = (pattern: RegExp, text: string, offset: number): number =>
  offset + (matchAt(pattern, text, offset)?.[0].length ?? 0)

export const withNulReplaced = (line: SourceLine): string =>
  line.text.includes('\u0000')
    ? line.text.replaceAll('\u0000', '\uFFFD')
    : line.text

const blanks = /[ \t]*/y

const trailingBlanks = /(?<![ \t])[ \t]+$/

const trailingSpaces = /(?<! ) +$/

export const lengthWithoutTrailingBlanks = (text: string): number =>
  text.length - (trailingBlanks.exec(text)?.[0].length ?? 0)

export const lengthWithoutTrailingSpaces = (text: string): number =>
  text.length - (trailingSpaces.exec(text)?.[0].length ?? 0)

const columnAfter = (run: string, column: number): number =>
  run.includes('\t')
    ? Array.reduce(Array.fromIterable(run), column, (at, character) =>
        character === '\t' ? at + tabStop - (at % tabStop) : at + 1,
      )
    : column + run.length

const measured = (
  text: string,
  offset: number,
  column: number,
  owedSpaces: number,
): Reader => {
  const nonspace = endAt(blanks, text, offset)
  return {
    text,
    offset,
    column,
    owedSpaces,
    nonspace,
    nonspaceColumn: columnAfter(text.slice(offset, nonspace), column),
  }
}

export const start = (text: string): Reader => measured(text, 0, 0, 0)

export const indentOf = (reader: Reader): number =>
  reader.owedSpaces + reader.nonspaceColumn - reader.column

export const isIndentedCode = (reader: Reader): boolean =>
  indentOf(reader) >= codeIndent

export const isBlank = (reader: Reader): boolean =>
  reader.nonspace >= reader.text.length

export const toNonspace = (reader: Reader): Reader => ({
  ...reader,
  offset: reader.nonspace,
  column: reader.nonspaceColumn,
  owedSpaces: 0,
})

export const pastMarker = (reader: Reader, length: number): Reader =>
  measured(
    reader.text,
    reader.nonspace + length,
    reader.nonspaceColumn + length,
    0,
  )

export const skipColumns = (reader: Reader, columns: number): Reader => {
  if (columns <= reader.owedSpaces) {
    return { ...reader, owedSpaces: reader.owedSpaces - columns }
  }
  const walked = Array.reduce(
    Array.fromIterable(
      reader.text.slice(
        reader.offset,
        Math.min(reader.nonspace, reader.offset + columns),
      ),
    ),
    {
      offset: reader.offset,
      column: reader.column,
      left: columns - reader.owedSpaces,
      owedSpaces: 0,
    },
    (at, character) => {
      if (at.left <= 0) {
        return at
      }
      const width = character === '\t' ? tabStop - (at.column % tabStop) : 1
      return {
        offset: at.offset + 1,
        column: at.column + width,
        left: at.left - width,
        owedSpaces: Math.max(0, width - at.left),
      }
    },
  )
  return {
    ...reader,
    offset: walked.offset,
    column: walked.column,
    owedSpaces: walked.owedSpaces,
  }
}
