import { Array, Match, Option, Schema } from 'effect'

import * as Buffer from './buffer'
import * as History from './history'
import { Input, type NamedKey, isControlAlone, noModifiers } from './input'
import { cellAt, cellCount, cellStart } from './vim/cells'
import * as Ex from './vim/command'
import * as Keymap from './vim/keymap'
import {
  type Spot,
  Want,
  cellsIn,
  endOf,
  firstFilled,
  firstNonBlank,
  motionFails,
  motions,
  motionsOn,
  positionOf,
  spotAt,
  spotOf,
} from './vim/motions'
import { type Picked, objects } from './vim/objects'
import * as Operators from './vim/operators'
import * as Seek from './vim/seek'
import * as Selection from './vim/selection'
import {
  OperatorName,
  type Range,
  type TargetName,
  byKind,
  isObject,
  rangeToLanding,
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

export const PromptHistories = Schema.Struct({
  search: Schema.Array(Schema.String),
  command: Schema.Array(Schema.String),
})
export type PromptHistories = typeof PromptHistories.Type

export const Kept = Schema.Struct({
  registers: Operators.Registers,
  dot: Schema.Option(Repeat),
  seek: Seek.Memory,
  history: PromptHistories,
})
export type Kept = typeof Kept.Type

export const nothingKept: Kept = {
  registers: noRegisters,
  dot: Option.none(),
  seek: Seek.forgotten,
  history: { search: [], command: [] },
}

export const BlockStay = Schema.Struct({
  rule: Operators.BlockRule,
  block: Selection.Block,
  held: Schema.Struct({
    column: Schema.Int,
    length: Schema.Int,
    kept: Schema.Int,
    indent: Schema.Struct({ letters: Schema.Int, columns: Schema.Int }),
  }),
  lines: Schema.Int,
  seen: Schema.NonEmptyArray(Buffer.Line),
  home: Schema.Int,
  entered: Schema.Int,
  run: Schema.Struct({
    at: Buffer.Position,
    origin: Buffer.Position,
    hasMoved: Schema.Boolean,
    originFollows: Schema.Boolean,
    isUntouched: Schema.Boolean,
  }),
})
export type BlockStay = typeof BlockStay.Type

export const Mode = Schema.TaggedUnion({
  Normal: {},
  Insert: {
    recording: Schema.Option(Repeat),
    block: Schema.Option(BlockStay),
  },
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

type Stay = Readonly<{
  recording: Option.Option<Repeat>
  block: Option.Option<BlockStay>
}>

const insertMode = (
  recording: Option.Option<Repeat>,
  block: Option.Option<BlockStay> = Option.none(),
): Mode => ({ _tag: 'Insert', recording, block })

const blockStay = (
  rule: Operators.BlockRule,
  block: Selection.Block,
  held: Operators.Held,
  opened: Buffer.Buffer,
  home: Buffer.Position,
): Option.Option<BlockStay> =>
  Option.some({
    rule,
    block,
    held,
    lines: opened.lines.length,
    seen: opened.lines,
    home: home.column,
    entered: opened.caret.column,
    run: Operators.runFrom(opened.caret),
  })

export const passed = (
  vim: Vim,
  before: Buffer.Buffer,
  after: Buffer.Buffer,
): Vim => {
  if (vim.mode._tag !== 'Insert' || Option.isNone(vim.mode.block)) {
    return vim
  }
  const stay = vim.mode.block.value
  if (stay.seen !== before.lines) {
    return vim
  }
  const run = Operators.runAfter(stay.run, before, after)
  return run === stay.run && before.lines === after.lines
    ? vim
    : {
        ...vim,
        mode: insertMode(
          vim.mode.recording,
          Option.some({ ...stay, seen: after.lines, run }),
        ),
      }
}

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

export const Resume = Schema.TaggedUnion({
  Search: {
    way: Seek.Way,
    operator: Schema.Option(OperatorName),
    count: Schema.UndefinedOr(Schema.Int),
    register: Operators.RegisterName,
  },
  Command: {},
})
export type Resume = typeof Resume.Type

type SearchResume = Extract<Resume, { _tag: 'Search' }>

export const promptLead = (resume: Resume): string =>
  Resume.match(resume, {
    Search: ({ way }) => (way === 'Forward' ? '/' : '?'),
    Command: () => ':',
  })

export const promptHistory = (
  kept: Kept,
  resume: Resume,
): ReadonlyArray<string> =>
  Resume.match(resume, {
    Search: () => kept.history.search,
    Command: () => kept.history.command,
  })

export const withPromptHistory = (
  kept: Kept,
  resume: Resume,
  history: ReadonlyArray<string>,
): Kept => ({
  ...kept,
  history: Resume.match(resume, {
    Search: () => ({ ...kept.history, search: history }),
    Command: () => ({ ...kept.history, command: history }),
  }),
})

export const Fate = Schema.TaggedUnion({
  Done: {},
  Plain: { input: Input },
  Travel: { way: History.Way, count: Schema.Int },
  Replay: { steps: Schema.Array(Replayed) },
  ReadClipboard: { put: Put },
  OpenPrompt: { resume: Resume },
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
  notice: Option.Option<string>
  save: boolean
}>

const stepOf = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  over: Partial<Step> = {},
): Step => ({
  vim,
  buffer,
  kept,
  fate: done,
  began: Option.none(),
  clipboard: Option.none(),
  notice: Option.none(),
  save: false,
  ...over,
})

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

const keyOf = (
  input: Input,
  awaitsArgument: () => boolean = () => false,
): Option.Option<Keymap.Key> => {
  const longerText = (text: string): Option.Option<Keymap.Key> =>
    text !== '' && awaitsArgument()
      ? Option.some(Keymap.longerText)
      : Option.none()
  return Input.match(input, {
    Key: ({ key, modifiers }) =>
      Option.some(`<${modifiers.ctrl ? 'C-' : ''}${keyNames[key]}>`),
    Chord: ({ char, modifiers }) =>
      modifiers.ctrl ? Option.some(`<C-${char.toLowerCase()}>`) : Option.none(),
    Text: ({ text }) =>
      isOneGrapheme(text) ? Option.some(text) : longerText(text),
    Erase: () => Option.none(),
    Paste: ({ byKey }) => (byKey ? Option.some('<C-v>') : Option.none()),
    Preedit: () => Option.none(),
    Commit: ({ text }) =>
      awaitsArgument()
        ? isOneGrapheme(text)
          ? Option.some(text)
          : longerText(text)
        : Option.none(),
  })
}

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

export const idle = (vim: Vim): Vim => ({ ...vim, ...Keymap.idle })

type Marks = Readonly<{ anchor: Buffer.Position; cursor: Buffer.Position }>

const leaveVisual = (
  vim: Vim,
  before: Buffer.Buffer,
  after: Buffer.Buffer = before,
  moved: (marks: Marks) => Marks = marks => marks,
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

export type Shown =
  | Selection.Shown
  | Readonly<{ kind: 'Block'; spans: ReadonlyArray<Selection.Span> }>

export const selection = (
  vim: Vim,
  buffer: Buffer.Buffer,
  drawn: Readonly<{ first: number; last: number }>,
): Option.Option<Shown> =>
  vim.mode._tag === 'Visual'
    ? Option.some(
        Selection.byShape(
          Selection.endsOf(buffer, vim.mode.kind, vim.mode.anchor),
          {
            Stretch: (stretch): Shown => Selection.shown(buffer, stretch),
            Block: (corners): Shown => ({
              kind: 'Block',
              spans: Selection.spansOf(
                buffer,
                corners,
                vim.want === 'End',
                drawn,
              ),
            }),
          },
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
  if (
    command._tag !== 'Insert' &&
    command._tag !== 'InsertAsSelected' &&
    command._tag !== 'InsertInBlock'
  ) {
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
  return stepOf(
    Option.isSome(held) ? normal : idle(vim),
    Option.match(held, {
      onNone: () => buffer,
      onSome: register =>
        rest(normal, Operators.put(buffer, register, side, count ?? 1), false),
    }),
    { ...kept, dot },
  )
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

const blockRepeatOf = (
  operator: OperatorName,
  block: Selection.Block,
  register: Operators.RegisterName,
): Repeat => ({
  command: {
    _tag: 'OperateBlock',
    operator,
    amount: Selection.blockAmountOf(block),
  },
  count: undefined,
  register,
  typed: [],
})

type Replaced = Readonly<{
  deleted: Operators.Applied
  put: Option.Option<Operators.Placed>
  began: Buffer.Position
  dot: Repeat
}>

const putOverStep = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  visual: Visual,
  { side, count }: Put,
  held: Option.Option<Operators.Register>,
): Step => {
  const deletesInto =
    side === 'After' ? Operators.defaultRegister : Operators.blackHole
  const { deleted, put, began, dot } = Selection.byShape(
    Selection.endsOf(buffer, visual.kind, visual.anchor),
    {
      Stretch: (ends): Replaced => {
        const range = Selection.rangeOf(buffer, ends, 'AsSelected')
        const removed = Operators.operators.Delete(
          buffer,
          range,
          kept.registers,
          deletesInto,
        )
        return {
          deleted: removed,
          put: Option.map(held, register =>
            Operators.putOver(
              buffer,
              removed.buffer,
              range,
              register,
              count ?? 1,
            ),
          ),
          began: positionOf(buffer, range.from),
          dot: repeatOf(
            'Delete',
            Selection.amountOf(buffer, ends, 'AsSelected', vim.want),
            deletesInto,
          ),
        }
      },
      Block: (corners): Replaced => {
        const block = Selection.blockOf(buffer, corners, vim.want === 'End')
        const removed = Operators.blockOperators.Delete(
          buffer,
          block,
          kept.registers,
          deletesInto,
        )
        return {
          deleted: removed,
          put: Option.map(held, register =>
            Operators.putOverBlock(
              buffer,
              removed.buffer,
              block,
              visual.anchor,
              register,
              side,
              count ?? 1,
            ),
          ),
          began: Operators.homeOf(buffer, block),
          dot: blockRepeatOf('Delete', block, deletesInto),
        }
      },
    },
  )
  const normal: Vim = {
    ...Option.match(put, {
      onNone: () => {
        const landed =
          began.line < deleted.buffer.lines.length
            ? rest(
                { ...vim, mode: normalMode },
                Buffer.moveTo(deleted.buffer, began),
                false,
              ).caret
            : began
        return leaveVisual(vim, buffer, deleted.buffer, () => ({
          anchor: landed,
          cursor: landed,
        }))
      },
      onSome: ({ buffer: after, first, last }) =>
        leaveVisual(vim, buffer, after, () => ({
          anchor: first,
          cursor: last,
        })),
    }),
    want: 'Unset',
  }
  return stepOf(
    normal,
    rest(
      normal,
      Option.match(put, {
        onNone: () => deleted.buffer,
        onSome: ({ buffer: after }) => after,
      }),
      false,
    ),
    { ...kept, registers: deleted.registers, dot: Option.some(dot) },
    { began: Option.some(began) },
  )
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
    : stepOf(idle(vim), buffer, kept)
}

const lastAfterSplits = (
  last: Option.Option<Last>,
  buffer: Buffer.Buffer,
  after: Buffer.Buffer,
  block: Selection.Block,
): Option.Option<Last> => {
  const moved = (mark: Selection.Mark): Selection.Mark => {
    const at = Selection.marked(buffer, mark, 'Nowhere')
    if (at === undefined) {
      return mark
    }
    const position = {
      line: Operators.lineAfterSplits(buffer, block, at.line),
      column: at.column,
    }
    return Selection.markAt(after, after, position, position)
  }
  return Option.map(last, kept => ({
    ...kept,
    anchor: moved(kept.anchor),
    cursor: moved(kept.cursor),
  }))
}

const startOf = (buffer: Buffer.Buffer, range: Range): Buffer.Position =>
  byKind(range, {
    Charwise: () => positionOf(buffer, range.from),
    Linewise: () => ({ line: range.from.line, column: 0 }),
  })

const blockRules: Readonly<
  Record<Keymap.SelectionEdge, Exclude<Operators.BlockRule, 'Change'>>
> = { Start: 'Insert', End: 'Append' }

const keepsItsCount = ({ _tag }: Keymap.Command): boolean =>
  _tag === 'InsertAsSelected' || _tag === 'InsertInBlock'

const soughtStep = (
  unchanged: Step,
  kept: Kept,
  cleared: Vim,
  sought: Seek.Sought,
): Step => ({
  ...unchanged,
  vim:
    sought._tag === 'Failed' && sought.resetsColumn
      ? { ...cleared, want: 'Unset' }
      : cleared,
  kept: { ...kept, seek: sought.memory },
  notice: sought.notice,
})

const opening = (unchanged: Step, vim: Vim, resume: Resume): Step => ({
  ...unchanged,
  vim,
  fate: Fate.cases.OpenPrompt.make({ resume }),
})

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
  const unchanged: Step = stepOf(cleared, buffer, kept)
  const repeat = Option.some({ command, count, register, typed: [] })
  const recordingStay: Vim = { ...normal, mode: insertMode(repeat) }
  const replacedStep = (after: Buffer.Buffer, began: Buffer.Position): Step =>
    stepOf(
      normal,
      rest(normal, after, false),
      { ...kept, dot: repeat },
      { began: Option.some(began) },
    )
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
    return stepOf(
      after,
      rest(after, applied.buffer, false),
      {
        ...kept,
        registers: applied.registers,
        dot: operator === 'Delete' ? repeat : kept.dot,
      },
      {
        began: Option.some(changeBegan(buffer, operator, target, range)),
        clipboard: applied.clipboard,
      },
    )
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
    OpenSearch: ({ way, operator }) =>
      opening(
        unchanged,
        vim,
        Resume.cases.Search.make({ way, operator, count, register }),
      ),
    OpenCommand: () =>
      opening(unchanged, cleared, Resume.cases.Command.make({})),
    OpenJump: () => unchanged,
    Seek: ({ seek }) => {
      const sought = Seek.sought(
        buffer,
        spotOf(buffer),
        seek,
        count,
        kept.seek,
        'LastLetter',
      )
      const remembered = soughtStep(unchanged, kept, cleared, sought)
      return Match.value(sought).pipe(
        Match.tagsExhaustive({
          Landed: ({ landing }): Step => ({
            ...remembered,
            vim: normal,
            buffer: Buffer.moveTo(buffer, positionOf(buffer, landing.spot)),
          }),
          Failed: ({ cursor }): Step =>
            Option.match(cursor, {
              onNone: () => remembered,
              onSome: spot => ({
                ...remembered,
                buffer: Buffer.moveTo(buffer, positionOf(buffer, spot)),
              }),
            }),
        }),
      )
    },
    OperateSeek: ({ operator, seek }) => {
      const from = spotOf(buffer)
      const sought = Seek.sought(
        buffer,
        from,
        seek,
        count,
        kept.seek,
        'LastLetter',
      )
      if (sought._tag === 'Failed') {
        return soughtStep(unchanged, kept, cleared, sought)
      }
      const step = operated(
        operator,
        'Selection',
        rangeToLanding(operator, buffer, from, sought.landing),
      )
      return {
        ...step,
        kept: { ...step.kept, seek: sought.memory },
        notice: sought.notice,
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
    OperateBlock: ({ operator, amount }) => {
      const block = Selection.blockFrom(
        buffer,
        spotOf(buffer),
        amount,
        vim.want,
      )
      const home = Operators.homeOf(buffer, block)
      const applied = Operators.blockOperators[operator](
        buffer,
        block,
        kept.registers,
        register,
      )
      const after: Vim = applied.inserting
        ? {
            ...normal,
            mode: insertMode(
              repeat,
              blockStay(
                'Change',
                block,
                Operators.changeHeld(applied.buffer),
                applied.buffer,
                home,
              ),
            ),
          }
        : normal
      return stepOf(
        after,
        rest(after, applied.buffer, false),
        {
          ...kept,
          registers: applied.registers,
          dot: operator === 'Delete' ? repeat : kept.dot,
        },
        { began: Option.some(home), clipboard: applied.clipboard },
      )
    },
    ReplaceLetters: ({ letter }) => {
      const from = spotOf(buffer)
      const letters = count ?? 1
      if (from.cell + letters > cellsIn(buffer, from.line)) {
        return unchanged
      }
      const replacing = Operators.lettersWithin(letter, letters)
      const start = positionOf(buffer, from)
      const end = positionOf(buffer, {
        line: from.line,
        cell: from.cell + replacing,
      })
      return replacedStep(
        letter === '\n'
          ? Buffer.insert(Buffer.erase(buffer, start, end), '\n')
          : Buffer.moveTo(
              Buffer.rewrite(buffer, [
                {
                  line: from.line,
                  from: start.column,
                  to: end.column,
                  text: letter.repeat(replacing),
                },
              ]),
              {
                line: from.line,
                column: start.column + letter.length * (replacing - 1),
              },
            ),
        start,
      )
    },
    ReplaceAmount: ({ letter, amount }) => {
      const range = Selection.rangeFrom(buffer, spotOf(buffer), amount)
      return replacedStep(
        Buffer.moveTo(
          Operators.replaced(buffer, range, letter),
          startOf(buffer, range),
        ),
        positionOf(buffer, range.from),
      )
    },
    ReplaceBlock: ({ letter, amount }) => {
      const block = Selection.blockFrom(
        buffer,
        spotOf(buffer),
        amount,
        vim.want,
      )
      const home = Operators.homeOf(buffer, block)
      const after = Operators.blockReplaced(buffer, block, letter)
      const step = replacedStep(Buffer.moveTo(after, home), home)
      return letter === '\n'
        ? {
            ...step,
            vim: {
              ...step.vim,
              last: lastAfterSplits(vim.last, buffer, after, block),
            },
          }
        : step
    },
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
    InsertInBlock: ({ at, amount }): Step => {
      const block = Selection.blockFrom(
        buffer,
        spotOf(buffer),
        amount,
        vim.want,
      )
      const rule = blockRules[at]
      const opened = Operators.blockOpened(buffer, block, rule)
      return {
        ...unchanged,
        vim: {
          ...normal,
          mode: insertMode(
            repeat,
            blockStay(
              rule,
              block,
              opened.held,
              opened.buffer,
              Operators.homeOf(buffer, block),
            ),
          ),
        },
        buffer: opened.buffer,
        began: Option.some(opened.began),
      }
    },
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
            keepsItsCount(last.command) ? last.count : (count ?? last.count),
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

type Operated = Readonly<{
  applied: Operators.Applied
  repeat: Repeat
  normal: Vim
  began: Buffer.Position
  block: Option.Option<BlockStay>
  yanked: (caret: Buffer.Position) => Want
}>

const stretchReaches: Readonly<Record<Keymap.Reach, Selection.Reach>> = {
  AsSelected: 'AsSelected',
  WholeLines: 'WholeLines',
  LinesOrBlock: 'WholeLines',
  LinesOrBlockToLineEnds: 'WholeLines',
}

const keptKind: Readonly<Record<Selection.Kind, Selection.Kind>> = {
  Letters: 'Letters',
  Lines: 'Lines',
  Block: 'Block',
}

const pickedKinds: Readonly<
  Record<Picked['kind'], Readonly<Record<Selection.Kind, Selection.Kind>>>
> = {
  Kept: keptKind,
  Letters: { Letters: 'Letters', Lines: 'Letters', Block: 'Letters' },
  LettersOrBlock: { Letters: 'Letters', Lines: 'Letters', Block: 'Block' },
  Lines: { Letters: 'Lines', Lines: 'Lines', Block: 'Lines' },
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
  const unchanged: Step = stepOf(cleared, buffer, kept)
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
  const ends = Selection.endsOf(buffer, visual.kind, visual.anchor)
  const swapped = (): Step => ({
    ...unchanged,
    vim: {
      ...cleared,
      mode: visualMode(visual.kind, buffer.caret, columnAfter(visual.anchor)),
      want: wantWhere(visual.anchor),
    },
    buffer: Buffer.moveTo(buffer, visual.anchor),
  })
  return Keymap.VisualCommand.match(command, {
    Operate: ({ operator, reach }) => {
      const overStretch = (
        stretch: Selection.Stretch,
        over: Selection.Reach,
      ): Operated => {
        const range = Selection.rangeOf(buffer, stretch, over)
        const applied = Operators.operators[operator](
          buffer,
          range,
          kept.registers,
          register,
        )
        const moved = (mark: Buffer.Position) =>
          Selection.movedBy(
            operator,
            range,
            positionOf(buffer, range.from),
            mark,
          )
        return {
          applied,
          repeat: repeatOf(
            operator,
            Selection.amountOf(buffer, stretch, over, vim.want),
            register,
          ),
          normal: leaveVisual(vim, buffer, applied.buffer, marks => ({
            anchor: moved(marks.anchor),
            cursor: moved(marks.cursor),
          })),
          began: changeBegan(buffer, operator, 'Selection', range),
          block: Option.none(),
          yanked: wantWhere,
        }
      }
      const overBlock = (
        corners: Selection.Corners,
        toLineEnds: boolean,
      ): Operated => {
        const block = Selection.blockOf(buffer, corners, toLineEnds)
        const home = Operators.homeOf(buffer, block)
        const applied = Operators.blockOperators[operator](
          buffer,
          block,
          kept.registers,
          register,
        )
        return {
          applied,
          repeat: blockRepeatOf(operator, block, register),
          normal: leaveVisual(
            toLineEnds ? toLineEnd(vim) : vim,
            buffer,
            applied.buffer,
          ),
          began: home,
          block: blockStay(
            'Change',
            block,
            Operators.changeHeld(applied.buffer),
            applied.buffer,
            home,
          ),
          yanked: caret =>
            stays(caret)
              ? Selection.wantAfterYank(buffer, block, wantWhere(caret))
              : 'Unset',
        }
      }
      const overCorners: Readonly<
        Record<Keymap.Reach, (corners: Selection.Corners) => Operated>
      > = {
        AsSelected: corners => overBlock(corners, vim.want === 'End'),
        WholeLines: corners =>
          overStretch(Selection.asLines(corners), 'WholeLines'),
        LinesOrBlock: corners => overBlock(corners, vim.want === 'End'),
        LinesOrBlockToLineEnds: corners => overBlock(corners, true),
      }
      const { applied, repeat, normal, began, block, yanked } =
        Selection.byShape(ends, {
          Stretch: stretch => overStretch(stretch, stretchReaches[reach]),
          Block: overCorners[reach],
        })
      const dot = Option.some(repeat)
      const after: Vim = applied.inserting
        ? { ...normal, mode: insertMode(dot, block), want: 'Unset' }
        : { ...normal, want: 'Unset' }
      const rested = rest(after, applied.buffer, false)
      return stepOf(
        operator === 'Yank' ? { ...after, want: yanked(rested.caret) } : after,
        rested,
        {
          ...kept,
          registers: applied.registers,
          dot: operator === 'Delete' ? dot : kept.dot,
        },
        { began: Option.some(began), clipboard: applied.clipboard },
      )
    },
    Insert: ({ at }): Step =>
      Selection.byShape(ends, {
        Stretch: (stretch): Step => ({
          ...unchanged,
          vim: {
            ...leaveVisual(vim, buffer),
            mode: insertMode(
              Option.some({
                command: { _tag: 'InsertAsSelected', at },
                count,
                register: Operators.defaultRegister,
                typed: [],
              }),
            ),
            want: 'Unset',
          },
          buffer: Buffer.moveTo(
            buffer,
            at === 'Start'
              ? Selection.insertAt(buffer, stretch)
              : Selection.appendAt(buffer, stretch),
          ),
        }),
        Block: (corners): Step => {
          const block = Selection.blockOf(buffer, corners, vim.want === 'End')
          const rule = blockRules[at]
          const opened = Operators.blockOpened(buffer, block, rule)
          return {
            ...unchanged,
            vim: {
              ...leaveVisual(vim, buffer, opened.buffer),
              mode: insertMode(
                Option.some({
                  command: {
                    _tag: 'InsertInBlock',
                    at,
                    amount: Selection.blockAmountOf(block),
                  },
                  count,
                  register: Operators.defaultRegister,
                  typed: [],
                }),
                blockStay(
                  rule,
                  block,
                  opened.held,
                  opened.buffer,
                  Operators.homeOf(buffer, block),
                ),
              ),
              want: 'Unset',
            },
            buffer: opened.buffer,
            began: Option.some(opened.began),
          }
        },
      }),
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
        Selection.wantOf(buffer, ends, vim.want, visual.column),
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
    OpenSearch: ({ way }): Step =>
      opening(
        unchanged,
        vim,
        Resume.cases.Search.make({
          way,
          operator: Option.none(),
          count,
          register,
        }),
      ),
    OpenJump: (): Step => unchanged,
    Seek: ({ seek }): Step => {
      const sought = Seek.sought(
        buffer,
        ends.cursor,
        seek,
        count,
        kept.seek,
        'LineBreak',
      )
      const remembered = soughtStep(unchanged, kept, cleared, sought)
      const moved = (spot: Spot): Step => {
        const caret = positionOf(buffer, spot)
        return {
          ...remembered,
          vim: {
            ...cleared,
            mode: visualMode(visual.kind, visual.anchor, columnAfter(caret)),
            want: 'Unset',
          },
          buffer: Buffer.moveTo(buffer, caret),
        }
      }
      return Match.value(sought).pipe(
        Match.tagsExhaustive({
          Landed: ({ landing }) => moved(landing.spot),
          Failed: ({ cursor }) =>
            Option.match(cursor, {
              onNone: () => remembered,
              onSome: moved,
            }),
        }),
      )
    },
    Pick: ({ object }): Step => {
      const picked = objects[object].pick(buffer, ends, count ?? 1)
      const caret = positionOf(buffer, picked.cursor)
      return {
        ...unchanged,
        vim: {
          ...cleared,
          mode: visualMode(
            pickedKinds[picked.kind][visual.kind],
            positionOf(buffer, picked.anchor),
            columnAfter(caret),
          ),
          want: wantWhere(caret),
        },
        buffer: Buffer.moveTo(buffer, caret),
      }
    },
    Swap: swapped,
    SwapColumns: (): Step =>
      Selection.byShape(ends, {
        Stretch: swapped,
        Block: (corners): Step => {
          const other = Selection.otherColumns(buffer, corners)
          const caret = positionOf(buffer, other.cursor)
          return {
            ...unchanged,
            vim: {
              ...cleared,
              mode: visualMode(
                visual.kind,
                positionOf(buffer, other.anchor),
                'AsInVisual',
              ),
              want: other.want,
            },
            buffer: Buffer.moveTo(buffer, caret),
          }
        },
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
    ReplaceLetters: ({ letter }): Step => {
      const replacedOver = (
        after: Buffer.Buffer,
        start: Buffer.Position,
        began: Buffer.Position,
        command: Keymap.Command,
        moved: (mark: Buffer.Position) => Buffer.Position,
      ): Step => {
        const normal: Vim = {
          ...leaveVisual(vim, buffer, after, marks => ({
            anchor: moved(marks.anchor),
            cursor: moved(marks.cursor),
          })),
          want: 'Unset',
        }
        return stepOf(
          normal,
          rest(normal, Buffer.moveTo(after, start), false),
          {
            ...kept,
            dot: Option.some({
              command,
              count: undefined,
              register,
              typed: [],
            }),
          },
          { began: Option.some(began) },
        )
      }
      const sameCell =
        (after: Buffer.Buffer) =>
        (mark: Buffer.Position): Buffer.Position =>
          positionOf(after, spotAt(buffer, mark, 'LineBreak'))
      return Selection.byShape(ends, {
        Stretch: (stretch): Step => {
          if (letter === '\n') {
            return unchanged
          }
          const range = Selection.rangeOf(buffer, stretch, 'AsSelected')
          const after = Operators.replaced(buffer, range, letter)
          return replacedOver(
            after,
            startOf(buffer, range),
            positionOf(buffer, range.from),
            Keymap.Command.cases.ReplaceAmount.make({
              letter,
              amount: Selection.amountOf(
                buffer,
                stretch,
                'AsSelected',
                vim.want,
              ),
            }),
            sameCell(after),
          )
        },
        Block: (corners): Step => {
          const block = Selection.blockOf(buffer, corners, vim.want === 'End')
          const home = Operators.homeOf(buffer, block)
          const after = Operators.blockReplaced(buffer, block, letter)
          return replacedOver(
            after,
            home,
            home,
            Keymap.Command.cases.ReplaceBlock.make({
              letter,
              amount: Selection.blockAmountOf(block),
            }),
            letter === '\n'
              ? mark => ({
                  ...mark,
                  line: Operators.lineAfterSplits(buffer, block, mark.line),
                })
              : sameCell(after),
          )
        },
      })
    },
    Ignore: () => unchanged,
  })
}

const emptyLineFrom: Readonly<Record<Selection.Kind, boolean>> = {
  Letters: false,
  Lines: true,
  Block: false,
}

const isPageKey = (input: Input): boolean =>
  input._tag === 'Key' && (input.key === 'PageUp' || input.key === 'PageDown')

const pressNormal = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  input: Input,
): Step => {
  const unchanged: Step = stepOf(vim, buffer, kept)
  if (isPasteByAnotherRoute(input) || isPageKey(input)) {
    return {
      ...unchanged,
      vim: interrupted(vim),
      fate: { _tag: 'Plain', input },
    }
  }
  return Option.match(
    keyOf(input, () => Keymap.awaitsArgument(Keymap.normal, vim)),
    {
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
    },
  )
}

const pressVisual = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  visual: Visual,
  input: Input,
): Step => {
  const unchanged: Step = stepOf(vim, buffer, kept)
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
    const erased = Selection.byShape(
      Selection.endsOf(buffer, visual.kind, visual.anchor),
      {
        Stretch: stretch => {
          const range = Selection.rangeOf(buffer, stretch, 'AsSelected')
          return {
            buffer: Operators.operators.Change(
              buffer,
              range,
              kept.registers,
              Operators.blackHole,
            ).buffer,
            began: changeBegan(buffer, 'Change', 'Selection', range),
          }
        },
        Block: corners => {
          const block = Selection.blockOf(buffer, corners, vim.want === 'End')
          return {
            buffer: Operators.blockOperators.Delete(
              buffer,
              block,
              kept.registers,
              Operators.blackHole,
            ).buffer,
            began: Operators.homeOf(buffer, block),
          }
        },
      },
    )
    return {
      ...unchanged,
      vim: interrupted(leaveVisual(vim, buffer)),
      buffer: erased.buffer,
      fate: { _tag: 'Plain', input },
      began: Option.some(erased.began),
    }
  }
  return Option.match(
    keyOf(input, () => Keymap.awaitsArgument(Keymap.visual, vim)),
    {
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
    },
  )
}

const leavesInsert = (input: Input): boolean =>
  Option.exists(keyOf(input), key => key === '<Esc>' || key === '<C-[>')

const copiedDown = (buffer: Buffer.Buffer, stay: BlockStay): Buffer.Buffer => {
  const first = buffer.lines[stay.block.first]
  if (
    first === undefined ||
    buffer.lines !== stay.seen ||
    buffer.lines.length !== stay.lines ||
    (stay.rule !== 'Change' && buffer.caret.line !== stay.block.first)
  ) {
    return buffer
  }
  return Option.match(Operators.gained(first, stay), {
    onNone: () => buffer,
    onSome: copy => {
      const copied = Operators.copiedDown(buffer, copy)
      return Option.match(copy.column, {
        onNone: () => copied,
        onSome: column =>
          Buffer.moveTo(copied, { line: stay.block.first, column }),
      })
    },
  })
}

const leaveInsert = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  block: Option.Option<BlockStay>,
): Step => {
  const settled = Buffer.settle(buffer)
  const back = Buffer.backspaceTarget(settled)
  const left =
    back.line === settled.caret.line ? Buffer.moveTo(settled, back) : settled
  return stepOf(
    { ...start, last: vim.last },
    rest(
      start,
      Option.match(block, {
        onNone: () => left,
        onSome: stay => copiedDown(left, stay),
      }),
      false,
    ),
    kept,
  )
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
  { recording, block }: Stay,
): Step =>
  Option.match(recording, {
    onNone: () => leaveInsert(vim, buffer, kept, block),
    onSome: repeat =>
      stepOf(
        { ...vim, mode: insertMode(Option.none(), block) },
        buffer,
        { ...kept, dot: recording },
        {
          fate: Fate.cases.Replay.make({
            steps: [...furtherCopies(repeat, buffer.lines.length), leave],
          }),
        },
      ),
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
  block: Option.Option<BlockStay>,
  input: Input,
): Pick<Step, 'vim' | 'kept'> => {
  const typed = typedWith(repeat.typed, input)
  return typed.length > maxRecordedInputs
    ? {
        vim: { ...vim, mode: insertMode(Option.none(), block) },
        kept: { ...kept, dot: Option.none() },
      }
    : {
        vim: {
          ...vim,
          mode: insertMode(Option.some({ ...repeat, typed }), block),
        },
        kept,
      }
}

const pressInsert = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  stay: Stay,
  input: Input,
): Step =>
  leavesInsert(input)
    ? leaving(vim, buffer, kept, stay)
    : {
        ...stepOf(vim, buffer, kept, { fate: { _tag: 'Plain', input } }),
        ...Option.match(stay.recording, {
          onNone: () => ({ vim, kept }),
          onSome: repeat =>
            isRecorded(buffer, input)
              ? stayWith(vim, kept, repeat, stay.block, input)
              : { vim, kept },
        }),
      }

export const press = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  input: Input,
): Step =>
  Mode.match(vim.mode, {
    Normal: () => pressNormal(vim, buffer, kept, input),
    Insert: stay => pressInsert(vim, buffer, kept, stay, input),
    Visual: visual => pressVisual(vim, buffer, kept, visual, input),
  })

export const again = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  step: Replayed,
): Step => {
  const unchanged: Step = stepOf(vim, buffer, kept)
  const inStay = (stepped: (stay: Stay) => Step): Step =>
    Mode.match(vim.mode, {
      Normal: () => unchanged,
      Insert: stepped,
      Visual: () => unchanged,
    })
  return Replayed.match(step, {
    Run: ({ command, count, register }) => {
      const ran = run(vim, buffer, kept, command, count, register)
      return {
        ...ran,
        kept: {
          ...ran.kept,
          seek: { ...ran.kept.seek, find: kept.seek.find },
        },
      }
    },
    Typed: ({ input }) =>
      inStay(stay => pressInsert(vim, buffer, kept, stay, input)),
    Leave: () => inStay(stay => leaving(vim, buffer, kept, stay)),
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

export const isScreenKey = (input: Input): boolean =>
  input._tag === 'Chord' &&
  isControlAlone(input.modifiers) &&
  Keymap.screenKeys.includes(`<C-${input.char.toLowerCase()}>`)

const searched = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  { way, operator, count, register }: SearchResume,
  text: string,
): Option.Option<Step> => {
  const seek = Seek.Seek.cases.Search.make({ way, text })
  return Mode.match(vim.mode, {
    Normal: () =>
      Option.some(
        run(
          vim,
          buffer,
          kept,
          Option.match(operator, {
            onNone: () => Keymap.Command.cases.Seek.make({ seek }),
            onSome: operator =>
              Keymap.Command.cases.OperateSeek.make({ operator, seek }),
          }),
          count,
          register,
        ),
      ),
    Insert: () => Option.none(),
    Visual: visual =>
      Option.some(
        runVisual(
          vim,
          buffer,
          kept,
          visual,
          Keymap.VisualCommand.cases.Seek.make({ seek }),
          count,
          register,
        ),
      ),
  })
}

export const pendingKeys = (vim: Vim): string => Keymap.shown(vim)

export type ModeName =
  | 'Normal'
  | 'Insert'
  | 'Visual'
  | 'VisualLine'
  | 'VisualBlock'

const visualModeNames: Readonly<Record<Selection.Kind, ModeName>> = {
  Letters: 'Visual',
  Lines: 'VisualLine',
  Block: 'VisualBlock',
}

export const modeName = (vim: Vim): ModeName =>
  Mode.match(vim.mode, {
    Normal: (): ModeName => 'Normal',
    Insert: (): ModeName => 'Insert',
    Visual: ({ kind }): ModeName => visualModeNames[kind],
  })

const commanded = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  text: string,
): Option.Option<Step> =>
  Mode.match(vim.mode, {
    Normal: () => {
      const cleared = idle(vim)
      const unchanged = stepOf(cleared, buffer, kept)
      const noticed = (notice: string): Step => ({
        ...unchanged,
        notice: Option.some(notice),
      })
      return Option.some(
        Ex.Command.match(Ex.parse(text), {
          Empty: () => unchanged,
          Write: () => ({ ...unchanged, save: true }),
          Unsupported: ({ text: line }) => noticed(`not supported: ${line}`),
          Unknown: ({ text: line }) =>
            noticed(`E492: Not an editor command: ${line}`),
          Goto: ({ address }) =>
            Ex.Resolved.match(
              Ex.resolve(address, buffer.lines.length, buffer.caret.line),
              {
                Invalid: () => noticed('E16: Invalid range'),
                At: ({ line }) => {
                  const { spot, want } = motions.LastLine(
                    buffer,
                    spotOf(buffer),
                    line + 1,
                    vim.want,
                  )
                  return {
                    ...unchanged,
                    vim: { ...cleared, want },
                    buffer: Buffer.moveTo(buffer, positionOf(buffer, spot)),
                  }
                },
              },
            ),
        }),
      )
    },
    Insert: () => Option.none(),
    Visual: () => Option.none(),
  })

export const resumed = (
  vim: Vim,
  buffer: Buffer.Buffer,
  kept: Kept,
  resume: Resume,
  text: string,
): Option.Option<Step> =>
  Resume.match(resume, {
    Search: search => searched(vim, buffer, kept, search, text),
    Command: () => commanded(vim, buffer, kept, text),
  })
