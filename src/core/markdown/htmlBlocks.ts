import { Array, Option } from 'effect'

import { endAt, matchAt } from './lines'
import * as Tags from './tags'

export type HtmlEnd =
  | 'RawTextEnd'
  | 'CommentEnd'
  | 'InstructionEnd'
  | 'DeclarationEnd'
  | 'CdataEnd'
  | 'BlankLine'

type Opening = Readonly<{ end: HtmlEnd; opens: RegExp }>

const openings: ReadonlyArray<Opening> = [
  { end: 'RawTextEnd', opens: /<(?:script|pre|textarea|style)(?:\s|>|$)/iy },
  { end: 'CommentEnd', opens: /<!--/y },
  { end: 'InstructionEnd', opens: /<[?]/y },
  { end: 'DeclarationEnd', opens: /<![A-Za-z]/y },
  { end: 'CdataEnd', opens: /<!\[CDATA\[/y },
  {
    end: 'BlankLine',
    opens:
      /<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|search|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/iy,
  },
]

const blankToLineEnd = /\s*$/y

const isCompleteTagLine = (text: string, at: number): boolean =>
  Option.match(Tags.tagEnd(text, at), {
    onNone: () => false,
    onSome: end => endAt(blankToLineEnd, text, end) === text.length,
  })

export const opening = (
  text: string,
  at: number,
  interruptsParagraph: boolean,
): Option.Option<HtmlEnd> =>
  Option.orElse(
    Option.map(
      Array.findFirst(
        openings,
        candidate => matchAt(candidate.opens, text, at) !== null,
      ),
      found => found.end,
    ),
    () =>
      !interruptsParagraph && isCompleteTagLine(text, at)
        ? Option.some('BlankLine')
        : Option.none(),
  )

const rawTextEnd = /<\/(?:script|pre|textarea|style)>/gi

const terminators: Readonly<Record<HtmlEnd, Option.Option<string>>> = {
  RawTextEnd: Option.none(),
  CommentEnd: Option.some('-->'),
  InstructionEnd: Option.some('?>'),
  DeclarationEnd: Option.some('>'),
  CdataEnd: Option.some(']]>'),
  BlankLine: Option.none(),
}

export const endsOnLine = (end: HtmlEnd, text: string, from: number): boolean =>
  end === 'RawTextEnd'
    ? matchAt(rawTextEnd, text, from) !== null
    : Option.match(terminators[end], {
        onNone: () => false,
        onSome: terminator => text.includes(terminator, from),
      })
