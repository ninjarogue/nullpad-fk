import { Array, Effect, Option, Queue, Stream } from 'effect'
import { Mount, Render } from 'foldkit'
import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'

import {
  type Answer,
  type Frame,
  type Landing,
  type Mode,
  type PaintedLine,
  Query,
} from './core/editor'
import type { Keyboard } from './keyboard'
import { Message } from './message'

type SurfaceMessage =
  | typeof Message.ResizedScreen.Type
  | typeof Message.ScrolledSurface.Type
  | typeof Message.ClickedText.Type

const pixels = (value: string): number => Number.parseFloat(value) || 0

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

type Box = Readonly<{ left: number; top: number; width: number }>

/** JetBrains Mono advances 0.6 em a character: the width of the caret past the end of a line. */
const monospaceAdvance = 0.6

/** The narrowest the caret gets, at the edge of the text column, where Chrome draws its own caret. */
const thinnest = 2

/** The drawn geometry the queries read: where the text column sits and how tall a row is. */
type Sheet = Readonly<{
  surface: HTMLElement
  rowHeight: number
  viewTop: number
  viewBottom: number
}>

const sheetOf = (surface: HTMLElement): Sheet => {
  const style = getComputedStyle(surface)
  const box = surface.getBoundingClientRect()
  return {
    surface,
    rowHeight: pixels(style.lineHeight),
    viewTop: box.top + pixels(style.paddingTop),
    viewBottom: box.bottom - pixels(style.paddingBottom),
  }
}

const findSurface = (): Option.Option<HTMLElement> =>
  Option.fromNullishOr(document.querySelector<HTMLElement>('.surface'))

const lineElement = (
  surface: HTMLElement,
  line: number,
): Option.Option<HTMLElement> =>
  Option.fromNullishOr(
    surface.querySelector<HTMLElement>(`.line[data-index="${line}"]`),
  )

const isGhost = (node: Node): boolean =>
  node instanceof HTMLElement && node.hasAttribute('data-ghost')

const textNodes = (line: HTMLElement): ReadonlyArray<Text> =>
  Array.filter(
    Array.fromIterable(line.childNodes),
    (node): node is Text => node instanceof Text,
  )

const lineText = (line: HTMLElement): string =>
  Array.join(
    Array.map(textNodes(line), node => node.data),
    '',
  )

/**
 * The DOM point of a column, in the text node that holds it. At a join it is the end of the node before, or with side
 * `After` the start of the node after, so a range that starts at a join measures the text after it.
 */
const domPoint = (
  line: HTMLElement,
  column: number,
  side: 'Before' | 'After' = 'Before',
): Readonly<{ node: Node; offset: number }> => {
  const nodes = textNodes(line)
  const found = Array.reduce(
    nodes,
    {
      rest: column,
      point: Option.none<Readonly<{ node: Node; offset: number }>>(),
    },
    (search, node, index) => {
      if (Option.isSome(search.point)) {
        return search
      }
      const takesNext =
        side === 'After' && index < nodes.length - 1
          ? search.rest >= node.length
          : search.rest > node.length
      return takesNext
        ? { rest: search.rest - node.length, point: search.point }
        : { rest: 0, point: Option.some({ node, offset: search.rest }) }
    },
  )
  return Option.getOrElse(found.point, () => ({ node: line, offset: 0 }))
}

/** The column of a DOM point inside a drawn line. A point inside the preedit is at the caret, where it is drawn. */
const columnOf = (line: HTMLElement, node: Node, offset: number): number => {
  const children = Array.fromIterable(line.childNodes)
  const stop =
    node === line
      ? offset
      : Array.findFirstIndex(
          children,
          child => child === node || child.contains(node),
        ).pipe(Option.getOrElse(() => children.length))
  const before = Array.reduce(children.slice(0, stop), 0, (sum, child) =>
    child instanceof Text ? sum + child.length : sum,
  )
  return node instanceof Text && node.parentNode === line
    ? before + offset
    : before
}

