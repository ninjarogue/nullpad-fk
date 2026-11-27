import { Array, Effect, Option, Queue, Schema, Stream } from 'effect'
import { Mount, Render } from 'foldkit'
import { type Html, type HtmlBuilder, createKeyedLazy } from 'foldkit/html'

import {
  type Answer,
  type Frame,
  type Landing,
  type Mode,
  type PaintedLine,
  Place,
  type PromptLine,
  Query,
  type Selection,
  Serial,
  type Step,
  Target,
  graphemeReach,
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

type Position = Readonly<{ line: number; column: number }>

const jetBrainsMonoAdvanceEm = 0.6

const minCaretWidthPx = 2

type Sheet = Readonly<{
  surface: HTMLElement
  rowHeight: number
  viewTop: number
  viewBottom: number
}>

const sheetOf = (surface: HTMLElement): Sheet => {
  const style = getComputedStyle(surface)
  const padding = getComputedStyle(surface.querySelector('.sheet') ?? surface)
  const box = surface.getBoundingClientRect()
  return {
    surface,
    rowHeight: pixels(style.lineHeight),
    viewTop: box.top + pixels(padding.paddingTop),
    viewBottom: box.bottom - pixels(padding.paddingBottom),
  }
}

export const isOnScrollbar = ({ target }: MouseEvent): boolean =>
  target instanceof HTMLElement &&
  target.classList.contains('surface') &&
  target.scrollHeight > target.clientHeight

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
      segmenter
        .segment(text.slice(column, column + graphemeReach))
        .containing(0),
    ),
    {
      onNone: () => column,
      onSome: ({ segment }) => column + segment.length,
    },
  )

const graphemeBefore = (text: string, column: number): number => {
  const start = Math.max(0, column - graphemeReach)
  return Option.match(
    Option.fromNullishOr(
      segmenter
        .segment(text.slice(start, column))
        .containing(column - start - 1),
    ),
    { onNone: () => column, onSome: ({ index }) => start + index },
  )
}

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

const cellWidth = (surface: HTMLElement): number =>
  pixels(getComputedStyle(surface).fontSize) * jetBrainsMonoAdvanceEm

const viewRight = (surface: HTMLElement): number =>
  surface.getBoundingClientRect().left + surface.clientWidth

const lineBreakBox = (
  line: HTMLElement,
  text: string,
  origin: Readonly<{ left: number; top: number }>,
  row: number,
  cell: number,
  mostRight: number,
): Box =>
  Option.match(
    text.length === 0
      ? Option.none()
      : rangeRect(line, graphemeBefore(text, text.length), text.length),
    {
      onNone: () => ({ ...origin, width: cell }),
      onSome: rect => ({
        left: Math.min(rect.right, mostRight - cell),
        top:
          origin.top +
          Math.floor((rect.top - origin.top + row / 2) / row) * row,
        width: cell,
      }),
    },
  )

