import { Array, Option, Schema } from 'effect'

import * as Buffer from '../buffer'
import {
  cellAt,
  cellCount,
  cellEnd,
  cellStart,
  cellText,
  lastScreenColumnOf,
  screenColumnOf,
  stopAtScreenColumn,
  widthOfLetter,
} from './cells'
import { cellsIn, endOf, firstNonBlank, positionOf, spotOf } from './motions'
import {
  type Block,
  type Cut,
  type CutLetter,
  cutOf,
  cutsOf,
  widthOf,
} from './selection'
import { type OperatorName, type Range, byKind } from './targets'

export const Register = Schema.TaggedUnion({
  Charwise: { text: Schema.String },
  Linewise: { text: Schema.String },
  Blockwise: { text: Schema.String, width: Schema.Int },
})
export type Register = typeof Register.Type

const rowsOf = (text: string): ReadonlyArray<string> => text.split('\n')

const rectangle = (rows: ReadonlyArray<string>, width: number): Register => ({
  _tag: 'Blockwise',
  text: rows.join('\n'),
  width,
})

export const letters = (text: string): Register => ({ _tag: 'Charwise', text })

export const wholeLines = (text: string): Register => ({
  _tag: 'Linewise',
  text,
})

export const Registers = Schema.Struct({
  unnamed: Schema.Option(Register),
  yank: Schema.Option(Register),
  named: Schema.Record(Schema.String, Register),
})
export type Registers = typeof Registers.Type

export const noRegisters: Registers = {
  unnamed: Option.none(),
  yank: Option.none(),
  named: {},
}

export const RegisterName = Schema.TaggedUnion({
  Default: {},
  Unnamed: {},
  Yank: {},
  Letter: { letter: Schema.String, appends: Schema.Boolean },
  BlackHole: {},
  Clipboard: {},
})
export type RegisterName = typeof RegisterName.Type

export const defaultRegister = RegisterName.cases.Default.make({})

export const clipboardRegister = RegisterName.cases.Clipboard.make({})

const registersBySign: Readonly<Record<string, RegisterName>> = {
  '"': RegisterName.cases.Unnamed.make({}),
  '0': RegisterName.cases.Yank.make({}),
  _: RegisterName.cases.BlackHole.make({}),
  '+': clipboardRegister,
  '*': clipboardRegister,
}

export const registerNamed = (key: string): Option.Option<RegisterName> => {
  if (/^[a-zA-Z]$/u.test(key)) {
    const letter = key.toLowerCase()
    return Option.some(
      RegisterName.cases.Letter.make({ letter, appends: key !== letter }),
    )
  }
  return Option.fromUndefinedOr(registersBySign[key])
}

export type Source =
  | Readonly<{ _tag: 'Held'; register: Option.Option<Register> }>
  | Readonly<{ _tag: 'Clipboard' }>

const held = (register: Option.Option<Register>): Source => ({
  _tag: 'Held',
  register,
})

export const registerFor = (registers: Registers, name: RegisterName): Source =>
  RegisterName.match(name, {
    Default: () => held(registers.unnamed),
    Unnamed: () => held(registers.unnamed),
    Yank: () => held(registers.yank),
    Letter: ({ letter }) =>
      held(Option.fromUndefinedOr(registers.named[letter])),
    BlackHole: () => held(Option.none()),
    Clipboard: (): Source => ({ _tag: 'Clipboard' }),
  })

export const fromClipboard = (text: string): Register => {
  const unixText = text.replace(/\r\n?/gu, '\n')
  return unixText.endsWith('\n') ? wholeLines(unixText) : letters(unixText)
}

const appended = (old: Register, added: Register): Register =>
  Register.match(old, {
    Charwise: () =>
      Register.match(added, {
        Charwise: () => letters(old.text + added.text),
        Linewise: () => wholeLines(`${old.text}\n${added.text}`),
        Blockwise: () => letters(old.text + added.text),
      }),
    Linewise: () =>
      Register.match(added, {
        Charwise: () => wholeLines(`${old.text}${added.text}\n`),
        Linewise: () => wholeLines(old.text + added.text),
        Blockwise: () => wholeLines(`${old.text}${added.text}\n`),
      }),
    Blockwise: ({ width }) =>
      Register.match(added, {
        Charwise: () =>
          rectangle([...rowsOf(old.text), ...rowsOf(added.text)], width),
        Linewise: () => wholeLines(`${old.text}\n${added.text}`),
        Blockwise: () =>
          rectangle([...rowsOf(old.text), ...rowsOf(added.text)], width),
      }),
  })

