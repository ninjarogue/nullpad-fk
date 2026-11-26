import { Option, Schema } from 'effect'

import type * as Buffer from '../buffer'
import { cellAt, cellText } from './cells'
import {
  type Spot,
  type Walked,
  cellsIn,
  classAt,
  dec,
  decl,
  endOf,
  endOfWord,
  firstFilled,
  forwardWordStoppingAtLineEnd,
  inc,
  incl,
  isEmptyLineStart,
  lastLine,
  positionOf,
} from './motions'

export type Reach = 'Exclusive' | 'Inclusive' | 'Linewise'

export type Span = Readonly<{ start: Spot; end: Spot; reach: Reach }>

export type Ends = Readonly<{ anchor: Spot; cursor: Spot }>

export type Selected = Ends & Readonly<{ kind: 'Letters' | 'Lines' | 'Block' }>

export type Picked = Ends &
  Readonly<{ kind: 'Letters' | 'LettersOrBlock' | 'Lines' | 'Kept' }>

export const isBefore = (a: Spot, b: Spot): boolean =>
  a.line < b.line || (a.line === b.line && a.cell < b.cell)

const isSame = (a: Spot, b: Spot): boolean =>
  a.line === b.line && a.cell === b.cell

const cellIn = (buffer: Buffer.Buffer, { line, cell }: Spot): string => {
  const text = buffer.lines[line] ?? buffer.lines[0]
  return cell >= 0 && cell < cellsIn(buffer, line) ? cellText(text, cell) : ''
}

export const inIndent = (
  buffer: Buffer.Buffer,
  spot: Spot,
  extra: number,
): boolean => firstFilled(buffer, spot.line) >= spot.cell + extra

const backInLine = (buffer: Buffer.Buffer, spot: Spot, big: boolean): Spot => {
  const wordClass = classAt(buffer, spot, big)
  let cell = spot.cell
  while (
    cell > 0 &&
    classAt(buffer, { line: spot.line, cell: cell - 1 }, big) === wordClass
  ) {
    cell -= 1
  }
  return { line: spot.line, cell }
}

const backwardWord = (
  buffer: Buffer.Buffer,
  from: Spot,
  big: boolean,
): Walked => {
  const classOf = (spot: Spot) => classAt(buffer, spot, big)
  const startClass = classOf(from)
  let stepped = dec(buffer, from)
  if (stepped.crossing === 'Stuck') {
    return { spot: from, failed: true }
  }
  let { spot } = stepped
  if (startClass === classOf(spot) || startClass === 'Blank') {
    while (classOf(spot) === 'Blank') {
      if (isEmptyLineStart(buffer, spot)) {
        return { spot, failed: false }
      }
      stepped = dec(buffer, spot)
      if (stepped.crossing === 'Stuck') {
        return { spot, failed: false }
      }
      spot = stepped.spot
    }
    const wordClass = classOf(spot)
    while (classOf(spot) === wordClass) {
      stepped = dec(buffer, spot)
      if (stepped.crossing === 'Stuck') {
        return { spot, failed: false }
      }
      spot = stepped.spot
    }
  }
  return { spot: inc(buffer, spot).spot, failed: false }
}

const backwardWordEnd = (
  buffer: Buffer.Buffer,
  from: Spot,
  big: boolean,
): Walked => {
  const classOf = (spot: Spot) => classAt(buffer, spot, big)
  const startClass = classOf(from)
  let stepped = dec(buffer, from)
  let { spot } = stepped
  const leftTheLine = () => stepped.crossing !== 'InLine'
  if (stepped.crossing === 'Stuck') {
    return { spot: from, failed: true }
  }
  if (leftTheLine()) {
    return { spot, failed: false }
  }
  while (startClass !== 'Blank' && classOf(spot) === startClass) {
    stepped = dec(buffer, spot)
    spot = stepped.spot
    if (leftTheLine()) {
      return { spot, failed: false }
    }
  }
  while (classOf(spot) === 'Blank' && !isEmptyLineStart(buffer, spot)) {
    stepped = dec(buffer, spot)
    spot = stepped.spot
    if (leftTheLine()) {
      return { spot, failed: false }
    }
  }
  return { spot, failed: false }
}

type Grown = 'FromCursor' | 'FromSelection'

type Words = Ends & Readonly<{ inclusive: boolean; failed: boolean }>

