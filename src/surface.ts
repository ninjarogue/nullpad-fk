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

const isGhost = (node: Node): boolean =>
  node instanceof HTMLElement && node.hasAttribute('data-ghost')

const lengthOf = (node: Node): number =>
  isGhost(node) ? 0 : (node.textContent ?? '').length

const sumLengths = (nodes: ReadonlyArray<Node>): number =>
  Array.reduce(nodes, 0, (sum, node) => sum + lengthOf(node))

/** Characters of the line in the row before the hit, skipping ghost spans. */
const offsetInRow = (row: HTMLElement, hit: CaretPosition): number => {
  const children = Array.fromIterable(row.childNodes)
  if (hit.offsetNode === row) {
    return sumLengths(children.slice(0, hit.offset))
  }
  return Option.match(
    Array.findFirstIndex(children, child => child.contains(hit.offsetNode)),
    {
      onNone: () => 0,
      onSome: index =>
        sumLengths(children.slice(0, index)) +
        Math.min(hit.offset, lengthOf(children[index] ?? row)),
    },
  )
}

/**
 * The row under the pointer by its fixed height, then the column inside it by the browser's hit test.
 * Past the end of a row that wraps, the column is that row's end. Below the text, when the text ends on screen,
 * it is the end of the text, as in a Chrome text field.
 */
const pointAt = (
  surface: HTMLElement,
  cell: Readonly<{ height: number; rows: number }>,
  event: PointerEvent,
): Option.Option<typeof Message.ClickedText.Type> => {
  const rows = Array.fromIterable(
    surface.querySelectorAll<HTMLElement>('[data-line-id]'),
  )
  return Option.flatMap(Array.head(rows), first => {
    const index = Math.floor(
      (event.clientY - first.getBoundingClientRect().top) / cell.height,
    )
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))] ?? first
    if (index >= rows.length && rows.length < cell.rows) {
      return Option.some(
        Message.ClickedText({
          lineId: Number(row.dataset['lineId']),
          column: Number.MAX_SAFE_INTEGER,
          atRowEnd: false,
        }),
      )
    }
    const box = row.getBoundingClientRect()
    const hit = document.caretPositionFromPoint(
      Math.max(box.left, Math.min(box.right - 1, event.clientX)),
      box.top + box.height / 2,
    )
    const offset =
      hit === null || !row.contains(hit.offsetNode)
        ? event.clientX <= box.left
          ? 0
          : Number.MAX_SAFE_INTEGER
        : offsetInRow(row, hit)
    const length = sumLengths(Array.fromIterable(row.childNodes))
    const continues =
      row.nextElementSibling instanceof HTMLElement &&
      row.nextElementSibling.dataset['lineId'] === row.dataset['lineId']
    return Option.some(
      Message.ClickedText({
        lineId: Number(row.dataset['lineId']),
        column: Number(row.dataset['start']) + Math.min(offset, length),
        atRowEnd: continues && offset >= length,
      }),
    )
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
              Option.map(pointAt(surface, cell, event), message =>
                Queue.offerUnsafe(queue, message),
              )
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

/** A boxed span is an inline-block `--cells` cells wide, the class `w`. */
const boxed = (
  span: Span,
  className: string,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Attribute<Message>> =>
  Option.match(span.box, {
    onNone: () => [h.Class(className)],
    onSome: cells => [
      h.Class(`${className} w`.trim()),
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
