import { Array, Option } from 'effect'

import { type Held, contentOf, heldText } from './content'
import * as Definitions from './definitions'
import type { HtmlEnd } from './htmlBlocks'
import { lengthWithoutTrailingBlanks } from './lines'
import * as Links from './links'
import * as Stack from './stack'
import type {
  BlockOf,
  CodeBlock,
  Definition,
  Heading,
  HtmlBlock,
  LineSlice,
  Paragraph,
  Point,
  Unread,
} from './tree'

export type Fence = Readonly<{
  character: string
  length: number
  indent: number
}>

export type OpenLeaf =
  | Readonly<{ _tag: 'Paragraph'; lines: Stack.Stack<Held> }>
  | Readonly<{ _tag: 'IndentedCode'; lines: Stack.Stack<Held> }>
  | Readonly<{
      _tag: 'FencedCode'
      from: Point
      fence: Fence
      opening: Held
      lines: Stack.Stack<Held>
    }>
  | Readonly<{ _tag: 'Html'; end: HtmlEnd; lines: Stack.Stack<Held> }>

export type Closed = Readonly<{
  blocks: ReadonlyArray<BlockOf<Unread>>
  definitions: ReadonlyArray<Definition>
}>

const startOf = ({ lineInSection, from }: LineSlice): Point => ({
  lineInSection,
  column: from,
})

const endOf = ({ lineInSection, to }: LineSlice): Point => ({
  lineInSection,
  column: to,
})

const withoutTrailingBlanks = ({ slice, text }: Held): LineSlice => ({
  ...slice,
  to:
    slice.from + lengthWithoutTrailingBlanks(text.slice(slice.from, slice.to)),
})

export type Text = Readonly<{
  definitions: ReadonlyArray<Definition>
  lines: ReadonlyArray<LineSlice>
}>

export const textOfParagraph = (lines: Stack.Stack<Held>): Text => {
  const held = Stack.toArray(lines)
  const { definitions, lineCount } = Definitions.leading(contentOf(held))
  const rest = lineCount === 0 ? held : held.slice(lineCount)
  return {
    definitions,
    lines: Array.map(rest, (line, index) =>
      index === rest.length - 1 ? withoutTrailingBlanks(line) : line.slice,
    ),
  }
}

const spanOfLines = (
  lines: Array.NonEmptyReadonlyArray<LineSlice>,
): Readonly<{ from: Point; to: Point }> => ({
  from: startOf(Array.headNonEmpty(lines)),
  to: endOf(Array.lastNonEmpty(lines)),
})

const paragraphOf = (
  lines: ReadonlyArray<LineSlice>,
): Array<Paragraph<Unread>> =>
  Array.match(lines, {
    onEmpty: () => [],
    onNonEmpty: some => [
      { _tag: 'Paragraph', span: spanOfLines(some), content: some },
    ],
  })

export const setextHeading = (
  text: Text,
  level: 1 | 2,
  underlineEnd: Point,
): Option.Option<Heading<Unread>> =>
  Option.map(Array.head(text.lines), first => ({
    _tag: 'Heading',
    span: { from: startOf(first), to: underlineEnd },
    level,
    style: 'Setext',
    content: text.lines,
  }))

const isBlankText = (text: string): boolean => /^[ \t]*$/.test(text)

const indentedCode = (lines: Stack.Stack<Held>): Array<CodeBlock> => {
  const held = Stack.toArray(lines)
  const texts = Array.map(held, heldText)
  const kept = Option.match(
    Array.findLastIndex(texts, text => !isBlankText(text)),
    { onNone: () => 0, onSome: last => last + 1 },
  )
  const slices = Array.map(held.slice(0, kept), ({ slice }) => slice)
  return Array.match(slices, {
    onEmpty: () => [],
    onNonEmpty: some => [
      {
        _tag: 'CodeBlock',
        span: spanOfLines(some),
        style: { _tag: 'Indented' },
        lines: some,
        text: Array.join(
          Array.map(texts.slice(0, kept), text => `${text}\n`),
          '',
        ),
      },
    ],
  })
}

const fencedCode = (
  leaf: Extract<OpenLeaf, { _tag: 'FencedCode' }>,
  closingFenceEnd: Option.Option<Point>,
): CodeBlock => {
  const held = Stack.toArray(leaf.lines)
  return {
    _tag: 'CodeBlock',
    span: {
      from: leaf.from,
      to: Option.getOrElse(closingFenceEnd, () =>
        endOf(Option.getOrElse(Array.last(held), () => leaf.opening).slice),
      ),
    },
    style: {
      _tag: 'Fenced',
      info: Links.unescaped(heldText(leaf.opening).trim()),
    },
    lines: Array.map(held, ({ slice }) => slice),
    text: Array.join(
      Array.map(held, line => `${heldText(line)}\n`),
      '',
    ),
  }
}

const htmlBlock = (lines: Stack.Stack<Held>): Array<HtmlBlock> => {
  const held = Stack.toArray(lines)
  return Array.match(
    Array.map(held, ({ slice }) => slice),
    {
      onEmpty: () => [],
      onNonEmpty: some => [
        {
          _tag: 'HtmlBlock',
          span: spanOfLines(some),
          lines: some,
          text: Array.join(Array.map(held, heldText), '\n'),
        },
      ],
    },
  )
}

export const close = (
  leaf: OpenLeaf,
  closingFenceEnd: Option.Option<Point>,
): Closed => {
  if (leaf._tag === 'Paragraph') {
    const text = textOfParagraph(leaf.lines)
    return {
      blocks: [...text.definitions, ...paragraphOf(text.lines)],
      definitions: text.definitions,
    }
  }
  if (leaf._tag === 'IndentedCode') {
    return { blocks: indentedCode(leaf.lines), definitions: [] }
  }
  return {
    blocks:
      leaf._tag === 'FencedCode'
        ? [fencedCode(leaf, closingFenceEnd)]
        : htmlBlock(leaf.lines),
    definitions: [],
  }
}