const lineOfNode = (node: Node): Option.Option<HTMLElement> =>
  Option.fromNullishOr(
    (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>(
      '.line',
    ),
  )

const indexOf = (line: HTMLElement): number => Number(line.dataset['index'])

const rangeRect = (
  line: HTMLElement,
  from: number,
  to: number,
): Option.Option<DOMRect> => {
  const start = domPoint(line, from, 'After')
  const end = domPoint(line, to)
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const rects = range.getClientRects()
  return Option.fromNullishOr(rects[0])
}

const graphemeAfter = (text: string, column: number): number =>
  Option.match(
    Option.fromNullishOr(
      segmenter.segment(text.slice(column, column + 64)).containing(0),
    ),
    {
      onNone: () => column,
      onSome: ({ segment }) => column + segment.length,
    },
  )

const graphemeBefore = (text: string, column: number): number => {
  const start = Math.max(0, column - 64)
  return Option.match(
    Option.fromNullishOr(
      segmenter
        .segment(text.slice(start, column))
        .containing(column - start - 1),
    ),
    { onNone: () => column, onSome: ({ index }) => start + index },
  )
}

/** The left edge of a line's text and the right edge of its column, in viewport pixels. */
const textEdges = (
  line: HTMLElement,
): Readonly<{ left: number; right: number; top: number }> => {
  const style = getComputedStyle(line)
  const box = line.getBoundingClientRect()
  return {
    left: box.left + pixels(style.paddingLeft),
    right: box.right - pixels(style.paddingRight),
    top: box.top,
  }
}

/** Whether the line wraps at this column: the text after it is drawn on a lower row than the text before it. */
const wrapsAt = (line: HTMLElement, column: number): boolean => {
  const text = lineText(line)
  if (column <= 0 || column >= text.length) {
    return false
  }
  return Option.match(
    Option.all([
      rangeRect(line, graphemeBefore(text, column), column),
      rangeRect(line, column, graphemeAfter(text, column)),
    ]),
    {
      onNone: () => false,
      onSome: ([before, after]) => after.top > before.top + 1,
    },
  )
}

/**
 * Where the caret is drawn: on the grapheme after it, or after the one before it when it ends its line, or ends its
 * row and the core asks for the end of the upper row. It never crosses the column's right edge: a caret among spaces
 * that hang past it, or after a row that fills it, narrows to fit at the edge, where Chrome draws its own.
 */
const caretBox = (
  line: HTMLElement,
  column: number,
  atRowEnd: boolean,
): Box => {
  const edges = textEdges(line)
  const style = getComputedStyle(line)
  const cell = pixels(style.fontSize) * monospaceAdvance
  const row = pixels(style.lineHeight)
  const fitted = ({ left, top, width }: Box): Box => {
    const inside = Math.min(left, edges.right - thinnest)
    return {
      left: inside,
      top: edges.top + Math.floor((top - edges.top + row / 2) / row) * row,
      width: Math.max(thinnest, Math.min(width, edges.right - inside)),
    }
  }
  const ghost = Array.findFirst(Array.fromIterable(line.childNodes), isGhost)
  const preeditEnd = Option.flatMap(ghost, element =>
    element instanceof Element
      ? Array.last(Array.fromIterable(element.getClientRects()))
      : Option.none(),
  )
  if (Option.isSome(preeditEnd)) {
    return fitted({
      left: preeditEnd.value.right,
      top: preeditEnd.value.top,
      width: cell,
    })
  }
  const text = lineText(line)
  const downstream =
    !(atRowEnd && wrapsAt(line, column)) && column < text.length
      ? rangeRect(line, column, graphemeAfter(text, column))
      : Option.none()
  return fitted(
    Option.match(downstream, {
      onSome: rect => ({ left: rect.left, top: rect.top, width: rect.width }),
      onNone: () =>
        Option.match(
          column > 0
            ? rangeRect(line, graphemeBefore(text, column), column)
            : Option.none(),
          {
            onSome: rect => ({ left: rect.right, top: rect.top, width: cell }),
            onNone: () => ({ left: edges.left, top: edges.top, width: cell }),
          },
        ),
    }),
  )
}

/** The browser's caret position at a viewport point, as a line and column, if the point falls on drawn text. */
const pointAt = (
  x: number,
  y: number,
): Option.Option<Readonly<{ line: HTMLElement; column: number }>> => {
  const position = document.caretPositionFromPoint(x, y)
  if (position === null) {
    return Option.none()
  }
  return Option.map(lineOfNode(position.offsetNode), line => ({
    line,
    column: columnOf(line, position.offsetNode, position.offset),
  }))
}

/**
 * A landing at a point. Where its line wraps it is drawn at the end of the upper row when the point is above the wrap
 * and `side` is `Hit`, and always when `side` is `Upper`; `Lower` draws it at the start of the lower row.
 */
const landAt = (
  found: Readonly<{ line: HTMLElement; column: number }>,
  y: number,
  side: 'Hit' | 'Upper' | 'Lower' = 'Hit',
): Landing => {
  const { line, column } = found
  const upper =
    side !== 'Lower' &&
    wrapsAt(line, column) &&
    (side === 'Upper' ||
      Option.match(
        rangeRect(line, graphemeBefore(lineText(line), column), column),
        { onNone: () => false, onSome: rect => y < rect.bottom },
      ))
  return { _tag: 'At', line: indexOf(line), column, atRowEnd: upper }
}

/** Scrolls the least that brings viewport y on screen, and returns where that y is drawn now. */
const bringOnScreen = (sheet: Sheet, y: number): number => {
  const below = y - (sheet.viewBottom - 1)
  const above = sheet.viewTop + 1 - y
  const delta = below > 0 ? below : above > 0 ? -above : 0
  if (delta !== 0) {
    const before = sheet.surface.scrollTop
    sheet.surface.scrollTop = before + delta
    return y - (sheet.surface.scrollTop - before)
  }
  return y
}

const stay = (aim: number): Answer => ({ landing: { _tag: 'Stay' }, aim })

const lastLineIndex = (surface: HTMLElement): number =>
  Number(surface.dataset['lastLine'])

/** Where a line's text starts, read from its first grapheme as the browser laid it out, or the column's edge. */
const textStart = (line: HTMLElement): number => {
  const text = lineText(line)
  return Option.match(
    text.length === 0
      ? Option.none()
      : rangeRect(line, 0, graphemeAfter(text, 0)),
    { onNone: () => textEdges(line).left, onSome: rect => rect.left },
  )
}

/**
 * Up, Down and paging: from the caret's row, `distance` pixels down (or up) at x `aim` from the text's left edge.
 * Chrome pages row by row and steps from the first row to the start of the text and from the last row to its end, so a
 * page that reaches either row goes on to that edge. Where a line wraps, Chrome draws a PageUp landing at the end of
 * the upper row and a PageDown landing at the start of the lower row, whichever side the caret started on.
 */
const verticalAnswer = (
  sheet: Sheet,
  line: HTMLElement,
  from: Readonly<{ column: number; atRowEnd: boolean }>,
  distance: number,
  goal: Option.Option<number>,
  stride: 'Row' | 'Page',
): Answer => {
  const start = textStart(line)
  const caret = caretBox(line, from.column, from.atRowEnd)
  const aim = Option.getOrElse(goal, () =>
    aimAt(line, from.column, from.atRowEnd),
  )
  const target = caret.top + sheet.rowHeight / 2 + distance
  const edgeRow = stride === 'Page' ? sheet.rowHeight : 0
  const first = sheet.surface.querySelector<HTMLElement>('.line')
  const lines = sheet.surface.querySelectorAll<HTMLElement>('.line')
  const last = lines[lines.length - 1]
  if (
    first !== null &&
    indexOf(first) === 0 &&
    target < first.getBoundingClientRect().top + edgeRow
  ) {
    return { landing: { _tag: 'TextStart' }, aim }
  }
  if (
    last !== undefined &&
    indexOf(last) === lastLineIndex(sheet.surface) &&
    target > last.getBoundingClientRect().bottom - edgeRow
  ) {
    return { landing: { _tag: 'TextEnd' }, aim }
  }
  const y = bringOnScreen(sheet, target)
  return Option.match(pointAt(start + aim, y), {
    onNone: () => stay(aim),
    onSome: found => ({
      landing: landAt(
        found,
        y,
        stride === 'Row' ? 'Hit' : distance < 0 ? 'Upper' : 'Lower',
      ),
      aim,
    }),
  })
}

/** One grapheme along the line, or to its row's start or end, as the browser moves its own caret. */
const selectionMove = (
  line: HTMLElement,
  column: number,
  direction: 'forward' | 'backward',
  granularity: 'character' | 'lineboundary',
): Option.Option<number> => {
  const selection = document.getSelection()
  if (selection === null) {
    return Option.none()
  }
  const { node, offset } = domPoint(line, column)
  selection.collapse(node, offset)
  selection.modify('move', direction, granularity)
  const moved =
    selection.focusNode !== null && line.contains(selection.focusNode)
      ? Option.some(columnOf(line, selection.focusNode, selection.focusOffset))
      : Option.none()
  selection.removeAllRanges()
  return moved
}

/** The column where the caret's row starts. A caret drawn at the end of the upper row is in that row. */
const rowStartOf = (
  line: HTMLElement,
  column: number,
  atRowEnd: boolean,
): Option.Option<number> =>
  selectionMove(
    line,
    atRowEnd && wrapsAt(line, column)
      ? graphemeBefore(lineText(line), column)
      : column,
    'backward',
    'lineboundary',
  )

const advances = document.createElement('canvas').getContext('2d')

/** The float sum of the advances of `text` in the line's font, measured on its own. */
const advanceSum = (line: HTMLElement, text: string): Option.Option<number> => {
  if (advances === null) {
    return Option.none()
  }
  const style = getComputedStyle(line)
  advances.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return Option.some(advances.measureText(text).width)
}

/** How far the drawn text from `from` to `to` on one row reaches past the text's start, as the browser drew it. */
const drawnReach = (
  line: HTMLElement,
  from: number,
  to: number,
  start: number,
): number => {
  if (to <= from) {
    return 0
  }
  const range = document.createRange()
  const first = domPoint(line, from, 'After')
  const last = domPoint(line, to)
  range.setStart(first.node, first.offset)
  range.setEnd(last.node, last.offset)
  return range.getBoundingClientRect().right - start
}

/**
 * Where Chrome aims Up and Down from, in whole pixels from the text's start: the advances from the start of the
 * caret's row to the caret, summed as floats and rounded to 1/64 px as Chrome places its caret, kept a pixel inside the
 * column, then rounded down. The drawn rect bounds that sum only to 1/64 px, so a canvas sum within that 1/64 px
 * settles it. Where the canvas strays further it measured what the row does not draw, such as a tab, which a canvas
 * draws as a space, or half of a cluster that a join splits, which the row draws whole.
 */
const aimAt = (
  line: HTMLElement,
  column: number,
  atRowEnd: boolean,
): number => {
  const start = textStart(line)
  const rowStart = Option.getOrElse(rowStartOf(line, column, atRowEnd), () => 0)
  const drawn = drawnReach(line, rowStart, column, start)
  const caret = Option.match(
    advanceSum(line, lineText(line).slice(rowStart, column)),
    {
      onNone: () => drawn,
      onSome: sum => {
        const placed = Math.round(sum * 64) / 64
        return Math.abs(placed - drawn) <= 1 / 64 + 1e-6 ? placed : drawn
      },
    },
  )
  return Math.max(
    0,
    Math.floor(Math.min(caret, textEdges(line).right - start - 1)),
  )
}

const at = (line: HTMLElement, column: number, atRowEnd: boolean): Answer => ({
  landing: { _tag: 'At', line: indexOf(line), column, atRowEnd },
  aim: 0,
})

/** A row edge. A caret drawn at the end of the upper row starts Home from inside that row. */
const rowEdgeAnswer = (
  line: HTMLElement,
  column: number,
  atRowEnd: boolean,
  edge: 'Start' | 'End',
): Answer => {
  if (edge === 'End' && atRowEnd && wrapsAt(line, column)) {
    return at(line, column, true)
  }
  return Option.match(
    edge === 'Start'
      ? rowStartOf(line, column, atRowEnd)
      : selectionMove(line, column, 'forward', 'lineboundary'),
    {
      onNone: () => stay(0),
      onSome: landed =>
        at(line, landed, edge === 'End' && wrapsAt(line, landed)),
    },
  )
}

/** A click: the text column catches every x, a point below the last line is the end of the text. */
const pointAnswer = (sheet: Sheet, x: number, y: number): Answer => {
  const lines = sheet.surface.querySelectorAll<HTMLElement>('.line')
  const last = lines[lines.length - 1]
  if (
    last !== undefined &&
    indexOf(last) === lastLineIndex(sheet.surface) &&
    y >= last.getBoundingClientRect().bottom
  ) {
    return { landing: { _tag: 'TextEnd' }, aim: 0 }
  }
  const row = Math.min(sheet.viewBottom - 1, Math.max(sheet.viewTop + 1, y))
  const hit = Array.findFirst(Array.fromIterable(lines), line => {
    const box = line.getBoundingClientRect()
    return row >= box.top && row < box.bottom
  })
  return Option.match(hit, {
    onNone: () => stay(0),
    onSome: line => {
      const edges = textEdges(line)
      const clampedX = Math.min(edges.right - 0.5, Math.max(edges.left, x))
      return Option.match(pointAt(clampedX, row), {
        onNone: () => stay(0),
        onSome: found => ({ landing: landAt(found, row), aim: 0 }),
      })
    },
  })
}

/** Chrome pages a text box by seven eighths of its client height in whole pixels, a whole row at a time. */
const pageDistance = (sheet: Sheet): number =>
  Math.max(
    1,
    Math.floor(
      Math.floor((sheet.surface.clientHeight * 7) / 8) / sheet.rowHeight,
    ),
  ) * sheet.rowHeight

const answer = (sheet: Sheet, query: Query): Answer =>
  Query.match(query, {
    Point: ({ x, y }) => pointAnswer(sheet, x, y),
    Step: ({ at: from, direction }) =>
      Option.match(lineElement(sheet.surface, from.line), {
        onNone: () => stay(0),
        onSome: line =>
          Option.match(
            selectionMove(
              line,
              from.column,
              direction === 'Forward' ? 'forward' : 'backward',
              'character',
            ),
            {
              onNone: () => stay(0),
              onSome: column => at(line, column, false),
            },
          ),
      }),
    RowEdge: ({ at: from, atRowEnd, edge }) =>
      Option.match(lineElement(sheet.surface, from.line), {
        onNone: () => stay(0),
        onSome: line => rowEdgeAnswer(line, from.column, atRowEnd, edge),
      }),
    Vertical: ({ at: from, atRowEnd, rows, goal }) =>
      Option.match(lineElement(sheet.surface, from.line), {
        onNone: () => stay(Option.getOrElse(goal, () => 0)),
        onSome: line =>
          verticalAnswer(
            sheet,
            line,
            { column: from.column, atRowEnd },
            rows * sheet.rowHeight,
            goal,
            'Row',
          ),
      }),
    Page: ({ at: from, atRowEnd, direction }) =>
      Option.match(lineElement(sheet.surface, from.line), {
        onNone: () => stay(0),
        onSome: line =>
          verticalAnswer(
            sheet,
            line,
            { column: from.column, atRowEnd },
            direction * pageDistance(sheet),
            Option.none(),
            'Page',
          ),
      }),
  })

const drawnRevision = (): number =>
  Option.match(findSurface(), {
    onNone: () => Number.POSITIVE_INFINITY,
    onSome: surface => Number(surface.dataset['revision']),
  })

/** Waits, a few frames at most, until the screen shows `revision`. */
const untilDrawn = (revision: number, frames: number): Effect.Effect<void> =>
  drawnRevision() >= revision || frames === 0
    ? Effect.void
    : Render.afterCommit.pipe(
        Effect.flatMap(() => untilDrawn(revision, frames - 1)),
      )

/** The browser's answer to a query, read from a screen that shows every input before it. */
export const locate = (query: Query, revision: number): Effect.Effect<Answer> =>
  untilDrawn(revision, 8).pipe(
    Effect.map(() =>
      Option.match(findSurface(), {
        onNone: () => stay(0),
        onSome: surface => answer(sheetOf(surface), query),
      }),
    ),
  )

/** Moves the drawn caret to the caret's place in the drawn text. The view draws the text; this draws only the caret. */
const drawCaret = (surface: HTMLElement): void => {
  const caret = surface.querySelector<HTMLElement>('#caret')
  if (caret === null) {
    return
  }
  const line = lineElement(surface, Number(surface.dataset['caretLine']))
  Option.match(line, {
    onNone: () => {
      caret.style.display = 'none'
    },
    onSome: element => {
      const box = caretBox(
        element,
        Number(surface.dataset['caretColumn']),
        surface.dataset['caretEnd'] === 'true',
      )
      const frame = surface.getBoundingClientRect()
      caret.style.display = ''
      caret.style.left = `${box.left - frame.left + surface.scrollLeft}px`
      caret.style.top = `${box.top - frame.top + surface.scrollTop}px`
      caret.style.width = `${box.width}px`
    },
  })
}

/** Scrolls the drawn caret on screen once the screen shows it: as little as it takes, or its row to the top. */
export const revealCaret = (align: 'Nearest' | 'Top'): Effect.Effect<void> =>
  Render.afterCommit.pipe(
    Effect.map(() =>
      Option.map(findSurface(), surface => {
        drawCaret(surface)
        surface.querySelector('#caret')?.scrollIntoView({
          block: align === 'Top' ? 'start' : 'nearest',
          inline: 'nearest',
        })
      }),
    ),
  )

/** The first line at the top of the screen, counting undrawn lines as one row each, as the spacers draw them. */
const topLine = (surface: HTMLElement, sheet: Sheet): number => {
  const lines = Array.fromIterable(
    surface.querySelectorAll<HTMLElement>('.line'),
  )
  const visible = Array.findFirst(
    lines,
    line => line.getBoundingClientRect().bottom > sheet.viewTop + 1,
  )
  return Option.match(visible, {
    onNone: () =>
      Option.match(Array.last(lines), {
        onNone: () => 0,
        onSome: last =>
          indexOf(last) +
          Math.max(
            1,
            Math.ceil(
              (sheet.viewTop - last.getBoundingClientRect().bottom) /
                sheet.rowHeight,
            ),
          ),
      }),
    onSome: line => {
      const above = line.getBoundingClientRect().top - sheet.viewTop
      return above > 1
        ? Math.max(0, indexOf(line) - Math.ceil(above / sheet.rowHeight))
        : indexOf(line)
    },
  })
}

const wheelPixels = (surface: HTMLElement, event: WheelEvent): number => {
  const sheet = sheetOf(surface)
  return event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * sheet.rowHeight
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? event.deltaY * pageDistance(sheet)
      : event.deltaY
}

/** The scroll offsets at which the text area shows only drawn lines, from the first drawn line's top to the last's bottom. */
const drawnScrollRange = (
  surface: HTMLElement,
): Readonly<{ min: number; max: number }> => {
  const lines = surface.querySelectorAll<HTMLElement>('.line')
  const first = lines[0]
  const last = lines[lines.length - 1]
  if (first === undefined || last === undefined) {
    return { min: surface.scrollTop, max: surface.scrollTop }
  }
  const sheet = sheetOf(surface)
  const shift = surface.scrollTop
  return {
    min: first.getBoundingClientRect().top - sheet.viewTop + shift,
    max: last.getBoundingClientRect().bottom - sheet.viewBottom + shift,
  }
}

const observe = (surface: HTMLElement): Stream.Stream<SurfaceMessage> =>
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
          const measure = () => {
            const sheet = sheetOf(surface)
            Queue.offerUnsafe(
              queue,
              Message.ResizedScreen({
                rows: Math.floor(
                  (sheet.viewBottom - sheet.viewTop) / sheet.rowHeight + 0.01,
                ),
              }),
            )
            drawCaret(surface)
          }
          const resizes = new ResizeObserver(measure)
          resizes.observe(surface)
          const wheel = { pending: 0 }
          const report = (top: number) =>
            Queue.offerUnsafe(queue, Message.ScrolledSurface({ top }))
          const reportTop = () => report(topLine(surface, sheetOf(surface)))
          /**
           * Scrolls the wheel's pending distance from the main thread when the drawn lines cover the place it lands.
           * When they do not, the screen stays put, the core is told the line there, and the patch that draws it
           * scrolls. Chrome scrolls a wheel turn on its compositor, ahead of the drawn lines, and paints blank screen
           * until they arrive; scrolled here, every painted frame shows drawn lines. A patch that still does not cover
           * the place drops the turn, so it never scrolls after a later key.
           */
          const scrollPending = (whenUndrawn: 'AskCore' | 'Drop') => {
            if (wheel.pending === 0) {
              return
            }
            const before = surface.scrollTop
            const wanted = Math.min(
              surface.scrollHeight - surface.clientHeight,
              Math.max(0, before + wheel.pending),
            )
            const drawn = drawnScrollRange(surface)
            const isDrawn =
              wanted >= Math.min(drawn.min, before) &&
              wanted <= Math.max(drawn.max, before)
            if (isDrawn) {
              wheel.pending = 0
              if (wanted !== before) {
                surface.scrollTop = wanted
                reportTop()
              }
            } else if (whenUndrawn === 'AskCore') {
              const sheet = sheetOf(surface)
              const shift = wanted - before
              report(
                topLine(surface, {
                  ...sheet,
                  viewTop: sheet.viewTop + shift,
                  viewBottom: sheet.viewBottom + shift,
                }),
              )
            } else {
              wheel.pending = 0
            }
          }
          const patches = new MutationObserver(() => {
            drawCaret(surface)
            scrollPending('Drop')
          })
          patches.observe(surface, {
            attributes: true,
            attributeFilter: [
              'data-revision',
              'data-caret-line',
              'data-caret-column',
              'data-caret-end',
            ],
          })
          surface.addEventListener('scroll', reportTop, {
            signal,
            passive: true,
          })
          surface.addEventListener(
            'wheel',
            event => {
              if (event.ctrlKey || event.deltaY === 0) {
                return
              }
              event.preventDefault()
              wheel.pending += wheelPixels(surface, event)
              scrollPending('AskCore')
            },
            { signal, passive: false },
          )
          surface.addEventListener(
            'pointerdown',
            event => {
              if (event.button !== 0) {
                return
              }
              event.preventDefault()
              Queue.offerUnsafe(
                queue,
                Message.ClickedText({ x: event.clientX, y: event.clientY }),
              )
            },
            { signal },
          )
          return { controller, resizes, patches }
        }),
        ({ controller, resizes, patches }) =>
          Effect.sync(() => {
            controller.abort()
            resizes.disconnect()
            patches.disconnect()
          }),
      )
      return yield* Effect.never
    }),
  )

