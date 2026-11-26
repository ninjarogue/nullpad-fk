import { Array, Option, Schema } from 'effect'

import { Input, type NamedKey, isControlAlone } from './input'
import * as Line from './line'

export const Recall = Schema.Struct({
  prefix: Schema.String,
  index: Schema.Int,
})
export type Recall = typeof Recall.Type

export const Prompt = Schema.Struct({
  line: Line.Line,
  recall: Schema.Option(Recall),
})
export type Prompt = typeof Prompt.Type

export const Act = Schema.TaggedUnion({
  Stay: {},
  Close: {},
  Run: {},
})
export type Act = typeof Act.Type

export type Outcome = Readonly<{ prompt: Prompt; act: Act }>

export const mostRemembered = 50

export const open: Prompt = { line: Line.empty, recall: Option.none() }

export const surrounding = ({
  line,
}: Prompt): Readonly<{ text: string; caret: number }> => ({
  text: line.text,
  caret: line.caret,
})

export const remembered = (
  history: ReadonlyArray<string>,
  text: string,
): ReadonlyArray<string> =>
  text === ''
    ? history
    : [text, ...Array.filter(history, line => line !== text)].slice(
        0,
        mostRemembered,
      )

const stay = (prompt: Prompt): Outcome => ({
  prompt,
  act: Act.cases.Stay.make({}),
})

const edited = (prompt: Prompt, line: Option.Option<Line.Line>): Outcome =>
  Option.match(line, {
    onNone: () => stay(prompt),
    onSome: next => stay({ line: next, recall: Option.none() }),
  })

const typeText = (prompt: Prompt, text: string): Outcome =>
  edited(
    prompt,
    Line.typeText(prompt.line, text.split(/\r\n|[\r\n]/u)[0] ?? ''),
  )

const erase = (prompt: Prompt, fromCaret: number, toCaret: number): Outcome =>
  edited(prompt, Line.erase(prompt.line, fromCaret, toCaret))

const recalled = (
  prompt: Prompt,
  history: ReadonlyArray<string>,
  way: 'Older' | 'Newer',
): Outcome => {
  const prefix = Option.match(prompt.recall, {
    onNone: () => prompt.line.text,
    onSome: recall => recall.prefix,
  })
  const at = Option.match(prompt.recall, {
    onNone: () => -1,
    onSome: recall => recall.index,
  })
  const matches = (index: number): boolean =>
    history[index]?.startsWith(prefix) === true
  const indices = Array.map(history, (_, index) => index)
  const found =
    way === 'Older'
      ? Array.findFirst(indices, index => index > at && matches(index))
      : Array.findLast(indices, index => index < at && matches(index))
  const put = (text: string, recall: Option.Option<Recall>): Outcome =>
    stay({ line: { ...prompt.line, text, caret: text.length }, recall })
  return Option.match(found, {
    onSome: index => put(history[index] ?? '', Option.some({ prefix, index })),
    onNone: () =>
      way === 'Newer' && Option.isSome(prompt.recall)
        ? put(prefix, Option.none())
        : stay(prompt),
  })
}

const closed = (prompt: Prompt): Outcome => ({
  prompt,
  act: Act.cases.Close.make({}),
})

const backspace = (prompt: Prompt): Outcome =>
  prompt.line.text === '' && prompt.line.preedit === ''
    ? closed(prompt)
    : edited(prompt, Line.backspace(prompt.line))

const keys: Readonly<
  Record<NamedKey, (prompt: Prompt, history: ReadonlyArray<string>) => Outcome>
> = {
  Escape: closed,
  Enter: prompt => ({ prompt, act: Act.cases.Run.make({}) }),
  Tab: prompt => typeText(prompt, '\t'),
  Backspace: backspace,
  Delete: prompt =>
    prompt.line.caret >= prompt.line.text.length
      ? backspace(prompt)
      : edited(prompt, Line.deleteAfter(prompt.line)),
  ArrowLeft: prompt => stay({ ...prompt, line: Line.left(prompt.line) }),
  ArrowRight: prompt => stay({ ...prompt, line: Line.right(prompt.line) }),
  ArrowUp: (prompt, history) => recalled(prompt, history, 'Older'),
  ArrowDown: (prompt, history) => recalled(prompt, history, 'Newer'),
  Home: prompt => stay({ ...prompt, line: Line.home(prompt.line) }),
  End: prompt => stay({ ...prompt, line: Line.end(prompt.line) }),
  PageUp: stay,
  PageDown: stay,
}

const chords: Readonly<Record<string, (prompt: Prompt) => Outcome>> = {
  u: prompt => erase(prompt, -prompt.line.caret, 0),
  c: closed,
  '[': closed,
}

export const feed = (
  prompt: Prompt,
  history: ReadonlyArray<string>,
  input: Input,
): Outcome =>
  Input.match(input, {
    Key: ({ key }) => keys[key](prompt, history),
    Chord: ({ char, modifiers }) =>
      isControlAlone(modifiers)
        ? (chords[char.toLowerCase()] ?? stay)(prompt)
        : stay(prompt),
    Text: ({ text }) => typeText(prompt, text),
    Paste: ({ text }) => typeText(prompt, text),
    Commit: ({ text }) =>
      typeText({ ...prompt, line: { ...prompt.line, preedit: '' } }, text),
    Preedit: ({ text }) =>
      stay({ ...prompt, line: { ...prompt.line, preedit: text } }),
    Erase: ({ fromCaret, toCaret }) => erase(prompt, fromCaret, toCaret),
  })