const words =
  (include: boolean, big: boolean) =>
  (buffer: Buffer.Buffer, ends: Ends, count: number, grown: Grown): Words => {
    const isBlank = (spot: Spot) => classAt(buffer, spot, big) === 'Blank'
    const toEnd = (spot: Spot) =>
      endOfWord(buffer, spot, 1, {
        stayOnEnd: true,
        stopAtEmptyLine: true,
        big,
      })
    let { anchor, cursor } = ends
    let left = count
    let start = Option.none<Spot>()
    let inclusive = true
    const walk = (walked: Walked): boolean => {
      cursor = walked.spot
      return walked.failed
    }
    const failed = (): Words => ({ anchor, cursor, inclusive, failed: true })
    if (isSame(anchor, cursor)) {
      const wordStart = backInLine(buffer, cursor, big)
      cursor = wordStart
      if (isBlank(wordStart) === include) {
        if (walk(toEnd(wordStart))) {
          return failed()
        }
      } else {
        const next = forwardWordStoppingAtLineEnd(buffer, wordStart, 1, big)
        cursor =
          next.spot.cell === 0
            ? decl(buffer, next.spot).spot
            : { line: next.spot.line, cell: next.spot.cell - 1 }
        start = include ? Option.some(wordStart) : start
      }
      anchor = wordStart
      left -= 1
    }
    for (; left > 0; left -= 1) {
      inclusive = true
      if (grown === 'FromSelection' && isBefore(cursor, anchor)) {
        const stepped = decl(buffer, cursor)
        cursor = stepped.spot
        if (stepped.crossing === 'Stuck') {
          return failed()
        }
        if (include === isBlank(cursor)) {
          if (walk(backwardWord(buffer, cursor, big))) {
            return failed()
          }
        } else {
          if (walk(backwardWordEnd(buffer, cursor, big))) {
            return failed()
          }
          cursor = incl(buffer, cursor).spot
        }
      } else {
        const stepped = incl(buffer, cursor)
        cursor = stepped.spot
        if (stepped.crossing === 'Stuck') {
          return failed()
        }
        if (include !== isBlank(cursor)) {
          if (
            walk(forwardWordStoppingAtLineEnd(buffer, cursor, 1, big)) &&
            left > 1
          ) {
            return failed()
          }
          if (cursor.cell === 0) {
            inclusive = false
          } else {
            cursor = { line: cursor.line, cell: cursor.cell - 1 }
          }
        } else if (walk(toEnd(cursor))) {
          return failed()
        }
      }
    }
    const widened = Option.filter(
      Option.map(
        Option.filter(
          start,
          ({ cell }) =>
            cell > 0 && (!isBlank(cursor) || (cursor.cell === 0 && !inclusive)),
        ),
        ({ line, cell }) => backInLine(buffer, { line, cell: cell - 1 }, big),
      ),
      spot => isBlank(spot) && spot.cell > 0,
    )
    return {
      anchor: Option.getOrElse(widened, () => anchor),
      cursor,
      inclusive,
      failed: false,
    }
  }

const isWhiteLine = (buffer: Buffer.Buffer, line: number): boolean =>
  firstFilled(buffer, line) >= cellsIn(buffer, line)

const paragraph =
  (include: boolean) =>
  (buffer: Buffer.Buffer, from: Spot, count: number): Option.Option<Span> => {
    const last = lastLine(buffer)
    const isWhite = (line: number) => isWhiteLine(buffer, line)
    const whiteInFront = isWhite(from.line)
    let start = from.line
    while (start > 0 && isWhite(start - 1) === whiteInFront) {
      start -= 1
    }
    let end = start
    while (end <= last && isWhite(end)) {
      end += 1
    }
    end -= 1
    let left = !include && whiteInFront ? count - 1 : count
    while (left > 0) {
      left -= 1
      if (end === last) {
        return Option.none()
      }
      const takesWhite = include || isWhite(end + 1)
      if (include || !takesWhite) {
        end += 1
        while (end < last && !isWhite(end + 1)) {
          end += 1
        }
      }
      if (left === 0 && whiteInFront && include) {
        break
      }
      if (takesWhite) {
        while (end < last && isWhite(end + 1)) {
          end += 1
        }
      }
    }
    if (!whiteInFront && !isWhite(end) && include) {
      while (start > 0 && isWhite(start - 1)) {
        start -= 1
      }
    }
    return Option.some({
      start: { line: start, cell: 0 },
      end: { line: end, cell: 0 },
      reach: 'Linewise',
    })
  }