export type Remembered = Readonly<{
  registers: Registers
  clipboard: Option.Option<string>
}>

const remembered = (
  registers: Registers,
  name: RegisterName,
  register: Register,
  isYank: boolean,
): Remembered => {
  const kept = (changed: Partial<Registers>): Remembered => ({
    registers: { ...registers, ...changed },
    clipboard: Option.none(),
  })
  const both = { unnamed: Option.some(register), yank: Option.some(register) }
  return RegisterName.match(name, {
    Default: () => kept(isYank ? both : { unnamed: Option.some(register) }),
    Unnamed: () => kept(both),
    Yank: () => kept(both),
    Letter: ({ letter, appends }) => {
      const old = registers.named[letter]
      const whole =
        appends && old !== undefined ? appended(old, register) : register
      return kept({
        unnamed: Option.some(whole),
        named: { ...registers.named, [letter]: whole },
      })
    },
    BlackHole: () => kept({}),
    Clipboard: () => ({
      ...kept({ unnamed: Option.some(register) }),
      clipboard: Option.some(register.text),
    }),
  })
}

export const Side = Schema.Literals(['Before', 'After'])
export type Side = typeof Side.Type

export type Applied = Remembered &
  Readonly<{ buffer: Buffer.Buffer; inserting: boolean }>

const lineText = (buffer: Buffer.Buffer, line: number): string =>
  (buffer.lines[line] ?? buffer.lines[0]).text

const textsBetween = (
  buffer: Buffer.Buffer,
  first: number,
  last: number,
): ReadonlyArray<string> =>
  Array.map(buffer.lines.slice(first, last + 1), line => line.text)

const registerOf = (buffer: Buffer.Buffer, range: Range): Register =>
  byKind(range, {
    Linewise: () =>
      wholeLines(
        `${textsBetween(buffer, range.from.line, range.to.line).join('\n')}\n`,
      ),
    Charwise: () => {
      const from = positionOf(buffer, range.from)
      const to = positionOf(buffer, range.to)
      return letters(
        from.line === to.line
          ? lineText(buffer, from.line).slice(from.column, to.column)
          : [
              lineText(buffer, from.line).slice(from.column),
              ...textsBetween(buffer, from.line + 1, to.line - 1),
              lineText(buffer, to.line).slice(0, to.column),
            ].join('\n'),
      )
    },
  })

const isOneEmptyLine = (buffer: Buffer.Buffer): boolean =>
  buffer.lines.length === 1 && buffer.lines[0].text === ''

const coversNothing = (buffer: Buffer.Buffer, range: Range): boolean =>
  byKind(range, {
    Charwise: () => {
      const from = positionOf(buffer, range.from)
      const to = positionOf(buffer, range.to)
      return from.line === to.line && from.column === to.column
    },
    Linewise: () => false,
  })

const atFirstNonBlank = (buffer: Buffer.Buffer, line: number): Buffer.Buffer =>
  Buffer.moveTo(
    buffer,
    positionOf(buffer, { line, cell: firstNonBlank(buffer, line) }),
  )

const remove = (buffer: Buffer.Buffer, range: Range): Buffer.Buffer =>
  byKind(range, {
    Charwise: () =>
      Buffer.erase(
        buffer,
        positionOf(buffer, range.from),
        positionOf(buffer, range.to),
      ),
    Linewise: () => {
      const removed = Buffer.removeLines(buffer, range.from.line, range.to.line)
      return atFirstNonBlank(removed, removed.caret.line)
    },
  })

