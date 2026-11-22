import { Array, HashMap, Option } from 'effect'

import { type Content, type Held, contentOf, pointAt, spanOf } from './content'
import * as Emphasis from './emphasis'
import * as Entities from './entities'
import { matchAt } from './lines'
import * as Links from './links'
import * as Stack from './stack'
import * as Tags from './tags'
import {
  type BlockOf,
  type Definition,
  type Inline,
  type Item,
  type LineSlice,
  type Phrasing,
  type Section,
  type Skeleton,
  type Unread,
  deepestNesting,
} from './tree'

type Kind =
  | 'Plain'
  | 'Backslash'
  | 'Ampersand'
  | 'Ticks'
  | 'Run'
  | 'OpenBracket'
  | 'ImageBracket'
  | 'CloseBracket'
  | 'LessThan'
  | 'LineEnd'

type Token = Readonly<{ kind: Kind; at: number; end: number }>

const tokenPattern = /[^\n\\&`*_[\]!<]+|`+|\*+|_+|!\[|[^]/g

const kindsByFirstCharacter: Readonly<Record<string, Kind>> = {
  '\n': 'LineEnd',
  '\\': 'Backslash',
  '&': 'Ampersand',
  '`': 'Ticks',
  '*': 'Run',
  _: 'Run',
  '[': 'OpenBracket',
  ']': 'CloseBracket',
  '<': 'LessThan',
}

const tokensOf = (text: string): ReadonlyArray<Token> =>
  Array.map(Array.fromIterable(text.matchAll(tokenPattern)), found => ({
    kind:
      found[0] === '!['
        ? 'ImageBracket'
        : (kindsByFirstCharacter[found[0].charAt(0)] ?? 'Plain'),
    at: found.index,
    end: found.index + found[0].length,
  }))

type TicksAfter = ReadonlyArray<HashMap.HashMap<number, number>>

const ticksAfterEach = (tokens: ReadonlyArray<Token>): TicksAfter => {
  if (!Array.some(tokens, token => token.kind === 'Ticks')) {
    return []
  }
  const [, fromLast] = Array.mapAccum(
    Array.reverse(tokens),
    HashMap.empty<number, number>(),
    (
      after,
      token,
      fromEnd,
    ): readonly [
      HashMap.HashMap<number, number>,
      HashMap.HashMap<number, number>,
    ] => [
      token.kind === 'Ticks'
        ? HashMap.set(after, token.end - token.at, tokens.length - 1 - fromEnd)
        : after,
      after,
    ],
  )
  return Array.reverse(fromLast)
}

export type Lookup = (key: string) => Option.Option<Definition>

type Reading = Readonly<{
  content: Content
  tokens: ReadonlyArray<Token>
  ticksAfter: TicksAfter
  terminators: Tags.Terminators
  parentheses: Links.Parentheses
  lookup: Lookup
}>

type Bracket = Readonly<{
  image: boolean
  at: number
  line: number
  piecesUnder: number
  holdsBracket: boolean
}>

type InlineState = Readonly<{
  line: number
  skipTo: number
  placed: Stack.Stack<Emphasis.Piece>
  brackets: Stack.Stack<Bracket>
  noLinkUnder: number
}>

const placeNode = (
  state: InlineState,
  node: Inline,
  end: number,
  height = 0,
): InlineState => ({
  ...state,
  skipTo: end,
  placed: Stack.push(state.placed, { _tag: 'Node', node, height }),
})

const placeText = (
  { content }: Reading,
  state: InlineState,
  at: number,
  end: number,
): InlineState =>
  end > at
    ? placeNode(
        state,
        {
          _tag: 'Text',
          span: spanOf(content, state.line, at, end),
          text: content.text.slice(at, end),
        },
        end,
      )
    : state

type Place = (
  reading: Reading,
  state: InlineState,
  token: Token,
  index: number,
) => InlineState

const plain: Place = (reading, state, token) =>
  placeText(
    reading,
    state,
    token.at,
    Math.min(token.end, reading.content.ends[state.line] ?? token.end),
  )

const escapablePattern = new RegExp(Links.escapable, 'y')

const backslash: Place = (reading, state, { at }) => {
  const { content } = reading
  if (content.text.charAt(at + 1) === '\n') {
    return placeNode(
      state,
      { _tag: 'HardBreak', span: spanOf(content, state.line, at, at + 1) },
      at + 2,
    )
  }
  return matchAt(escapablePattern, content.text, at + 1) === null
    ? placeText(reading, state, at, at + 1)
    : placeNode(
        state,
        {
          _tag: 'Escape',
          span: spanOf(content, state.line, at, at + 2),
          text: content.text.charAt(at + 1),
        },
        at + 2,
      )
}

const referencePattern = new RegExp(Entities.referencePattern, 'y')

const ampersand: Place = (reading, state, { at }) => {
  const { content } = reading
  const reference = matchAt(referencePattern, content.text, at)?.[0]
  if (reference === undefined) {
    return placeText(reading, state, at, at + 1)
  }
  const end = at + reference.length
  return Option.match(Entities.decode(reference), {
    onNone: () => placeText(reading, state, at, end),
    onSome: text =>
      placeNode(
        state,
        { _tag: 'Entity', span: spanOf(content, state.line, at, end), text },
        end,
      ),
  })
}

/** Spec section 6.1: line endings in a code span become spaces, then one space comes off each end when both ends have one and the content is not all spaces. */
const codeOf = (source: string): string => {
  const spaced = source.replaceAll('\n', ' ')
  return spaced.startsWith(' ') && spaced.endsWith(' ') && /[^ ]/.test(spaced)
    ? spaced.slice(1, -1)
    : spaced
}

const ticks: Place = (reading, state, { at, end }, index) => {
  const { content, tokens, ticksAfter } = reading
  const closer = Option.flatMap(
    Option.flatMap(Option.fromUndefinedOr(ticksAfter[index]), after =>
      HashMap.get(after, end - at),
    ),
    closing => Option.fromUndefinedOr(tokens[closing]),
  )
  return Option.match(closer, {
    onNone: () => placeText(reading, state, at, end),
    onSome: closing =>
      placeNode(
        state,
        {
          _tag: 'Code',
          span: spanOf(content, state.line, at, closing.end),
          text: codeOf(content.text.slice(end, closing.at)),
        },
        closing.end,
      ),
  })
}

const lastPoint = (text: string): string =>
  Array.fromIterable(text).at(-1) ?? '\n'

const firstPoint = (text: string): string =>
  String.fromCodePoint(text.codePointAt(0) ?? 10)

const run: Place = ({ content }, state, { at, end }) => {
  const { text } = content
  const character = text.charAt(at)
  return {
    ...state,
    skipTo: end,
    placed: Stack.push(state.placed, {
      _tag: 'Delimiters',
      run: {
        character,
        length: end - at,
        left: end - at,
        from: pointAt(content, state.line, at),
        ...Emphasis.flanking(
          character,
          lastPoint(text.slice(Math.max(0, at - 2), at)),
          firstPoint(text.slice(end, end + 2)),
        ),
      },
    }),
  }
}

const openBracket =
  (image: boolean): Place =>
  ({ content }, state, { at, end }) => ({
    ...state,
    skipTo: end,
    placed: Stack.push(state.placed, {
      _tag: 'Bracket',
      span: spanOf(content, state.line, at, end),
      text: content.text.slice(at, end),
    }),
    brackets: Stack.push(
      state.brackets._tag === 'Empty'
        ? state.brackets
        : Stack.push(state.brackets.under, {
            ...state.brackets.top,
            holdsBracket: true,
          }),
      {
        image,
        at: end - 1,
        line: state.line,
        piecesUnder: Stack.sizeOf(state.placed),
        holdsBracket: false,
      },
    ),
  })

type Target = Readonly<{
  destination: string
  title: Option.Option<string>
  end: number
}>

const whitespaceBefore = /(?<=[ \t\n\v\f\r])/y

const inlineTarget = (
  { content, parentheses }: Reading,
  at: number,
): Option.Option<Target> => {
  const { text } = content
  if (text.charAt(at) !== '(') {
    return Option.none()
  }
  return Option.flatMap(
    Links.destinationAt(text, parentheses, Links.pastSpaces(text, at + 1)),
    ({ destination, end }) => {
      const afterSpaces = Links.pastSpaces(text, end)
      const titled =
        matchAt(whitespaceBefore, text, afterSpaces) === null
          ? Option.none()
          : Links.titleAt(text, afterSpaces)
      const beforeClose = Links.pastSpaces(
        text,
        Option.match(titled, {
          onNone: () => afterSpaces,
          onSome: title => title.end,
        }),
      )
      return text.charAt(beforeClose) === ')'
        ? Option.some({
            destination,
            title: Option.map(titled, title => title.title),
            end: beforeClose + 1,
          })
        : Option.none()
    },
  )
}

const collapsedLabelLength = 2

const referenceTarget = (
  { content, lookup }: Reading,
  opener: Bracket,
  at: number,
): Option.Option<Target> => {
  const { text } = content
  const labelEnd = Option.getOrElse(Links.labelEnd(text, at), () => at)
  const hasOwnLabel = labelEnd - at > collapsedLabelLength
  if (!hasOwnLabel && opener.holdsBracket) {
    return Option.none()
  }
  const label = hasOwnLabel
    ? text.slice(at + 1, labelEnd - 1)
    : text.slice(opener.at + 1, at - 1)
  return Option.map(lookup(Links.keyOf(label)), definition => ({
    destination: definition.destination,
    title: definition.title,
    end: labelEnd,
  }))
}

type Linked = Readonly<{
  node: Inline
  height: number
  end: number
  under: Stack.Stack<Emphasis.Piece>
}>

const linkAt = (
  reading: Reading,
  state: InlineState,
  opener: Bracket,
  at: number,
): Option.Option<Linked> =>
  Option.flatMap(
    Option.orElse(inlineTarget(reading, at + 1), () =>
      referenceTarget(reading, opener, at + 1),
    ),
    ({ destination, title, end }) => {
      const { pushed, under } = Stack.since(state.placed, opener.piecesUnder)
      const children = Emphasis.pair(pushed.slice(1))
      const height =
        1 +
        Array.reduce(children, 0, (most, child) => Math.max(most, child.height))
      const from = opener.image ? opener.at - 1 : opener.at
      return height > deepestNesting
        ? Option.none()
        : Option.some({
            node: {
              _tag: opener.image ? 'Image' : 'Link',
              span: {
                from: pointAt(reading.content, opener.line, from),
                to: spanOf(reading.content, state.line, at, end).to,
              },
              destination,
              title,
              children: Array.map(children, child => child.node),
            },
            height,
            end,
            under,
          })
    },
  )

const closeBracket: Place = (reading, state, { at, end }) => {
  if (state.brackets._tag === 'Empty') {
    return placeText(reading, state, at, end)
  }
  const opener = state.brackets.top
  const brackets = state.brackets.under
  const height = Stack.sizeOf(brackets)
  const popped = {
    ...state,
    brackets,
    noLinkUnder: Math.min(state.noLinkUnder, height),
  }
  const mayLink = opener.image || height >= state.noLinkUnder
  return Option.match(
    mayLink ? linkAt(reading, state, opener, at) : Option.none(),
    {
      onNone: () => placeText(reading, popped, at, end),
      onSome: linked => ({
        ...placeNode(
          { ...popped, placed: linked.under },
          linked.node,
          linked.end,
          linked.height,
        ),
        noLinkUnder: opener.image ? popped.noLinkUnder : height,
      }),
    },
  )
}

const emailAutolink = /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-zA-Z0-9.-]+))>/y

