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
  motionsOn,
  positionOf,
  spotOf,
} from './vim/motions'
import { objects } from './vim/objects'
import * as Operators from './vim/operators'
import * as Selection from './vim/selection'
import {
  type OperatorName,
  type Range,
  type TargetName,
  byKind,
  isObject,
  targetFor,
} from './vim/targets'

export const noRegisters = Operators.noRegisters

export const Recorded = Schema.TaggedUnion({
  Keys: { text: Schema.String },
  Other: { input: Input },
})
export type Recorded = typeof Recorded.Type

export const Repeat = Schema.Struct({
  command: Keymap.Command,
  count: Schema.UndefinedOr(Schema.Int),
  register: Operators.RegisterName,
  typed: Schema.Array(Recorded),
})
export type Repeat = typeof Repeat.Type

export const Kept = Schema.Struct({
  registers: Operators.Registers,
  dot: Schema.Option(Repeat),
})
export type Kept = typeof Kept.Type

export const nothingKept: Kept = { registers: noRegisters, dot: Option.none() }

export const Mode = Schema.TaggedUnion({
  Normal: {},
  Insert: { recording: Schema.Option(Repeat) },
  Visual: {
    kind: Selection.Kind,
    anchor: Buffer.Position,
    column: Selection.Column,
  },
})
export type Mode = typeof Mode.Type

type Visual = Readonly<{
  kind: Selection.Kind
  anchor: Buffer.Position
  column: Selection.Column
}>

const visualMode = (
  kind: Selection.Kind,
  anchor: Buffer.Position,
  column: Selection.Column,
): Mode => ({ _tag: 'Visual', kind, anchor, column })

const normalMode = Mode.cases.Normal.make({})

const unrecordedStay = Mode.cases.Insert.make({ recording: Option.none() })

export const Last = Schema.Struct({
  kind: Selection.Kind,
  anchor: Selection.Mark,
  cursor: Selection.Mark,
  want: Want,
})
export type Last = typeof Last.Type

export const Vim = Schema.Struct({
  mode: Mode,
  ...Keymap.Pending.fields,
  want: Want,
  last: Schema.Option(Last),
})
export type Vim = typeof Vim.Type

export const start: Vim = {
  mode: normalMode,
  ...Keymap.idle,
  want: 'Unset',
  last: Option.none(),
}

export const Replayed = Schema.TaggedUnion({
  Run: {
    command: Keymap.Command,
    count: Schema.UndefinedOr(Schema.Int),
    register: Operators.RegisterName,
  },
  Typed: { input: Input },
  Leave: {},
})
export type Replayed = typeof Replayed.Type

export const Put = Schema.Struct({
  side: Operators.Side,
  count: Schema.UndefinedOr(Schema.Int),
})
export type Put = typeof Put.Type

export const Fate = Schema.TaggedUnion({
  Done: {},
  Plain: { input: Input },
  Travel: { way: History.Way, count: Schema.Int },
  Replay: { steps: Schema.Array(Replayed) },
  ReadClipboard: { put: Put },
})
export type Fate = typeof Fate.Type

const done = Fate.cases.Done.make({})

export type Step = Readonly<{
  vim: Vim
  buffer: Buffer.Buffer
  kept: Kept
  fate: Fate
  began: Option.Option<Buffer.Position>
  clipboard: Option.Option<string>
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
    Paste: ({ byKey }) => (byKey ? Option.some('<C-v>') : Option.none()),
    Preedit: () => Option.none(),
    Commit: () => Option.none(),
  })

const isPasteByAnotherRoute = (input: Input): boolean =>
  input._tag === 'Paste' && !input.byKey

