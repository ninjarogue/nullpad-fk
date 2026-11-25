import { Array, Option, Schema } from 'effect'

export const NamedKey = Schema.Literals([
  'Escape',
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])
export type NamedKey = typeof NamedKey.Type

export const Modifiers = Schema.Struct({
  ctrl: Schema.Boolean,
  alt: Schema.Boolean,
  meta: Schema.Boolean,
  shift: Schema.Boolean,
})
export type Modifiers = typeof Modifiers.Type

export const Input = Schema.TaggedUnion({
  Key: { key: NamedKey, modifiers: Modifiers },
  Chord: { char: Schema.String, modifiers: Modifiers },
  Text: { text: Schema.String, byKey: Schema.Boolean },
  Erase: { fromCaret: Schema.Int, toCaret: Schema.Int },
  Paste: { text: Schema.String, byKey: Schema.Boolean },
  Preedit: { text: Schema.String },
  Commit: { text: Schema.String },
})
export type Input = typeof Input.Type

export const noModifiers: Modifiers = {
  ctrl: false,
  alt: false,
  meta: false,
  shift: false,
}

const notationKeys: Readonly<Record<string, NamedKey>> = {
  CR: 'Enter',
  Enter: 'Enter',
  BS: 'Backspace',
  Del: 'Delete',
  Esc: 'Escape',
  Tab: 'Tab',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
}

const fromNotation = (name: string): Option.Option<Input> => {
  if (name === 'lt') {
    return Option.some(Input.cases.Text.make({ text: '<', byKey: true }))
  }
  const chord = /^C-(.)$/.exec(name)
  if (chord !== null && chord[1] !== undefined) {
    return Option.some(
      Input.cases.Chord.make({
        char: chord[1],
        modifiers: { ...noModifiers, ctrl: true },
      }),
    )
  }
  return Option.map(Option.fromUndefinedOr(notationKeys[name]), key =>
    Input.cases.Key.make({ key, modifiers: noModifiers }),
  )
}

export const script = (notation: string): ReadonlyArray<Input> =>
  Array.flatMap(
    Array.fromIterable(notation.matchAll(/<([A-Za-z-]+)>|[^]/gu)),
    ([token, name]) =>
      Option.match(Option.flatMap(Option.fromUndefinedOr(name), fromNotation), {
        onNone: () =>
          Array.map(Array.fromIterable(token), text =>
            Input.cases.Text.make({ text, byKey: true }),
          ),
        onSome: input => [input],
      }),
  )
