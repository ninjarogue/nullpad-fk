import { Array, Option, Schema } from 'effect'

import * as Buffer from './buffer'
import * as History from './history'
import { Input, type NamedKey, noModifiers } from './input'
import { cellAt, cellCount, cellStart } from './vim/cells'
import * as Keymap from './vim/keymap'
import {
  Want,
  endOf,
  firstFilled,
  firstNonBlank,
  motionFails,
  motions,
  positionOf,
  spotOf,
} from './vim/motions'
import * as Operators from './vim/operators'
import { type Range, type TargetName, targetFor } from './vim/targets'

export const Registers = Operators.Registers
export type Registers = Operators.Registers
export const noRegisters = Operators.noRegisters

export const Repeat = Schema.Struct({
  command: Keymap.Command,
  count: Schema.UndefinedOr(Schema.Int),
  typed: Schema.Array(Input),
})
export type Repeat = typeof Repeat.Type

export const Kept = Schema.Struct({
  registers: Registers,
  dot: Schema.Option(Repeat),
})
export type Kept = typeof Kept.Type

export const nothingKept: Kept = { registers: noRegisters, dot: Option.none() }

export const Mode = Schema.TaggedUnion({
  Normal: {},
  Insert: { recording: Schema.Option(Repeat) },
})
export type Mode = typeof Mode.Type

const normalMode = Mode.cases.Normal.make({})

const unrecordedStay = Mode.cases.Insert.make({ recording: Option.none() })

export const Vim = Schema.Struct({
  mode: Mode,
  count: Schema.String,
  keys: Schema.Array(Schema.String),
  innerCount: Schema.String,
  want: Want,
})
export type Vim = typeof Vim.Type

export const start: Vim = {
  mode: normalMode,
  ...Keymap.idle,
  want: 'Unset',
}

export const Replayed = Schema.TaggedUnion({
  Run: { command: Keymap.Command, count: Schema.UndefinedOr(Schema.Int) },
  Typed: { input: Input },
  Leave: {},
})
export type Replayed = typeof Replayed.Type

export const Fate = Schema.TaggedUnion({
  Done: {},
  Plain: { input: Input },
  Travel: { way: History.Way, count: Schema.Int },
  Replay: { steps: Schema.Array(Replayed) },
})
export type Fate = typeof Fate.Type

const done = Fate.cases.Done.make({})

