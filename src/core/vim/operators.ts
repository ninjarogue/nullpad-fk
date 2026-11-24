import { Array, Option, Schema } from 'effect'

import * as Buffer from '../buffer'
import { cellAt, cellStart } from './cells'
import { cellsIn, endOf, firstNonBlank, positionOf, spotOf } from './motions'
import { Kind, type Range, isInIndent } from './targets'

export const OperatorName = Schema.Literals(['Delete', 'Change', 'Yank'])
export type OperatorName = typeof OperatorName.Type

export const Register = Schema.Struct({ text: Schema.String, kind: Kind })
export type Register = typeof Register.Type

export const Registers = Schema.Struct({
  unnamed: Schema.Option(Register),
  yank: Schema.Option(Register),
})
export type Registers = typeof Registers.Type

export const noRegisters: Registers = {
  unnamed: Option.none(),
  yank: Option.none(),
}

export const Side = Schema.Literals(['Before', 'After'])
export type Side = typeof Side.Type

export type Applied = Readonly<{
  buffer: Buffer.Buffer
  inserting: boolean
  registers: Registers
}>

const lineText = (buffer: Buffer.Buffer, line: number): string =>
  (buffer.lines[line] ?? buffer.lines[0]).text

const textsBetween = (
  buffer: Buffer.Buffer,
  first: number,
  last: number,
): ReadonlyArray<string> =>
  Array.map(buffer.lines.slice(first, last + 1), line => line.text)

const registerOf = (buffer: Buffer.Buffer, range: Range): Register => {
  if (range.kind === 'Linewise') {
    return {
      text: `${textsBetween(buffer, range.from.line, range.to.line).join('\n')}\n`,
      kind: 'Linewise',
    }
  }
  const from = positionOf(buffer, range.from)
  const to = positionOf(buffer, range.to)
  return {
    text:
      from.line === to.line
        ? lineText(buffer, from.line).slice(from.column, to.column)
        : [
            lineText(buffer, from.line).slice(from.column),
            ...textsBetween(buffer, from.line + 1, to.line - 1),
            lineText(buffer, to.line).slice(0, to.column),
          ].join('\n'),
    kind: 'Charwise',
  }
}

const isEmpty = (buffer: Buffer.Buffer, range: Range): boolean => {
  const from = positionOf(buffer, range.from)
  const to = positionOf(buffer, range.to)
  return (
    (buffer.lines.length === 1 && buffer.lines[0].text === '') ||
    (range.kind === 'Charwise' &&
      from.line === to.line &&
      from.column === to.column)
  )
}

const restIsBlank = (buffer: Buffer.Buffer, range: Range): boolean =>
  /^[ \t]*$/u.test(
    lineText(buffer, range.to.line).slice(positionOf(buffer, range.to).column),
  )

const linewiseWhenBlankAround = (buffer: Buffer.Buffer, range: Range): Range =>
  range.kind === 'Charwise' &&
  range.to.line > range.from.line &&
  restIsBlank(buffer, range) &&
  isInIndent(buffer, range.from)
    ? { ...range, kind: 'Linewise' }
    : range

const atFirstNonBlank = (buffer: Buffer.Buffer, line: number): Buffer.Buffer =>
  Buffer.moveTo(
    buffer,
    positionOf(buffer, { line, cell: firstNonBlank(buffer, line) }),
  )

const remove = (buffer: Buffer.Buffer, range: Range): Buffer.Buffer => {
  if (range.kind === 'Charwise') {
    return Buffer.erase(
      buffer,
      positionOf(buffer, range.from),
      positionOf(buffer, range.to),
    )
  }
  const removed = Buffer.removeLines(buffer, range.from.line, range.to.line)
  return atFirstNonBlank(removed, removed.caret.line)
}

const emptyLine = (buffer: Buffer.Buffer, range: Range): Buffer.Buffer => {
  const { line } = range.from
  const kept = Buffer.removeLines(buffer, line + 1, range.to.line)
  return Buffer.erase(
    kept,
    { line, column: 0 },
    { line, column: Buffer.lineEnd(kept, line) },
  )
}

const remembered = (
  registers: Registers,
  register: Register,
  isYank: boolean,
): Registers => ({
  unnamed: Option.some(register),
  yank: isYank ? Option.some(register) : registers.yank,
})

const toStart = (buffer: Buffer.Buffer, range: Range): Buffer.Buffer =>
  Buffer.moveTo(buffer, positionOf(buffer, range.from))

export const operators: Readonly<
  Record<
    OperatorName,
    (buffer: Buffer.Buffer, range: Range, registers: Registers) => Applied
  >
> = {
  Delete: (buffer, picked, registers) => {
    const range = linewiseWhenBlankAround(buffer, picked)
    return isEmpty(buffer, range)
      ? { buffer: toStart(buffer, range), inserting: false, registers }
      : {
          buffer: remove(buffer, range),
          inserting: false,
          registers: remembered(registers, registerOf(buffer, range), false),
        }
  },
  Change: (buffer, range, registers) =>
    isEmpty(buffer, range)
      ? { buffer: toStart(buffer, range), inserting: true, registers }
      : {
          buffer:
            range.kind === 'Linewise'
              ? emptyLine(buffer, range)
              : remove(buffer, range),
          inserting: true,
          registers: remembered(registers, registerOf(buffer, range), false),
        },
  Yank: (buffer, range, registers) => ({
    buffer: toStart(buffer, range),
    inserting: false,
    registers: remembered(registers, registerOf(buffer, range), true),
  }),
}

const linesOf = (text: string): Array.NonEmptyReadonlyArray<string> => {
  const [first = '', ...rest] = text.split('\n')
  return [first, ...rest]
}

const lastCellBefore = (buffer: Buffer.Buffer): Buffer.Position => {
  const { line, column } = buffer.caret
  const text = buffer.lines[line] ?? buffer.lines[0]
  return { line, column: cellStart(text, cellAt(text, column - 1)) }
}

export const put = (
  buffer: Buffer.Buffer,
  register: Register,
  side: Side,
  count: number,
): Buffer.Buffer => {
  if (register.kind === 'Linewise') {
    const at = buffer.caret.line + (side === 'After' ? 1 : 0)
    const added = Buffer.insertLines(
      buffer,
      at,
      linesOf(register.text.repeat(count).slice(0, -1)),
    )
    return atFirstNonBlank(added, at)
  }
  if (register.text === '') {
    return buffer
  }
  const spot = spotOf(buffer)
  const at =
    side === 'After' && cellsIn(buffer, spot.line) > 0
      ? endOf(buffer, spot)
      : positionOf(buffer, spot)
  const text = register.text.repeat(count)
  const added = Buffer.insert(Buffer.moveTo(buffer, at), text)
  return Buffer.moveTo(added, text.includes('\n') ? at : lastCellBefore(added))
}
