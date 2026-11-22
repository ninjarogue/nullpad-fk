import { Array, Option } from 'effect'

import * as HtmlBlocks from './htmlBlocks'
import * as Leaves from './leaves'
import {
  type Reader,
  codeIndent,
  indentOf,
  isBlank,
  isIndentedCode,
  lengthWithoutTrailingBlanks,
  matchAt,
  pastMarker,
  skipColumns,
  toNonspace,
} from './lines'
import { type HeadingLevel, type ListKind, deepestNesting } from './tree'

export type Columns = Readonly<{ from: number; to: number }>

export type StartedContainer =
  | Readonly<{ _tag: 'Quote'; at: number; depth: number; rest: Reader }>
  | Readonly<{
      _tag: 'Item'
      kind: ListKind
      joinsList: boolean
      marker: Columns
      contentIndent: number
      depth: number
      rest: Reader
    }>

export type StartedLeaf =
  | Readonly<{
      _tag: 'Heading'
      level: HeadingLevel
      span: Columns
      content: Columns
    }>
  | Readonly<{ _tag: 'ThematicBreak'; span: Columns }>
  | Readonly<{ _tag: 'Fence'; at: number; fence: Leaves.Fence; rest: Reader }>
  | Readonly<{ _tag: 'Html'; end: HtmlBlocks.HtmlEnd }>
  | Readonly<{ _tag: 'IndentedCode'; rest: Reader }>

export type StartedSetext = Readonly<{
  _tag: 'Setext'
  level: 1 | 2
  underlineEnd: number
  text: Leaves.Text
}>

export type Started = StartedContainer | StartedLeaf | StartedSetext

export type Tip = Readonly<{
  within: 'Paragraph' | 'List' | 'Elsewhere'
  list: Option.Option<ListKind>
  paragraph: Option.Option<Extract<Leaves.OpenLeaf, { _tag: 'Paragraph' }>>
  leafIsParagraph: boolean
  mayBeLazy: boolean
  depth: number
}>

type BlockStart = (reader: Reader, tip: Tip) => Option.Option<Started>

const depthUnderTip = (tip: Tip): number =>
  tip.within === 'List' ? tip.depth - 1 : tip.depth

const quote: BlockStart = (reader, tip) => {
  const depth = depthUnderTip(tip) + 1
  if (
    isIndentedCode(reader) ||
    reader.text.charAt(reader.nonspace) !== '>' ||
    depth > deepestNesting
  ) {
    return Option.none()
  }
  const afterMarker = pastMarker(reader, 1)
  return Option.some({
    _tag: 'Quote',
    at: reader.nonspace,
    depth,
    rest: indentOf(afterMarker) > 0 ? skipColumns(afterMarker, 1) : afterMarker,
  })
}

const atxMarker = /#{1,6}(?:[ \t]+|$)/y

const closingSequenceAlone = /[ \t]*#+[ \t]*$/y

const closingSequence = /(?<![ \t])[ \t]+#+[ \t]*$/

const headingLevels: ReadonlyArray<HeadingLevel> = [1, 2, 3, 4, 5, 6]

const atxHeading: BlockStart = reader => {
  const marker = isIndentedCode(reader)
    ? null
    : matchAt(atxMarker, reader.text, reader.nonspace)
  if (marker === null) {
    return Option.none()
  }
  const { text } = reader
  const from = reader.nonspace + marker[0].length
  const raw = text.slice(from)
  const length =
    matchAt(closingSequenceAlone, text, from) === null
      ? (closingSequence.exec(raw)?.index ?? lengthWithoutTrailingBlanks(raw))
      : 0
  return Option.some({
    _tag: 'Heading',
    level: headingLevels[marker[0].trim().length - 1] ?? 6,
    span: { from: reader.nonspace, to: lengthWithoutTrailingBlanks(text) },
    content: { from, to: from + length },
  })
}

const fenceRun = /`{3,}|~{3,}/y

const fencedCode: BlockStart = reader => {
  const fence = isIndentedCode(reader)
    ? null
    : matchAt(fenceRun, reader.text, reader.nonspace)
  if (fence === null) {
    return Option.none()
  }
  const { length } = fence[0]
  const character = fence[0].charAt(0)
  return character === '`' &&
    reader.text.includes('`', reader.nonspace + length)
    ? Option.none()
    : Option.some({
        _tag: 'Fence',
        at: reader.nonspace,
        fence: { character, length, indent: indentOf(reader) },
        rest: pastMarker(reader, length),
      })
}

const htmlBlock: BlockStart = (reader, tip) =>
  isIndentedCode(reader) || reader.text.charAt(reader.nonspace) !== '<'
    ? Option.none()
    : Option.map(
        HtmlBlocks.opening(
          reader.text,
          reader.nonspace,
          tip.within === 'Paragraph' || tip.mayBeLazy,
        ),
        end => ({ _tag: 'Html', end }),
      )