const domainLabel = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/

const uriAutolink = /<([A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*)>/y

type Autolink = Readonly<{ text: string; destination: string; end: number }>

const autolinkAt = (text: string, at: number): Option.Option<Autolink> => {
  const email = matchAt(emailAutolink, text, at)
  const address = email?.[1]
  if (
    email !== null &&
    address !== undefined &&
    Array.every((email[2] ?? '').split('.'), label => domainLabel.test(label))
  ) {
    return Option.some({
      text: address,
      destination: Links.normalizedUri(`mailto:${address}`),
      end: at + email[0].length,
    })
  }
  const uri = matchAt(uriAutolink, text, at)
  const target = uri?.[1]
  return uri !== null && target !== undefined
    ? Option.some({
        text: target,
        destination: Links.normalizedUri(target),
        end: at + uri[0].length,
      })
    : Option.none()
}

const lessThan: Place = (reading, state, { at }) => {
  const { content, terminators } = reading
  const autolink = autolinkAt(content.text, at)
  if (Option.isSome(autolink)) {
    const { text, destination, end } = autolink.value
    return placeNode(
      state,
      {
        _tag: 'Autolink',
        span: spanOf(content, state.line, at, end),
        destination,
        text,
      },
      end,
    )
  }
  return Option.match(Tags.rawHtmlEnd(content.text, terminators, at), {
    onNone: () => placeText(reading, state, at, at + 1),
    onSome: end =>
      placeNode(
        state,
        {
          _tag: 'Html',
          span: spanOf(content, state.line, at, end),
          text: content.text.slice(at, end),
        },
        end,
      ),
  })
}

const hardBreakSpaces = 2

const lineEnd: Place = ({ content }, state, { at, end }) => {
  const from = content.ends[state.line] ?? at
  return placeNode(
    state,
    {
      _tag: at - from >= hardBreakSpaces ? 'HardBreak' : 'SoftBreak',
      span: spanOf(content, state.line, from, at),
    },
    end,
  )
}

const places: Readonly<Record<Kind, Place>> = {
  Plain: plain,
  Backslash: backslash,
  Ampersand: ampersand,
  Ticks: ticks,
  Run: run,
  OpenBracket: openBracket(false),
  ImageBracket: openBracket(true),
  CloseBracket: closeBracket,
  LessThan: lessThan,
  LineEnd: lineEnd,
}

const fromSkip = (token: Token, skipTo: number): Token =>
  token.at >= skipTo
    ? token
    : {
        kind: token.kind === 'ImageBracket' ? 'OpenBracket' : token.kind,
        at: skipTo,
        end: token.end,
      }

export const read = (
  content: Content,
  lookup: Lookup,
): ReadonlyArray<Inline> => {
  const { text } = content
  const tokens = tokensOf(text)
  const reading: Reading = {
    content,
    tokens,
    ticksAfter: ticksAfterEach(tokens),
    terminators: Tags.lastTerminators(text),
    parentheses: text.includes('](')
      ? Links.pairedParentheses(text)
      : new Map(),
    lookup,
  }
  const read = Array.reduce(
    tokens,
    {
      line: 0,
      skipTo: 0,
      placed: Stack.empty,
      brackets: Stack.empty,
      noLinkUnder: 0,
    },
    (state: InlineState, token, index): InlineState => {
      const rest = fromSkip(token, state.skipTo)
      const next =
        token.end <= state.skipTo
          ? state
          : places[rest.kind](reading, state, rest, index)
      return token.kind === 'LineEnd' ? { ...next, line: state.line + 1 } : next
    },
  )
  return Array.map(Emphasis.pair(Stack.toArray(read.placed)), tall => tall.node)
}

const readLeaf = (
  lines: ReadonlyArray<LineSlice>,
  textOfLine: (lineInSection: number) => string,
  lookup: Lookup,
): Phrasing => ({
  lines,
  inlines: read(
    contentOf(
      Array.map(lines, (slice): Held => ({
        slice,
        text: textOfLine(slice.lineInSection),
      })),
    ),
    lookup,
  ),
})

const readItem =
  (textOfLine: (lineInSection: number) => string, lookup: Lookup) =>
  (item: Item<Unread>): Item<Phrasing> => ({
    ...item,
    children: Array.map(item.children, readBlock(textOfLine, lookup)),
  })

const readBlock =
  (textOfLine: (lineInSection: number) => string, lookup: Lookup) =>
  (block: BlockOf<Unread>): BlockOf<Phrasing> => {
    if (block._tag === 'Paragraph' || block._tag === 'Heading') {
      return { ...block, content: readLeaf(block.content, textOfLine, lookup) }
    }
    if (block._tag === 'Quote') {
      return {
        ...block,
        children: Array.map(block.children, readBlock(textOfLine, lookup)),
      }
    }
    return block._tag === 'List'
      ? {
          ...block,
          items: Array.map(block.items, readItem(textOfLine, lookup)),
        }
      : block
  }

export const readSection = (
  skeleton: Skeleton,
  textOfLine: (lineInSection: number) => string,
  lookup: Lookup,
): Section => ({
  ...skeleton,
  blocks: Array.map(skeleton.blocks, readBlock(textOfLine, lookup)),
})