const caretBox = (
  line: HTMLElement,
  column: number,
  atRowEnd: boolean,
): Box => {
  const edges = textEdges(line)
  const style = getComputedStyle(line)
  const cell = pixels(style.fontSize) * jetBrainsMonoAdvanceEm
  const row = pixels(style.lineHeight)
  const snapped = (top: number): number =>
    edges.top + Math.floor((top - edges.top + row / 2) / row) * row
  const fitted = ({ left, top, width }: Box): Box => {
    const inside = Math.min(left, edges.right - minCaretWidthPx)
    return {
      left: inside,
      top: snapped(top),
      width: Math.max(minCaretWidthPx, Math.min(width, edges.right - inside)),
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
  const hanging = Option.filter(
    downstream,
    rect => rect.left >= edges.right - minCaretWidthPx,
  )
  if (Option.isSome(hanging)) {
    return { left: edges.right, top: snapped(hanging.value.top), width: cell }
  }
  return fitted(
    Option.match(downstream, {
      onSome: rect => ({ left: rect.left, top: rect.top, width: rect.width }),
      onNone: () =>
        Option.match(
          column > 0
            ? rangeRect(line, graphemeBefore(text, column), column)
            : Option.none(),
          {
            onSome: rect => ({
              left: rect.right,
              top: rect.top,
              width: cell,
            }),
            onNone: () => ({ left: edges.left, top: edges.top, width: cell }),
          },
        ),
    }),
  )
}

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

const landAt = (
  found: Readonly<{ line: HTMLElement; column: number }>,
  y: number,
  side: 'ByPointY' | 'Upper' | 'Lower' = 'ByPointY',
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

const appScrollMemoryMs = 1000

type AppScroll = { readonly distance: number; shownAt: number }

const appScrolls: { recent: ReadonlyArray<AppScroll> } = { recent: [] }

/**
 * The app scrolls after a patch, inside a frame, and that frame is on screen no sooner than the next frame begins.
 * `shownAt` is that moment on the clock of `Event.timeStamp`.
 */
const scrollSurface = (
  surface: HTMLElement,
  top: number,
  author: 'App' | 'Person',
): number => {
  const before = surface.scrollTop
  surface.scrollTop = top
  const distance = surface.scrollTop - before
  if (author === 'App' && distance !== 0) {
    const made: AppScroll = { distance, shownAt: Infinity }
    appScrolls.recent = [...appScrolls.recent, made]
    requestAnimationFrame(nextFrame => {
      made.shownAt = nextFrame
      appScrolls.recent = Array.filter(
        appScrolls.recent,
        ({ shownAt }) => shownAt > nextFrame - appScrollMemoryMs,
      )
    })
  }
  return distance
}

const unshownAt = (time: number): number =>
  Array.reduce(appScrolls.recent, 0, (pixels, { distance, shownAt }) =>
    time < shownAt ? pixels + distance : pixels,
  )

const bringOnScreen = (sheet: Sheet, y: number): number => {
  const below = y - (sheet.viewBottom - 1)
  const above = sheet.viewTop + 1 - y
  const delta = below > 0 ? below : above > 0 ? -above : 0
  return delta === 0
    ? y
    : y - scrollSurface(sheet.surface, sheet.surface.scrollTop + delta, 'App')
}

const stay = (aimFromTextLeft: number): Answer => ({
  landing: { _tag: 'Stay' },
  aimFromTextLeft,
})

const lastLineIndex = (surface: HTMLElement): number =>
  Number(surface.dataset['lastLine'])

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
    return { landing: { _tag: 'TextStart' }, aimFromTextLeft: aim }
  }
  if (
    last !== undefined &&
    indexOf(last) === lastLineIndex(sheet.surface) &&
    target > last.getBoundingClientRect().bottom - edgeRow
  ) {
    return { landing: { _tag: 'TextEnd' }, aimFromTextLeft: aim }
  }
  const y = bringOnScreen(sheet, target)
  return Option.match(pointAt(start + aim, y), {
    onNone: () => stay(aim),
    onSome: found => ({
      landing: landAt(
        found,
        y,
        stride === 'Row' ? 'ByPointY' : distance < 0 ? 'Upper' : 'Lower',
      ),
      aimFromTextLeft: aim,
    }),
  })
}

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

const columnInCaretRow = (
  line: HTMLElement,
  column: number,
  atRowEnd: boolean,
): number =>
  atRowEnd && wrapsAt(line, column)
    ? graphemeBefore(lineText(line), column)
    : column

const rowStartOf = (
  line: HTMLElement,
  column: number,
  atRowEnd: boolean,
): Option.Option<number> =>
  selectionMove(
    line,
    columnInCaretRow(line, column, atRowEnd),
    'backward',
    'lineboundary',
  )

const advances = document.createElement('canvas').getContext('2d')

const advanceSum = (line: HTMLElement, text: string): Option.Option<number> => {
  if (advances === null) {
    return Option.none()
  }
  const style = getComputedStyle(line)
  advances.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return Option.some(advances.measureText(text).width)
}

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
  aimFromTextLeft: 0,
})

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

const lineAt = (
  sheet: Sheet,
  y: number,
): Readonly<{ line: number; yInLine: number }> => {
  const lines = Array.fromIterable(
    sheet.surface.querySelectorAll<HTMLElement>('.line'),
  )
  const inUndrawnRow = (line: number) => ({
    line,
    yInLine: sheet.rowHeight / 2,
  })
  const hit = Array.findFirst(lines, line => {
    const box = line.getBoundingClientRect()
    return y >= box.top && y < box.bottom
  })
  if (Option.isSome(hit)) {
    return {
      line: indexOf(hit.value),
      yInLine: y - hit.value.getBoundingClientRect().top,
    }
  }
  const first = lines[0]
  const last = lines[lines.length - 1]
  if (first === undefined || last === undefined) {
    return inUndrawnRow(0)
  }
  const top = first.getBoundingClientRect().top
  if (y < top) {
    const rowsAbove = Math.ceil((top - y) / sheet.rowHeight)
    return inUndrawnRow(Math.max(0, indexOf(first) - rowsAbove))
  }
  const rowsBelow = Math.floor(
    (y - last.getBoundingClientRect().bottom) / sheet.rowHeight,
  )
  return inUndrawnRow(indexOf(last) + 1 + rowsBelow)
}