const setextUnderline = /(?:=+|-+)[ \t]*$/y

const setextHeading: BlockStart = (reader, tip) =>
  Option.flatMap(tip.paragraph, paragraph => {
    const underline = isIndentedCode(reader)
      ? null
      : matchAt(setextUnderline, reader.text, reader.nonspace)
    if (underline === null) {
      return Option.none()
    }
    const text = Leaves.textOfParagraph(paragraph.lines)
    return Array.isReadonlyArrayNonEmpty(text.lines)
      ? Option.some({
          _tag: 'Setext',
          level: underline[0].startsWith('=') ? 1 : 2,
          underlineEnd: lengthWithoutTrailingBlanks(reader.text),
          text,
        })
      : Option.none()
  })

const thematicBreakLine = /([*_-])[ \t]*\1[ \t]*\1(?:\1|[ \t])*$/y

const thematicBreak: BlockStart = reader =>
  isIndentedCode(reader) ||
  matchAt(thematicBreakLine, reader.text, reader.nonspace) === null
    ? Option.none()
    : Option.some({
        _tag: 'ThematicBreak',
        span: {
          from: reader.nonspace,
          to: lengthWithoutTrailingBlanks(reader.text),
        },
      })

const bulletMarker = /[*+-]/y

const orderedMarker = /(\d{1,9})([.)])/y

type Marker = Readonly<{ kind: ListKind; length: number }>

const bulletAt = (reader: Reader): Option.Option<Marker> => {
  const character = matchAt(bulletMarker, reader.text, reader.nonspace)?.[0]
  return character === '-' || character === '+' || character === '*'
    ? Option.some({ kind: { _tag: 'Bullet', character }, length: 1 })
    : Option.none()
}

const orderedAt = (reader: Reader, tip: Tip): Option.Option<Marker> => {
  const found = matchAt(orderedMarker, reader.text, reader.nonspace)
  const start = Number.parseInt(found?.[1] ?? '', 10)
  const delimiter = found?.[2]
  return found !== null &&
    (delimiter === '.' || delimiter === ')') &&
    (tip.within !== 'Paragraph' || start === 1)
    ? Option.some({
        kind: { _tag: 'Ordered', start, delimiter },
        length: found[0].length,
      })
    : Option.none()
}

const sameList = (a: ListKind, b: ListKind): boolean =>
  a._tag === 'Bullet'
    ? b._tag === 'Bullet' && a.character === b.character
    : b._tag === 'Ordered' && a.delimiter === b.delimiter

const widestMarkerPadding = 4

const listItem: BlockStart = (reader, tip) =>
  Option.flatMap(
    isIndentedCode(reader)
      ? Option.none()
      : Option.orElse(bulletAt(reader), () => orderedAt(reader, tip)),
    ({ kind, length }) => {
      const afterMarker = pastMarker(reader, length)
      const spaces = indentOf(afterMarker)
      const joinsList =
        tip.within === 'List' &&
        Option.exists(tip.list, list => sameList(list, kind))
      const depth = joinsList ? tip.depth + 1 : depthUnderTip(tip) + 2
      if (
        (spaces === 0 && !isBlank(afterMarker)) ||
        (tip.within === 'Paragraph' && isBlank(afterMarker)) ||
        depth > deepestNesting
      ) {
        return Option.none()
      }
      const contentStartsOnLine =
        spaces <= widestMarkerPadding && !isBlank(afterMarker)
      return Option.some({
        _tag: 'Item',
        kind,
        joinsList,
        marker: { from: reader.nonspace, to: reader.nonspace + length },
        contentIndent:
          indentOf(reader) + length + (contentStartsOnLine ? spaces : 1),
        depth,
        rest: contentStartsOnLine
          ? toNonspace(afterMarker)
          : skipColumns(afterMarker, 1),
      })
    },
  )

const indentedCode: BlockStart = (reader, tip) =>
  isIndentedCode(reader) && !tip.leafIsParagraph && !isBlank(reader)
    ? Option.some({
        _tag: 'IndentedCode',
        rest: skipColumns(reader, codeIndent),
      })
    : Option.none()

const blockStarts: ReadonlyArray<BlockStart> = [
  quote,
  atxHeading,
  fencedCode,
  htmlBlock,
  setextHeading,
  thematicBreak,
  listItem,
  indentedCode,
]

const mayStartBlock = /[#`~*+_=<>0-9-]/y

export const startAt = (reader: Reader, tip: Tip): Option.Option<Started> =>
  !isIndentedCode(reader) &&
  matchAt(mayStartBlock, reader.text, reader.nonspace) === null
    ? Option.none()
    : Array.findFirst(blockStarts, start => start(reader, tip))