export const rest = (
  vim: Vim,
  buffer: Buffer.Buffer,
  atRowEnd: boolean,
): Buffer.Buffer => {
  if (vim.mode._tag === 'Insert') {
    return buffer
  }
  const { line, column } = buffer.caret
  const text = buffer.lines[line] ?? buffer.lines[0]
  if (vim.mode._tag === 'Visual' && column >= text.text.length) {
    return buffer
  }
  const cell = cellAt(text, atRowEnd ? column - 1 : column)
  const target = cellCount(text) === 0 ? 0 : cellStart(text, cell)
  return target === column
    ? buffer
    : Buffer.moveTo(buffer, { line, column: target })
}

const idle = (vim: Vim): Vim => ({ ...vim, ...Keymap.idle })

type Ends = Readonly<{ anchor: Buffer.Position; cursor: Buffer.Position }>

const leaveVisual = (
  vim: Vim,
  before: Buffer.Buffer,
  after: Buffer.Buffer = before,
  moved: (ends: Ends) => Ends = ends => ends,
): Vim => {
  if (vim.mode._tag !== 'Visual') {
    return vim
  }
  const selected = { anchor: vim.mode.anchor, cursor: before.caret }
  const ends = moved(selected)
  const last: Last = {
    kind: vim.mode.kind,
    anchor: Selection.markAt(before, after, selected.anchor, ends.anchor),
    cursor: Selection.markAt(before, after, selected.cursor, ends.cursor),
    want:
      vim.want === 'Unset'
        ? Selection.columnOf(
            before,
            Selection.endsOf(before, vim.mode.kind, vim.mode.anchor),
            'AsInVisual',
          )
        : vim.want,
  }
  return { ...idle(vim), mode: normalMode, last: Option.some(last) }
}

const toLineEnd = (vim: Vim): Vim => ({ ...vim, want: 'End' })

const interrupted = (vim: Vim): Vim => ({ ...idle(vim), want: 'Unset' })

export const clicked = (vim: Vim, buffer: Buffer.Buffer): Vim =>
  interrupted(leaveVisual(vim, buffer))

export const reshown = (vim: Vim): Vim => ({
  ...interrupted(vim),
  mode: vim.mode._tag === 'Visual' ? normalMode : vim.mode,
  last: Option.none(),
})

export const selection = (
  vim: Vim,
  buffer: Buffer.Buffer,
): Option.Option<Selection.Shown> =>
  vim.mode._tag === 'Visual'
    ? Option.some(
        Selection.shown(
          buffer,
          Selection.endsOf(buffer, vim.mode.kind, vim.mode.anchor),
        ),
      )
    : Option.none()

export const next = (
  vim: Vim,
): ReadonlyArray<Readonly<{ key: Keymap.Key; about: string }>> =>
  vim.mode._tag === 'Visual'
    ? Keymap.next(Keymap.visual, vim)
    : Keymap.next(Keymap.normal, vim)

const placeInsert = (
  buffer: Buffer.Buffer,
  at: Keymap.InsertAt,
): Buffer.Buffer => {
  const from = spotOf(buffer)
  const moved = (position: Buffer.Position) => Buffer.moveTo(buffer, position)
  const lineEnd = {
    line: from.line,
    column: Buffer.lineEnd(buffer, from.line),
  }
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
  operator: OperatorName,
  target: TargetName | 'Selection',
  range: Range,
): Buffer.Position => {
  const from = positionOf(buffer, range.from)
  return byKind(range, {
    Charwise: () => from,
    Linewise: () => {
      if (target === 'Lines' && range.from.line === range.to.line) {
        const lineStart = firstNonBlankOf(buffer, range.from.line)
        return Buffer.isBefore(buffer.caret, lineStart)
          ? buffer.caret
          : lineStart
      }
      return operator === 'Change' && range.to.line > range.from.line
        ? { line: from.line + 1, column: from.column }
        : from
    },
  })
}

const maxReplayedInputs = 20_000

const maxReplayedLineCopies = 100_000_000

const maxReplayedDeletes = 120

const maxRecordedInputs = 10_000

