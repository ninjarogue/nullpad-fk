import { Option } from 'effect'

import { type Content, lineOf, pointAt } from './content'
import { matchAt } from './lines'
import * as Links from './links'
import * as Stack from './stack'
import type { Definition } from './tree'

const toLineEnd = / *(?:\n|$)/y

const lineEndAfter = (text: string, at: number): Option.Option<number> =>
  Option.map(
    Option.fromNullishOr(matchAt(toLineEnd, text, at)),
    found => at + found[0].length,
  )

type Target = Readonly<{
  destination: string
  title: Option.Option<string>
  end: number
  next: number
}>

const targetAt = (
  text: string,
  parentheses: Links.Parentheses,
  at: number,
): Option.Option<Target> =>
  Option.flatMap(
    Links.destinationAt(text, parentheses, Links.pastSpaces(text, at)),
    ({ destination, end }) => {
      const beforeTitle = Links.pastSpaces(text, end)
      const titled = Option.flatMap(
        beforeTitle > end ? Links.titleAt(text, beforeTitle) : Option.none(),
        ({ title, end: titleEnd }) =>
          Option.map(lineEndAfter(text, titleEnd), next => ({
            destination,
            title: Option.some(title),
            end: titleEnd,
            next,
          })),
      )
      return Option.orElse(titled, () =>
        Option.map(lineEndAfter(text, end), next => ({
          destination,
          title: Option.none(),
          end,
          next,
        })),
      )
    },
  )

type Reading = Readonly<{
  at: number
  line: number
  found: Stack.Stack<Definition>
}>

const definitionAt = (
  content: Content,
  parentheses: Links.Parentheses,
  reading: Reading,
): Option.Option<Reading> => {
  const { text } = content
  return Option.flatMap(Links.labelEnd(text, reading.at), labelEnd => {
    const label = text.slice(reading.at + 1, labelEnd - 1)
    const key = Links.keyOf(label)
    return text.charAt(labelEnd) !== ':' || key === ''
      ? Option.none()
      : Option.map(
          targetAt(text, parentheses, labelEnd + 1),
          ({ destination, title, end, next }) => {
            const lastLine = lineOf(content, reading.line, reading.at, end)
            return {
              at: next,
              line: lastLine + 1,
              found: Stack.push(reading.found, {
                _tag: 'Definition',
                span: {
                  from: pointAt(content, reading.line, reading.at),
                  to: pointAt(content, lastLine, end),
                },
                label,
                key,
                destination,
                title,
              }),
            }
          },
        )
  })
}

export type Leading = Readonly<{
  definitions: ReadonlyArray<Definition>
  lineCount: number
}>

const none: Leading = { definitions: [], lineCount: 0 }

const startsWithLabelAndColon = ({ text }: Content): boolean =>
  Option.match(Links.labelEnd(text, 0), {
    onNone: () => false,
    onSome: end => text.charAt(end) === ':',
  })

export const leading = (content: Content): Leading => {
  if (!startsWithLabelAndColon(content)) {
    return none
  }
  const parentheses = Links.pairedParentheses(content.text)
  const read = Stack.whileSome<Reading>(
    { at: 0, line: 0, found: Stack.empty },
    reading =>
      content.text.charAt(reading.at) === '['
        ? definitionAt(content, parentheses, reading)
        : Option.none(),
  )
  return { definitions: Stack.toArray(read.found), lineCount: read.line }
}