const moreParagraphs = (
  buffer: Buffer.Buffer,
  { anchor, cursor }: Ends,
  count: number,
  include: boolean,
): Spot => {
  const direction = cursor.line < anchor.line ? -1 : 1
  const edge = direction < 0 ? 0 : lastLine(buffer)
  let { line } = cursor
  for (let left = count; left > 0 && line !== edge; left -= 1) {
    let whiteBefore = Option.none<boolean>()
    for (let pass = 0; pass < 2; pass += 1) {
      line += direction
      const white = isWhiteLine(buffer, line)
      if (Option.contains(whiteBefore, white)) {
        line -= direction
        break
      }
      while (line !== edge && isWhiteLine(buffer, line + direction) === white) {
        line += direction
      }
      if (!include || line === edge) {
        break
      }
      whiteBefore = Option.some(white)
    }
  }
  return { line, cell: 0 }
}

const quoted =
  (quote: string, include: boolean) =>
  (buffer: Buffer.Buffer, ends: Ends, count: number): Option.Option<Ends> => {
    const { line } = ends.cursor
    if (ends.anchor.line !== line) {
      return Option.none()
    }
    const cells = cellsIn(buffer, line)
    const isQuote = (cell: number) => cellIn(buffer, { line, cell }) === quote
    const isWhite = (cell: number) => {
      const text = cellIn(buffer, { line, cell })
      return text === ' ' || text === '\t'
    }
    const nextQuote = (cell: number): number => {
      let at = cell
      while (at < cells && !isQuote(at)) {
        at += 1
      }
      return at < cells ? at : -1
    }
    const previousQuote = (cell: number): number => {
      let at = cell
      while (at > 0) {
        at -= 1
        if (isQuote(at)) {
          break
        }
      }
      return at
    }
    const anchor = ends.anchor.cell
    const cursor = ends.cursor.cell
    const isEmpty = anchor === cursor
    const anchorFirst = anchor < cursor
    const low = Math.min(anchor, cursor)
    const high = Math.max(anchor, cursor)
    const insideQuotes =
      !isEmpty &&
      low > 0 &&
      isQuote(low - 1) &&
      high < cells &&
      isQuote(high + 1)
    const selectedQuote =
      !isEmpty && nextQuote(low) >= 0 && nextQuote(low) <= high
    let start = cursor
    let end = -1
    if (!isEmpty && isQuote(cursor)) {
      if (anchorFirst) {
        const next = nextQuote(cursor + 1)
        const closing = next < 0 ? -1 : nextQuote(next + 1)
        start = closing < 0 ? cursor : next
        end = closing < 0 ? next : closing
      } else {
        const before = previousQuote(cursor)
        const opening = isQuote(before) ? previousQuote(before) : -1
        start = opening >= 0 && isQuote(opening) ? opening : before
        end = !isQuote(before)
          ? -1
          : opening >= 0 && isQuote(opening)
            ? before
            : cursor
      }
    } else if (isQuote(cursor) || !isEmpty) {
      const nearest = isEmpty
        ? cursor
        : anchorFirst
          ? nextQuote(cursor)
          : previousQuote(cursor)
      start = nextQuote(0)
      while (start >= 0 && start <= nearest) {
        end = nextQuote(start + 1)
        if (end < 0 || nearest <= end) {
          break
        }
        start = nextQuote(end + 1)
        end = -1
      }
    } else {
      const before = previousQuote(cursor)
      start = isQuote(before) ? before : nextQuote(before)
      end = start < 0 ? -1 : nextQuote(start + 1)
    }
    if (start < 0 || end < 0) {
      return Option.none()
    }
    if (include && isWhite(end + 1)) {
      while (isWhite(end + 1)) {
        end += 1
      }
    } else if (include) {
      while (start > 0 && isWhite(start - 1)) {
        start -= 1
      }
    }
    const first =
      !include && count < 2 && (isEmpty || !insideQuotes) ? start + 1 : start
    const last =
      include || count > 1 || (!isEmpty && insideQuotes) ? end : end - 1
    const at = (cell: number): Spot => ({ line, cell })
    if (isEmpty || anchorFirst) {
      const movesAnchor =
        isEmpty ||
        (!selectedQuote &&
          (insideQuotes ||
            (!isQuote(anchor) && (anchor === 0 || !isQuote(anchor - 1)))))
      return Option.some({
        anchor: at(movesAnchor ? first : anchor),
        cursor: at(last),
      })
    }
    const movesAnchor =
      insideQuotes ||
      (!selectedQuote &&
        !isQuote(anchor) &&
        (anchor >= cells || !isQuote(anchor + 1)))
    return Option.some({
      anchor: at(movesAnchor ? last : anchor),
      cursor: at(first),
    })
  }