/** Reports the screen height in rows, the line at its top, and clicks; draws the caret after each patch. */
export const SurfacePort = Mount.defineStream('SurfacePort', {
  messages: [
    Message.ResizedScreen,
    Message.ScrolledSurface,
    Message.ClickedText,
  ],
  execute: ({ element, viewStateChanges }) =>
    element instanceof HTMLElement
      ? viewStateChanges.pipe(
          Stream.switchMap(viewState =>
            viewState === 'Live' ? observe(element) : Stream.never,
          ),
        )
      : Stream.never,
})

const lineView = (
  id: PaintedLine['id'],
  index: number,
  number: number,
  parts: PaintedLine['parts'],
  isCaretLine: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(
    String(id),
    [
      h.Class(isCaretLine ? 'line cl' : 'line'),
      h.DataAttribute('line-id', String(id)),
      h.DataAttribute('index', String(index)),
      h.DataAttribute('n', String(number)),
    ],
    Array.map(parts, part =>
      part.isPreedit
        ? h.span([h.Class('pre'), h.DataAttribute('ghost', '')], [part.text])
        : part.text,
    ),
  )

/**
 * The view of each drawn line, rebuilt only when its parts, place or caret change. The core keeps a line's parts while
 * the line is unchanged, so a keypress rebuilds one line however many are drawn.
 */
const lazyLine = createKeyedLazy()

const spacer = (lines: number, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('spacer'), h.Style({ '--lines': String(lines) })])

/**
 * The scrolling text: a spacer for the lines above, one `white-space: pre-wrap` div per drawn line, keyed by line id,
 * whose pieces are separate text nodes and whose number its `data-n` draws in the gutter, a spacer for the lines
 * below, and `#caret`, which SurfacePort places. The browser wraps the lines.
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
      h.DataAttribute('revision', String(frame.revision)),
      h.DataAttribute('caret-line', String(frame.caret.line)),
      h.DataAttribute('caret-column', String(frame.caret.column)),
      h.DataAttribute('caret-end', String(frame.caret.atRowEnd)),
      h.DataAttribute('last-line', String(frame.status.lineCount - 1)),
      h.OnMount(SurfacePort()),
    ],
    [
      spacer(frame.above, h),
      ...Array.map(frame.lines, line =>
        lazyLine(line.id, lineView, [
          line.id,
          line.index,
          line.number,
          line.parts,
          line.index === frame.caret.line,
          h,
        ]),
      ),
      spacer(frame.below, h),
      h.div([h.Id('caret'), h.Class('cur'), h.AriaHidden(true)]),
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