const mostReplayed = (lineCount: number): number =>
  Math.min(maxReplayedInputs, maxReplayedLineCopies / lineCount)

const typedText = (recorded: Recorded): string =>
  Recorded.match(recorded, {
    Keys: ({ text }) => text,
    Other: ({ input }) =>
      Input.match(input, {
        Key: ({ key }) => (key === 'Enter' ? '\n' : ''),
        Chord: () => '',
        Text: ({ text }) => text,
        Erase: () => '',
        Paste: ({ text }) => text,
        Preedit: () => '',
        Commit: ({ text }) => text,
      }),
  })

const inputCount = (recorded: Recorded): number =>
  recorded._tag === 'Keys' ? recorded.text.length : 1

const isDeleteKey = (recorded: Recorded): boolean =>
  recorded._tag === 'Other' &&
  recorded.input._tag === 'Key' &&
  recorded.input.key === 'Delete'

const isKeys = (recorded: Recorded): boolean => recorded._tag === 'Keys'

const typedStep = (input: Input): Replayed =>
  Replayed.cases.Typed.make({ input })

const enter = typedStep(
  Input.cases.Key.make({ key: 'Enter', modifiers: noModifiers }),
)

const leave = Replayed.cases.Leave.make({})

const runInserts =
  /^(?<lineFeeds>\n*)(?<firstKey>[^\n]?)(?<throughFirstBreak>[^\n]*\n*)(?<keyAfterBreak>[^\n]?)(?<rest>[^]*)$/u

const keySteps = (text: string): ReadonlyArray<Replayed> =>
  Array.map(
    Array.filter((runInserts.exec(text) ?? []).slice(1), part => part !== ''),
    part => typedStep(Input.cases.Text.make({ text: part, byKey: true })),
  )

const stepsOf = (recorded: Recorded): ReadonlyArray<Replayed> =>
  Recorded.match(recorded, {
    Keys: ({ text }) => keySteps(text),
    Other: ({ input }) => [typedStep(input)],
  })

const furtherCopies = (
  { command, count, typed }: Repeat,
  lineCount: number,
): ReadonlyArray<Replayed> => {
  if (command._tag !== 'Insert' && command._tag !== 'InsertAsSelected') {
    return []
  }
  const opensLine = command.at === 'LineBelow' || command.at === 'LineAbove'
  const opening = opensLine ? [enter] : []
  const text = Array.join(Array.map(typed, typedText), '')
  const isOneRun = Array.every(typed, isKeys)
  const deletes = Array.filter(typed, isDeleteKey).length
  const inputs = Array.reduce(
    typed,
    opening.length,
    (sum, entry) => sum + inputCount(entry),
  )
  const most = isOneRun ? maxReplayedInputs : mostReplayed(lineCount)
  const copies = Math.max(
    1,
    Math.min(
      Operators.boundedCount(
        Operators.letters((opensLine ? '\n' : '') + text),
        count ?? 1,
      ),
      Math.floor(most / Math.max(1, inputs)),
      deletes === 0 ? Infinity : Math.floor(maxReplayedDeletes / deletes),
    ),
  )
  if (copies === 1) {
    return []
  }
  if (!isOneRun) {
    return Array.flatten(
      Array.replicate(
        [...opening, ...Array.flatMap(typed, stepsOf)],
        copies - 1,
      ),
    )
  }
  return [
    ...opening,
    ...keySteps(
      opensLine
        ? text + `\n${text}`.repeat(copies - 2)
        : text.repeat(copies - 1),
    ),
  ]
}

const replayOf = (
  { command, register, typed }: Repeat,
  count: number | undefined,
  lineCount: number,
): Fate => {
  const stay = Array.flatMap(typed, stepsOf)
  return stay.length > mostReplayed(lineCount)
    ? done
    : Fate.cases.Replay.make({
        steps: [
          Replayed.cases.Run.make({ command, count, register }),
          ...stay,
          leave,
        ],
      })
}