const unmatched = (
  buffer: Buffer.Buffer,
  from: Spot,
  direction: 'Backward' | 'Forward',
  wanted: string,
  nested: string,
): Option.Option<Spot> => {
  const step = direction === 'Backward' ? -1 : 1
  let line = from.line
  let column =
    direction === 'Backward'
      ? positionOf(buffer, from).column - 1
      : endOf(buffer, from).column
  let depth = 0
  while (line >= 0 && line <= lastLine(buffer)) {
    const { text } = buffer.lines[line] ?? buffer.lines[0]
    for (; column >= 0 && column < text.length; column += step) {
      const unit = text[column]
      if (unit === wanted && depth === 0) {
        return Option.some({
          line,
          cell: cellAt(buffer.lines[line] ?? buffer.lines[0], column),
        })
      }
      depth += unit === wanted ? -1 : unit === nested ? 1 : 0
    }
    line += step
    column =
      direction === 'Backward' ? (buffer.lines[line]?.text.length ?? 0) - 1 : 0
  }
  return Option.none()
}

const repeatedSearch = (
  from: Spot,
  count: number,
  search: (spot: Spot) => Option.Option<Spot>,
): Option.Option<Spot> => {
  let spot = Option.some(from)
  for (let left = count; left > 0 && Option.isSome(spot); left -= 1) {
    spot = search(spot.value)
  }
  return spot
}

type Pair = Readonly<{ open: Spot; close: Spot }>

type Block = Readonly<{ start: Spot; end: Spot; endsAtLineStart: boolean }>

const block =
  (open: string, close: string, include: boolean) =>
  (
    buffer: Buffer.Buffer,
    ends: Ends,
    count: number,
    grown: Grown,
  ): Option.Option<Block> => {
    const [low, high] = isBefore(ends.cursor, ends.anchor)
      ? [ends.cursor, ends.anchor]
      : [ends.anchor, ends.cursor]
    let from = low
    if (isSame(low, high)) {
      while (open === '{' && inIndent(buffer, from, 1)) {
        const stepped = inc(buffer, from)
        from = stepped.spot
        if (stepped.crossing !== 'InLine') {
          break
        }
      }
      if (cellIn(buffer, from) === open) {
        from = { line: from.line, cell: from.cell + 1 }
      }
    }
    const closed = (opening: Option.Option<Spot>): Option.Option<Pair> =>
      Option.flatMap(opening, start =>
        Option.map(unmatched(buffer, start, 'Forward', close, open), end => ({
          open: start,
          close: end,
        })),
      )
    const enclosing = (spot: Spot) =>
      unmatched(buffer, spot, 'Backward', open, close)
    const direction = Option.isSome(enclosing(from)) ? 'Backward' : 'Forward'
    let pair = closed(
      repeatedSearch(from, count, spot =>
        unmatched(buffer, spot, direction, open, close),
      ),
    )
    while (Option.isSome(pair)) {
      const found = pair.value
      if (include) {
        return Option.some({
          start: found.open,
          end: found.close,
          endsAtLineStart: false,
        })
      }
      const start = incl(buffer, found.open).spot
      if (grown === 'FromSelection' && isSame(start, found.close)) {
        return Option.none()
      }
      let endsAtLineStart = found.close.cell === 0
      let end = decl(buffer, found.close).spot
      while (inIndent(buffer, end, 1)) {
        endsAtLineStart = true
        const stepped = decl(buffer, end)
        end = stepped.spot
        if (stepped.crossing !== 'InLine') {
          break
        }
      }
      if (
        grown === 'FromCursor' ||
        isBefore(start, low) ||
        isBefore(high, end) ||
        isSame(start, end)
      ) {
        return Option.some({ start, end, endsAtLineStart })
      }
      pair = Option.filter(closed(enclosing(decl(buffer, low).spot)), outer =>
        isBefore(outer.open, found.open),
      )
    }
    return Option.none()
  }

export const ObjectName = Schema.Literals([
  'InnerWord',
  'AWord',
  'InnerBigWord',
  'ABigWord',
  'InnerParagraph',
  'AParagraph',
  'InnerDoubleQuote',
  'ADoubleQuote',
  'InnerSingleQuote',
  'ASingleQuote',
  'InnerParen',
  'AParen',
  'InnerBracket',
  'ABracket',
  'InnerBrace',
  'ABrace',
  'InnerAngle',
  'AAngle',
])
export type ObjectName = typeof ObjectName.Type

type Object = Readonly<{
  find: (
    buffer: Buffer.Buffer,
    from: Spot,
    count: number,
  ) => Option.Option<Span>
  pick: (buffer: Buffer.Buffer, selected: Selected, count: number) => Picked
}>

