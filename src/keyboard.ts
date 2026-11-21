import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Mount, Render } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Input, type Modifiers, NamedKey } from './core/input'
import { Message } from './message'

/** Whether the app's one text input has focus, which decides how the caret is drawn. */
export const Keyboard = Schema.Literals(['Focused', 'Blurred'])
export type Keyboard = typeof Keyboard.Type

/** The part of the EditContext API nullpad uses. TypeScript's DOM library does not declare it yet. */
type EditContext = EventTarget &
  Readonly<{
    text: string
    updateText: (rangeStart: number, rangeEnd: number, text: string) => void
    updateSelection: (start: number, end: number) => void
    updateControlBounds: (bounds: DOMRect) => void
    updateSelectionBounds: (bounds: DOMRect) => void
    updateCharacterBounds: (
      rangeStart: number,
      bounds: ReadonlyArray<DOMRect>,
    ) => void
  }>

const makeEditContext = (): Option.Option<EditContext> => {
  const constructor: unknown = Reflect.get(globalThis, 'EditContext')
  return typeof constructor === 'function'
    ? Option.some(Reflect.construct(constructor, []))
    : Option.none()
}

/** A field of an EditContext event, whose classes TypeScript's DOM library does not declare either. */
const textField = (event: Event, name: string): string => {
  const value: unknown = Reflect.get(event, name)
  return typeof value === 'string' ? value : ''
}

const numberField = (event: Event, name: string): number => {
  const value: unknown = Reflect.get(event, name)
  return typeof value === 'number' ? value : 0
}

const browserChords: ReadonlySet<string> = new Set([
  'r',
  't',
  'w',
  'n',
  'l',
  'q',
  'v',
  '=',
  '+',
  '-',
  '0',
])

const isNamedKey = Schema.is(NamedKey)

const modifiersOf = (event: KeyboardEvent): Modifiers => ({
  ctrl: event.ctrlKey,
  alt: event.altKey,
  meta: event.metaKey,
  shift: event.shiftKey,
})

/**
 * A keydown as an Input, or none when the key belongs to the browser or the IME, or will arrive as text from the
 * EditContext. Windows reports AltGr as Ctrl+Alt, so a character typed with both arrives as text. Backspace is taken
 * here, before the EditContext acts, because a textarea takes a combining mark or a jamo alone where the EditContext
 * takes the whole cluster; leaving Backspace out of this function hands it to the EditContext instead.
 */
const fromKeyDown = (event: KeyboardEvent): Option.Option<Input> => {
  const { key } = event
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    key === 'Dead' ||
    key === 'Process'
  ) {
    return Option.none()
  }
  if (isNamedKey(key)) {
    return Option.some(
      Input.cases.Key.make({ key, modifiers: modifiersOf(event) }),
    )
  }
  const isAltGraph =
    event.getModifierState('AltGraph') || (event.ctrlKey && event.altKey)
  const isChord =
    [...key].length === 1 && (event.ctrlKey || event.metaKey) && !isAltGraph
  return isChord && !browserChords.has(key.toLowerCase())
    ? Option.some(
        Input.cases.Chord.make({ char: key, modifiers: modifiersOf(event) }),
      )
    : Option.none()
}

type KeyboardMessage =
  | typeof Message.ReceivedInput.Type
  | typeof Message.FocusedKeyboard.Type
  | typeof Message.BlurredKeyboard.Type

const drawnRect = (selector: string): Option.Option<DOMRect> =>
  Option.map(Option.fromNullishOr(document.querySelector(selector)), element =>
    element.getBoundingClientRect(),
  )

/** Each UTF-16 unit of the drawn preedit, in viewport pixels, so the IME puts its window by the composed text. */
const preeditBounds = (from: number, to: number): ReadonlyArray<DOMRect> => {
  const node = document.querySelector('[data-ghost]')?.firstChild
  if (node === null || node === undefined) {
    return []
  }
  const range = document.createRange()
  const length = node.textContent?.length ?? 0
  return Array.from(
    { length: Math.max(0, Math.min(to, length) - from) },
    (_, offset) => {
      range.setStart(node, from + offset)
      range.setEnd(node, from + offset + 1)
      return range.getBoundingClientRect()
    },
  )
}

