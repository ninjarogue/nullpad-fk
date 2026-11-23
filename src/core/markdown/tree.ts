import type { Array, Option } from 'effect'

export type SourceLine = Readonly<{ text: string }>

export type Point = Readonly<{ lineInSection: number; column: number }>

export type Span = Readonly<{ from: Point; to: Point }>

export type LineSlice = Readonly<{
  lineInSection: number
  from: number
  to: number
  owedSpaces: number
}>

export type Inline =
  | Readonly<{ _tag: 'Text'; span: Span; text: string }>
  | Readonly<{ _tag: 'Escape'; span: Span; text: string }>
  | Readonly<{ _tag: 'Entity'; span: Span; text: string }>
  | Readonly<{ _tag: 'SoftBreak'; span: Span }>
  | Readonly<{ _tag: 'HardBreak'; span: Span }>
  | Readonly<{ _tag: 'Code'; span: Span; text: string }>
  | Readonly<{ _tag: 'Emphasis'; span: Span; children: ReadonlyArray<Inline> }>
  | Readonly<{ _tag: 'Strong'; span: Span; children: ReadonlyArray<Inline> }>
  | Readonly<{
      _tag: 'Link'
      span: Span
      destination: string
      title: Option.Option<string>
      children: ReadonlyArray<Inline>
    }>
  | Readonly<{
      _tag: 'Image'
      span: Span
      destination: string
      title: Option.Option<string>
      children: ReadonlyArray<Inline>
    }>
  | Readonly<{
      _tag: 'Autolink'
      span: Span
      destination: string
      text: string
    }>
  | Readonly<{ _tag: 'Html'; span: Span; text: string }>

export type Unread = ReadonlyArray<LineSlice>

export type Phrasing = Readonly<{
  lines: ReadonlyArray<LineSlice>
  inlines: ReadonlyArray<Inline>
}>

export type Paragraph<Content> = Readonly<{
  _tag: 'Paragraph'
  span: Span
  content: Content
}>

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export type Heading<Content> = Readonly<{
  _tag: 'Heading'
  span: Span
  level: HeadingLevel
  style: 'Atx' | 'Setext'
  content: Content
}>

export type ThematicBreak = Readonly<{ _tag: 'ThematicBreak'; span: Span }>

export type CodeBlock = Readonly<{
  _tag: 'CodeBlock'
  span: Span
  style:
    | Readonly<{ _tag: 'Indented' }>
    | Readonly<{ _tag: 'Fenced'; info: string }>
  lines: ReadonlyArray<LineSlice>
  text: string
}>

export type HtmlBlock = Readonly<{
  _tag: 'HtmlBlock'
  span: Span
  lines: ReadonlyArray<LineSlice>
  text: string
}>

export type Definition = Readonly<{
  _tag: 'Definition'
  span: Span
  label: string
  key: string
  destination: string
  title: Option.Option<string>
}>

export type Quote<Content> = Readonly<{
  _tag: 'Quote'
  span: Span
  children: ReadonlyArray<BlockOf<Content>>
}>

export type ListKind =
  | Readonly<{ _tag: 'Bullet'; character: '-' | '+' | '*' }>
  | Readonly<{ _tag: 'Ordered'; start: number; delimiter: '.' | ')' }>

export type Item<Content> = Readonly<{
  _tag: 'Item'
  span: Span
  marker: Span
  children: ReadonlyArray<BlockOf<Content>>
}>

export type List<Content> = Readonly<{
  _tag: 'List'
  span: Span
  kind: ListKind
  tight: boolean
  items: Array.NonEmptyReadonlyArray<Item<Content>>
}>

export type BlockOf<Content> =
  | Paragraph<Content>
  | Heading<Content>
  | ThematicBreak
  | CodeBlock
  | HtmlBlock
  | Definition
  | Quote<Content>
  | List<Content>

export type Block = BlockOf<Phrasing>

export type SectionOf<Content> = Readonly<{
  lineCount: number
  blocks: ReadonlyArray<BlockOf<Content>>
  definitions: ReadonlyArray<Definition>
}>

export type Skeleton = SectionOf<Unread>

export type Section = SectionOf<Phrasing>

export type Placed = Readonly<{ firstLine: number; section: Section }>

export type Document = Readonly<{
  lines: ReadonlyArray<SourceLine>
  sections: ReadonlyArray<Placed>
  definitions: ReadonlyMap<string, Definition>
}>

export const deepestNesting = 100

export const positionOf = (
  placed: Placed,
  point: Point,
): Readonly<{ line: number; column: number }> => ({
  line: placed.firstLine + point.lineInSection,
  column: point.column,
})
