import { Array, Option, Schema } from 'effect'

import * as Buffer from '../buffer'
import { cellAt, cellStart } from './cells'
import { cellsIn, endOf, firstNonBlank, positionOf, spotOf } from './motions'
import { Kind, type OperatorName, type Range } from './targets'

export const Register = Schema.Struct({ text: Schema.String, kind: Kind })
export type Register = typeof Register.Type

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
  return {
    text: unixText,
    kind: unixText.endsWith('\n') ? 'Linewise' : 'Charwise',
  }
}

const appended = (old: Register, added: Register): Register => {
  if (old.kind === 'Charwise' && added.kind === 'Charwise') {
    return { text: old.text + added.text, kind: 'Charwise' }
  }
  return {
    text:
      old.kind === 'Charwise'
        ? `${old.text}\n${added.text}`
        : added.kind === 'Charwise'
          ? `${old.text}${added.text}\n`
          : old.text + added.text,
    kind: 'Linewise',
  }
}

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

const isOneEmptyLine = (buffer: Buffer.Buffer): boolean =>
  buffer.lines.length === 1 && buffer.lines[0].text === ''

const coversNothing = (buffer: Buffer.Buffer, range: Range): boolean => {
  const from = positionOf(buffer, range.from)
  const to = positionOf(buffer, range.to)
  return (
    range.kind === 'Charwise' &&
    from.line === to.line &&
    from.column === to.column
  )
}

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
        : range.kind === 'Linewise'
          ? emptyLine(buffer, range)
          : remove(buffer, range),
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
  const units =
    register.kind === 'Charwise' && lines === 0
      ? maxPutUnitsOnOneLine
      : maxPutUnits
  return Math.max(
    1,
    Math.min(
      count,
      Math.floor(units / Math.max(1, register.text.length)),
      lines === 0 ? count : Math.floor(maxPutLines / lines),
    ),
  )
}

export const put = (
  buffer: Buffer.Buffer,
  register: Register,
  side: Side,
  count: number,
): Buffer.Buffer => {
  const times = boundedCount(register, count)
  if (register.kind === 'Linewise') {
    const at = buffer.caret.line + (side === 'After' ? 1 : 0)
    const once = linesOf(register.text.slice(0, -1))
    const added = Buffer.insertLines(
      buffer,
      at,
      Array.flatten(Array.replicate(once, times)),
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
  const text = register.text.repeat(times)
  const added = Buffer.insert(Buffer.moveTo(buffer, at), text)
  return Buffer.moveTo(added, text.includes('\n') ? at : lastCellBefore(added))
}