const listen = (
  port: HTMLElement,
  context: EditContext,
): Stream.Stream<KeyboardMessage> =>
  Stream.callback<KeyboardMessage>(queue =>
    Effect.gen(function* () {
      const boundsRequests =
        yield* Queue.unbounded<Readonly<{ from: number; to: number }>>()
      const reportBounds = ({
        from,
        to,
      }: Readonly<{ from: number; to: number }>) =>
        Effect.sync(() => {
          Option.map(drawnRect('.surface'), rect =>
            context.updateControlBounds(rect),
          )
          Option.map(drawnRect('#caret'), rect =>
            context.updateSelectionBounds(rect),
          )
          context.updateCharacterBounds(from, preeditBounds(from, to))
        })
      yield* Queue.take(boundsRequests).pipe(
        Effect.tap(() => Render.afterCommit),
        Effect.flatMap(reportBounds),
        Effect.forever,
        Effect.forkScoped,
      )
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const controller = new AbortController()
          const { signal } = controller
          const offerInput = (input: Input): boolean =>
            Queue.offerUnsafe(queue, Message.ReceivedInput({ input }))
          const keepFocus = () => port.focus({ preventScroll: true })
          const state: { lastKey: Option.Option<string>; composing: boolean } =
            { lastKey: Option.none(), composing: false }
          const empty = () => {
            context.updateText(0, context.text.length, '')
            context.updateSelection(0, 0)
          }

          Reflect.set(port, 'editContext', context)
          port.addEventListener(
            'keydown',
            event => {
              state.lastKey = Option.some(event.key)
              Option.map(fromKeyDown(event), input => {
                event.preventDefault()
                offerInput(input)
              })
            },
            { signal },
          )
          context.addEventListener(
            'textupdate',
            event => {
              const text = textField(event, 'text')
              if (state.composing) {
                offerInput(Input.cases.Preedit.make({ text: context.text }))
                return
              }
              empty()
              if (text !== '') {
                offerInput(
                  Input.cases.Text.make({
                    text,
                    byKey: Option.contains(state.lastKey, text),
                  }),
                )
              }
              state.lastKey = Option.none()
            },
            { signal },
          )
          context.addEventListener(
            'compositionstart',
            () => {
              state.composing = true
            },
            { signal },
          )
          context.addEventListener(
            'compositionend',
            event => {
              state.composing = false
              empty()
              offerInput(
                Input.cases.Commit.make({
                  text: event instanceof CompositionEvent ? event.data : '',
                }),
              )
            },
            { signal },
          )
          context.addEventListener(
            'characterboundsupdate',
            event => {
              Queue.offerUnsafe(boundsRequests, {
                from: numberField(event, 'rangeStart'),
                to: numberField(event, 'rangeEnd'),
              })
            },
            { signal },
          )
          port.addEventListener(
            'paste',
            event => {
              event.preventDefault()
              offerInput(
                Input.cases.Paste.make({
                  text: event.clipboardData?.getData('text/plain') ?? '',
                }),
              )
            },
            { signal },
          )
          port.addEventListener(
            'focus',
            () => Queue.offerUnsafe(queue, Message.FocusedKeyboard()),
            { signal },
          )
          port.addEventListener(
            'blur',
            () => Queue.offerUnsafe(queue, Message.BlurredKeyboard()),
            { signal },
          )
          window.addEventListener('focus', keepFocus, { signal })
          port.parentElement?.addEventListener(
            'pointerdown',
            event => {
              if (event.target !== port) {
                event.preventDefault()
                keepFocus()
              }
            },
            { signal },
          )
          keepFocus()
          return controller
        }),
        controller =>
          Effect.sync(() => {
            controller.abort()
            Reflect.set(port, 'editContext', null)
          }),
      )
      return yield* Effect.never
    }),
  )

/**
 * The app's only keyboard listener, on the app's only text input: an element with an empty EditContext. The
 * EditContext holds nothing between keys. Text it receives becomes an Input and is cleared, and an IME composes in it
 * until it commits, so the core's text never has to be copied into it.
 */
export const KeyboardPort = Mount.defineStream('KeyboardPort', {
  messages: [
    Message.ReceivedInput,
    Message.FocusedKeyboard,
    Message.BlurredKeyboard,
  ],
  execute: ({ element, viewStateChanges }) =>
    Option.match(makeEditContext(), {
      onNone: () => Stream.never,
      onSome: context =>
        element instanceof HTMLElement
          ? viewStateChanges.pipe(
              Stream.switchMap(viewState =>
                viewState === 'Live' ? listen(element, context) : Stream.never,
              ),
            )
          : Stream.never,
    }),
})

/** Rendered once, at the app root, outside every branch that can switch. */
export const keyboardPort = (h: HtmlBuilder<Message>): Html =>
  h.div([
    h.Id('port'),
    h.Role('textbox'),
    h.AriaLabel('editor'),
    h.Tabindex(0),
    h.OnMount(KeyboardPort()),
  ])