const pointAnswer = (
  sheet: Sheet,
  line: HTMLElement,
  x: number,
  yInLine: number,
): Answer => {
  const box = line.getBoundingClientRect()
  const row = bringOnScreen(sheet, box.top + Math.min(yInLine, box.height - 1))
  const edges = textEdges(line)
  const clampedX = Math.min(edges.right - 0.5, Math.max(edges.left, x))
  return Option.match(pointAt(clampedX, row), {
    onNone: () => stay(0),
    onSome: found => ({ landing: landAt(found, row), aimFromTextLeft: 0 }),
  })
}

const isBefore = (a: Position, b: Position): boolean =>
  a.line < b.line || (a.line === b.line && a.column < b.column)

const rowEnds = (
  sheet: Sheet,
  y: number,
): Option.Option<ReadonlyArray<Position>> => {
  const { line: index } = lineAt(sheet, y)
  const lastIndex = lastLineIndex(sheet.surface)
  return Option.flatMap(
    lineElement(sheet.surface, Math.min(index, lastIndex)),
    line => {
      if (index > lastIndex) {
        const end = { line: lastIndex, column: lineText(line).length }
        return Option.some([end])
      }
      const edges = textEdges(line)
      return Option.all([
        pointAt(edges.left + 0.5, y),
        pointAt(edges.right - 0.5, y),
      ]).pipe(
        Option.map(found =>
          Array.map(found, ({ line: hit, column }) => ({
            line: indexOf(hit),
            column,
          })),
        ),
      )
    },
  )
}

