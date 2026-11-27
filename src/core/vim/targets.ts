import { Option, Schema } from 'effect'

import type * as Buffer from '../buffer'
import { cellCount } from './cells'
import {
  type Motion,
  MotionName,
  type Spot,
  type Want,
  cellsIn,
  classAt,
  endOfWord,
  forwardWordStoppingAtLineEnd,
  lastLine,
  motionFails,
  motions,
  positionOf,
} from './motions'
import {
  ObjectName,
  type Reach,
  type Span,
  inIndent,
  isBefore,
  objects,
} from './objects'
import type { Landing } from './seek'

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

export const byKind = <A>(
  range: Range,
  cases: Readonly<Record<Kind, () => A>>,
): A => cases[range.kind]()

export type Target = (
  buffer: Buffer.Buffer,
  from: Spot,
  count: number | undefined,
  want: Want,
) => Option.Option<Range>

const ordered = (a: Spot, b: Spot, reach: Reach): Span =>
  isBefore(b, a) ? { start: b, end: a, reach } : { start: a, end: b, reach }

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
  FirstColumn: 'Exclusive',
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

export const TargetName = Schema.Union([
  MotionName,
  ObjectName,
  Schema.Literal('Lines'),
])
export type TargetName = typeof TargetName.Type

const ofObject =
  (name: ObjectName): Target =>
  (buffer, from, count = 1) =>
    Option.map(objects[name].find(buffer, from, count), span =>
      rangeOf(buffer, span),
    )

export const isObject = Schema.is(ObjectName)

const targets: Readonly<Record<Exclude<TargetName, ObjectName>, Target>> = {
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
  FirstColumn: ofMotion('FirstColumn'),
  FirstNonBlank: ofMotion('FirstNonBlank'),
  LineEnd: ofMotion('LineEnd'),
  FirstLine: ofMotion('FirstLine'),
  LastLine: ofMotion('LastLine'),
  LastLineEnd: ofMotion('LastLineEnd'),
  Lines: lines,
}

const restIsBlank = (buffer: Buffer.Buffer, range: Range): boolean =>
  /^[ \t]*$/u.test(
    (buffer.lines[range.to.line] ?? buffer.lines[0]).text.slice(
      positionOf(buffer, range.to).column,
    ),
  )

const linewiseWhenBlankAround = (buffer: Buffer.Buffer, range: Range): Range =>
  byKind(range, {
    Charwise: () =>
      range.to.line > range.from.line &&
      restIsBlank(buffer, range) &&
      inIndent(buffer, range.from, 0)
        ? { ...range, kind: 'Linewise' }
        : range,
    Linewise: () => range,
  })

export const targetFor = (operator: OperatorName, name: TargetName): Target => {
  const target =
    operator === 'Change' && name === 'WordForward'
      ? wordEndStay
      : isObject(name)
        ? ofObject(name)
        : targets[name]
  return operator === 'Delete'
    ? (buffer, from, count, want) =>
        Option.map(target(buffer, from, count, want), range =>
          linewiseWhenBlankAround(buffer, range),
        )
    : target
}

const beforeLineBreak = (buffer: Buffer.Buffer, spot: Spot): Spot => {
  const line = buffer.lines[spot.line]
  return line !== undefined && spot.cell > 0 && spot.cell >= cellCount(line)
    ? { ...spot, cell: cellCount(line) - 1 }
    : spot
}

export const rangeToLanding = (
  operator: OperatorName,
  buffer: Buffer.Buffer,
  from: Spot,
  { spot, reach }: Landing,
): Range => {
  const range = rangeOf(
    buffer,
    ordered(
      from,
      reach === 'Linewise' ? spot : beforeLineBreak(buffer, spot),
      reach,
    ),
  )
  return operator === 'Delete' ? linewiseWhenBlankAround(buffer, range) : range
}
