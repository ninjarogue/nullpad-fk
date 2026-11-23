import { Array, Option } from 'effect'

import type { Held } from './content'
import * as HtmlBlocks from './htmlBlocks'
import * as Leaves from './leaves'
import {
  type Reader,
  codeIndent,
  indentOf,
  isBlank,
  matchAt,
  pastMarker,
  skipColumns,
  start,
  toNonspace,
  withNulReplaced,
} from './lines'
import * as Stack from './stack'
import * as Starts from './starts'
import type {
  BlockOf,
  Definition,
  Item,
  List,
  ListKind,
  Point,
  Skeleton,
  SourceLine,
  Span,
  Unread,
} from './tree'

type UnreadBlock = BlockOf<Unread>

type OpenContainer =
  | Readonly<{ _tag: 'Quote'; from: Point; children: Stack.Stack<UnreadBlock> }>
  | Readonly<{
      _tag: 'List'
      from: Point
      kind: ListKind
      items: Stack.Stack<Item<Unread>>
    }>
  | Readonly<{
      _tag: 'Item'
      from: Point
      marker: Span
      contentIndent: number
      children: Stack.Stack<UnreadBlock>
    }>

type OpenSection = Readonly<{
  lineCount: number
  previousLineLength: number
  previousLineBlank: boolean
  blocks: Stack.Stack<UnreadBlock>
  definitions: Stack.Stack<Definition>
  containers: ReadonlyArray<OpenContainer>
  leaf: Option.Option<Leaves.OpenLeaf>
}>

export type BlockState = Readonly<{
  closed: Stack.Stack<Skeleton>
  open: OpenSection
}>

const emptySection: OpenSection = {
  lineCount: 0,
  previousLineLength: 0,
  previousLineBlank: false,
  blocks: Stack.empty,
  definitions: Stack.empty,
  containers: [],
  leaf: Option.none(),
}

export const fresh: BlockState = { closed: Stack.empty, open: emptySection }

const adopt = (
  section: OpenSection,
  blocks: ReadonlyArray<UnreadBlock>,
): OpenSection => {
  const innermost = Array.last(section.containers)
  if (Option.isNone(innermost)) {
    return { ...section, blocks: Stack.pushAll(section.blocks, blocks) }
  }
  const container = innermost.value
  return container._tag === 'List'
    ? adopt(closeInnermost(section), blocks)
    : {
        ...section,
        containers: [
          ...section.containers.slice(0, -1),
          { ...container, children: Stack.pushAll(container.children, blocks) },
        ],
      }
}

const endOfPreviousLine = (section: OpenSection): Point => ({
  lineInSection: section.lineCount - 1,
  column: section.previousLineLength,
})

const isLooseGap = (above: Span, below: Span): boolean =>
  below.from.lineInSection - above.to.lineInSection > 1

const hasLooseGap = (
  blocks: ReadonlyArray<Readonly<{ span: Span }>>,
): boolean =>
  Array.some(Array.zip(blocks, blocks.slice(1)), ([above, below]) =>
    isLooseGap(above.span, below.span),
  )

const listOf = (
  list: Extract<OpenContainer, { _tag: 'List' }>,
): ReadonlyArray<List<Unread>> =>
  Array.match(Stack.toArray(list.items), {
    onEmpty: () => [],
    onNonEmpty: items => [
      {
        _tag: 'List',
        span: { from: list.from, to: Array.lastNonEmpty(items).span.to },
        kind: list.kind,
        tight:
          !hasLooseGap(items) &&
          !Array.some(items, item => hasLooseGap(item.children)),
        items,
      },
    ],
  })

const itemOf = (
  item: Extract<OpenContainer, { _tag: 'Item' }>,
): Item<Unread> => {
  const children = Stack.toArray(item.children)
  return {
    _tag: 'Item',
    span: {
      from: item.from,
      to: Option.match(Array.last(children), {
        onNone: () => item.marker.to,
        onSome: last => last.span.to,
      }),
    },
    marker: item.marker,
    children,
  }
}

const closeInnermost = (section: OpenSection): OpenSection => {
  const innermost = Array.last(section.containers)
  if (Option.isNone(innermost)) {
    return section
  }
  const container = innermost.value
  const outer = {
    ...section,
    containers: section.containers.slice(0, -1),
  }
  if (container._tag !== 'Item') {
    return adopt(
      outer,
      container._tag === 'List'
        ? listOf(container)
        : [
            {
              _tag: 'Quote',
              span: { from: container.from, to: endOfPreviousLine(section) },
              children: Stack.toArray(container.children),
            },
          ],
    )
  }
  const parent = Array.last(outer.containers)
  return Option.isSome(parent) && parent.value._tag === 'List'
    ? {
        ...outer,
        containers: [
          ...outer.containers.slice(0, -1),
          {
            ...parent.value,
            items: Stack.push(parent.value.items, itemOf(container)),
          },
        ],
      }
    : outer
}

