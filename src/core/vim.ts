import { Option, Schema } from 'effect'

import * as Buffer from './buffer'
import { Input, type NamedKey } from './input'
import { cellAt, cellCount, cellStart } from './vim/cells'
import * as Keymap from './vim/keymap'
import {
  Want,
  endOf,
  firstFilled,
  motionFails,
  motions,
  positionOf,
  spotOf,
} from './vim/motions'
import * as Operators from './vim/operators'
import { targetFor } from './vim/targets'

export const Registers = Operators.Registers
export type Registers = Operators.Registers
export const noRegisters = Operators.noRegisters

export const Mode = Schema.Literals(['Normal', 'Insert'])
export type Mode = typeof Mode.Type

export const Vim = Schema.Struct({
  mode: Mode,
  count: Schema.String,
  keys: Schema.Array(Schema.String),
  innerCount: Schema.String,
  want: Want,
})
export type Vim = typeof Vim.Type

export const start: Vim = {
  mode: 'Normal',
  ...Keymap.idle,
  want: 'Unset',
}

export type Fate = 'Done' | 'Plain' | 'Swallowed'

export type Step = Readonly<{
  vim: Vim
  buffer: Buffer.Buffer
  registers: Registers
  fate: Fate
}>

const keyNames: Readonly<Record<NamedKey, string>> = {
  Escape: 'Esc',
  Enter: 'CR',
  Tab: 'Tab',
  Backspace: 'BS',
  Delete: 'Del',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
}

const isOneGrapheme = (text: string): boolean =>
  text !== '' && Buffer.segmenter.segment(text).containing(0)?.segment === text

const keyOf = (input: Input): Option.Option<Keymap.Key> =>
  Input.match(input, {
    Key: ({ key, modifiers }) =>
      Option.some(`<${modifiers.ctrl ? 'C-' : ''}${keyNames[key]}>`),
    Chord: ({ char, modifiers }) =>
      modifiers.ctrl ? Option.some(`<C-${char.toLowerCase()}>`) : Option.none(),
    Text: ({ text }) =>
      isOneGrapheme(text) ? Option.some(text) : Option.none(),
    Erase: () => Option.none(),
    Paste: () => Option.none(),
    Preedit: () => Option.none(),
    Commit: () => Option.none(),
  })

export const rest = (
  vim: Vim,
  buffer: Buffer.Buffer,
  atRowEnd: boolean,
): Buffer.Buffer => {
  if (vim.mode !== 'Normal') {
    return buffer
  }
  const { line, column } = buffer.caret
  const text = buffer.lines[line] ?? buffer.lines[0]
  const cell = cellAt(text, atRowEnd ? column - 1 : column)
  const target = cellCount(text) === 0 ? 0 : cellStart(text, cell)
  return target === column
    ? buffer
    : Buffer.moveTo(buffer, { line, column: target })
}

const idle = (vim: Vim): Vim => ({ ...vim, ...Keymap.idle })

export const interrupted = (vim: Vim): Vim => ({ ...idle(vim), want: 'Unset' })

const placeInsert = (
  buffer: Buffer.Buffer,
  at: Keymap.InsertAt,
): Buffer.Buffer => {
  const from = spotOf(buffer)
  const moved = (position: Buffer.Position) => Buffer.moveTo(buffer, position)
  const lineEnd = { line: from.line, column: Buffer.lineEnd(buffer, from.line) }
  const lineStart = { line: from.line, column: 0 }
  const places: Record<Keymap.InsertAt, () => Buffer.Buffer> = {
    Here: () => buffer,
    After: () => moved(endOf(buffer, from)),
    FirstNonBlank: () =>
      moved(
        positionOf(buffer, {
          line: from.line,
          cell: firstFilled(buffer, from.line),
        }),
      ),
    LineEnd: () => moved(lineEnd),
    LineBelow: () => Buffer.insert(moved(lineEnd), '\n'),
    LineAbove: () =>
      Buffer.moveTo(Buffer.insert(moved(lineStart), '\n'), lineStart),
  }
  return places[at]()
}

