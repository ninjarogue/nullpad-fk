import { Option, Schema } from 'effect'

import type * as Buffer from '../buffer'
import { cellAt, cellText } from './cells'
import {
  type Motion,
  MotionName,
  type Spot,
  type Want,
  cellsIn,
  classAt,
  decl,
  endOf,
  endOfWord,
  firstFilled,
  forwardWordStoppingAtLineEnd,
  inc,
  incl,
  lastLine,
  motionFails,
  motions,
  positionOf,
} from './motions'

export const Kind = Schema.Literals(['Charwise', 'Linewise'])
export type Kind = typeof Kind.Type

export const OperatorName = Schema.Literals(['Delete', 'Change', 'Yank'])
export type OperatorName = typeof OperatorName.Type

export type Range = Readonly<{
  from: Spot
  to: Spot
  kind: Kind
  inclusive: boolean
}>

export type Target = (
  buffer: Buffer.Buffer,
  from: Spot,
  count: number | undefined,
  want: Want,
) => Option.Option<Range>

type Reach = 'Exclusive' | 'Inclusive' | 'Linewise'

type Span = Readonly<{ start: Spot; end: Spot; reach: Reach }>

const isBefore = (a: Spot, b: Spot): boolean =>
  a.line < b.line || (a.line === b.line && a.cell < b.cell)

const ordered = (a: Spot, b: Spot, reach: Reach): Span =>
  isBefore(b, a) ? { start: b, end: a, reach } : { start: a, end: b, reach }

const cellIn = (buffer: Buffer.Buffer, { line, cell }: Spot): string => {
  const text = buffer.lines[line] ?? buffer.lines[0]
  return cell >= 0 && cell < cellsIn(buffer, line) ? cellText(text, cell) : ''
}

const inIndent = (buffer: Buffer.Buffer, spot: Spot, extra: number): boolean =>
  firstFilled(buffer, spot.line) >= spot.cell + extra

const wholeLines = (from: Spot, to: Spot): Range => ({
  from,
  to,
  kind: 'Linewise',
  inclusive: true,
})

const rangeOf = (buffer: Buffer.Buffer, { start, end, reach }: Span): Range => {
  if (reach === 'Linewise') {
    return wholeLines(start, end)
  }
  if (reach === 'Inclusive') {
    return {
      from: start,
      to: {
        line: end.line,
        cell: Math.min(end.cell + 1, cellsIn(buffer, end.line)),
      },
      kind: 'Charwise',
      inclusive: true,
    }
  }
  if (end.cell > 0 || end.line === start.line) {
    return { from: start, to: end, kind: 'Charwise', inclusive: false }
  }
  const above = end.line - 1
  return inIndent(buffer, start, 0)
    ? wholeLines(start, { line: above, cell: 0 })
    : {
        from: start,
        to: { line: above, cell: cellsIn(buffer, above) },
        kind: 'Charwise',
        inclusive: false,
      }
}

const reachOf: Readonly<Record<MotionName, Reach>> = {
  Left: 'Exclusive',
  Right: 'Exclusive',
  LeftAcrossLines: 'Exclusive',
  RightAcrossLines: 'Exclusive',
  Down: 'Linewise',
  Up: 'Linewise',
  WordForward: 'Exclusive',
  WordBackward: 'Exclusive',
  WordEnd: 'Inclusive',
  LineStart: 'Exclusive',
  FirstNonBlank: 'Exclusive',
  LineEnd: 'Inclusive',
  FirstLine: 'Linewise',
  LastLine: 'Linewise',
  LastLineEnd: 'Inclusive',
}

const ofMotion =
  (name: MotionName, motion: Motion = motions[name]): Target =>
  (buffer, from, count, want) =>
    motionFails(name, buffer, from, count)
      ? Option.none()
      : Option.some(
          rangeOf(
            buffer,
            ordered(
              from,
              motion(buffer, from, count, want).spot,
              reachOf[name],
            ),
          ),
        )

const rightward: Target = (buffer, from, count = 1) =>
  Option.some(
    rangeOf(buffer, {
      start: from,
      end: {
        line: from.line,
        cell: Math.min(cellsIn(buffer, from.line), from.cell + count),
      },
      reach: 'Exclusive',
    }),
  )

const wordForward: Target = (buffer, from, count = 1) =>
  Option.some(
    rangeOf(buffer, {
      start: from,
      end: forwardWordStoppingAtLineEnd(buffer, from, count, false).spot,
      reach: 'Exclusive',
    }),
  )

const toWordEnd =
  (stayOnEnd: boolean): Target =>
  (buffer, from, count = 1) =>
    Option.some(
      rangeOf(buffer, {
        start: from,
        end: endOfWord(buffer, from, count, {
          stayOnEnd,
          stopAtEmptyLine: false,
          big: false,
        }).spot,
        reach: 'Inclusive',
      }),
    )