const putStep = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  { side, count }: Put,
  name: Operators.RegisterName,
  held: Option.Option<Operators.Register>,
): Step => {
  const normal: Vim = { ...idle(vim), want: 'Unset' }
  const dot = Option.some({
    command: Keymap.Command.cases.Put.make({ side }),
    count,
    register: name,
    typed: [],
  })
  return {
    vim: Option.isSome(held) ? normal : idle(vim),
    buffer: Option.match(held, {
      onNone: () => buffer,
      onSome: register =>
        rest(normal, Operators.put(buffer, register, side, count ?? 1), false),
    }),
    kept: { ...kept, dot },
    fate: done,
    began: Option.none(),
    clipboard: Option.none(),
  }
}

const repeatOf = (
  operator: OperatorName,
  amount: Selection.Amount,
  register: Operators.RegisterName,
): Repeat => ({
  command: { _tag: 'OperateAmount', operator, amount },
  count: undefined,
  register,
  typed: [],
})

const putOverStep = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  visual: Visual,
  { side, count }: Put,
  held: Option.Option<Operators.Register>,
): Step => {
  const ends = Selection.endsOf(buffer, visual.kind, visual.anchor)
  const range = Selection.rangeOf(buffer, ends, 'AsSelected')
  const deletesInto =
    side === 'After' ? Operators.defaultRegister : Operators.blackHole
  const deleted = Operators.operators.Delete(
    buffer,
    range,
    kept.registers,
    deletesInto,
  )
  const put = Option.map(held, register =>
    Operators.putOver(buffer, deleted.buffer, range, register, count ?? 1),
  )
  const normal: Vim = {
    ...Option.match(put, {
      onNone: () =>
        leaveVisual(vim, buffer, deleted.buffer, () => ({
          anchor: positionOf(buffer, range.from),
          cursor: positionOf(buffer, range.from),
        })),
      onSome: ({ buffer: after, first, last }) =>
        leaveVisual(vim, buffer, after, () => ({
          anchor: first,
          cursor: last,
        })),
    }),
    want: 'Unset',
  }
  return {
    vim: normal,
    buffer: rest(
      normal,
      Option.match(put, {
        onNone: () => deleted.buffer,
        onSome: ({ buffer: after }) => after,
      }),
      false,
    ),
    kept: {
      registers: deleted.registers,
      dot: Option.some(
        repeatOf(
          'Delete',
          Selection.amountOf(buffer, ends, 'AsSelected', vim.want),
          deletesInto,
        ),
      ),
    },
    fate: done,
    began: Option.some(positionOf(buffer, range.from)),
    clipboard: Option.none(),
  }
}

export const putClipboard = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  put: Put,
  text: Option.Option<string>,
): Step => {
  const held = Option.map(text, Operators.fromClipboard)
  if (vim.mode._tag !== 'Visual') {
    return putStep(vim, buffer, kept, put, Operators.clipboardRegister, held)
  }
  return Option.isSome(held)
    ? putOverStep(vim, buffer, kept, vim.mode, put, held)
    : {
        vim: idle(vim),
        buffer,
        kept,
        fate: done,
        began: Option.none(),
        clipboard: Option.none(),
      }
}