const closeLeaf = (
  section: OpenSection,
  closingFenceEnd: Option.Option<Point> = Option.none(),
): OpenSection =>
  Option.match(section.leaf, {
    onNone: () => section,
    onSome: leaf => {
      const { blocks, definitions } = Leaves.close(leaf, closingFenceEnd)
      const adopted = adopt({ ...section, leaf: Option.none() }, blocks)
      return {
        ...adopted,
        definitions: Stack.pushAll(adopted.definitions, definitions),
      }
    },
  })

const closeTo = (section: OpenSection, depth: number): OpenSection =>
  Stack.whileSome(closeLeaf(section), open =>
    open.containers.length > depth
      ? Option.some(closeInnermost(open))
      : Option.none(),
  )

const skeletonOf = (section: OpenSection): Skeleton => {
  const closed = closeTo(section, 0)
  return {
    lineCount: closed.lineCount,
    blocks: Stack.toArray(closed.blocks),
    definitions: Stack.toArray(closed.definitions),
  }
}

type Carried = Readonly<{ matched: number; reader: Reader }>

const hasChild = (section: OpenSection, index: number): boolean => {
  const container = section.containers[index]
  return (
    container !== undefined &&
    container._tag === 'Item' &&
    (container.children._tag === 'Pushed' ||
      index < section.containers.length - 1 ||
      Option.isSome(section.leaf))
  )
}

const pastQuoteMarker = (reader: Reader): Option.Option<Reader> => {
  if (
    indentOf(reader) >= codeIndent ||
    reader.text.charAt(reader.nonspace) !== '>'
  ) {
    return Option.none()
  }
  const afterMarker = pastMarker(reader, 1)
  return Option.some(
    indentOf(afterMarker) > 0 ? skipColumns(afterMarker, 1) : afterMarker,
  )
}

const continued = (
  section: OpenSection,
  index: number,
  container: OpenContainer,
  reader: Reader,
): Option.Option<Reader> => {
  if (container._tag === 'List') {
    return Option.some(reader)
  }
  if (container._tag === 'Quote') {
    return pastQuoteMarker(reader)
  }
  if (isBlank(reader)) {
    return hasChild(section, index)
      ? Option.some(toNonspace(reader))
      : Option.none()
  }
  return indentOf(reader) >= container.contentIndent
    ? Option.some(skipColumns(reader, container.contentIndent))
    : Option.none()
}

const carry = (section: OpenSection, text: string): Carried => {
  const lineStart = start(text)
  if (
    section.previousLineBlank &&
    isBlank(lineStart) &&
    Array.isReadonlyArrayNonEmpty(section.containers)
  ) {
    return {
      matched: section.containers.length,
      reader: toNonspace(lineStart),
    }
  }
  return Array.reduce(
    section.containers,
    { matched: 0, reader: lineStart },
    (carried: Carried, container, index): Carried =>
      carried.matched < index
        ? carried
        : Option.match(continued(section, index, container, carried.reader), {
            onNone: () => carried,
            onSome: reader => ({ matched: index + 1, reader }),
          }),
  )
}

type LeafLine =
  | Readonly<{ _tag: 'Takes'; reader: Reader }>
  | Readonly<{ _tag: 'ClosedByFence'; end: number }>
  | Readonly<{ _tag: 'Offers' }>
  | Readonly<{ _tag: 'Ends' }>