export type Step = Readonly<{
  vim: Vim
  buffer: Buffer.Buffer
  kept: Kept
  fate: Fate
  began: Option.Option<Buffer.Position>
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
  if (vim.mode._tag !== 'Normal') {
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

const firstNonBlankOf = (
  buffer: Buffer.Buffer,
  line: number,
): Buffer.Position =>
  positionOf(buffer, { line, cell: firstNonBlank(buffer, line) })

const changeBegan = (
  buffer: Buffer.Buffer,
  operator: Operators.OperatorName,
  target: TargetName,
  range: Range,
): Buffer.Position => {
  const from = positionOf(buffer, range.from)
  if (range.kind === 'Charwise') {
    return from
  }
  if (target === 'Lines' && range.from.line === range.to.line) {
    const lineStart = firstNonBlankOf(buffer, range.from.line)
    return Buffer.isBefore(buffer.caret, lineStart) ? buffer.caret : lineStart
  }
  return operator === 'Change' && range.to.line > range.from.line
    ? { line: from.line + 1, column: from.column }
    : from
}

const maxReplayedInputs = 20_000

const maxReplayedLineCopies = 100_000_000

const maxReplayedDeletes = 120

const typedText = (input: Input): string =>
  Input.match(input, {
    Key: ({ key }) => (key === 'Enter' ? '\n' : ''),
    Chord: () => '',
    Text: ({ text }) => text,
    Erase: () => '',
    Paste: ({ text }) => text,
    Preedit: () => '',
    Commit: ({ text }) => text,
  })

const isDeleteKey = (input: Input): boolean =>
  input._tag === 'Key' && input.key === 'Delete'

const isTypedAscii = (input: Input): boolean =>
  input._tag === 'Text' && input.byKey && /^[\x20-\x7e]*$/u.test(input.text)

const typedStep = (input: Input): Replayed =>
  Replayed.cases.Typed.make({ input })

const enter = typedStep(
  Input.cases.Key.make({ key: 'Enter', modifiers: noModifiers }),
)

const leave = Replayed.cases.Leave.make({})

const furtherCopies = (
  { command, count, typed }: Repeat,
  lineCount: number,
): ReadonlyArray<Replayed> => {
  if (command._tag !== 'Insert') {
    return []
  }
  const opensLine = command.at === 'LineBelow' || command.at === 'LineAbove'
  const opening = opensLine ? [enter] : []
  const copy = [...opening, ...Array.map(typed, typedStep)]
  const text = Array.join(Array.map(typed, typedText), '')
  const isOneInsert = Array.every(typed, isTypedAscii)
  const deletes = Array.filter(typed, isDeleteKey).length
  const inputs = isOneInsert
    ? maxReplayedInputs
    : Math.min(maxReplayedInputs, maxReplayedLineCopies / lineCount)
  const copies = Math.max(
    1,
    Math.min(
      Operators.boundedCount(
        { text: (opensLine ? '\n' : '') + text, kind: 'Charwise' },
        count ?? 1,
      ),
      Math.floor(inputs / Math.max(1, copy.length)),
      deletes === 0 ? Infinity : Math.floor(maxReplayedDeletes / deletes),
    ),
  )
  if (copies === 1) {
    return []
  }
  if (!isOneInsert) {
    return Array.drop(Array.flatten(Array.replicate(copy, copies)), copy.length)
  }
  const rest = opensLine
    ? text + `\n${text}`.repeat(copies - 2)
    : text.repeat(copies - 1)
  return [
    ...opening,
    ...(rest === ''
      ? []
      : [typedStep(Input.cases.Text.make({ text: rest, byKey: true }))]),
  ]
}

const replayOf = (repeat: Repeat): ReadonlyArray<Replayed> => [
  Replayed.cases.Run.make({ command: repeat.command, count: repeat.count }),
  ...Array.map(repeat.typed, typedStep),
  leave,
]

const run = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  command: Keymap.Command,
  count: number | undefined,
): Step => {
  const cleared = idle(vim)
  const normal: Vim = { ...cleared, want: 'Unset' }
  const unchanged: Step = {
    vim: cleared,
    buffer,
    kept,
    fate: done,
    began: Option.none(),
  }
  const repeat = Option.some({ command, count, typed: [] })
  const recordingStay: Vim = {
    ...normal,
    mode: { _tag: 'Insert', recording: repeat },
  }
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
        ...unchanged,
        vim: { ...cleared, want },
        buffer: Buffer.moveTo(buffer, positionOf(buffer, spot)),
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
              kept.registers,
            )
            const after = applied.inserting ? recordingStay : normal
            return {
              vim: after,
              buffer: rest(after, applied.buffer, false),
              kept: {
                registers: applied.registers,
                dot: operator === 'Delete' ? repeat : kept.dot,
              },
              fate: done,
              began: Option.some(changeBegan(buffer, operator, target, range)),
            }
          },
        },
      ),
    Put: ({ side }) =>
      Option.match(kept.registers.unnamed, {
        onNone: () => ({ ...unchanged, kept: { ...kept, dot: repeat } }),
        onSome: register => ({
          ...unchanged,
          vim: normal,
          kept: { ...kept, dot: repeat },
          buffer: rest(
            normal,
            Operators.put(buffer, register, side, count ?? 1),
            false,
          ),
        }),
      }),
    Insert: ({ at }): Step => ({
      ...unchanged,
      vim: recordingStay,
      buffer: placeInsert(buffer, at),
    }),
    Travel: ({ way }) => ({
      ...unchanged,
      vim: normal,
      fate: Fate.cases.Travel.make({ way, count: count ?? 1 }),
    }),
    Repeat: () =>
      Option.match(kept.dot, {
        onNone: () => unchanged,
        onSome: last => ({
          ...unchanged,
          fate: Fate.cases.Replay.make({
            steps: replayOf({ ...last, count: count ?? last.count }),
          }),
        }),
      }),
  })
}

const isPageKey = (input: Input): boolean =>
  input._tag === 'Key' && (input.key === 'PageUp' || input.key === 'PageDown')