const screenAnswer = (sheet: Sheet, from: Position): Answer =>
  Option.match(lineElement(sheet.surface, from.line), {
    onNone: () => stay(0),
    onSome: line => {
      bringOnScreen(
        sheet,
        caretBox(line, from.column, false).top + sheet.rowHeight / 2,
      )
      const top = rowEnds(sheet, sheet.viewTop + sheet.rowHeight / 2)
      const bottom = rowEnds(sheet, sheet.viewBottom - sheet.rowHeight / 2)
      return Option.match(Option.all([top, bottom]), {
        onNone: () => stay(0),
        onSome: ([upper, lower]) => {
          const first = Array.reduce(upper, upper[0] ?? from, (a, b) =>
            isBefore(b, a) ? b : a,
          )
          const last = Array.reduce(lower, lower[0] ?? from, (a, b) =>
            isBefore(a, b) ? b : a,
          )
          return isBefore(last, first)
            ? stay(0)
            : { landing: { _tag: 'Screen', first, last }, aimFromTextLeft: 0 }
        },
      })
    },
  })

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
    Point: ({ x, line, yInLine }) =>
      Option.match(lineElement(sheet.surface, line), {
        onNone: () => stay(0),
        onSome: element => pointAnswer(sheet, element, x, yInLine),
      }),
    Screen: ({ at: from }) => screenAnswer(sheet, from),
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
    Vertical: ({ at: from, atRowEnd, rows, goalX }) =>
      Option.match(lineElement(sheet.surface, from.line), {
        onNone: () => stay(Option.getOrElse(goalX, () => 0)),
        onSome: line =>
          verticalAnswer(
            sheet,
            line,
            { column: from.column, atRowEnd },
            rows * sheet.rowHeight,
            goalX,
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

const untilDrawn = (revision: number, frames: number): Effect.Effect<void> =>
  drawnRevision() >= revision || frames === 0
    ? Effect.void
    : Render.afterCommit.pipe(
        Effect.flatMap(() => untilDrawn(revision, frames - 1)),
      )

export const locate = (query: Query, revision: number): Effect.Effect<Answer> =>
  untilDrawn(revision, 8).pipe(
    Effect.map(() =>
      Option.match(findSurface(), {
        onNone: () => stay(0),
        onSome: surface => {
          applyTarget(surface)
          return answer(sheetOf(surface), query)
        },
      }),
    ),
  )

type Shift = Readonly<{ left: number; top: number; scrollTop: number }>

const shiftOf = (surface: HTMLElement): Shift => {
  const frame = surface.getBoundingClientRect()
  const { scrollTop } = surface
  return {
    left: surface.scrollLeft - frame.left,
    top: scrollTop - frame.top,
    scrollTop,
  }
}

const lineBreakBoxOf = (surface: HTMLElement, element: HTMLElement): Box =>
  lineBreakBox(
    element,
    lineText(element),
    textEdges(element),
    sheetOf(surface).rowHeight,
    cellWidth(surface),
    viewRight(surface),
  )

const caretPlace = (surface: HTMLElement): Option.Option<Box> =>
  Option.map(
    lineElement(surface, Number(surface.dataset['caretLine'])),
    element => {
      const column = Number(surface.dataset['caretColumn'])
      return surface.dataset['selected'] !== '' &&
        column >= lineText(element).length
        ? lineBreakBoxOf(surface, element)
        : caretBox(element, column, surface.dataset['caretEnd'] === 'true')
    },
  )

const cellBox = (
  surface: HTMLElement,
  element: HTMLElement,
  column: number,
): Box => {
  const text = lineText(element)
  if (column >= text.length) {
    return lineBreakBoxOf(surface, element)
  }
  const box = caretBox(element, column, false)
  return text[column] === '\t' ? { ...box, width: cellWidth(surface) } : box
}

type LabelPlace = Readonly<{ element: HTMLElement; box: Box }>

const labelPlaces = (surface: HTMLElement): ReadonlyArray<LabelPlace> =>
  Array.getSomes(
    Array.map(
      Array.fromIterable(
        surface.querySelectorAll<HTMLElement>('#jump > [data-label]'),
      ),
      element =>
        Option.map(
          lineElement(surface, Number(element.dataset['line'])),
          line => ({
            element,
            box: cellBox(surface, line, Number(element.dataset['from'])),
          }),
        ),
    ),
  )

const placeLabels = (places: ReadonlyArray<LabelPlace>, shift: Shift): void => {
  for (const { element, box } of places) {
    element.style.left = `${box.left + shift.left}px`
    element.style.top = `${box.top + shift.top}px`
    element.style.width = `${box.width}px`
  }
}

const markMatches = (surface: HTMLElement): void => {
  const written = surface.dataset['jumpMatches']
  if (written === undefined || written === '') {
    CSS.highlights.delete('jump-match')
    return
  }
  const ranges: Array<StaticRange> = []
  const lines = new Map<number, HTMLElement>()
  for (const line of surface.querySelectorAll<HTMLElement>('.line')) {
    lines.set(indexOf(line), line)
  }
  for (const match of written.split(';')) {
    const [index, from, to] = match.split(',').map(Number)
    const line = lines.get(index ?? -1)
    if (line === undefined || from === undefined || to === undefined) {
      continue
    }
    const start = domPoint(line, from, 'After')
    const stop = domPoint(line, to)
    ranges.push(
      new StaticRange({
        startContainer: start.node,
        startOffset: start.offset,
        endContainer: stop.node,
        endOffset: stop.offset,
      }),
    )
  }
  CSS.highlights.set('jump-match', new Highlight(...ranges))
}

const placeCaret = (
  surface: HTMLElement,
  place: Option.Option<Box>,
  shift: Shift,
): void => {
  const caret = surface.querySelector<HTMLElement>('#caret')
  if (caret === null) {
    return
  }
  Option.match(place, {
    onNone: () => {
      caret.style.display = 'none'
    },
    onSome: box => {
      caret.style.display = ''
      caret.style.left = `${box.left + shift.left}px`
      caret.style.top = `${box.top + shift.top}px`
      caret.style.width =
        surface.dataset['caretShape'] === 'Bar' ? '2px' : `${box.width}px`
    },
  })
}

type Covered = Readonly<{
  from: number
  to: number
  lineBreak: boolean
  marksEmptyLine: boolean
}>

type Selected = (index: number, length: number) => Option.Option<Covered>

const blockMark = 'block:'

const stretchOf = (written: string): Selected => {
  const [
    firstLine = 0,
    firstColumn = 0,
    lastLine = 0,
    endColumn = 0,
    lineBreak,
  ] = Array.map(written.split(','), Number)
  return (index, length) =>
    index < firstLine || index > lastLine
      ? Option.none()
      : Option.some({
          from: index === firstLine ? firstColumn : 0,
          to: index === lastLine ? Math.min(endColumn, length) : length,
          lineBreak: index < lastLine || lineBreak === 1,
          marksEmptyLine: false,
        })
}

const blockOf = (written: string): Selected => {
  const spans = new Map(
    Array.map(written.split(';'), span => {
      const [line = 0, from = 0, to = 0] = Array.map(span.split(','), Number)
      return [
        line,
        { from, to, lineBreak: false, marksEmptyLine: true },
      ] as const
    }),
  )
  return index => Option.fromUndefinedOr(spans.get(index))
}

const selectedOf = (surface: HTMLElement): Option.Option<Selected> => {
  const written = surface.dataset['selected'] ?? ''
  if (written === '') {
    return Option.none()
  }
  return Option.some(
    written.startsWith(blockMark)
      ? blockOf(written.slice(blockMark.length))
      : stretchOf(written),
  )
}

type PlacedBox = Readonly<{
  left: number
  top: number
  width: number
  isLineBreak: boolean
}>

type SelectionBox = PlacedBox &
  Readonly<{ seamLeft: number; seamWidth: number }>

type Span = Readonly<{ left: number; right: number; top: number }>

const touchingPx = 0.5

const joinedWhereTouching = (
  spans: ReadonlyArray<Span>,
): ReadonlyArray<Span> => {
  const joined: Array<Span> = []
  for (const span of [...spans].sort(
    (a, b) => a.top - b.top || a.left - b.left,
  )) {
    const open = joined[joined.length - 1]
    if (
      open !== undefined &&
      open.top === span.top &&
      span.left <= open.right + touchingPx
    ) {
      joined[joined.length - 1] = {
        ...open,
        right: Math.max(open.right, span.right),
      }
    } else {
      joined.push(span)
    }
  }
  return joined
}

const seamOverlapPx = 1

const withSeams = (
  boxes: ReadonlyArray<PlacedBox>,
  row: number,
): ReadonlyArray<SelectionBox> => {
  const grouped: Array<{ top: number; boxes: Array<PlacedBox> }> = []
  for (const box of [...boxes].sort((a, b) => a.top - b.top)) {
    const open = grouped[grouped.length - 1]
    if (open !== undefined && box.top - open.top < touchingPx) {
      open.boxes.push(box)
    } else {
      grouped.push({ top: box.top, boxes: [box] })
    }
  }
  const rows = grouped.map(({ top, boxes: inRow }) => ({
    top,
    boxes: inRow.map(box =>
      !box.isLineBreak &&
      inRow.some(
        other =>
          other.isLineBreak &&
          Math.abs(box.left + box.width - other.left) < touchingPx,
      )
        ? { ...box, width: box.width + seamOverlapPx }
        : box,
    ),
  }))
  return rows.flatMap(({ top, boxes: above }, index) => {
    const next = rows[index + 1]
    const below =
      next !== undefined && Math.abs(next.top - top - row) < touchingPx
        ? joinedWhereTouching(
            next.boxes.map(box => ({
              left: box.left,
              right: box.left + box.width,
              top: next.top,
            })),
          )
        : []
    return above.map(box => {
      const shared = below
        .map(span => {
          const left = Math.max(box.left, span.left)
          return {
            left,
            width: Math.min(box.left + box.width, span.right) - left,
          }
        })
        .reduce((widest, span) => (span.width > widest.width ? span : widest), {
          left: box.left,
          width: 0,
        })
      return {
        ...box,
        seamLeft: shared.left - box.left,
        seamWidth: shared.width,
      }
    })
  })
}

const selectionBoxes = (
  surface: HTMLElement,
  selected: Selected,
): ReadonlyArray<SelectionBox> => {
  const sheet = sheetOf(surface)
  const screen = sheet.viewBottom - sheet.viewTop
  const bandTop = sheet.viewTop - screen
  const bandBottom = sheet.viewBottom + screen
  const row = sheet.rowHeight
  const cell = cellWidth(surface)
  const mostRight = viewRight(surface)
  const range = document.createRange()
  const boxes: Array<PlacedBox> = []
  const lines = surface.querySelectorAll<HTMLElement>('.line')
  const textLeft = Option.match(Option.fromNullishOr(lines[0]), {
    onNone: () => 0,
    onSome: first => textEdges(first).left - first.getBoundingClientRect().left,
  })
  for (const line of lines) {
    const text = lineText(line)
    const covered = Option.getOrUndefined(selected(indexOf(line), text.length))
    if (covered === undefined) {
      continue
    }
    const box = line.getBoundingClientRect()
    if (box.bottom < bandTop || box.top > bandBottom) {
      continue
    }
    const rowTop = (top: number): number =>
      box.top + Math.floor((top - box.top + row / 2) / row) * row
    const { from, to } = covered
    if (to > from) {
      const start = domPoint(line, from, 'After')
      const stop = domPoint(line, to)
      range.setStart(start.node, start.offset)
      range.setEnd(stop.node, stop.offset)
      const spans = Array.fromIterable(range.getClientRects())
        .filter(rect => rect.bottom >= bandTop && rect.top <= bandBottom)
        .map(rect => ({
          left: rect.left,
          right: rect.right,
          top: rowTop(rect.top),
        }))
      const wide = spans.filter(span => span.right > span.left)
      const drawn =
        wide.length > 0
          ? joinedWhereTouching(wide)
          : spans
              .slice(0, 1)
              .map(span => ({ ...span, right: span.left + minCaretWidthPx }))
      for (const { left, right, top } of drawn) {
        boxes.push({ left, top, width: right - left, isLineBreak: false })
      }
    } else if (covered.marksEmptyLine) {
      boxes.push({
        left: box.left + textLeft,
        top: box.top,
        width: 0,
        isLineBreak: false,
      })
    }
    if (covered.lineBreak) {
      const end = lineBreakBox(
        line,
        text,
        { left: box.left + textLeft, top: box.top },
        row,
        cell,
        mostRight,
      )
      if (end.top + row >= bandTop && end.top <= bandBottom) {
        boxes.push({ ...end, isLineBreak: true })
      }
    }
  }
  return withSeams(boxes, row)
}

const selectionPool: Array<HTMLElement> = []

const drawnSelection = { scrollTop: 0 }

const selectionPlaces = (surface: HTMLElement): ReadonlyArray<SelectionBox> =>
  surface.querySelector('#selection') === null
    ? []
    : Option.match(selectedOf(surface), {
        onNone: () => [],
        onSome: selected => selectionBoxes(surface, selected),
      })

const placeSelection = (
  surface: HTMLElement,
  boxes: ReadonlyArray<SelectionBox>,
  shift: Shift,
): void => {
  const layer = surface.querySelector<HTMLElement>('#selection')
  drawnSelection.scrollTop = shift.scrollTop
  boxes.forEach((box, index) => {
    const element = selectionPool[index] ?? document.createElement('div')
    selectionPool[index] = element
    element.style.cssText = `left:${box.left + shift.left}px;top:${box.top + shift.top}px;width:${box.width}px;--seam-left:${box.seamLeft}px;--seam-width:${box.seamWidth}px`
    element.toggleAttribute('data-break', box.isLineBreak)
    if (element.parentNode !== layer) {
      layer?.append(element)
    }
  })
  for (const unused of selectionPool.slice(boxes.length)) {
    unused.remove()
  }
}

const draw = (surface: HTMLElement): void => {
  const boxes = selectionPlaces(surface)
  const caret = caretPlace(surface)
  const labels = labelPlaces(surface)
  const shift = shiftOf(surface)
  placeSelection(surface, boxes, shift)
  placeLabels(labels, shift)
  markMatches(surface)
  placeCaret(surface, caret, shift)
}

const redrawSelectionAfterScroll = (surface: HTMLElement): void => {
  if (
    surface.dataset['selected'] !== '' &&
    Math.abs(surface.scrollTop - drawnSelection.scrollTop) >
      surface.clientHeight / 2
  ) {
    placeSelection(surface, selectionPlaces(surface), shiftOf(surface))
  }
}

const aiming = {
  applied: Serial.make(0),
  handled: '',
  isUnreported: false,
  askedAt: 0,
}

export const markAimed: Effect.Effect<void> = Effect.sync(() => {
  aiming.askedAt = performance.now()
})

const decodeTarget = Schema.decodeUnknownSync(Schema.fromJsonString(Target))

const lineById = (
  surface: HTMLElement,
  id: number,
): Option.Option<HTMLElement> =>
  Option.fromNullishOr(
    surface.querySelector<HTMLElement>(`.line[data-line-id="${id}"]`),
  )

const bringRowOnScreen = (
  sheet: Sheet,
  top: number,
  align: 'Nearest' | 'Top',
): void => {
  const bottom = top + sheet.rowHeight
  const delta =
    align === 'Top' || top < sheet.viewTop
      ? top - sheet.viewTop
      : Math.max(0, bottom - sheet.viewBottom)
  if (delta !== 0) {
    scrollSurface(sheet.surface, sheet.surface.scrollTop + delta, 'App')
  }
}

const applyStep = (surface: HTMLElement, { place }: Step): void =>
  Place.match(place, {
    At: ({ anchor, align }) => {
      Option.map(lineById(surface, anchor.lineId), line => {
        const { top } = caretBox(
          line,
          Math.min(anchor.column, lineText(line).length),
          anchor.atRowEnd,
        )
        bringRowOnScreen(sheetOf(surface), top, align)
      })
    },
    End: () => {
      scrollSurface(surface, surface.scrollHeight, 'App')
    },
  })

const applyTarget = (surface: HTMLElement): void => {
  const written = surface.dataset['target'] ?? ''
  if (written === aiming.handled) {
    return
  }
  aiming.handled = written
  const target = decodeTarget(written)
  if (target.serial <= aiming.applied) {
    return
  }
  for (const step of target.steps) {
    if (step.serial > aiming.applied) {
      applyStep(surface, step)
    }
  }
  aiming.applied = target.serial
  aiming.isUnreported = true
}

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

const isAtEnd = (surface: HTMLElement): boolean =>
  surface.scrollTop >= surface.scrollHeight - surface.clientHeight - 1

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
            draw(surface)
          }
          const resizes = new ResizeObserver(measure)
          resizes.observe(surface)
          const wheel = { pending: 0, turnedAt: 0 }
          const dropTurnsBeforeReveal = () => {
            if (wheel.turnedAt < aiming.askedAt) {
              wheel.pending = 0
            }
          }
          const report = (top: number, atEnd: boolean) =>
            Queue.offerUnsafe(
              queue,
              Message.ScrolledSurface({ top, atEnd, serial: aiming.applied }),
            )
          const thumb = { isHeld: false, isAtEnd: false }
          const reportTop = () => {
            thumb.isAtEnd = thumb.isHeld && isAtEnd(surface)
            report(topLine(surface, sheetOf(surface)), isAtEnd(surface))
          }
          const holdThumb = () => {
            thumb.isHeld = true
            thumb.isAtEnd = isAtEnd(surface)
            document.documentElement.style.setProperty(
              '--held-sheet-height',
              `${surface.querySelector('.sheet')?.getBoundingClientRect().height ?? 0}px`,
            )
          }
          const releaseThumb = () => {
            document.documentElement.style.removeProperty('--held-sheet-height')
            if (thumb.isHeld && thumb.isAtEnd) {
              scrollSurface(surface, surface.scrollHeight, 'App')
            }
            thumb.isHeld = false
          }
          window.addEventListener('pointerup', releaseThumb, { signal })
          window.addEventListener('pointercancel', releaseThumb, { signal })
          /**
           * Chrome scrolls a wheel turn on its compositor, ahead of the drawn lines, and paints blank screen until they arrive;
           * scrolled here, every painted frame shows drawn lines. Chrome hands over a wheel turn at the next frame, after keys
           * pressed later than it, so a turn made before an input last asked for the caret on screen is dropped: that input's
           * reveal is the later scroll.
           */
          const scrollPending = (whenUndrawn: 'AskCore' | 'Drop') => {
            dropTurnsBeforeReveal()
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
                scrollSurface(surface, wanted, 'Person')
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
                false,
              )
            } else {
              wheel.pending = 0
            }
          }
          const patched = () => {
            applyTarget(surface)
            draw(surface)
            scrollPending('Drop')
            if (aiming.isUnreported) {
              aiming.isUnreported = false
              reportTop()
            }
          }
          const patches = new MutationObserver(patched)
          patches.observe(surface, {
            attributes: true,
            attributeFilter: [
              'data-revision',
              'data-caret-line',
              'data-caret-column',
              'data-caret-end',
              'data-caret-shape',
              'data-selected',
              'data-jump-matches',
              'data-target',
            ],
          })
          patched()
          surface.addEventListener(
            'scroll',
            () => {
              reportTop()
              redrawSelectionAfterScroll(surface)
            },
            { signal, passive: true },
          )
          surface.addEventListener(
            'wheel',
            event => {
              if (event.ctrlKey || event.deltaY === 0) {
                return
              }
              event.preventDefault()
              dropTurnsBeforeReveal()
              wheel.pending += wheelPixels(surface, event)
              wheel.turnedAt = event.timeStamp
              scrollPending('AskCore')
            },
            { signal, passive: false },
          )
          surface.addEventListener(
            'pointerdown',
            event => {
              if (isOnScrollbar(event)) {
                holdThumb()
                return
              }
              if (event.button !== 0) {
                return
              }
              event.preventDefault()
              const sheet = sheetOf(surface)
              const y = Math.min(
                sheet.viewBottom - 1,
                Math.max(sheet.viewTop + 1, event.clientY),
              )
              Queue.offerUnsafe(
                queue,
                Message.ClickedText({
                  x: event.clientX,
                  ...lineAt(sheet, y - unshownAt(event.timeStamp)),
                }),
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

const selectionKinds: Readonly<Record<Selection['kind'], string>> = {
  Letters: 'letters',
  Lines: 'lines',
  Block: 'block',
}

const writtenSelection = (selection: Selection): string =>
  selection.kind === 'Block'
    ? blockMark +
      Array.join(
        Array.map(
          selection.spans,
          ({ line, from, to }) => `${line},${from},${to}`,
        ),
        ';',
      )
    : `${selection.from.line},${selection.from.column},${selection.to.line},${selection.to.column},${selection.lineBreak ? 1 : 0}`

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

const lazyLine = createKeyedLazy()

const spacer = (lines: number, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('spacer'), h.Style({ '--lines': String(lines) })])

export const surface = (
  frame: Frame,
  keyboard: Keyboard,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Class(
        [
          'surface',
          ...(keyboard === 'Focused' ? ['focused'] : []),
          ...(Option.isSome(frame.jump) ? ['jumping'] : []),
        ].join(' '),
      ),
      h.Style({ '--gutter': String(frame.gutter) }),
      h.DataAttribute('revision', String(frame.revision)),
      h.DataAttribute('caret-line', String(frame.caret.line)),
      h.DataAttribute('caret-column', String(frame.caret.column)),
      h.DataAttribute('caret-end', String(frame.caret.atRowEnd)),
      h.DataAttribute('caret-shape', frame.caret.shape),
      h.DataAttribute('target', JSON.stringify(frame.target)),
      h.DataAttribute('last-line', String(frame.status.lineCount - 1)),
      ...Option.match(frame.jump, {
        onNone: () => [],
        onSome: ({ matches }) => [
          h.DataAttribute(
            'jump-matches',
            Array.join(
              Array.map(
                matches,
                ({ line, from, to }) => `${line},${from},${to}`,
              ),
              ';',
            ),
          ),
        ],
      }),
      h.DataAttribute(
        'selected',
        Option.match(frame.selection, {
          onNone: () => '',
          onSome: writtenSelection,
        }),
      ),
      h.OnMount(SurfacePort()),
    ],
    [
      ...Option.match(frame.selection, {
        onNone: () => [],
        onSome: ({ kind }) => [
          h.keyed('div')('selection', [
            h.Id('selection'),
            h.DataAttribute('kind', selectionKinds[kind]),
            h.AriaHidden(true),
          ]),
        ],
      }),
      h.div(
        [h.Class('sheet')],
        [
          spacer(frame.undrawnAbove, h),
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
          spacer(frame.undrawnBelow, h),
        ],
      ),
      ...Option.match(frame.jump, {
        onNone: () => [],
        onSome: ({ labels }) => [
          h.keyed('div')(
            'jump',
            [h.Id('jump'), h.AriaHidden(true)],
            Array.map(labels, ({ letter, line, column, over }) =>
              h.keyed('div')(
                letter,
                [
                  h.DataAttribute('label', letter),
                  h.DataAttribute('line', String(line)),
                  h.DataAttribute('column', String(column)),
                  h.DataAttribute('from', String(over.from)),
                  h.DataAttribute('to', String(over.to)),
                ],
                [letter],
              ),
            ),
          ),
        ],
      }),
      h.div(
        [h.Id('caret'), h.Class('cur'), h.AriaHidden(true)],
        [
          h.span([h.Class('cur-flip')]),
          h.span([h.Class('cur-lift')]),
          h.span([h.Class('cur-cap')]),
        ],
      ),
    ],
  )

const modeLabels: Readonly<Record<Mode, string>> = {
  Plain: 'EDIT',
  Normal: 'NORMAL',
  Insert: 'INSERT',
  Visual: 'VISUAL',
  VisualLine: 'V-LINE',
  VisualBlock: 'V-BLOCK',
}

const promptView = (prompt: PromptLine, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Class('prompt')],
    [
      h.span([h.Class('prompt-lead')], [prompt.lead]),
      h.span(
        [h.Class('prompt-before')],
        [
          prompt.before,
          ...(prompt.preedit === ''
            ? []
            : [
                h.span(
                  [h.Class('pre'), h.DataAttribute('ghost', '')],
                  [prompt.preedit],
                ),
              ]),
        ],
      ),
      h.span(
        [h.Class('prompt-caret')],
        prompt.under === '' ? [] : [prompt.under],
      ),
      h.span([h.Class('prompt-after')], [prompt.after]),
    ],
  )