const run = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  command: Keymap.Command,
  count: number | undefined,
  register: Operators.RegisterName,
): Step => {
  const cleared = idle(vim)
  const normal: Vim = { ...cleared, want: 'Unset' }
  const unchanged: Step = {
    vim: cleared,
    buffer,
    kept,
    fate: done,
    began: Option.none(),
    clipboard: Option.none(),
  }
  const repeat = Option.some({ command, count, register, typed: [] })
  const recordingStay: Vim = {
    ...normal,
    mode: { _tag: 'Insert', recording: repeat },
  }
  const operated = (
    operator: OperatorName,
    target: TargetName | 'Selection',
    range: Range,
  ): Step => {
    const applied = Operators.operators[operator](
      buffer,
      range,
      kept.registers,
      register,
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
      clipboard: applied.clipboard,
    }
  }
  return Keymap.Command.match(command, {
    Cancel: () => unchanged,
    Move: ({ motion }) => {
      if (motionFails(motion, buffer, spotOf(buffer), count)) {
        return motion === 'LineEnd'
          ? { ...unchanged, vim: toLineEnd(cleared) }
          : unchanged
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
        targetFor(operator, target)(buffer, spotOf(buffer), count, vim.want),
        {
          onNone: () =>
            isObject(target)
              ? { ...unchanged, vim: interrupted(vim) }
              : unchanged,
          onSome: range => operated(operator, target, range),
        },
      ),
    OperateAmount: ({ operator, amount }) =>
      operated(
        operator,
        'Selection',
        Selection.rangeFrom(buffer, spotOf(buffer), amount),
      ),
    Put: ({ side }) => {
      const source = Operators.registerFor(kept.registers, register)
      return source._tag === 'Clipboard'
        ? {
            ...unchanged,
            vim,
            fate: Fate.cases.ReadClipboard.make({ put: { side, count } }),
          }
        : putStep(vim, buffer, kept, { side, count }, register, source.register)
    },
    Insert: ({ at }): Step => ({
      ...unchanged,
      vim: recordingStay,
      buffer: placeInsert(buffer, at),
    }),
    InsertAsSelected: ({ at }): Step => ({
      ...unchanged,
      vim: recordingStay,
      buffer: placeInsert(buffer, at === 'Start' ? 'Here' : 'After'),
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
          fate: replayOf(
            last,
            last.command._tag === 'InsertAsSelected'
              ? last.count
              : (count ?? last.count),
            buffer.lines.length,
          ),
        }),
      }),
    Select: ({ kind }) => ({
      ...unchanged,
      vim: {
        ...cleared,
        mode: visualMode(kind, buffer.caret, 'AsInNormal'),
        want: Selection.wantBefore(buffer, vim.want),
      },
    }),
    Reselect: () => {
      const last = Option.getOrUndefined(vim.last)
      const anchor =
        last === undefined
          ? undefined
          : Selection.marked(buffer, last.anchor, 'Nowhere')
      const cursor =
        last === undefined
          ? undefined
          : Selection.marked(buffer, last.cursor, 'LastLine')
      return last === undefined || anchor === undefined || cursor === undefined
        ? unchanged
        : {
            ...unchanged,
            vim: {
              ...cleared,
              mode: visualMode(last.kind, anchor, 'AsInVisual'),
              want: last.want,
            },
            buffer: Buffer.moveTo(buffer, cursor),
          }
    },
  })
}