const emptyLine = (buffer: Buffer.Buffer, range: Range): Buffer.Buffer => {
  const { line } = range.from
  if (range.to.line === line && lineText(buffer, line) === '') {
    return Buffer.moveTo(buffer, { line, column: 0 })
  }
  const kept = Buffer.removeLines(buffer, line + 1, range.to.line)
  return Buffer.erase(
    kept,
    { line, column: 0 },
    { line, column: Buffer.lineEnd(kept, line) },
  )
}

const toStart = (buffer: Buffer.Buffer, range: Range): Buffer.Buffer =>
  Buffer.moveTo(buffer, positionOf(buffer, range.from))

export const operators: Readonly<
  Record<
    OperatorName,
    (
      buffer: Buffer.Buffer,
      range: Range,
      registers: Registers,
      name: RegisterName,
    ) => Applied
  >
> = {
  Delete: (buffer, range, registers, name) =>
    isOneEmptyLine(buffer) || coversNothing(buffer, range)
      ? {
          buffer: toStart(buffer, range),
          inserting: false,
          registers,
          clipboard: Option.none(),
        }
      : {
          buffer: remove(buffer, range),
          inserting: false,
          ...remembered(registers, name, registerOf(buffer, range), false),
        },
  Change: (buffer, range, registers, name) => {
    const isNothing = coversNothing(buffer, range)
    if (isOneEmptyLine(buffer) || (isNothing && !range.inclusive)) {
      return {
        buffer: toStart(buffer, range),
        inserting: true,
        registers,
        clipboard: Option.none(),
      }
    }
    return {
      buffer: isNothing
        ? toStart(buffer, range)
        : byKind(range, {
            Linewise: () => emptyLine(buffer, range),
            Charwise: () => remove(buffer, range),
          }),
      inserting: true,
      ...remembered(registers, name, registerOf(buffer, range), false),
    }
  },
  Yank: (buffer, range, registers, name) => ({
    buffer: toStart(buffer, range),
    inserting: false,
    ...remembered(registers, name, registerOf(buffer, range), true),
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

const maxPutUnits = 4_000_000

const maxPutUnitsOnOneLine = 50_000

const maxPutLines = 200_000

export const boundedCount = (register: Register, count: number): number => {
  const lines = register.text.split('\n').length - 1
  const within = (units: number): number =>
    Math.min(
      Math.floor(units / Math.max(1, register.text.length)),
      lines === 0 ? count : Math.floor(maxPutLines / lines),
    )
  return Math.max(
    1,
    Math.min(
      count,
      Register.match(register, {
        Charwise: () =>
          within(lines === 0 ? maxPutUnitsOnOneLine : maxPutUnits),
        Linewise: () => within(maxPutUnits),
        Blockwise: ({ width }) =>
          Math.min(
            Math.floor(maxPutUnitsOnOneLine / Math.max(1, width)),
            Math.floor(maxPutUnits / Math.max(1, (lines + 1) * width)),
          ),
      }),
    ),
  )
}

export type Placed = Readonly<{
  buffer: Buffer.Buffer
  first: Buffer.Position
  last: Buffer.Position
}>

const utf8Units = (codePoint: number): number =>
  codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4

const columnsVimCounts = (row: string): number =>
  Array.reduce(
    Array.fromIterable(row),
    0,
    (sum, letter) =>
      sum +
      widthOfLetter(letter) +
      4 * (utf8Units(letter.codePointAt(0) ?? 0) - 1),
  )

type Landed = Readonly<{ rewrite: Buffer.Rewrite; column: number }>

const putRow = (
  line: Buffer.Line,
  number: number,
  column: number,
  row: string,
  pad: string,
  times: number,
): Landed => {
  const stop = stopAtScreenColumn(line, column)
  const atLineEnd = stop.cell === cellCount(line)
  const isShort = stop.column < column || (stop.column === column && atLineEnd)
  const body = (row + pad).repeat(times - 1) + row + (isShort ? '' : pad)
  const end = line.text.length
  if (stop.column < column) {
    const spaces = column - stop.column
    return {
      rewrite: {
        line: number,
        from: end,
        to: end,
        text: ' '.repeat(spaces) + body,
      },
      column: end + spaces,
    }
  }
  if (stop.column === column) {
    const at = cellStart(line, stop.cell)
    return {
      rewrite: { line: number, from: at, to: at, text: body },
      column: at,
    }
  }
  const letter = stop.cell - 1
  const from = cellStart(line, letter)
  const after = stop.column - column
  const before = stop.stepped - after
  return cellText(line, letter) === '\t'
    ? {
        rewrite: {
          line: number,
          from,
          to: cellEnd(line, letter),
          text: ' '.repeat(before) + body + ' '.repeat(after),
        },
        column: from + before,
      }
    : {
        rewrite: {
          line: number,
          from,
          to: from,
          text: ' '.repeat(before) + body,
        },
        column: from + before,
      }
}

const lineToCome: Buffer.Line = {
  id: Buffer.LineId.make(-1),
  text: '',
  joins: [],
}

const putRows = (
  buffer: Buffer.Buffer,
  register: Readonly<{ text: string; width: number }>,
  side: Side,
  count: number,
): Placed => {
  const { caret } = buffer
  const text = buffer.lines[caret.line] ?? buffer.lines[0]
  const cell = cellAt(text, caret.column)
  const column =
    side === 'After' && cellCount(text) > 0
      ? lastScreenColumnOf(text, cell) + 1
      : screenColumnOf(text, cell)
  const times = boundedCount({ _tag: 'Blockwise', ...register }, count)
  const landed = Array.map(rowsOf(register.text), (row, index) =>
    putRow(
      buffer.lines[caret.line + index] ?? lineToCome,
      caret.line + index,
      column,
      row,
      ' '.repeat(Math.max(0, register.width - columnsVimCounts(row))),
      times,
    ),
  )
  const kept = Array.filter(
    landed,
    ({ rewrite }) => rewrite.line < buffer.lines.length,
  )
  const added = Buffer.rewrite(
    buffer,
    Array.map(kept, ({ rewrite }) => rewrite),
    Array.map(landed.slice(kept.length), ({ rewrite }) => rewrite.text),
  )
  const first = landed[0]
  const last = landed[landed.length - 1]
  const at = { line: caret.line, column: first?.column ?? caret.column }
  return {
    buffer: Buffer.moveTo(added, at),
    first: at,
    last:
      last === undefined
        ? at
        : {
            line: last.rewrite.line,
            column: Math.max(
              0,
              last.rewrite.from + last.rewrite.text.length - 1,
            ),
          },
  }
}

export const put = (
  buffer: Buffer.Buffer,
  register: Register,
  side: Side,
  count: number,
): Buffer.Buffer => {
  const times = boundedCount(register, count)
  return Register.match(register, {
    Linewise: ({ text }) => {
      const at = buffer.caret.line + (side === 'After' ? 1 : 0)
      const once = linesOf(text.slice(0, -1))
      const added = Buffer.insertLines(
        buffer,
        at,
        Array.flatten(Array.replicate(once, times)),
      )
      return atFirstNonBlank(added, at)
    },
    Charwise: ({ text: once }) => {
      if (once === '') {
        return buffer
      }
      const spot = spotOf(buffer)
      const at =
        side === 'After' && cellsIn(buffer, spot.line) > 0
          ? endOf(buffer, spot)
          : positionOf(buffer, spot)
      const text = once.repeat(times)
      const added = Buffer.insert(Buffer.moveTo(buffer, at), text)
      return Buffer.moveTo(
        added,
        text.includes('\n') ? at : lastCellBefore(added),
      )
    },
    Blockwise: rows => putRows(buffer, rows, side, count).buffer,
  })
}

const lettersAt = (
  after: Buffer.Buffer,
  at: Buffer.Position,
  once: string,
  times: number,
): Placed => {
  if (once === '') {
    return { buffer: after, first: at, last: at }
  }
  const text = once.repeat(times)
  const added = Buffer.insert(Buffer.moveTo(after, at), text)
  const last = lastCellBefore(added)
  return {
    buffer: Buffer.moveTo(added, text.includes('\n') ? at : last),
    first: at,
    last,
  }
}

type Rested = Readonly<{ column: number; isPastHome: boolean }>

const restingAt = (
  buffer: Buffer.Buffer,
  line: number,
  home: number,
  column: number,
): Rested => {
  const text = buffer.lines[line] ?? buffer.lines[0]
  const cells = cellCount(text)
  const rested =
    cells === 0
      ? 0
      : column >= text.text.length
        ? cellStart(text, cells - 1)
        : column
  return { column: rested, isPastHome: cells > 0 && home > rested }
}

const landingOf = (
  buffer: Buffer.Buffer,
  line: number,
  home: number,
  column: number,
): number => {
  const rested = restingAt(buffer, line, home, column)
  const text = buffer.lines[line] ?? buffer.lines[0]
  return rested.isPastHome
    ? cellEnd(text, cellAt(text, rested.column))
    : rested.column
}

const lastLetterOf = (buffer: Buffer.Buffer, line: number): Buffer.Position =>
  positionOf(buffer, { line, cell: Math.max(0, cellsIn(buffer, line) - 1) })

export const putOver = (
  before: Buffer.Buffer,
  after: Buffer.Buffer,
  range: Range,
  register: Register,
  count: number,
): Placed => {
  const times = boundedCount(register, count)
  const at = positionOf(before, range.from)
  const onLinesOfTheirOwn = (
    once: Array.NonEmptyReadonlyArray<string>,
  ): Placed => {
    const lines = Array.flatten(Array.replicate(once, times))
    const first = byKind(range, {
      Linewise: () => at.line,
      Charwise: () => at.line + 1,
    })
    const added = byKind(range, {
      Linewise: () => Buffer.insertLines(after, first, lines),
      Charwise: () =>
        Buffer.insert(Buffer.moveTo(after, at), `\n${lines.join('\n')}\n`),
    })
    const leftover = added.lines.length - 1
    const removedAll = byKind(range, {
      Linewise: () =>
        range.to.line - range.from.line + 1 === before.lines.length,
      Charwise: () => false,
    })
    return {
      buffer: atFirstNonBlank(
        removedAll ? Buffer.removeLines(added, leftover, leftover) : added,
        first,
      ),
      first: { line: first, column: 0 },
      last: lastLetterOf(added, first + lines.length - 1),
    }
  }
  return Register.match(register, {
    Linewise: ({ text }) => onLinesOfTheirOwn(linesOf(text.slice(0, -1))),
    Charwise: ({ text }) =>
      byKind(range, {
        Linewise: () => onLinesOfTheirOwn(linesOf(text)),
        Charwise: () => lettersAt(after, at, text, times),
      }),
    Blockwise: rows =>
      byKind(range, {
        Linewise: () => onLinesOfTheirOwn(linesOf(rows.text)),
        Charwise: () => {
          const rested = restingAt(after, at.line, at.column, at.column)
          return putRows(
            Buffer.moveTo(after, { line: at.line, column: rested.column }),
            rows,
            rested.isPastHome ? 'After' : 'Before',
            count,
          )
        },
      }),
  })
}

export const blackHole = RegisterName.cases.BlackHole.make({})

const blockRegister = (cuts: ReadonlyArray<Cut>, block: Block): Register =>
  rectangle(
    Array.map(cuts, cut => cut.row),
    widthOf(block),
  )

const unchangedAt = (
  buffer: Buffer.Buffer,
  position: Buffer.Position,
  inserting: boolean,
  registers: Registers,
): Applied => ({
  buffer: Buffer.moveTo(buffer, position),
  inserting,
  registers,
  clipboard: Option.none(),
})

const blockRemoved = (
  buffer: Buffer.Buffer,
  block: Block,
  cuts: ReadonlyArray<Cut>,
): Buffer.Buffer => {
  const rewrites: Array<Buffer.Rewrite> = []
  cuts.forEach((cut, index) => {
    if (cut.reaches && cut.end > cut.start) {
      rewrites.push({
        line: block.first + index,
        from: cut.start,
        to: cut.end,
        text: ' '.repeat(cut.spaces),
      })
    }
  })
  const top = rewrites[0]
  if (top !== undefined && top.line !== block.first) {
    rewrites.push({ line: block.first, from: 0, to: 0, text: '' })
  }
  return Buffer.rewrite(buffer, rewrites)
}

const topLeft = (block: Block, cuts: ReadonlyArray<Cut>): Buffer.Position => ({
  line: block.first,
  column: cuts[0]?.start ?? 0,
})

const leftEdge = (block: Block, cuts: ReadonlyArray<Cut>): Buffer.Position => ({
  line: block.first,
  column: cuts[0]?.edge ?? 0,
})

export const blockOperators: Readonly<
  Record<
    OperatorName,
    (
      buffer: Buffer.Buffer,
      block: Block,
      registers: Registers,
      name: RegisterName,
    ) => Applied
  >
> = {
  Delete: (buffer, block, registers, name) => {
    const cuts = cutsOf(buffer, block)
    return isOneEmptyLine(buffer) ||
      (block.first === block.last && lineText(buffer, block.first) === '')
      ? unchangedAt(buffer, topLeft(block, cuts), false, registers)
      : {
          buffer: Buffer.moveTo(
            blockRemoved(buffer, block, cuts),
            leftEdge(block, cuts),
          ),
          inserting: false,
          ...remembered(registers, name, blockRegister(cuts, block), false),
        }
  },
  Change: (buffer, block, registers, name) => {
    const cuts = cutsOf(buffer, block)
    if (isOneEmptyLine(buffer)) {
      return unchangedAt(buffer, topLeft(block, cuts), true, registers)
    }
    const removed = blockRemoved(buffer, block, cuts)
    return {
      buffer: Buffer.moveTo(removed, {
        line: block.first,
        column: landingOf(
          removed,
          block.first,
          topLeft(block, cuts).column,
          leftEdge(block, cuts).column,
        ),
      }),
      inserting: true,
      ...remembered(registers, name, blockRegister(cuts, block), false),
    }
  },
  Yank: (buffer, block, registers, name) => {
    const cuts = cutsOf(buffer, block)
    return {
      buffer: Buffer.moveTo(buffer, topLeft(block, cuts)),
      inserting: false,
      ...remembered(registers, name, blockRegister(cuts, block), true),
    }
  },
}

export const BlockRule = Schema.Literals(['Insert', 'Append', 'Change'])
export type BlockRule = typeof BlockRule.Type

export type Held = Readonly<{ column: number; length: number; kept: number }>

type Hold = Readonly<{
  column: number
  length: number
  isShort: boolean
  pad: number
  trimmed: number
  skipped: number
}>

const holdOf = (
  line: Buffer.Line,
  block: Block,
  rule: Exclude<BlockRule, 'Change'>,
): Hold => {
  const cut = cutOf(line, block)
  const isShort = rule === 'Append' && cut.ends
  const length = cut.end - cut.start
  const cells = cellCount(line)
  const hold = { column: cut.start, length, isShort, pad: cut.pad }
  if (rule !== 'Append') {
    return { ...hold, trimmed: 0, skipped: 0 }
  }
  if (isShort) {
    const lastLetter =
      cells === 0 ? 0 : line.text.length - cellStart(line, cells - 1)
    return { ...hold, trimmed: Math.min(length, lastLetter), skipped: 0 }
  }
  if (cut.right === undefined) {
    return { ...hold, trimmed: 0, skipped: 0 }
  }
  const letter = cut.right.to - cut.right.from
  return { ...hold, trimmed: letter, skipped: cut.right.isTab ? 0 : letter }
}

export type Opened = Readonly<{
  buffer: Buffer.Buffer
  held: Held
  began: Buffer.Position
}>

export const blockOpened = (
  buffer: Buffer.Buffer,
  block: Block,
  rule: Exclude<BlockRule, 'Change'>,
): Opened => {
  const line = buffer.lines[block.first] ?? buffer.lines[0]
  const hold = holdOf(line, block, rule)
  const end = line.text.length
  const at = (column: number): Buffer.Buffer =>
    Buffer.moveTo(buffer, { line: block.first, column })
  if (rule === 'Insert') {
    return {
      began: { line: block.first, column: hold.column },
      buffer: at(hold.column),
      held: {
        column: hold.column,
        length: hold.length,
        kept: end - hold.column,
      },
    }
  }
  const kept = end - hold.column - hold.length
  if (block.toLineEnds || !hold.isShort) {
    const column = Math.min(end, hold.column + hold.length)
    return {
      began: { line: block.first, column },
      buffer: at(column),
      held: { column: hold.column, length: hold.length, kept },
    }
  }
  return {
    began: { line: block.first, column: end },
    buffer: Buffer.moveTo(
      Buffer.rewrite(buffer, [
        { line: block.first, from: end, to: end, text: ' '.repeat(hold.pad) },
      ]),
      { line: block.first, column: end + hold.pad },
    ),
    held: { column: hold.column, length: hold.length + hold.pad, kept },
  }
}

export const changeHeld = (buffer: Buffer.Buffer): Held => ({
  column: buffer.caret.column,
  length: 0,
  kept: Buffer.lineEnd(buffer, buffer.caret.line),
})

const isWholeLetters = (text: string): boolean =>
  !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(text)

const someText = (text: string): Option.Option<string> =>
  text === '' ? Option.none() : Option.some(text)

const gainedBy: Readonly<
  Record<
    BlockRule,
    (line: Buffer.Line, block: Block, held: Held) => Option.Option<string>
  >
> = {
  Change: ({ text }, _block, held) =>
    someText(text.slice(held.column, held.column + text.length - held.kept)),
  Insert: (line, block, held) => {
    const now = holdOf(line, block, 'Insert')
    const column =
      !block.toLineEnds || now.length < held.length ? now.column : held.column
    const from = Math.min(line.text.length, column)
    return someText(line.text.slice(from, line.text.length - held.kept))
  },
  Append: (line, block, held) => {
    const now = holdOf(line, block, 'Append')
    const isFresh = !block.toLineEnds || now.length < held.length
    const kept = isFresh ? held.kept + now.length - held.length : held.kept
    const from = Math.min(
      line.text.length,
      isFresh
        ? now.column + now.length - now.trimmed
        : held.column + held.length,
    )
    return kept < 0
      ? Option.none()
      : Option.map(
          someText(line.text.slice(from, line.text.length - kept)),
          text => text.slice(isFresh ? now.skipped : 0),
        )
  },
}

export const gained = (
  line: Buffer.Line,
  block: Block,
  rule: BlockRule,
  held: Held,
): Option.Option<string> =>
  Option.filter(gainedBy[rule](line, block, held), isWholeLetters)

const splitting = (
  line: number,
  letter: CutLetter,
  before: number,
  text: string,
  after: number,
): Buffer.Rewrite =>
  letter.isTab
    ? {
        line,
        from: letter.from,
        to: letter.to,
        text: ' '.repeat(before) + text + ' '.repeat(after),
      }
    : {
        line,
        from: letter.from,
        to: letter.from,
        text: ' '.repeat(before) + text,
      }

const insertedAt = (
  line: number,
  column: number,
  text: string,
): Buffer.Rewrite => ({ line, from: column, to: column, text })

const copiedOnto: Readonly<
  Record<
    BlockRule,
    (
      line: Buffer.Line,
      number: number,
      block: Block,
      text: string,
    ) => Option.Option<Buffer.Rewrite>
  >
> = {
  Insert: (line, number, block, text) => {
    const cut = cutOf(line, block)
    if (!cut.reaches) {
      return Option.none()
    }
    return Option.some(
      cut.left === undefined
        ? insertedAt(number, cut.start, text)
        : splitting(number, cut.left, cut.left.outside, text, cut.left.inside),
    )
  },
  Append: (line, number, block, text) => {
    const cut = cutOf(line, block)
    const end = line.text.length
    if (block.toLineEnds) {
      return Option.some(insertedAt(number, end, text))
    }
    if (cut.ends) {
      return Option.some(insertedAt(number, end, ' '.repeat(cut.pad) + text))
    }
    return Option.some(
      cut.right === undefined
        ? insertedAt(number, cut.end, text)
        : splitting(
            number,
            cut.right,
            cut.right.inside,
            text,
            cut.right.outside,
          ),
    )
  },
  Change: (line, number, block, text) => {
    const stop = stopAtScreenColumn(line, block.left)
    return stop.column < block.left
      ? Option.none()
      : Option.some(
          insertedAt(
            number,
            cellStart(
              line,
              stop.column > block.left ? stop.cell - 1 : stop.cell,
            ),
            text,
          ),
        )
  },
}

export const copiedDown = (
  buffer: Buffer.Buffer,
  block: Block,
  rule: BlockRule,
  text: string,
): Buffer.Buffer => {
  const rewrites: Array<Buffer.Rewrite> = []
  for (let number = block.first + 1; number <= block.last; number += 1) {
    const line = buffer.lines[number]
    if (line !== undefined) {
      Option.match(copiedOnto[rule](line, number, block, text), {
        onNone: () => undefined,
        onSome: rewrite => rewrites.push(rewrite),
      })
    }
  }
  return Buffer.rewrite(buffer, rewrites)
}

const caretColumnAt = (
  line: Buffer.Line,
  column: number,
  onTab: 'First' | 'Last',
): number => {
  if (column >= line.text.length) {
    return stopAtScreenColumn(line, Number.POSITIVE_INFINITY).column
  }
  const cell = cellAt(line, column)
  return onTab === 'Last' && cellText(line, cell) === '\t'
    ? lastScreenColumnOf(line, cell)
    : screenColumnOf(line, cell)
}

const lettersDown = (
  after: Buffer.Buffer,
  block: Block,
  at: Buffer.Position,
  anchor: Buffer.Position,
  text: string,
): Placed => {
  const first = after.lines[at.line] ?? after.lines[0]
  const isAfterAnchor =
    at.line > anchor.line ||
    (at.line === anchor.line && at.column > anchor.column)
  const wanted = caretColumnAt(
    first,
    at.column,
    isAfterAnchor ? 'Last' : 'First',
  )
  const rewrites: Array<Buffer.Rewrite> = [insertedAt(at.line, at.column, text)]
  for (let number = block.first + 1; number <= block.last; number += 1) {
    const line = after.lines[number]
    if (line !== undefined) {
      const stop = stopAtScreenColumn(line, wanted)
      if (stop.column === wanted) {
        rewrites.push(insertedAt(number, cellStart(line, stop.cell), text))
      }
    }
  }
  const added = Buffer.moveTo(Buffer.rewrite(after, rewrites), {
    line: at.line,
    column: at.column + text.length,
  })
  const last = lastCellBefore(added)
  return { buffer: Buffer.moveTo(added, last), first: at, last }
}

export const putOverBlock = (
  before: Buffer.Buffer,
  after: Buffer.Buffer,
  block: Block,
  anchor: Buffer.Position,
  register: Register,
  side: Side,
  count: number,
): Placed => {
  const cut = cutOf(before.lines[block.first] ?? before.lines[0], block)
  const times = boundedCount(register, count)
  const rested = restingAt(after, block.first, cut.start, cut.edge)
  const at = {
    line: block.first,
    column: landingOf(after, block.first, cut.start, cut.edge),
  }
  return Register.match(register, {
    Charwise: ({ text }) =>
      text === '' || text.includes('\n')
        ? lettersAt(after, at, text, times)
        : lettersDown(after, block, at, anchor, text.repeat(times)),
    Linewise: ({ text }) => {
      const lines = Array.flatten(
        Array.replicate(linesOf(text.slice(0, -1)), times),
      )
      const first =
        side === 'After'
          ? before.caret.line + 1
          : rested.isPastHome
            ? block.first + 1
            : block.first
      const added = Buffer.insertLines(after, first, lines)
      return {
        buffer: atFirstNonBlank(added, first),
        first: { line: first, column: 0 },
        last: lastLetterOf(added, first + lines.length - 1),
      }
    },
    Blockwise: rows =>
      putRows(
        Buffer.moveTo(after, { line: block.first, column: rested.column }),
        rows,
        rested.isPastHome ? 'After' : 'Before',
        count,
      ),
  })
}

export const homeOf = (
  buffer: Buffer.Buffer,
  block: Block,
): Buffer.Position => ({
  line: block.first,
  column: cutOf(buffer.lines[block.first] ?? buffer.lines[0], block).start,
})
