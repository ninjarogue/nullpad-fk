import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Mount, Render } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Input, type Modifiers, NamedKey } from './core/input'
import { Message } from './message'

export const Keyboard = Schema.Literals(['Focused', 'Blurred', 'Unsupported'])
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
  if (typeof constructor !== 'function') {
    return Option.none()
  }
  try {
    return Option.some(Reflect.construct(constructor, []))
  } catch {
    return Option.none()
  }
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

const isOneCodePoint = (text: string): boolean => Array.from(text).length === 1

const modifiersOf = (event: KeyboardEvent): Modifiers => ({
  ctrl: event.ctrlKey,
  alt: event.altKey,
  meta: event.metaKey,
  shift: event.shiftKey,
})

/** Windows reports AltGr as Ctrl+Alt, so a character typed with both arrives as text. */
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
    isOneCodePoint(key) && (event.ctrlKey || event.metaKey) && !isAltGraph
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
  | typeof Message.FoundBrowserUnsupported.Type

const drawnRect = (selector: string): Option.Option<DOMRect> =>
  Option.map(Option.fromNullishOr(document.querySelector(selector)), element =>
    element.getBoundingClientRect(),
  )

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

type Span = Readonly<{ start: number; end: number }>

const eraseOutside = (kept: Span, replaced: Span): Option.Option<Input> => {
  const offsetFromCaret = (offset: number) =>
    offset < kept.start
      ? offset - kept.start
      : offset > kept.end
        ? offset - kept.end
        : 0
  const fromCaret = offsetFromCaret(replaced.start)
  const toCaret = offsetFromCaret(replaced.end)
  return fromCaret === toCaret
    ? Option.none()
    : Option.some(Input.cases.Erase.make({ fromCaret, toCaret }))
}

const composedAfter = (composed: Span, replaced: Span, text: string): Span => {
  const touches =
    replaced.start <= composed.end && replaced.end >= composed.start
  const start = touches
    ? Math.min(composed.start, replaced.start)
    : replaced.start
  const end = touches
    ? Math.max(composed.end, replaced.end) +
      text.length -
      (replaced.end - replaced.start)
    : replaced.start + text.length
  return { start, end }
}

const listen = (
  port: HTMLElement,
  context: EditContext,
): Stream.Stream<KeyboardMessage> =>
  Stream.callback<KeyboardMessage>(queue =>
    Effect.gen(function* () {
      const boundsRequests =
        yield* Queue.unbounded<
          Readonly<{ from: number; to: number; base: number }>
        >()
      const reportBounds = ({
        from,
        to,
        base,
      }: Readonly<{ from: number; to: number; base: number }>) =>
        Effect.sync(() => {
          Option.map(drawnRect('.surface'), rect =>
            context.updateControlBounds(rect),
          )
          Option.map(drawnRect('#caret'), rect =>
            context.updateSelectionBounds(rect),
          )
          context.updateCharacterBounds(
            from,
            preeditBounds(from - base, to - base),
          )
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
          /** Giving the port its EditContext again makes Chrome end the composition then and there, with a compositionend. */
          const commitComposition = () => {
            Reflect.set(port, 'editContext', context)
          }
          const state: {
            lastKey: Option.Option<string>
            selection: Span
            composition: Option.Option<Span>
          } = {
            lastKey: Option.none(),
            selection: { start: 0, end: 0 },
            composition: Option.none(),
          }
          const holdSurrounding = () => {
            if (Option.isSome(state.composition)) {
              return
            }
            const text = port.dataset['surrounding'] ?? ''
            const caret = Number(port.dataset['caret'] ?? 0)
            if (context.text !== text) {
              context.updateText(0, context.text.length, text)
            }
            context.updateSelection(caret, caret)
            state.selection = { start: caret, end: caret }
          }
          const surroundingChanges = new MutationObserver(holdSurrounding)
          surroundingChanges.observe(port, {
            attributes: true,
            attributeFilter: ['data-surrounding', 'data-caret'],
          })
          signal.addEventListener('abort', () =>
            surroundingChanges.disconnect(),
          )

          Reflect.set(port, 'editContext', context)
          holdSurrounding()
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
              const replaced = {
                start: numberField(event, 'updateRangeStart'),
                end: numberField(event, 'updateRangeEnd'),
              }
              Option.match(state.composition, {
                onNone: () => {
                  Option.map(
                    eraseOutside(state.selection, replaced),
                    offerInput,
                  )
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
                onSome: composed => {
                  Option.map(eraseOutside(composed, replaced), offerInput)
                  const { start, end } = composedAfter(composed, replaced, text)
                  state.composition = Option.some({ start, end })
                  offerInput(
                    Input.cases.Preedit.make({
                      text: context.text.slice(start, end),
                    }),
                  )
                },
              })
              state.selection = {
                start: numberField(event, 'selectionStart'),
                end: numberField(event, 'selectionEnd'),
              }
            },
            { signal },
          )
          context.addEventListener(
            'compositionstart',
            () => {
              const { start } = state.selection
              state.composition = Option.some({ start, end: start })
            },
            { signal },
          )
          context.addEventListener(
            'compositionend',
            event => {
              state.composition = Option.none()
              holdSurrounding()
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
                base: Option.match(state.composition, {
                  onNone: () => state.selection.start,
                  onSome: ({ start }) => start,
                }),
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
            () => {
              if (Option.isSome(state.composition)) {
                commitComposition()
              }
            },
            { signal, capture: true },
          )
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

export const KeyboardPort = Mount.defineStream('KeyboardPort', {
  messages: [
    Message.ReceivedInput,
    Message.FocusedKeyboard,
    Message.BlurredKeyboard,
    Message.FoundBrowserUnsupported,
  ],
  execute: ({ element, viewStateChanges }) =>
    Option.match(makeEditContext(), {
      onNone: () => Stream.make(Message.FoundBrowserUnsupported()),
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

export const keyboardPort = (
  surrounding: Readonly<{ text: string; caret: number }>,
  keyboard: Keyboard,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([
    h.Id('port'),
    ...(keyboard === 'Unsupported'
      ? [h.Tabindex(-1)]
      : [h.Role('textbox'), h.AriaLabel('editor'), h.Tabindex(0)]),
    h.DataAttribute('surrounding', surrounding.text),
    h.DataAttribute('caret', String(surrounding.caret)),
    h.OnMount(KeyboardPort()),
  ])

export const browserUnsupportedNotice = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('unsupported'), h.Role('alert')],
    [
      h.p([h.Class('headline')], ['nullpad needs Chrome or Edge']),
      h.p(
        [],
        [
          "It types through EditContext, which Firefox, Safari and browsers built on them, such as Zen, don't have yet.",
        ],
      ),
    ],
  )