type Ran = Readonly<{ vim: Vim; buffer: Buffer.Buffer; registers: Registers }>

const run = (
  vim: Vim,
  buffer: Buffer.Buffer,
  registers: Registers,
  command: Keymap.Command,
  count: number | undefined,
): Ran => {
  const cleared = idle(vim)
  const normal: Vim = { ...cleared, want: 'Unset' }
  const unchanged: Ran = { vim: cleared, buffer, registers }
  return Keymap.Command.match(command, {
    Cancel: () => unchanged,
    Move: ({ motion }) => {
      if (motionFails(motion, buffer, spotOf(buffer), count)) {
        return unchanged
      }
      const { spot, want } = motions[motion](
        buffer,
        spotOf(buffer),
        count,
        vim.want,
      )
      return {
        vim: { ...cleared, want },
        buffer: Buffer.moveTo(buffer, positionOf(buffer, spot)),
        registers,
      }
    },
    Operate: ({ operator, target }) =>
      Option.match(
        targetFor(operator === 'Change', target)(
          buffer,
          spotOf(buffer),
          count,
          vim.want,
        ),
        {
          onNone: () => unchanged,
          onSome: range => {
            const applied = Operators.operators[operator](
              buffer,
              range,
              registers,
            )
            const after: Vim = applied.inserting
              ? { ...normal, mode: 'Insert' }
              : normal
            return {
              vim: after,
              buffer: rest(after, applied.buffer, false),
              registers: applied.registers,
            }
          },
        },
      ),
    Put: ({ side }) =>
      Option.match(registers.unnamed, {
        onNone: () => unchanged,
        onSome: register => ({
          vim: normal,
          buffer: rest(
            normal,
            Operators.put(buffer, register, side, count ?? 1),
            false,
          ),
          registers,
        }),
      }),
    Insert: ({ at }): Ran => ({
      vim: { ...normal, mode: 'Insert' },
      buffer: placeInsert(buffer, at),
      registers,
    }),
  })
}

const isPageKey = (input: Input): boolean =>
  input._tag === 'Key' && (input.key === 'PageUp' || input.key === 'PageDown')

const pressNormal = (
  vim: Vim,
  buffer: Buffer.Buffer,
  registers: Registers,
  input: Input,
): Step => {
  if (input._tag === 'Paste' || isPageKey(input)) {
    return { vim: interrupted(vim), buffer, registers, fate: 'Plain' }
  }
  const fate: Fate =
    input._tag === 'Key' || input._tag === 'Chord' ? 'Done' : 'Swallowed'
  return Option.match(keyOf(input), {
    onNone: () => ({ vim, buffer, registers, fate }),
    onSome: key =>
      Keymap.Advance.match(Keymap.advance(Keymap.normal, vim, key), {
        Drop: () => ({ vim: idle(vim), buffer, registers, fate }),
        Wait: ({ pending }) => ({
          vim: { ...vim, ...pending },
          buffer,
          registers,
          fate,
        }),
        Run: ({ command, count }) => ({
          ...run(vim, buffer, registers, command, count),
          fate,
        }),
      }),
  })
}

const leavesInsert = (input: Input): boolean =>
  Option.exists(keyOf(input), key => key === '<Esc>' || key === '<C-[>')

const leaveInsert = (buffer: Buffer.Buffer, registers: Registers): Step => {
  const settled = Buffer.settle(buffer)
  const back = Buffer.backspaceTarget(settled)
  return {
    vim: start,
    buffer: rest(
      start,
      back.line === settled.caret.line ? Buffer.moveTo(settled, back) : settled,
      false,
    ),
    registers,
    fate: 'Done',
  }
}

export const press = (
  vim: Vim,
  buffer: Buffer.Buffer,
  registers: Registers,
  input: Input,
): Step =>
  vim.mode === 'Normal'
    ? pressNormal(vim, buffer, registers, input)
    : leavesInsert(input)
      ? leaveInsert(buffer, registers)
      : { vim, buffer, registers, fate: 'Plain' }

export const pendingKeys = (vim: Vim): string => Keymap.shown(vim)
