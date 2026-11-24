import { Option, Schema } from 'effect'

import * as Buffer from './buffer'
import { Input, type NamedKey } from './input'
import { cellAt, cellCount, cellStart } from './vim/cells'
import * as Keymap from './vim/keymap'
import {
  Want,
  endOf,
  firstFilled,
  motions,
  positionOf,
  spotOf,
} from './vim/motions'

export const Mode = Schema.Literals(['Normal', 'Insert'])
export type Mode = typeof Mode.Type

export const Vim = Schema.Struct({
  mode: Mode,
  count: Schema.String,
  keys: Schema.Array(Schema.String),
  want: Want,
})
export type Vim = typeof Vim.Type

export const start: Vim = { mode: 'Normal', count: '', keys: [], want: 'Unset' }

export type Fate = 'Done' | 'Plain' | 'Swallowed'

export type Step = Readonly<{ vim: Vim; buffer: Buffer.Buffer; fate: Fate }>

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

const idle = (vim: Vim): Vim => ({ ...vim, count: '', keys: [] })

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

const deleteCells = (
  buffer: Buffer.Buffer,
  count: number | undefined,
): Buffer.Buffer => {
  const from = spotOf(buffer)
  const last = motions.Right(buffer, from, (count ?? 1) - 1, 'Unset').spot
  const start = positionOf(buffer, from)
  const end = endOf(buffer, last)
  return end.column === start.column ? buffer : Buffer.erase(buffer, start, end)
}

type Ran = Readonly<{ vim: Vim; buffer: Buffer.Buffer }>

const run = (
  vim: Vim,
  buffer: Buffer.Buffer,
  command: Keymap.Command,
  count: number | undefined,
): Ran => {
  const cleared = idle(vim)
  return Keymap.Command.match(command, {
    Cancel: () => ({ vim: cleared, buffer }),
    Move: ({ motion }) => {
      const { spot, want } = motions[motion](
        buffer,
        spotOf(buffer),
        count,
        vim.want,
      )
      return {
        vim: { ...cleared, want },
        buffer: Buffer.moveTo(buffer, positionOf(buffer, spot)),
      }
    },
    DeleteCells: () => {
      const normal: Vim = { ...cleared, want: 'Unset' }
      return {
        vim: normal,
        buffer: rest(normal, deleteCells(buffer, count), false),
      }
    },
    Insert: ({ at }): Ran => ({
      vim: { ...cleared, mode: 'Insert', want: 'Unset' },
      buffer: placeInsert(buffer, at),
    }),
  })
}

const isPageKey = (input: Input): boolean =>
  input._tag === 'Key' && (input.key === 'PageUp' || input.key === 'PageDown')

const pressNormal = (vim: Vim, buffer: Buffer.Buffer, input: Input): Step => {
  if (input._tag === 'Paste' || isPageKey(input)) {
    return { vim: interrupted(vim), buffer, fate: 'Plain' }
  }
  const fate: Fate =
    input._tag === 'Key' || input._tag === 'Chord' ? 'Done' : 'Swallowed'
  return Option.match(keyOf(input), {
    onNone: () => ({ vim, buffer, fate }),
    onSome: key =>
      Keymap.Advance.match(Keymap.advance(Keymap.normal, vim, key), {
        Drop: () => ({ vim: idle(vim), buffer, fate }),
        Wait: ({ pending }) => ({ vim: { ...vim, ...pending }, buffer, fate }),
        Run: ({ command, count }) => ({
          ...run(vim, buffer, command, count),
          fate,
        }),
      }),
  })
}

const leavesInsert = (input: Input): boolean =>
  Option.exists(keyOf(input), key => key === '<Esc>' || key === '<C-[>')

const leaveInsert = (buffer: Buffer.Buffer): Step => {
  const settled = Buffer.settle(buffer)
  const back = Buffer.backspaceTarget(settled)
  return {
    vim: start,
    buffer: rest(
      start,
      back.line === settled.caret.line ? Buffer.moveTo(settled, back) : settled,
      false,
    ),
    fate: 'Done',
  }
}

export const press = (vim: Vim, buffer: Buffer.Buffer, input: Input): Step =>
  vim.mode === 'Normal'
    ? pressNormal(vim, buffer, input)
    : leavesInsert(input)
      ? leaveInsert(buffer)
      : { vim, buffer, fate: 'Plain' }

export const pendingKeys = (vim: Vim): string => Keymap.shown(vim)