const kept = (ends: Ends): Picked => ({ ...ends, kind: 'Kept' })

const wordObject = (include: boolean, big: boolean): Object => {
  const walk = words(include, big)
  return {
    find: (buffer, from, count) => {
      const { anchor, cursor, inclusive, failed } = walk(
        buffer,
        { anchor: from, cursor: from },
        count,
        'FromCursor',
      )
      return failed
        ? Option.none()
        : Option.some(
            isBefore(cursor, anchor)
              ? { start: cursor, end: anchor, reach: 'Inclusive' }
              : {
                  start: anchor,
                  end: cursor,
                  reach: inclusive ? 'Inclusive' : 'Exclusive',
                },
          )
    },
    pick: (buffer, ends, count) => {
      const { anchor, cursor, failed } = walk(
        buffer,
        ends,
        count,
        'FromSelection',
      )
      return { anchor, cursor, kind: failed ? 'Kept' : 'LettersOrBlock' }
    },
  }
}

const isWholeLines: Readonly<Record<Selected['kind'], boolean>> = {
  Letters: false,
  Lines: true,
  Block: false,
}

const paragraphObject = (include: boolean): Object => {
  const find = paragraph(include)
  return {
    find,
    pick: (buffer, selected, count) => {
      const { anchor, cursor, kind } = selected
      const more = (): Picked =>
        kept({
          anchor,
          cursor: moreParagraphs(buffer, selected, count, include),
        })
      return anchor.line === cursor.line
        ? Option.match(find(buffer, cursor, count), {
            onNone: () => kept(selected),
            onSome: ({ start, end }) =>
              isWholeLines[kind] && start.line === anchor.line
                ? more()
                : {
                    anchor: start.line === anchor.line ? anchor : start,
                    cursor: end,
                    kind: 'Lines',
                  },
          })
        : more()
    },
  }
}

const quoteObject = (quote: string, include: boolean): Object => {
  const find = quoted(quote, include)
  return {
    find: (buffer, from, count) =>
      Option.map(
        find(buffer, { anchor: from, cursor: from }, count),
        ({ anchor, cursor }) =>
          isBefore(cursor, anchor)
            ? { start: anchor, end: anchor, reach: 'Exclusive' }
            : { start: anchor, end: cursor, reach: 'Inclusive' },
      ),
    pick: (buffer, ends, count) =>
      Option.match(find(buffer, ends, count), {
        onNone: () => kept(ends),
        onSome: found => ({ ...found, kind: 'LettersOrBlock' }),
      }),
  }
}

const blockObject = (open: string, close: string, include: boolean): Object => {
  const find = block(open, close, include)
  return {
    find: (buffer, from, count) =>
      Option.map(
        find(buffer, { anchor: from, cursor: from }, count, 'FromCursor'),
        ({ start, end, endsAtLineStart }) =>
          include
            ? { start, end, reach: 'Inclusive' }
            : endsAtLineStart
              ? { start, end: incl(buffer, end).spot, reach: 'Exclusive' }
              : isBefore(end, start)
                ? { start, end: start, reach: 'Exclusive' }
                : { start, end, reach: 'Inclusive' },
      ),
    pick: (buffer, ends, count) =>
      Option.match(find(buffer, ends, count, 'FromSelection'), {
        onNone: () => kept(ends),
        onSome: ({ start, end, endsAtLineStart }) => ({
          anchor: start,
          cursor:
            endsAtLineStart && end.cell < cellsIn(buffer, end.line)
              ? inc(buffer, end).spot
              : end,
          kind: 'Letters',
        }),
      }),
  }
}

export const objects: Readonly<Record<ObjectName, Object>> = {
  InnerWord: wordObject(false, false),
  AWord: wordObject(true, false),
  InnerBigWord: wordObject(false, true),
  ABigWord: wordObject(true, true),
  InnerParagraph: paragraphObject(false),
  AParagraph: paragraphObject(true),
  InnerDoubleQuote: quoteObject('"', false),
  ADoubleQuote: quoteObject('"', true),
  InnerSingleQuote: quoteObject("'", false),
  ASingleQuote: quoteObject("'", true),
  InnerParen: blockObject('(', ')', false),
  AParen: blockObject('(', ')', true),
  InnerBracket: blockObject('[', ']', false),
  ABracket: blockObject('[', ']', true),
  InnerBrace: blockObject('{', '}', false),
  ABrace: blockObject('{', '}', true),
  InnerAngle: blockObject('<', '>', false),
  AAngle: blockObject('<', '>', true),
}
