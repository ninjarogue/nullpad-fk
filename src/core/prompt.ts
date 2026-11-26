import { Array, Option, Schema } from 'effect'

import { Input, type NamedKey } from './input'

export const Recall = Schema.Struct({
  prefix: Schema.String,
  index: Schema.Int,
})
export type Recall = typeof Recall.Type

export const Prompt = Schema.Struct({
  text: Schema.String,
  caret: Schema.Int,
  preedit: Schema.String,
  recall: Schema.Option(Recall),
})
export type Prompt = typeof Prompt.Type

export const Act = Schema.TaggedUnion({
  Stay: {},
  Close: { text: Schema.String },
  Run: { text: Schema.String },
})
export type Act = typeof Act.Type

export type Outcome = Readonly<{ prompt: Prompt; act: Act }>

export const mostRemembered = 50

export const open: Prompt = {
  text: '',
  caret: 0,
  preedit: '',
  recall: Option.none(),
}

export const surrounding = (
  prompt: Prompt,
): Readonly<{ text: string; caret: number }> => ({
  text: prompt.text,
  caret: prompt.caret,
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

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

const boundaries = (text: string): ReadonlyArray<number> => [
  0,
  ...Array.map(
    Array.fromIterable(segmenter.segment(text)),
    ({ index, segment }) => index + segment.length,
  ),
]

const boundaryBefore = (text: string, caret: number): number =>
  Option.getOrElse(
    Array.findLast(boundaries(text), boundary => boundary < caret),
    () => 0,
  )

const boundaryAfter = (text: string, caret: number): number =>
  Option.getOrElse(
    Array.findFirst(boundaries(text), boundary => boundary > caret),
    () => text.length,
  )

const stay = (prompt: Prompt): Outcome => ({
  prompt,
  act: Act.cases.Stay.make({}),
})

const edited = (prompt: Prompt, text: string, caret: number): Outcome =>
  stay({ ...prompt, text, caret, recall: Option.none() })

const typeText = (prompt: Prompt, text: string): Outcome => {
  const line = text.split(/\r\n|[\r\n]/u)[0] ?? ''
  return line === ''
    ? stay(prompt)
    : edited(
        prompt,
        prompt.text.slice(0, prompt.caret) +
          line +
          prompt.text.slice(prompt.caret),
        prompt.caret + line.length,
      )
}

const erase = (prompt: Prompt, fromCaret: number, toCaret: number): Outcome => {
  const { text, caret } = prompt
  const clamp = (offset: number) => Math.max(0, Math.min(text.length, offset))
  const start = clamp(caret + Math.min(fromCaret, toCaret))
  const end = clamp(caret + Math.max(fromCaret, toCaret))
  const next =
    caret <= start ? caret : caret >= end ? caret - (end - start) : start
  return start === end
    ? stay(prompt)
    : edited(prompt, text.slice(0, start) + text.slice(end), next)
}

const recalled = (
  prompt: Prompt,
  history: ReadonlyArray<string>,
  way: 'Older' | 'Newer',
): Outcome => {
  const prefix = Option.match(prompt.recall, {
    onNone: () => prompt.text,
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
    stay({ ...prompt, text, caret: text.length, recall })
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
  act: Act.cases.Close.make({ text: prompt.text }),
})

const keys: Readonly<
  Record<NamedKey, (prompt: Prompt, history: ReadonlyArray<string>) => Outcome>
> = {
  Escape: closed,
  Enter: prompt => ({
    prompt,
    act: Act.cases.Run.make({ text: prompt.text }),
  }),
  Tab: prompt => typeText(prompt, '\t'),
  Backspace: prompt =>
    prompt.text === '' && prompt.preedit === ''
      ? closed(prompt)
      : erase(
          prompt,
          boundaryBefore(prompt.text, prompt.caret) - prompt.caret,
          0,
        ),
  Delete: prompt =>
    prompt.caret >= prompt.text.length
      ? keys.Backspace(prompt, [])
      : erase(
          prompt,
          0,
          boundaryAfter(prompt.text, prompt.caret) - prompt.caret,
        ),
  ArrowLeft: prompt =>
    stay({ ...prompt, caret: boundaryBefore(prompt.text, prompt.caret) }),
  ArrowRight: prompt =>
    stay({ ...prompt, caret: boundaryAfter(prompt.text, prompt.caret) }),
  ArrowUp: (prompt, history) => recalled(prompt, history, 'Older'),
  ArrowDown: (prompt, history) => recalled(prompt, history, 'Newer'),
  Home: prompt => stay({ ...prompt, caret: 0 }),
  End: prompt => stay({ ...prompt, caret: prompt.text.length }),
  PageUp: stay,
  PageDown: stay,
}

const chord = (prompt: Prompt, char: string): Outcome =>
  char.toLowerCase() === 'u'
    ? edited(prompt, prompt.text.slice(prompt.caret), 0)
    : char.toLowerCase() === 'c' || char === '['
      ? closed(prompt)
      : stay(prompt)

export const feed = (
  prompt: Prompt,
  history: ReadonlyArray<string>,
  input: Input,
): Outcome =>
  Input.match(input, {
    Key: ({ key }) => keys[key](prompt, history),
    Chord: ({ char, modifiers }) =>
      modifiers.ctrl ? chord(prompt, char) : stay(prompt),
    Text: ({ text }) => typeText(prompt, text),
    Paste: ({ text }) => typeText(prompt, text),
    Commit: ({ text }) => typeText({ ...prompt, preedit: '' }, text),
    Preedit: ({ text }) => stay({ ...prompt, preedit: text }),
    Erase: ({ fromCaret, toCaret }) => erase(prompt, fromCaret, toCaret),
  })