const runVisual = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  visual: Visual,
  command: Keymap.VisualCommand,
  count: number | undefined,
  register: Operators.RegisterName,
): Step => {
  const cleared = idle(vim)
  const unchanged: Step = {
    vim: cleared,
    buffer,
    kept,
    fate: done,
    began: Option.none(),
    clipboard: Option.none(),
  }
  const stays = (caret: Buffer.Position): boolean =>
    caret.line === buffer.caret.line && caret.column === buffer.caret.column
  const columnAfter = (caret: Buffer.Position): Selection.Column =>
    stays(caret) ? visual.column : 'AsInVisual'
  const wantWhere = (caret: Buffer.Position): Want =>
    stays(caret)
      ? Selection.columnOf(
          buffer,
          Selection.endsOf(buffer, visual.kind, visual.anchor),
          visual.column,
        )
      : 'Unset'
  const left = (): Step => {
    const normal = leaveVisual(vim, buffer)
    return { ...unchanged, vim: normal, buffer: rest(normal, buffer, false) }
  }
  return Keymap.VisualCommand.match(command, {
    Operate: ({ operator, reach }) => {
      const ends = Selection.endsOf(buffer, visual.kind, visual.anchor)
      const range = Selection.rangeOf(buffer, ends, reach)
      const repeat = Option.some(
        repeatOf(
          operator,
          Selection.amountOf(buffer, ends, reach, vim.want),
          register,
        ),
      )
      const applied = Operators.operators[operator](
        buffer,
        range,
        kept.registers,
        register,
      )
      const moved = (mark: Buffer.Position) =>
        Selection.movedBy(operator, range, positionOf(buffer, range.from), mark)
      const normal = leaveVisual(vim, buffer, applied.buffer, ends => ({
        anchor: moved(ends.anchor),
        cursor: moved(ends.cursor),
      }))
      const after: Vim = applied.inserting
        ? {
            ...normal,
            mode: { _tag: 'Insert', recording: repeat },
            want: 'Unset',
          }
        : { ...normal, want: 'Unset' }
      const rested = rest(after, applied.buffer, false)
      return {
        vim:
          operator === 'Yank'
            ? { ...after, want: wantWhere(rested.caret) }
            : after,
        buffer: rested,
        kept: {
          registers: applied.registers,
          dot: operator === 'Delete' ? repeat : kept.dot,
        },
        fate: done,
        began: Option.some(changeBegan(buffer, operator, 'Selection', range)),
        clipboard: applied.clipboard,
      }
    },
    Insert: ({ at }): Step => {
      const ends = Selection.endsOf(buffer, visual.kind, visual.anchor)
      const stay: Repeat = {
        command: { _tag: 'InsertAsSelected', at },
        count,
        register: Operators.defaultRegister,
        typed: [],
      }
      return {
        ...unchanged,
        vim: {
          ...leaveVisual(vim, buffer),
          mode: { _tag: 'Insert', recording: Option.some(stay) },
          want: 'Unset',
        },
        buffer: Buffer.moveTo(
          buffer,
          at === 'Start'
            ? Selection.insertAt(buffer, ends)
            : Selection.appendAt(buffer, ends),
        ),
      }
    },
    Replace: ({ side }) => {
      const source = Operators.registerFor(kept.registers, register)
      return source._tag === 'Clipboard'
        ? {
            ...unchanged,
            vim,
            fate: Fate.cases.ReadClipboard.make({ put: { side, count } }),
          }
        : putOverStep(
            vim,
            buffer,
            kept,
            visual,
            { side, count },
            emptyLineFrom[visual.kind] && register._tag === 'BlackHole'
              ? Option.some(Operators.wholeLines('\n'))
              : source.register,
          )
    },
    Move: ({ motion }) => {
      const ends = Selection.endsOf(buffer, visual.kind, visual.anchor)
      const from = ends.cursor
      if (motionFails(motion, buffer, from, count)) {
        return motion === 'LineEnd'
          ? { ...unchanged, vim: toLineEnd(cleared) }
          : unchanged
      }
      const { spot, want } = motionsOn('LineBreak')[motion](
        buffer,
        from,
        count,
        Selection.wantOf(buffer, ends, vim.want),
      )
      const caret = positionOf(buffer, spot)
      return {
        ...unchanged,
        vim: {
          ...cleared,
          mode: visualMode(visual.kind, visual.anchor, columnAfter(caret)),
          want,
        },
        buffer: Buffer.moveTo(buffer, caret),
      }
    },
    Pick: ({ object }): Step => {
      const picked = objects[object].pick(
        buffer,
        Selection.endsOf(buffer, visual.kind, visual.anchor),
        count ?? 1,
      )
      const caret = positionOf(buffer, picked.cursor)
      return {
        ...unchanged,
        vim: {
          ...cleared,
          mode: visualMode(
            picked.kind === 'Kept' ? visual.kind : picked.kind,
            positionOf(buffer, picked.anchor),
            columnAfter(caret),
          ),
          want: wantWhere(caret),
        },
        buffer: Buffer.moveTo(buffer, caret),
      }
    },
    Swap: (): Step => ({
      ...unchanged,
      vim: {
        ...cleared,
        mode: visualMode(visual.kind, buffer.caret, columnAfter(visual.anchor)),
        want: wantWhere(visual.anchor),
      },
      buffer: Buffer.moveTo(buffer, visual.anchor),
    }),
    Select: ({ kind }) =>
      kind === visual.kind
        ? left()
        : {
            ...unchanged,
            vim: {
              ...cleared,
              mode: visualMode(kind, visual.anchor, visual.column),
            },
          },
    Leave: (): Step => {
      const { vim: normal, ...step } = left()
      return {
        ...step,
        vim: { ...normal, want: wantWhere(step.buffer.caret) },
      }
    },
    Ignore: () => unchanged,
  })
}