const wordEndStay: Target = (buffer, from, count, want) =>
  classAt(buffer, from, false) === 'Blank'
    ? wordForward(buffer, from, count, want)
    : toWordEnd(true)(buffer, from, count, want)

const isNoteStart = (spot: Spot): boolean => spot.line === 0 && spot.cell === 0

const wordBackward: Target = (buffer, from, count = 1) => {
  let spot = from
  for (let left = count; left > 0; left -= 1) {
    if (isNoteStart(spot)) {
      return Option.none()
    }
    spot = motions.WordBackward(buffer, spot, 1, 'Unset').spot
    if (isNoteStart(spot) && cellsIn(buffer, 0) > 0) {
      break
    }
  }
  return Option.some(
    rangeOf(buffer, { start: spot, end: from, reach: 'Exclusive' }),
  )
}

const lines: Target = (buffer, from, count = 1) =>
  count > 1 && from.line === lastLine(buffer)
    ? Option.none()
    : Option.some(
        wholeLines(from, {
          line: Math.min(lastLine(buffer), from.line + count - 1),
          cell: 0,
        }),
      )

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

const wordObject =
  (include: boolean, big: boolean): Target =>
  (buffer, from, count = 1) => {
    const isBlank = (spot: Spot) => classAt(buffer, spot, big) === 'Blank'
    const toEnd = (spot: Spot) =>
      endOfWord(buffer, spot, 1, {
        stayOnEnd: true,
        stopAtEmptyLine: true,
        big,
      })
    const start = backInLine(buffer, from, big)
    let end = start
    let includeWhite = false
    let inclusive = true
    if (isBlank(start) === include) {
      const walked = toEnd(start)
      if (walked.failed) {
        return Option.none()
      }
      end = walked.spot
    } else {
      end = forwardWordStoppingAtLineEnd(buffer, start, 1, big).spot
      end =
        end.cell === 0
          ? decl(buffer, end).spot
          : { line: end.line, cell: end.cell - 1 }
      includeWhite = include
    }
    for (let left = count - 1; left > 0; left -= 1) {
      inclusive = true
      const stepped = incl(buffer, end)
      if (stepped.crossing === 'Stuck') {
        return Option.none()
      }
      end = stepped.spot
      if (include !== isBlank(end)) {
        const walked = forwardWordStoppingAtLineEnd(buffer, end, 1, big)
        if (walked.failed && left > 1) {
          return Option.none()
        }
        end = walked.spot
        if (end.cell === 0) {
          inclusive = false
        } else {
          end = { line: end.line, cell: end.cell - 1 }
        }
      } else {
        const walked = toEnd(end)
        if (walked.failed) {
          return Option.none()
        }
        end = walked.spot
      }
    }
    const widened =
      includeWhite &&
      (!isBlank(end) || (end.cell === 0 && !inclusive)) &&
      start.cell > 0
        ? backInLine(buffer, { line: start.line, cell: start.cell - 1 }, big)
        : start
    return Option.some(
      rangeOf(buffer, {
        start: isBlank(widened) && widened.cell > 0 ? widened : start,
        end,
        reach: inclusive ? 'Inclusive' : 'Exclusive',
      }),
    )
  }

const isWhiteLine = (buffer: Buffer.Buffer, line: number): boolean =>
  firstFilled(buffer, line) >= cellsIn(buffer, line)

const paragraphObject =
  (include: boolean): Target =>
  (buffer, from, count = 1) => {
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
    return Option.some(
      wholeLines({ line: start, cell: 0 }, { line: end, cell: 0 }),
    )
  }