const closingFence = /(?:`{3,}|~{3,})(?=[ \t]*$)/y

const leafLine = (leaf: Leaves.OpenLeaf, reader: Reader): LeafLine => {
  if (leaf._tag === 'Paragraph') {
    return isBlank(reader) ? { _tag: 'Ends' } : { _tag: 'Offers' }
  }
  if (leaf._tag === 'Html') {
    return isBlank(reader) && leaf.end === 'BlankLine'
      ? { _tag: 'Ends' }
      : { _tag: 'Takes', reader }
  }
  if (leaf._tag === 'IndentedCode') {
    if (indentOf(reader) >= codeIndent) {
      return { _tag: 'Takes', reader: skipColumns(reader, codeIndent) }
    }
    return isBlank(reader)
      ? { _tag: 'Takes', reader: toNonspace(reader) }
      : { _tag: 'Ends' }
  }
  const closing =
    indentOf(reader) < codeIndent &&
    reader.text.charAt(reader.nonspace) === leaf.fence.character
      ? matchAt(closingFence, reader.text, reader.nonspace)
      : null
  return closing !== null && closing[0].length >= leaf.fence.length
    ? { _tag: 'ClosedByFence', end: reader.nonspace + closing[0].length }
    : { _tag: 'Takes', reader: skipColumns(reader, leaf.fence.indent) }
}

const heldAt = (reader: Reader, lineInSection: number): Held => ({
  slice: {
    lineInSection,
    from: reader.offset,
    to: reader.text.length,
    owedSpaces: reader.owedSpaces,
  },
  text: reader.text,
})

const withLine = (leaf: Leaves.OpenLeaf, line: Held): Leaves.OpenLeaf => ({
  ...leaf,
  lines: Stack.push(leaf.lines, line),
})

const takeLine = (
  section: OpenSection,
  leaf: Leaves.OpenLeaf,
  reader: Reader,
): OpenSection => {
  const taken = {
    ...section,
    leaf: Option.some(withLine(leaf, heldAt(reader, section.lineCount))),
  }
  return leaf._tag === 'Html' &&
    HtmlBlocks.endsOnLine(leaf.end, reader.text, reader.offset)
    ? closeLeaf(taken)
    : taken
}

type Trying = Readonly<{
  reader: Reader
  tip: Starts.Tip
  containers: Stack.Stack<Starts.StartedContainer>
  leaf: Option.Option<Starts.StartedLeaf | Starts.StartedSetext>
}>

const tryStarts = (reader: Reader, tip: Starts.Tip): Trying =>
  Stack.whileSome<Trying>(
    { reader, tip, containers: Stack.empty, leaf: Option.none() },
    trying =>
      Option.isSome(trying.leaf)
        ? Option.none()
        : Option.map(
            Starts.startAt(trying.reader, trying.tip),
            (started): Trying =>
              started._tag === 'Quote' || started._tag === 'Item'
                ? {
                    reader: started.rest,
                    tip: {
                      within: 'Elsewhere',
                      list: Option.none(),
                      paragraph: Option.none(),
                      leafIsParagraph: false,
                      mayBeLazy: false,
                      depth: started.depth,
                    },
                    containers: Stack.push(trying.containers, started),
                    leaf: Option.none(),
                  }
                : { ...trying, leaf: Option.some(started) },
          ),
  )

const tipOf = (
  section: OpenSection,
  matched: number,
  paragraphOffers: boolean,
): Starts.Tip => {
  const innermost = section.containers[matched - 1]
  const paragraph = Option.filter(
    section.leaf,
    leaf => leaf._tag === 'Paragraph',
  )
  return {
    within: paragraphOffers
      ? 'Paragraph'
      : innermost?._tag === 'List'
        ? 'List'
        : 'Elsewhere',
    list:
      innermost?._tag === 'List' ? Option.some(innermost.kind) : Option.none(),
    paragraph: paragraphOffers ? paragraph : Option.none(),
    leafIsParagraph: Option.isSome(paragraph),
    mayBeLazy: Option.isSome(paragraph) && !paragraphOffers,
    depth: matched,
  }
}

const openContainer = (
  section: OpenSection,
  started: Starts.StartedContainer,
  lineInSection: number,
): OpenSection => {
  if (started._tag === 'Quote') {
    return {
      ...section,
      containers: [
        ...section.containers,
        {
          _tag: 'Quote',
          from: { lineInSection, column: started.at },
          children: Stack.empty,
        },
      ],
    }
  }
  const from = { lineInSection, column: started.marker.from }
  const item: OpenContainer = {
    _tag: 'Item',
    from,
    marker: { from, to: { lineInSection, column: started.marker.to } },
    contentIndent: started.contentIndent,
    children: Stack.empty,
  }
  return {
    ...section,
    containers: started.joinsList
      ? [...section.containers, item]
      : [
          ...section.containers,
          { _tag: 'List', from, kind: started.kind, items: Stack.empty },
          item,
        ],
  }
}

const openLeaf = (
  section: OpenSection,
  started: Starts.StartedLeaf,
  reader: Reader,
  lineInSection: number,
): OpenSection => {
  const at = (column: number): Point => ({ lineInSection, column })
  if (started._tag === 'Heading') {
    return adopt(section, [
      {
        _tag: 'Heading',
        span: { from: at(started.span.from), to: at(started.span.to) },
        level: started.level,
        style: 'Atx',
        content: [{ lineInSection, ...started.content, owedSpaces: 0 }],
      },
    ])
  }
  if (started._tag === 'ThematicBreak') {
    return adopt(section, [
      {
        _tag: 'ThematicBreak',
        span: { from: at(started.span.from), to: at(started.span.to) },
      },
    ])
  }
  if (started._tag === 'Fence') {
    return {
      ...section,
      leaf: Option.some({
        _tag: 'FencedCode',
        from: at(started.at),
        fence: started.fence,
        opening: heldAt(started.rest, lineInSection),
        lines: Stack.empty,
      }),
    }
  }
  return started._tag === 'Html'
    ? takeLine(
        section,
        { _tag: 'Html', end: started.end, lines: Stack.empty },
        reader,
      )
    : takeLine(
        section,
        { _tag: 'IndentedCode', lines: Stack.empty },
        started.rest,
      )
}

const underSetext = (
  section: OpenSection,
  started: Starts.StartedSetext,
): OpenSection => {
  const heading = Leaves.setextHeading(started.text, started.level, {
    lineInSection: section.lineCount,
    column: started.underlineEnd,
  })
  const adopted = adopt({ ...section, leaf: Option.none() }, [
    ...started.text.definitions,
    ...Option.toArray(heading),
  ])
  return {
    ...adopted,
    definitions: Stack.pushAll(adopted.definitions, started.text.definitions),
  }
}

type Split = Readonly<{ closed: Stack.Stack<Skeleton>; open: OpenSection }>

const beginBlock = (
  state: BlockState,
  section: OpenSection,
  firstJoinsList: boolean,
): Split => {
  const ready =
    !firstJoinsList &&
    Array.last(section.containers).pipe(
      Option.exists(container => container._tag === 'List'),
    )
      ? closeInnermost(section)
      : section
  return Array.isReadonlyArrayNonEmpty(ready.containers) ||
    ready.lineCount === 0
    ? { closed: state.closed, open: ready }
    : {
        closed: Stack.push(state.closed, skeletonOf(ready)),
        open: emptySection,
      }
}

const readLine = (state: BlockState, text: string): Split => {
  const section = state.open
  const { matched, reader } = carry(section, text)
  const allMatched = matched === section.containers.length
  const offered: LeafLine = Option.match(section.leaf, {
    onNone: () => ({ _tag: 'Ends' }),
    onSome: leaf => (allMatched ? leafLine(leaf, reader) : { _tag: 'Ends' }),
  })
  if (offered._tag === 'ClosedByFence') {
    return {
      closed: state.closed,
      open: closeLeaf(
        section,
        Option.some({ lineInSection: section.lineCount, column: offered.end }),
      ),
    }
  }
  if (offered._tag === 'Takes' && Option.isSome(section.leaf)) {
    return {
      closed: state.closed,
      open: takeLine(section, section.leaf.value, offered.reader),
    }
  }
  const tip = tipOf(section, matched, offered._tag === 'Offers')
  const tried = tryStarts(reader, tip)
  const containers = Stack.toArray(tried.containers)
  const leaf = Option.getOrUndefined(tried.leaf)
  if (leaf?._tag === 'Setext') {
    return { closed: state.closed, open: underSetext(section, leaf) }
  }
  const rest = leaf === undefined ? toNonspace(tried.reader) : tried.reader
  const opensNothing =
    !Array.isReadonlyArrayNonEmpty(containers) && leaf === undefined
  if (
    opensNothing &&
    tip.leafIsParagraph &&
    !isBlank(rest) &&
    Option.isSome(section.leaf)
  ) {
    return {
      closed: state.closed,
      open: takeLine(section, section.leaf.value, rest),
    }
  }
  const settled = closeTo(section, matched)
  if (opensNothing && isBlank(rest)) {
    return { closed: state.closed, open: settled }
  }
  const begun = beginBlock(
    state,
    settled,
    Option.exists(
      Array.head(containers),
      first => first._tag === 'Item' && first.joinsList,
    ),
  )
  const lineInSection = begun.open.lineCount
  const within = Array.reduce(containers, begun.open, (open, started) =>
    openContainer(open, started, lineInSection),
  )
  return {
    closed: begun.closed,
    open:
      leaf === undefined
        ? isBlank(rest)
          ? within
          : takeLine(within, { _tag: 'Paragraph', lines: Stack.empty }, rest)
        : openLeaf(within, leaf, rest, lineInSection),
  }
}

export const step = (state: BlockState, line: SourceLine): BlockState => {
  const text = withNulReplaced(line)
  const { closed, open } = readLine(state, text)
  return {
    closed,
    open: {
      ...open,
      lineCount: open.lineCount + 1,
      previousLineLength: text.length,
      previousLineBlank: isBlank(start(text)),
    },
  }
}

export const finish = (state: BlockState): ReadonlyArray<Skeleton> =>
  Stack.toArray(
    state.open.lineCount === 0
      ? state.closed
      : Stack.push(state.closed, skeletonOf(state.open)),
  )

export const skeletons = (
  lines: ReadonlyArray<SourceLine>,
): ReadonlyArray<Skeleton> =>
  finish(
    Array.reduce(
      Array.last(lines).pipe(Option.exists(last => last.text === ''))
        ? lines.slice(0, -1)
        : lines,
      fresh,
      step,
    ),
  )
