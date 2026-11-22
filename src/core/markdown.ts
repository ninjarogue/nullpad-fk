import { Array, Option } from 'effect'

import * as Blocks from './markdown/blocks'
import * as Inlines from './markdown/inlines'
import { withNulReplaced } from './markdown/lines'
import type {
  Definition,
  Document,
  Placed,
  Skeleton,
  SourceLine,
} from './markdown/tree'

export { outline, toHtml } from './markdown/html'
export { deepestNesting, positionOf } from './markdown/tree'
export type {
  Block,
  CodeBlock,
  Definition,
  Document,
  Heading,
  HtmlBlock,
  Inline,
  Item,
  LineSlice,
  List,
  ListKind,
  Paragraph,
  Phrasing,
  Placed,
  Point,
  Quote,
  Section,
  SourceLine,
  Span,
  ThematicBreak,
} from './markdown/tree'

const definitionsOf = (
  skeletons: ReadonlyArray<Skeleton>,
): ReadonlyMap<string, Definition> =>
  new Map(
    Array.map(
      Array.reverse(Array.flatMap(skeletons, skeleton => skeleton.definitions)),
      definition => [definition.key, definition],
    ),
  )

export const parse = (lines: ReadonlyArray<SourceLine>): Document => {
  const skeletons = Blocks.skeletons(lines)
  const definitions = definitionsOf(skeletons)
  const [, sections] = Array.mapAccum(
    skeletons,
    0,
    (firstLine, skeleton): readonly [number, Placed] => [
      firstLine + skeleton.lineCount,
      {
        firstLine,
        section: Inlines.readSection(
          skeleton,
          lineInSection =>
            Option.match(Array.get(lines, firstLine + lineInSection), {
              onNone: () => '',
              onSome: withNulReplaced,
            }),
          key => Option.fromUndefinedOr(definitions.get(key)),
        ),
      },
    ],
  )
  return { lines, sections, definitions }
}