const quoteObject =
  (quote: string, include: boolean): Target =>
  (buffer, from, count = 1) => {
    const { line } = from
    const cells = cellsIn(buffer, line)
    const textAt = (cell: number) => cellIn(buffer, { line, cell })
    const isWhite = (cell: number) =>
      textAt(cell) === ' ' || textAt(cell) === '\t'
    const nextQuote = (cell: number): number => {
      let at = cell
      while (at < cells && textAt(at) !== quote) {
        at += 1
      }
      return at < cells ? at : -1
    }
    const quotesAround = (): Option.Option<readonly [number, number]> => {
      if (textAt(from.cell) === quote) {
        let open = nextQuote(0)
        while (open >= 0 && open <= from.cell) {
          const close = nextQuote(open + 1)
          if (close < 0) {
            return Option.none()
          }
          if (from.cell <= close) {
            return Option.some([open, close])
          }
          open = nextQuote(close + 1)
        }
        return Option.none()
      }
      let before = from.cell
      while (before > 0) {
        before -= 1
        if (textAt(before) === quote) {
          break
        }
      }
      const open = textAt(before) === quote ? before : nextQuote(before)
      const close = open < 0 ? -1 : nextQuote(open + 1)
      return close < 0 ? Option.none() : Option.some([open, close])
    }
    return Option.map(quotesAround(), ([open, close]) => {
      let start = open
      let end = close
      if (include && isWhite(end + 1)) {
        while (isWhite(end + 1)) {
          end += 1
        }
      } else if (include) {
        while (start > 0 && isWhite(start - 1)) {
          start -= 1
        }
      }
      const takesQuotes = include || count > 1
      return rangeOf(buffer, {
        start: { line, cell: takesQuotes ? start : start + 1 },
        end: { line, cell: end },
        reach: takesQuotes ? 'Inclusive' : 'Exclusive',
      })
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

const blockObject =
  (open: string, close: string, include: boolean): Target =>
  (buffer, from, count = 1) => {
    let cursor = from
    while (open === '{' && inIndent(buffer, cursor, 1)) {
      const stepped = inc(buffer, cursor)
      cursor = stepped.spot
      if (stepped.crossing !== 'InLine') {
        break
      }
    }
    if (cellIn(buffer, cursor) === open) {
      cursor = { line: cursor.line, cell: cursor.cell + 1 }
    }
    const direction = Option.isSome(
      unmatched(buffer, cursor, 'Backward', open, close),
    )
      ? 'Backward'
      : 'Forward'
    const opening = repeatedSearch(cursor, count, spot =>
      unmatched(buffer, spot, direction, open, close),
    )
    return Option.flatMap(opening, start =>
      Option.map(unmatched(buffer, start, 'Forward', close, open), end => {
        if (include) {
          return rangeOf(buffer, { start, end, reach: 'Inclusive' })
        }
        const innerStart = incl(buffer, start).spot
        let atLineStart = end.cell === 0
        let innerEnd = decl(buffer, end).spot
        while (inIndent(buffer, innerEnd, 1)) {
          atLineStart = true
          const stepped = decl(buffer, innerEnd)
          innerEnd = stepped.spot
          if (stepped.crossing !== 'InLine') {
            break
          }
        }
        return atLineStart
          ? rangeOf(buffer, {
              start: innerStart,
              end: incl(buffer, innerEnd).spot,
              reach: 'Exclusive',
            })
          : isBefore(innerEnd, innerStart)
            ? rangeOf(buffer, {
                start: innerStart,
                end: innerStart,
                reach: 'Exclusive',
              })
            : rangeOf(buffer, {
                start: innerStart,
                end: innerEnd,
                reach: 'Inclusive',
              })
      }),
    )
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
])
export type ObjectName = typeof ObjectName.Type

export const TargetName = Schema.Union([
  MotionName,
  ObjectName,
  Schema.Literal('Lines'),
])
export type TargetName = typeof TargetName.Type

const targets: Readonly<Record<TargetName, Target>> = {
  Left: ofMotion('Left'),
  Right: rightward,
  LeftAcrossLines: ofMotion('Left'),
  RightAcrossLines: rightward,
  Down: ofMotion('Down'),
  Up: ofMotion('Up'),
  WordForward: wordForward,
  WordBackward: wordBackward,
  WordEnd: toWordEnd(false),
  LineStart: ofMotion('LineStart'),
  FirstNonBlank: ofMotion('FirstNonBlank'),
  LineEnd: ofMotion('LineEnd'),
  FirstLine: ofMotion('FirstLine'),
  LastLine: ofMotion('LastLine'),
  LastLineEnd: ofMotion('LastLineEnd'),
  Lines: lines,
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
}

const restIsBlank = (buffer: Buffer.Buffer, range: Range): boolean =>
  /^[ \t]*$/u.test(
    (buffer.lines[range.to.line] ?? buffer.lines[0]).text.slice(
      positionOf(buffer, range.to).column,
    ),
  )

const linewiseWhenBlankAround = (buffer: Buffer.Buffer, range: Range): Range =>
  range.kind === 'Charwise' &&
  range.to.line > range.from.line &&
  restIsBlank(buffer, range) &&
  inIndent(buffer, range.from, 0)
    ? { ...range, kind: 'Linewise' }
    : range

export const targetFor = (operator: OperatorName, name: TargetName): Target => {
  const target =
    operator === 'Change' && name === 'WordForward'
      ? wordEndStay
      : targets[name]
  return operator === 'Delete'
    ? (buffer, from, count, want) =>
        Option.map(target(buffer, from, count, want), range =>
          linewiseWhenBlankAround(buffer, range),
        )
    : target
}