const pressNormal = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  input: Input,
): Step => {
  const unchanged: Step = {
    vim,
    buffer,
    kept,
    fate: done,
    began: Option.none(),
  }
  if (input._tag === 'Paste' || isPageKey(input)) {
    return {
      ...unchanged,
      vim: interrupted(vim),
      fate: { _tag: 'Plain', input },
    }
  }
  return Option.match(keyOf(input), {
    onNone: () => unchanged,
    onSome: key =>
      Keymap.Advance.match(Keymap.advance(Keymap.normal, vim, key), {
        Drop: () => ({ ...unchanged, vim: idle(vim) }),
        Wait: ({ pending }) => ({ ...unchanged, vim: { ...vim, ...pending } }),
        Run: ({ command, count }) => run(vim, buffer, kept, command, count),
      }),
  })
}

const leavesInsert = (input: Input): boolean =>
  Option.exists(keyOf(input), key => key === '<Esc>' || key === '<C-[>')

const leaveInsert = (buffer: Buffer.Buffer, kept: Kept): Step => {
  const settled = Buffer.settle(buffer)
  const back = Buffer.backspaceTarget(settled)
  return {
    vim: start,
    buffer: rest(
      start,
      back.line === settled.caret.line ? Buffer.moveTo(settled, back) : settled,
      false,
    ),
    kept,
    fate: done,
    began: Option.none(),
  }
}

const isAtNoteStart = ({ caret }: Buffer.Buffer): boolean =>
  caret.line === 0 && caret.column === 0

const isRecorded = (buffer: Buffer.Buffer, input: Input): boolean =>
  Input.match(input, {
    Key: ({ key }) =>
      key === 'Enter' ||
      key === 'Tab' ||
      key === 'Delete' ||
      (key === 'Backspace' && !isAtNoteStart(buffer)),
    Chord: () => false,
    Text: () => true,
    Erase: () => true,
    Paste: () => true,
    Preedit: () => false,
    Commit: () => true,
  })

const leaving = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  recording: Option.Option<Repeat>,
): Step =>
  Option.match(recording, {
    onNone: () => leaveInsert(buffer, kept),
    onSome: repeat => ({
      vim: { ...vim, mode: unrecordedStay },
      buffer,
      kept: { ...kept, dot: recording },
      fate: Fate.cases.Replay.make({
        steps: [...furtherCopies(repeat, buffer.lines.length), leave],
      }),
      began: Option.none(),
    }),
  })

const pressInsert = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  recording: Option.Option<Repeat>,
  input: Input,
): Step =>
  leavesInsert(input)
    ? leaving(vim, buffer, kept, recording)
    : {
        vim: isRecorded(buffer, input)
          ? {
              ...vim,
              mode: {
                _tag: 'Insert',
                recording: Option.map(recording, repeat => ({
                  ...repeat,
                  typed: [...repeat.typed, input],
                })),
              },
            }
          : vim,
        buffer,
        kept,
        fate: { _tag: 'Plain', input },
        began: Option.none(),
      }

export const press = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  input: Input,
): Step =>
  Mode.match(vim.mode, {
    Normal: () => pressNormal(vim, buffer, kept, input),
    Insert: ({ recording }) => pressInsert(vim, buffer, kept, recording, input),
  })

export const again = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  step: Replayed,
): Step => {
  const unchanged: Step = {
    vim,
    buffer,
    kept,
    fate: done,
    began: Option.none(),
  }
  const inStay = (stepped: (recording: Option.Option<Repeat>) => Step): Step =>
    Mode.match(vim.mode, {
      Normal: () => unchanged,
      Insert: ({ recording }) => stepped(recording),
    })
  return Replayed.match(step, {
    Run: ({ command, count }) => run(vim, buffer, kept, command, count),
    Typed: ({ input }) =>
      inStay(recording => pressInsert(vim, buffer, kept, recording, input)),
    Leave: () => inStay(recording => leaving(vim, buffer, kept, recording)),
  })
}

export const landed = (
  buffer: Buffer.Buffer,
  began: Buffer.Position,
  {
    at,
    size,
    changed,
  }: Readonly<{ at: number; size: number; changed: number }>,
): Buffer.Buffer => {
  const near = began.line >= at - 1 && began.line <= at + size
  const line = Math.min(near ? began.line : changed, buffer.lines.length - 1)
  return Buffer.moveTo(
    buffer,
    line === began.line ? began : firstNonBlankOf(buffer, line),
  )
}

export const pendingKeys = (vim: Vim): string => Keymap.shown(vim)
