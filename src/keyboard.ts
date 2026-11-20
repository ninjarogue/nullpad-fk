import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Mount } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Input, type Modifiers, NamedKey } from './core/input'
import { Message } from './message'

/** Whether the app's one text control has focus, which decides how the caret is drawn. */
export const Keyboard = Schema.Literals(['Focused', 'Blurred'])
export type Keyboard = typeof Keyboard.Type

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
 * A keydown as an Input, or none when the key belongs to the browser or the IME, or will arrive
 * as text. Windows reports AltGr as Ctrl+Alt, so a character typed with both arrives as text.
 * It reads the event and nothing else, so its answer cannot depend on a stale Model.
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

/** A cancelable beforeinput as an Input. Only insertText carries one. `keyed` is the key of the keydown just before. */
const fromBeforeInput = (
  event: InputEvent,
  keyed: Option.Option<string>,
): Option.Option<Input> =>
  event.inputType === 'insertText' && event.data !== null && event.data !== ''
    ? Option.some(
        Input.cases.Text.make({
          text: event.data,
          byKey: Option.contains(keyed, event.data),
        }),
      )
    : Option.none()

type KeyboardMessage =
  | typeof Message.ReceivedInput.Type
  | typeof Message.FocusedKeyboard.Type
  | typeof Message.BlurredKeyboard.Type

const listen = (port: HTMLTextAreaElement): Stream.Stream<KeyboardMessage> =>
  Stream.callback<KeyboardMessage>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const controller = new AbortController()
        const { signal } = controller
        const offerInput = (maybeInput: Option.Option<Input>): boolean =>
          Option.match(maybeInput, {
            onNone: () => false,
            onSome: input =>
              Queue.offerUnsafe(queue, Message.ReceivedInput({ input })),
          })
        const keepFocus = () => port.focus({ preventScroll: true })
        const lastKey: { key: Option.Option<string> } = { key: Option.none() }

        port.addEventListener(
          'keydown',
          event => {
            lastKey.key = Option.some(event.key)
            if (offerInput(fromKeyDown(event))) {
              event.preventDefault()
            }
          },
          { signal },
        )
        port.addEventListener(
          'beforeinput',
          event => {
            if (event.cancelable) {
              event.preventDefault()
              offerInput(fromBeforeInput(event, lastKey.key))
            }
            lastKey.key = Option.none()
          },
          { signal },
        )
        port.addEventListener(
          'compositionupdate',
          event =>
            offerInput(
              Option.some(Input.cases.Preedit.make({ text: event.data })),
            ),
          { signal },
        )
        port.addEventListener(
          'compositionend',
          event => {
            port.value = ''
            offerInput(
              Option.some(Input.cases.Commit.make({ text: event.data })),
            )
          },
          { signal },
        )
        port.addEventListener(
          'paste',
          event => {
            event.preventDefault()
            offerInput(
              Option.some(
                Input.cases.Paste.make({
                  text: event.clipboardData?.getData('text/plain') ?? '',
                }),
              ),
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
      controller => Effect.sync(() => controller.abort()),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

/**
 * The app's only keyboard listener, on the app's only text control.
 * It owns the textarea's value: empty, except while an IME composes in it.
 */
export const KeyboardPort = Mount.defineStream('KeyboardPort', {
  messages: [
    Message.ReceivedInput,
    Message.FocusedKeyboard,
    Message.BlurredKeyboard,
  ],
  execute: ({ element, viewStateChanges }) =>
    element instanceof HTMLTextAreaElement
      ? viewStateChanges.pipe(
          Stream.switchMap(viewState =>
            viewState === 'Live' ? listen(element) : Stream.never,
          ),
        )
      : Stream.never,
})

/** Rendered once, at the app root, outside every branch that can switch. Never given h.Value. */
export const keyboardPort = (h: HtmlBuilder<Message>): Html =>
  h.textarea([
    h.Id('port'),
    h.AriaLabel('editor'),
    h.Spellcheck(false),
    h.Autocapitalize('off'),
    h.Autocomplete('off'),
    h.OnMount(KeyboardPort()),
  ])