const emptyLineFrom: Readonly<Record<Selection.Kind, boolean>> = {
  Letters: false,
  Lines: true,
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
    clipboard: Option.none(),
  }
  if (isPasteByAnotherRoute(input) || isPageKey(input)) {
    return {
      ...unchanged,
      vim: interrupted(vim),
      fate: { _tag: 'Plain', input },
    }
  }
  return Option.match(keyOf(input), {
    onNone: () => unchanged,
    onSome: key => {
      const advance = Keymap.advance(Keymap.normal, vim, key)
      return advance._tag === 'Run'
        ? run(
            vim,
            buffer,
            kept,
            advance.command,
            advance.count,
            advance.register,
          )
        : advance._tag === 'Wait'
          ? { ...unchanged, vim: { ...vim, ...advance.pending } }
          : { ...unchanged, vim: idle(vim) }
    },
  })
}

const pressVisual = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  visual: Visual,
  input: Input,
): Step => {
  const unchanged: Step = {
    vim,
    buffer,
    kept,
    fate: done,
    began: Option.none(),
    clipboard: Option.none(),
  }
  if (isPageKey(input)) {
    return {
      ...unchanged,
      vim: {
        ...interrupted(vim),
        mode: visualMode(visual.kind, visual.anchor, 'AsInVisual'),
      },
      fate: { _tag: 'Plain', input },
    }
  }
  if (isPasteByAnotherRoute(input)) {
    const range = Selection.rangeOf(
      buffer,
      Selection.endsOf(buffer, visual.kind, visual.anchor),
      'AsSelected',
    )
    const erased = Operators.operators.Change(
      buffer,
      range,
      kept.registers,
      Operators.blackHole,
    )
    return {
      ...unchanged,
      vim: interrupted(leaveVisual(vim, buffer)),
      buffer: erased.buffer,
      fate: { _tag: 'Plain', input },
      began: Option.some(changeBegan(buffer, 'Change', 'Selection', range)),
    }
  }
  return Option.match(keyOf(input), {
    onNone: () => unchanged,
    onSome: key => {
      const advance = Keymap.advance(Keymap.visual, vim, key)
      return advance._tag === 'Run'
        ? runVisual(
            vim,
            buffer,
            kept,
            visual,
            advance.command,
            advance.count,
            advance.register,
          )
        : advance._tag === 'Wait'
          ? { ...unchanged, vim: { ...vim, ...advance.pending } }
          : { ...unchanged, vim: idle(vim) }
    },
  })
}

const leavesInsert = (input: Input): boolean =>
  Option.exists(keyOf(input), key => key === '<Esc>' || key === '<C-[>')