export const statusLine = (
  status: Frame['status'],
  screen: 'Edit' | 'Read',
  path: string,
  maybeWarning: Option.Option<string>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class('status')],
    [
      h.span(
        [h.Class('mode')],
        [screen === 'Read' ? 'READ' : modeLabels[status.mode]],
      ),
      h.span([h.Class('pending')], [status.pending]),
      ...Option.match(status.prompt, {
        onNone: () => [h.span([h.Class('file')], [path])],
        onSome: prompt => [promptView(prompt, h)],
      }),
      ...(status.notice === ''
        ? []
        : [h.span([h.Class('notice')], [status.notice])]),
      ...Option.match(maybeWarning, {
        onNone: () => [],
        onSome: warning => [h.span([h.Class('warn')], [warning])],
      }),
      h.span(
        [h.Class('pos')],
        [`${status.line}:${status.column} ${status.lineCount}L`],
      ),
      h.button(
        [
          h.Class('toggle-read'),
          h.Type('button'),
          h.Tabindex(-1),
          h.OnClick(Message.ClickedReadToggle()),
        ],
        [screen === 'Read' ? 'edit ^E' : 'read ^E'],
      ),
      h.button(
        [
          h.Class('toggle-vim'),
          h.Type('button'),
          h.Tabindex(-1),
          h.OnClick(Message.ClickedVimToggle()),
        ],
        [status.mode === 'Plain' ? 'vim off' : 'vim on'],
      ),
    ],
  )
