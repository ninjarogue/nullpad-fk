import { Array, Effect, Option, Queue, Stream } from 'effect'
import { Mount } from 'foldkit'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

import type { Frame, Mode, Row, Span, SpanKind } from './core/editor'
import type { Keyboard } from './keyboard'
import { Message } from './message'

type SurfaceMessage =
  | typeof Message.ResizedScreen.Type
  | typeof Message.ScrolledWheel.Type
  | typeof Message.ClickedText.Type

const probeCells = 100

const pixels = (value: string): number => Number.parseFloat(value) || 0

/**
 * The pointer as rows down from the top of the text area and cells from its left edge, the gutter included.
 * Only the core knows what text is there, and it reads the place against the editor after every input before
 * the click, so a click right after a keystroke lands where the keystroke left the text.
 */
const pointAt = (
  surface: HTMLElement,
  style: CSSStyleDeclaration,
  cell: Readonly<{ width: number; height: number }>,
  event: PointerEvent,
): typeof Message.ClickedText.Type => {
  const box = surface.getBoundingClientRect()
  return Message.ClickedText({
    row: Math.floor(
      (event.clientY - box.top - pixels(style.paddingTop)) / cell.height,
    ),
    cell: (event.clientX - box.left - pixels(style.paddingLeft)) / cell.width,
  })
}

const observe = (
  surface: HTMLElement,
  probe: Element,
): Stream.Stream<SurfaceMessage> =>
  Stream.callback<SurfaceMessage>(queue =>
    Effect.gen(function* () {
      const style = getComputedStyle(surface)
      yield* Effect.tryPromise(() =>
        document.fonts.load(`${style.fontSize} ${style.fontFamily}`),
      ).pipe(Effect.ignore)
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const controller = new AbortController()
          const { signal } = controller
          const cell = { width: 1, height: 1, rows: 1 }
          const wheel = { carry: 0 }

          const measure = () => {
            const probeBox = probe.getBoundingClientRect()
            const box = surface.getBoundingClientRect()
            const width =
              box.width - pixels(style.paddingLeft) - pixels(style.paddingRight)
            const height =
              box.height -
              pixels(style.paddingTop) -
              pixels(style.paddingBottom)
            cell.width = probeBox.width / probeCells
            cell.height = probeBox.height
            cell.rows = Math.floor(height / cell.height + 0.01)
            Queue.offerUnsafe(
              queue,
              Message.ResizedScreen({
                columns: Math.floor(width / cell.width + 0.01),
                rows: cell.rows,
              }),
            )
          }
          const observer = new ResizeObserver(measure)
          observer.observe(surface)
          observer.observe(probe)

          surface.addEventListener(
            'wheel',
            event => {
              if (event.ctrlKey) {
                return
              }
              wheel.carry +=
                event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
                  ? event.deltaY / cell.height
                  : event.deltaY
              const rows = Math.trunc(wheel.carry)
              if (rows !== 0) {
                wheel.carry -= rows
                Queue.offerUnsafe(queue, Message.ScrolledWheel({ rows }))
              }
            },
            { signal, passive: true },
          )
          surface.addEventListener(
            'pointerdown',
            event => {
              if (event.button !== 0) {
                return
              }
              event.preventDefault()
              Queue.offerUnsafe(queue, pointAt(surface, style, cell, event))
            },
            { signal },
          )
          return { controller, observer }
        }),
        ({ controller, observer }) =>
          Effect.sync(() => {
            controller.abort()
            observer.disconnect()
          }),
      )
      return yield* Effect.never
    }),
  )

/** Pixels to cells. The only code that measures the DOM, and it never writes to it. */
export const SurfacePort = Mount.defineStream('SurfacePort', {
  messages: [Message.ResizedScreen, Message.ScrolledWheel, Message.ClickedText],
  execute: ({ element, viewStateChanges }) => {
    const probe = element.querySelector('.probe')
    return element instanceof HTMLElement && probe !== null
      ? viewStateChanges.pipe(
          Stream.switchMap(viewState =>
            viewState === 'Live' ? observe(element, probe) : Stream.never,
          ),
        )
      : Stream.never
  },
})

/**
 * A boxed span is an inline-block `--cells` cells wide, the class `w`. A box of 0 cells holds spaces that hang past
 * the row's edge, and the class `hang` sets them in no room at all.
 */
const boxed = (
  span: Span,
  className: string,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Attribute<Message>> =>
  Option.match(span.box, {
    onNone: () => [h.Class(className)],
    onSome: cells => [
      h.Class(`${className} w${cells === 0 ? ' hang' : ''}`.trim()),
      h.Style({ '--cells': String(cells) }),
    ],
  })

const spanViews: Readonly<
  Record<
    SpanKind,
    (span: Span, caretKey: string, h: HtmlBuilder<Message>) => Html | string
  >
> = {
  Text: (span, _, h) =>
    Option.isSome(span.box)
      ? h.span(boxed(span, '', h), [span.text])
      : span.text,
  Preedit: (span, _, h) =>
    h.span(
      [...boxed(span, 'pre', h), h.DataAttribute('ghost', '')],
      [span.text],
    ),
  Caret: (span, caretKey, h) =>
    h.keyed('span')(
      caretKey,
      [h.Id('caret'), ...boxed(span, 'cur', h)],
      [span.text],
    ),
  CaretPastEnd: (span, caretKey, h) =>
    h.keyed('span')(
      caretKey,
      [h.Id('caret'), h.Class('cur'), h.DataAttribute('ghost', '')],
      [span.text],
    ),
}

const rowView = (
  row: Row,
  status: Frame['status'],
  h: HtmlBuilder<Message>,
): Html => {
  const caretKey = `caret-${status.line}-${status.column}`
  const isCaretLine = Option.contains(row.lineNumber, status.line)
  return h.keyed('div')(
    row.key,
    [
      h.Class(isCaretLine ? 'row cl' : 'row'),
      h.DataAttribute('line-id', String(row.lineId)),
      h.DataAttribute('start', String(row.start)),
      ...Option.match(row.lineNumber, {
        onNone: () => [],
        onSome: lineNumber => [h.DataAttribute('n', String(lineNumber))],
      }),
    ],
    Array.map(row.spans, span => spanViews[span.kind](span, caretKey, h)),
  )
}

/**
 * Paints the frame: one keyed `white-space: pre` div per Row, carrying data-line-id and data-start,
 * indented by the gutter (`--gutter`, in cells) that holds its line number.
 * Caret and CaretPastEnd become span#caret.cur, the CSS anchor the port sits on.
 * CaretPastEnd and Preedit spans carry data-ghost.
 */
export const surface = (
  frame: Frame,
  keyboard: Keyboard,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Class(keyboard === 'Focused' ? 'surface focused' : 'surface'),
      h.Style({ '--gutter': String(frame.gutter) }),
      h.OnMount(SurfacePort()),
    ],
    [
      ...Array.map(frame.rows, row => rowView(row, frame.status, h)),
      h.span([h.Class('probe'), h.AriaHidden(true)], ['0'.repeat(probeCells)]),
    ],
  )

const modeLabels: Readonly<Record<Mode, string>> = { Plain: 'EDIT' }

export const statusLine = (
  status: Frame['status'],
  path: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('status')],
    [
      h.span([h.Class('mode')], [modeLabels[status.mode]]),
      h.span([h.Class('file')], [path]),
      h.span(
        [h.Class('pos')],
        [`${status.line}:${status.column} ${status.lineCount}L`],
      ),
    ],
  )