const leaveInsert = (vim: Vim, buffer: Buffer.Buffer, kept: Kept): Step => {
  const settled = Buffer.settle(buffer)
  const back = Buffer.backspaceTarget(settled)
  return {
    vim: { ...start, last: vim.last },
    buffer: rest(
      start,
      back.line === settled.caret.line ? Buffer.moveTo(settled, back) : settled,
      false,
    ),
    kept,
    fate: done,
    began: Option.none(),
    clipboard: Option.none(),
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
    onNone: () => leaveInsert(vim, buffer, kept),
    onSome: repeat => ({
      vim: { ...vim, mode: unrecordedStay },
      buffer,
      kept: { ...kept, dot: recording },
      fate: Fate.cases.Replay.make({
        steps: [...furtherCopies(repeat, buffer.lines.length), leave],
      }),
      began: Option.none(),
      clipboard: Option.none(),
    }),
  })

const printableKeys = /^[\x20-\x7e\n]+$/u

const isPastLineStart = (run: string): boolean =>
  run !== '' && !run.endsWith('\n')

const runWith = (run: string, input: Input): Option.Option<string> => {
  if (input._tag === 'Text') {
    return input.byKey &&
      printableKeys.test(input.text) &&
      (input.text.length === 1 || isPastLineStart(run))
      ? Option.some(run + input.text)
      : Option.none()
  }
  if (input._tag !== 'Key' || run === '') {
    return Option.none()
  }
  if (input.key === 'Enter') {
    return Option.some(run + '\n')
  }
  if (input.key === 'Tab') {
    return isPastLineStart(run) ? Option.some(run + '  ') : Option.none()
  }
  return input.key === 'Backspace' &&
    run.length > 1 &&
    !run.slice(-2).includes('\n')
    ? Option.some(run.slice(0, -1))
    : Option.none()
}

const typedWith = (
  typed: ReadonlyArray<Recorded>,
  input: Input,
): ReadonlyArray<Recorded> => {
  const last = typed[typed.length - 1]
  const run = last?._tag === 'Keys' ? last.text : ''
  return Option.match(runWith(run, input), {
    onNone: () => [...typed, { _tag: 'Other', input }],
    onSome: text => [
      ...(run === '' ? typed : typed.slice(0, -1)),
      { _tag: 'Keys', text },
    ],
  })
}

const stayWith = (
  vim: Vim,
  kept: Kept,
  repeat: Repeat,
  input: Input,
): Pick<Step, 'vim' | 'kept'> => {
  const typed = typedWith(repeat.typed, input)
  return typed.length > maxRecordedInputs
    ? {
        vim: { ...vim, mode: unrecordedStay },
        kept: { ...kept, dot: Option.none() },
      }
    : {
        vim: {
          ...vim,
          mode: {
            _tag: 'Insert',
            recording: Option.some({ ...repeat, typed }),
          },
        },
        kept,
      }
}

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
        ...Option.match(recording, {
          onNone: () => ({ vim, kept }),
          onSome: repeat =>
            isRecorded(buffer, input)
              ? stayWith(vim, kept, repeat, input)
              : { vim, kept },
        }),
        buffer,
        fate: { _tag: 'Plain', input },
        began: Option.none(),
        clipboard: Option.none(),
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
    Visual: visual => pressVisual(vim, buffer, kept, visual, input),
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
    clipboard: Option.none(),
  }
  const inStay = (stepped: (recording: Option.Option<Repeat>) => Step): Step =>
    Mode.match(vim.mode, {
      Normal: () => unchanged,
      Insert: ({ recording }) => stepped(recording),
      Visual: () => unchanged,
    })
  return Replayed.match(step, {
    Run: ({ command, count, register }) =>
      run(vim, buffer, kept, command, count, register),
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

export type ModeName = 'Normal' | 'Insert' | 'Visual' | 'VisualLine'

const visualModeNames: Readonly<Record<Selection.Kind, ModeName>> = {
  Letters: 'Visual',
  Lines: 'VisualLine',
}

export const modeName = (vim: Vim): ModeName =>
  Mode.match(vim.mode, {
    Normal: (): ModeName => 'Normal',
    Insert: (): ModeName => 'Insert',
    Visual: ({ kind }): ModeName => visualModeNames[kind],
  })
