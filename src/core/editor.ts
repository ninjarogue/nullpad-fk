import { Array, Option, Order, Schema } from 'effect'

import * as Buffer from './buffer'
import { Input, type Modifiers, type NamedKey } from './input'
import * as Markdown from './markdown'
import * as Notes from './notes'
import * as Vim from './vim'
import * as Words from './words'

export const Mode = Schema.Literals(['Plain', 'Normal', 'Insert'])
export type Mode = typeof Mode.Type

export const Query = Schema.TaggedUnion({
  Step: {
    at: Buffer.Position,
    direction: Schema.Literals(['Forward', 'Backward']),
  },
  RowEdge: {
    at: Buffer.Position,
    atRowEnd: Schema.Boolean,
    edge: Schema.Literals(['Start', 'End']),
  },
  Vertical: {
    at: Buffer.Position,
    atRowEnd: Schema.Boolean,
    rows: Schema.Literals([-1, 1]),
    goalX: Schema.Option(Schema.Finite),
  },
  Page: {
    at: Buffer.Position,
    atRowEnd: Schema.Boolean,
    direction: Schema.Literals([-1, 1]),
  },
  Point: { x: Schema.Finite, line: Schema.Int, yInLine: Schema.Finite },
})
export type Query = typeof Query.Type

export const Landing = Schema.TaggedUnion({
  At: { line: Schema.Int, column: Schema.Int, atRowEnd: Schema.Boolean },
  TextStart: {},
  TextEnd: {},
  Stay: {},
})
export type Landing = typeof Landing.Type

export const Answer = Schema.Struct({
  landing: Landing,
  aimFromTextLeft: Schema.Finite,
})
export type Answer = typeof Answer.Type

const Queued = Schema.TaggedUnion({
  Fed: { input: Input },
  Clicked: { x: Schema.Finite, line: Schema.Int, yInLine: Schema.Finite },
  ToggledVim: {},
})
type Queued = typeof Queued.Type

const Locating = Schema.Struct({ cause: Queued, queued: Schema.Array(Queued) })

export const Editor = Schema.Struct({
  buffer: Buffer.Buffer,
  vim: Schema.Option(Vim.Vim),
  discards: Schema.Int,
  preedit: Schema.String,
  goalX: Schema.Option(Schema.Finite),
  caretAtRowEnd: Schema.Boolean,
  topLine: Schema.Int,
  screenRows: Schema.Int,
  drawnRevision: Schema.Int,
  locating: Schema.Option(Locating),
  pendingReveals: Schema.Int,
})
export type Editor = typeof Editor.Type

export type Reveal = 'None' | 'Nearest' | 'Top'

export type Outcome = Readonly<{
  editor: Editor
  locate: Option.Option<Readonly<{ query: Query; revision: number }>>
  reveal: Reveal
}>

export type Part = Readonly<{ text: string; isPreedit: boolean }>

export type PaintedLine = Readonly<{
  id: Buffer.LineId
  index: number
  number: number
  parts: ReadonlyArray<Part>
}>

export type Frame = Readonly<{
  lines: ReadonlyArray<PaintedLine>
  undrawnAbove: number
  undrawnBelow: number
  gutter: number
  caret: Readonly<{
    line: number
    column: number
    atRowEnd: boolean
    shape: 'Block' | 'Bar'
  }>
  surrounding: Readonly<{ text: string; caret: number }>
  discards: number
  status: Readonly<{
    mode: Mode
    pending: string
    line: number
    column: number
    lineCount: number
  }>
  revision: number
}>

export const open = (text: string, vim = false): Editor => ({
  buffer: Buffer.fromText(text),
  vim: vim ? Option.some(Vim.start) : Option.none(),
  discards: 0,
  preedit: '',
  goalX: Option.none(),
  caretAtRowEnd: false,
  topLine: 0,
  screenRows: 24,
  drawnRevision: 0,
  locating: Option.none(),
  pendingReveals: 0,
})

const atRest = (editor: Editor, buffer: Buffer.Buffer): Buffer.Buffer =>
  Option.match(editor.vim, {
    onNone: () => buffer,
    onSome: vim => Vim.rest(vim, buffer, editor.caretAtRowEnd),
  })

const rested = (editor: Editor): Editor => {
  const buffer = atRest(editor, editor.buffer)
  return buffer === editor.buffer
    ? editor
    : { ...editor, buffer, caretAtRowEnd: false }
}

export const isVimOn = (editor: Editor): boolean => Option.isSome(editor.vim)

export const text = (editor: Editor): string => Buffer.toText(editor.buffer)

const queuedToggles = (editor: Editor): number =>
  Option.match(editor.locating, {
    onNone: () => 0,
    onSome: ({ cause, queued }) =>
      Array.filter([cause, ...queued], ({ _tag }) => _tag === 'ToggledVim')
        .length,
  })

const vimAfterReopen = (
  editor: Editor,
  landing: 'AnotherNote' | 'SameNote',
): Option.Option<Vim.Vim> => {
  const wasOn = Option.isSome(editor.vim)
  const isOn = queuedToggles(editor) % 2 === 0 ? wasOn : !wasOn
  return !isOn
    ? Option.none()
    : landing === 'SameNote' && wasOn
      ? Option.map(editor.vim, Vim.interrupted)
      : Option.some(Vim.start)
}

export const reopen = (
  editor: Editor,
  text: string,
  caretAt: 'Start' | 'End',
  landing: 'AnotherNote' | 'SameNote',
): Editor => {
  const opened = {
    ...open(text),
    vim: vimAfterReopen(editor, landing),
  }
  return {
    ...opened,
    discards: editor.discards,
    buffer: atRest(
      opened,
      caretAt === 'End'
        ? Buffer.moveTo(opened.buffer, Buffer.documentEnd(opened.buffer))
        : opened.buffer,
    ),
    screenRows: editor.screenRows,
    drawnRevision: editor.drawnRevision + 1,
  }
}

export const sameText = (a: Editor, b: Editor): boolean =>
  a.buffer.lines === b.buffer.lines

const firstFilledLine = (editor: Editor): string =>
  Option.match(
    Array.findFirst(editor.buffer.lines, line => /\S/u.test(line.text)),
    { onNone: () => '', onSome: line => line.text },
  )

export const isBlank = (editor: Editor): boolean =>
  firstFilledLine(editor) === ''

export const title = (editor: Editor): string =>
  Notes.title(firstFilledLine(editor))

export const graphemeReach = Buffer.graphemeReach

type DrawnChange = Partial<
  Pick<
    Editor,
    'buffer' | 'preedit' | 'caretAtRowEnd' | 'topLine' | 'screenRows'
  >
>

const changeDrawn = (editor: Editor, change: DrawnChange): Editor => {
  const next = { ...editor, ...change }
  return next.buffer.lines === editor.buffer.lines &&
    next.preedit === editor.preedit &&
    next.topLine === editor.topLine &&
    next.screenRows === editor.screenRows
    ? next
    : { ...next, drawnRevision: editor.drawnRevision + 1 }
}

const minLinesDrawnPastScreen = 125

const linesDrawnPastScreen = (editor: Editor): number =>
  Math.max(editor.screenRows, minLinesDrawnPastScreen)

const drawnLines = (
  editor: Editor,
): Readonly<{ first: number; last: number }> => {
  const lastLine = editor.buffer.lines.length - 1
  const top = Math.max(0, Math.min(lastLine, editor.topLine))
  return {
    first: Math.max(0, top - linesDrawnPastScreen(editor)),
    last: Math.min(
      lastLine,
      top + editor.screenRows + linesDrawnPastScreen(editor),
    ),
  }
}

const isDrawn = (editor: Editor, line: number): boolean => {
  const { first, last } = drawnLines(editor)
  return line >= first && line <= last
}

const withLineDrawn = (editor: Editor, line: number): Editor =>
  isDrawn(editor, line)
    ? editor
    : changeDrawn(editor, {
        topLine:
          line < drawnLines(editor).first
            ? line
            : Math.max(0, line - editor.screenRows + 1),
      })

const withCaretDrawn = (editor: Editor): Editor =>
  withLineDrawn(editor, editor.buffer.caret.line)

const done = (unrested: Editor, reveal: Reveal = 'Nearest'): Outcome => {
  const editor = rested(unrested)
  return {
    editor: reveal === 'None' ? editor : withCaretDrawn(editor),
    locate: Option.none(),
    reveal,
  }
}

type Plan =
  | Readonly<{ _tag: 'Done'; outcome: Outcome }>
  | Readonly<{
      _tag: 'Ask'
      query: Query
      land: (answer: Answer) => Outcome
    }>

const now = (editor: Editor, reveal: Reveal = 'Nearest'): Plan => ({
  _tag: 'Done',
  outcome: done(editor, reveal),
})

const ask = (query: Query, land: (answer: Answer) => Outcome): Plan => ({
  _tag: 'Ask',
  query,
  land,
})

const samePosition = (a: Buffer.Position, b: Buffer.Position): boolean =>
  a.line === b.line && a.column === b.column

/**
 * Chrome starts every command from the next boundary at or after a caret that inserted text left inside a grapheme,
 * but a command that then does nothing leaves the caret where it was.
 */
const settled = (editor: Editor): Buffer.Buffer => Buffer.settle(editor.buffer)

const insertText =
  (text: string, atRowEnd = false) =>
  (editor: Editor): Editor =>
    changeDrawn(
      { ...editor, goalX: Option.none() },
      {
        buffer: Buffer.insert(settled(editor), text),
        caretAtRowEnd: atRowEnd,
      },
    )

/**
 * Text typed by a key, after which Chrome moves the caret past a grapheme the text joined (z before ZWJ 🇵).
 * After a space typed by a key, a caret left where the line now wraps shows at the end of the upper row, as in Chrome;
 * the same space inserted another way leaves it at the start of the lower row.
 */
const typeText =
  (text: string) =>
  (editor: Editor): Editor => {
    const inserted = insertText(text, text === ' ')(editor)
    return { ...inserted, buffer: Buffer.settle(inserted.buffer) }
  }

/**
 * Chrome keeps the goal when the break falls inside a piece of the line, and clears it at the start of the line, at a
 * join, at the line end and at a caret drawn at the end of the upper row.
 */
const breakLine = (editor: Editor): Editor => {
  const buffer = settled(editor)
  const typed = typeText('\n')(editor)
  return Buffer.isInsidePiece(buffer) && !editor.caretAtRowEnd
    ? { ...typed, goalX: editor.goalX }
    : typed
}

/**
 * Chrome keeps the goal only when its caret ends in the text node it was in, on the same side of a wrap: an erase that
 * empties the caret's piece, ends in another one or starts at a caret drawn at the end of the upper row clears it,
 * wherever the caret is drawn after.
 */
const eraseTo = (editor: Editor, target: Buffer.Position): Editor => {
  const buffer = settled(editor)
  const keepsGoal =
    !editor.caretAtRowEnd &&
    Buffer.keepsCaretPiece(buffer, buffer.caret, target)
  return samePosition(target, buffer.caret)
    ? editor
    : changeDrawn(keepsGoal ? editor : { ...editor, goalX: Option.none() }, {
        buffer: Buffer.erase(buffer, buffer.caret, target),
        caretAtRowEnd: false,
      })
}

const moveTo = (
  editor: Editor,
  caret: Buffer.Position,
  atRowEnd: boolean,
): Editor => {
  const moved = Buffer.moveTo(editor.buffer, caret)
  return samePosition(moved.caret, editor.buffer.caret) &&
    atRowEnd === editor.caretAtRowEnd
    ? editor
    : changeDrawn(
        { ...editor, goalX: Option.none() },
        { buffer: moved, caretAtRowEnd: atRowEnd },
      )
}

const landingPosition = (
  editor: Editor,
  landing: Landing,
): Option.Option<Readonly<{ caret: Buffer.Position; atRowEnd: boolean }>> =>
  Landing.match(landing, {
    At: ({ line, column, atRowEnd }) =>
      Option.some({ caret: { line, column }, atRowEnd }),
    TextStart: () =>
      Option.some({ caret: { line: 0, column: 0 }, atRowEnd: false }),
    TextEnd: () =>
      Option.some({
        caret: Buffer.documentEnd(editor.buffer),
        atRowEnd: false,
      }),
    Stay: () => Option.none(),
  })

const landMove =
  (editor: Editor, reveal: Reveal = 'Nearest') =>
  ({ landing }: Answer): Outcome =>
    done(
      Option.match(landingPosition(editor, landing), {
        onNone: () => editor,
        onSome: ({ caret, atRowEnd }) => moveTo(editor, caret, atRowEnd),
      }),
      reveal,
    )

const step =
  (direction: 'Forward' | 'Backward') =>
  (editor: Editor): Plan => {
    const buffer = settled(editor)
    const { line, column } = buffer.caret
    const atLineEdge =
      direction === 'Forward'
        ? column === Buffer.lineEnd(buffer, line)
        : column === 0
    if (!atLineEdge) {
      return ask(
        Query.cases.Step.make({ at: buffer.caret, direction }),
        landMove(editor),
      )
    }
    const lastLine = buffer.lines.length - 1
    return direction === 'Forward'
      ? now(
          line < lastLine
            ? moveTo(editor, { line: line + 1, column: 0 }, false)
            : editor,
        )
      : now(
          line > 0
            ? moveTo(
                editor,
                { line: line - 1, column: Buffer.lineEnd(buffer, line - 1) },
                false,
              )
            : editor,
        )
  }

const linuxWordStep =
  (direction: 'Forward' | 'Backward') =>
  (editor: Editor): Plan => {
    const buffer = settled(editor)
    return now(
      Option.match(
        direction === 'Forward'
          ? Words.nextWordEnd(buffer)
          : Words.previousWordStart(buffer),
        {
          onNone: () => editor,
          onSome: caret => moveTo(editor, caret, false),
        },
      ),
    )
  }

const deleteForward = (editor: Editor): Plan => {
  const buffer = settled(editor)
  const { line, column } = buffer.caret
  if (column === Buffer.lineEnd(buffer, line)) {
    return now(eraseTo(editor, Buffer.nextLineStart(buffer)))
  }
  return ask(
    Query.cases.Step.make({ at: buffer.caret, direction: 'Forward' }),
    ({ landing }) =>
      done(
        Landing.match(landing, {
          At: ({ line, column }) => eraseTo(editor, { line, column }),
          TextStart: () => editor,
          TextEnd: () => editor,
          Stay: () => editor,
        }),
      ),
  )
}

const rowEdge =
  (edge: 'Start' | 'End') =>
  (editor: Editor): Plan =>
    ask(
      Query.cases.RowEdge.make({
        at: settled(editor).caret,
        atRowEnd: editor.caretAtRowEnd,
        edge,
      }),
      landMove(editor),
    )

const documentEdge = (editor: Editor, edge: 'Start' | 'End'): Plan =>
  now(
    moveTo(
      editor,
      edge === 'Start'
        ? { line: 0, column: 0 }
        : Buffer.documentEnd(editor.buffer),
      false,
    ),
  )

const vertical =
  (rows: -1 | 1) =>
  (editor: Editor): Plan =>
    ask(
      Query.cases.Vertical.make({
        at: settled(editor).caret,
        atRowEnd: editor.caretAtRowEnd,
        rows,
        goalX: editor.goalX,
      }),
      ({ landing, aimFromTextLeft }) => {
        const goalX = Option.some(aimFromTextLeft)
        return done(
          Option.match(landingPosition(editor, landing), {
            onNone: () => ({ ...editor, goalX }),
            onSome: ({ caret, atRowEnd }) => ({
              ...moveTo(editor, caret, atRowEnd),
              goalX,
            }),
          }),
        )
      },
    )

const page =
  (direction: -1 | 1) =>
  (editor: Editor): Plan =>
    ask(
      Query.cases.Page.make({
        at: settled(editor).caret,
        atRowEnd: editor.caretAtRowEnd,
        direction,
      }),
      landMove(editor, 'Top'),
    )

const plainKeys: Readonly<
  Record<NamedKey, (editor: Editor, modifiers: Modifiers) => Plan>
> = {
  Escape: editor => now(editor, 'None'),
  Enter: editor => now(breakLine(editor)),
  Tab: editor => now(typeText('  ')(editor)),
  Backspace: editor =>
    now(eraseTo(editor, Buffer.backspaceTarget(settled(editor)))),
  Delete: deleteForward,
  ArrowLeft: (editor, { ctrl }) =>
    ctrl ? linuxWordStep('Backward')(editor) : step('Backward')(editor),
  ArrowRight: (editor, { ctrl }) =>
    ctrl ? linuxWordStep('Forward')(editor) : step('Forward')(editor),
  ArrowUp: vertical(-1),
  ArrowDown: vertical(1),
  Home: (editor, { ctrl }) =>
    ctrl ? documentEdge(editor, 'Start') : rowEdge('Start')(editor),
  End: (editor, { ctrl }) =>
    ctrl ? documentEdge(editor, 'End') : rowEdge('End')(editor),
  PageUp: page(-1),
  PageDown: page(1),
}

const plainPlan = (editor: Editor, input: Input): Plan =>
  Input.match(input, {
    Key: ({ key, modifiers }) => plainKeys[key](editor, modifiers),
    Chord: () => now(editor, 'None'),
    Text: ({ text, byKey }) =>
      now(byKey ? typeText(text)(editor) : insertText(text)(editor)),
    Erase: span => {
      const { from, to } = Buffer.spanAround(
        editor.buffer,
        span.fromCaret,
        span.toCaret,
      )
      return now(
        samePosition(from, to)
          ? editor
          : changeDrawn(
              { ...editor, goalX: Option.none() },
              {
                buffer: Buffer.erase(editor.buffer, from, to),
                caretAtRowEnd: false,
              },
            ),
      )
    },
    Paste: ({ text }) => now(insertText(text)(editor)),
    Preedit: ({ text }) =>
      now(changeDrawn(editor, { buffer: settled(editor), preedit: text })),
    Commit: ({ text }) => now(insertText(text)({ ...editor, preedit: '' })),
  })

const vimPlan = (editor: Editor, vim: Vim.Vim, input: Input): Plan => {
  const step = Vim.press(vim, editor.buffer, input)
  const stepped = { ...editor, vim: Option.some(step.vim) }
  if (step.fate === 'Plain') {
    return plainPlan(stepped, input)
  }
  const moved = step.buffer !== editor.buffer
  return now(
    changeDrawn(
      {
        ...stepped,
        goalX: moved ? Option.none() : editor.goalX,
        discards: editor.discards + (step.fate === 'Swallowed' ? 1 : 0),
      },
      moved ? { buffer: step.buffer, caretAtRowEnd: false } : {},
    ),
    moved ? 'Nearest' : 'None',
  )
}

const inputPlan = (editor: Editor, input: Input): Plan =>
  Option.match(editor.vim, {
    onNone: () => plainPlan(editor, input),
    onSome: vim => vimPlan(editor, vim, input),
  })

const toggleVim = (editor: Editor): Editor =>
  Option.match(editor.vim, {
    onSome: () => ({ ...editor, vim: Option.none() }),
    onNone: () =>
      changeDrawn(
        { ...editor, vim: Option.some(Vim.start), goalX: Option.none() },
        { preedit: '' },
      ),
  })

const clickPlan = (
  editor: Editor,
  x: number,
  line: number,
  yInLine: number,
): Plan =>
  line >= editor.buffer.lines.length
    ? documentEdge(editor, 'End')
    : ask(Query.cases.Point.make({ x, line, yInLine }), landMove(editor))

const planOf = (editor: Editor, queued: Queued): Plan =>
  Queued.match(queued, {
    Fed: ({ input }) => inputPlan(editor, input),
    Clicked: ({ x, line, yInLine }) =>
      clickPlan(
        { ...editor, vim: Option.map(editor.vim, Vim.interrupted) },
        x,
        line,
        yInLine,
      ),
    ToggledVim: () => now(toggleVim(editor)),
  })

const withQueriedLineDrawn = (editor: Editor, query: Query): Editor =>
  query._tag === 'Point'
    ? withLineDrawn(editor, query.line)
    : withCaretDrawn(editor)

const run = (editor: Editor, queued: Queued): Outcome => {
  const plan = planOf(editor, queued)
  if (plan._tag === 'Done') {
    return plan.outcome
  }
  const drawn = withQueriedLineDrawn(editor, plan.query)
  return {
    editor: {
      ...drawn,
      locating: Option.some({ cause: queued, queued: [] }),
    },
    locate: Option.some({ query: plan.query, revision: drawn.drawnRevision }),
    reveal:
      plan.query._tag === 'Point' || drawn === editor ? 'None' : 'Nearest',
  }
}

const enqueue = (editor: Editor, queued: Queued): Outcome =>
  Option.match(editor.locating, {
    onNone: () => run(editor, queued),
    onSome: locating =>
      done(
        {
          ...editor,
          locating: Option.some({
            ...locating,
            queued: [...locating.queued, queued],
          }),
        },
        'None',
      ),
  })

const strongest = (a: Reveal, b: Reveal): Reveal => (b === 'None' ? a : b)

const replay = (start: Outcome, queued: ReadonlyArray<Queued>): Outcome =>
  Array.reduce(queued, start, (outcome, next) => {
    const result = enqueue(outcome.editor, next)
    return {
      editor: result.editor,
      locate: Option.isSome(result.locate) ? result.locate : outcome.locate,
      reveal: strongest(outcome.reveal, result.reveal),
    }
  })

const countPendingReveal = (outcome: Outcome): Outcome =>
  outcome.reveal === 'None'
    ? outcome
    : {
        ...outcome,
        editor: {
          ...outcome.editor,
          pendingReveals: outcome.editor.pendingReveals + 1,
        },
      }

export const revealed = (editor: Editor): Editor => ({
  ...editor,
  pendingReveals: Math.max(0, editor.pendingReveals - 1),
})

export const feed = (editor: Editor, input: Input): Outcome =>
  countPendingReveal(enqueue(editor, Queued.cases.Fed.make({ input })))

export const click = (
  editor: Editor,
  x: number,
  line: number,
  yInLine: number,
): Outcome =>
  countPendingReveal(
    enqueue(editor, Queued.cases.Clicked.make({ x, line, yInLine })),
  )

export const toggledVim = (editor: Editor): Outcome =>
  countPendingReveal(enqueue(editor, Queued.cases.ToggledVim.make({})))

export const togglesVim = (input: Input): boolean =>
  input._tag === 'Chord' && input.char === ',' && input.modifiers.ctrl

export const overwrite = (
  editor: Editor,
  at: Buffer.Position,
  text: string,
): Outcome =>
  done(
    changeDrawn(editor, { buffer: Buffer.overwrite(editor.buffer, at, text) }),
    'None',
  )

export const located = (editor: Editor, answer: Answer): Outcome =>
  Option.match(editor.locating, {
    onNone: () => done(editor, 'None'),
    onSome: ({ cause, queued }) => {
      const asked = { ...editor, locating: Option.none() }
      const plan = planOf(asked, cause)
      const landed = plan._tag === 'Ask' ? plan.land(answer) : plan.outcome
      return countPendingReveal(replay(landed, queued))
    },
  })

const awaitedLine = (editor: Editor): Option.Option<number> =>
  Option.match(editor.locating, {
    onNone: () =>
      editor.pendingReveals > 0
        ? Option.some(editor.buffer.caret.line)
        : Option.none(),
    onSome: ({ cause }) =>
      Option.some(
        Queued.match(cause, {
          Fed: () => editor.buffer.caret.line,
          Clicked: ({ line }) => line,
          ToggledVim: () => editor.buffer.caret.line,
        }),
      ),
  })

const undrawsAwaitedLine = (editor: Editor, moved: Editor): boolean =>
  Option.exists(
    awaitedLine(editor),
    line => isDrawn(editor, line) && !isDrawn(moved, line),
  )

export const scrolled = (editor: Editor, topLine: number): Editor => {
  if (topLine === editor.topLine) {
    return editor
  }
  const moved = changeDrawn(editor, { topLine })
  return undrawsAwaitedLine(editor, moved) ? editor : moved
}

export const resized = (editor: Editor, rows: number): Outcome => {
  const size = Math.max(1, Math.floor(rows))
  return countPendingReveal({
    editor:
      size === editor.screenRows
        ? editor
        : changeDrawn(editor, { screenRows: size }),
    locate: Option.none(),
    reveal: 'Nearest',
  })
}

const minLineNumberDigits = 4

const gutterBlankCells = 2

const gutterWidth = (buffer: Buffer.Buffer): number =>
  Math.max(minLineNumberDigits, String(buffer.lines.length).length) +
  gutterBlankCells

const caretGrapheme = (text: string, column: number): number =>
  Array.fromIterable(Buffer.segmenter.segment(text.slice(0, column))).length

const cutAt = (
  line: Buffer.Line,
  extra: ReadonlyArray<number>,
): ReadonlyArray<
  Readonly<{ from: number; text: string; isPreedit: boolean }>
> => {
  const cuts = Array.dedupeAdjacent(
    Array.sort([0, ...line.joins, ...extra, line.text.length], Order.Number),
  )
  const texts = Array.map(Array.zip(cuts, cuts.slice(1)), ([from, to]) => ({
    from,
    text: line.text.slice(from, to),
    isPreedit: false,
  }))
  return Array.isArrayNonEmpty(texts)
    ? texts
    : [{ from: 0, text: '', isPreedit: false }]
}

const stablePiecesByLine = new WeakMap<Buffer.Line, ReadonlyArray<Part>>()

const stablePiecesOf = (line: Buffer.Line): ReadonlyArray<Part> => {
  const known = stablePiecesByLine.get(line)
  if (known !== undefined) {
    return known
  }
  const pieces = cutAt(line, [])
  stablePiecesByLine.set(line, pieces)
  return pieces
}

const partsOf = (
  line: Buffer.Line,
  preedit: Option.Option<Readonly<{ column: number; text: string }>>,
): ReadonlyArray<Part> =>
  Option.match(preedit, {
    onNone: () => stablePiecesOf(line),
    onSome: ({ column, text }) => {
      const pieces = cutAt(line, [column])
      const at = Option.getOrElse(
        Array.findFirstIndex(pieces, piece => piece.from >= column),
        () => pieces.length,
      )
      return [
        ...pieces.slice(0, at),
        { from: column, text, isPreedit: true },
        ...pieces.slice(at),
      ]
    },
  })

const surroundingReach = 1000

export const paint = (editor: Editor): Frame => {
  const { buffer } = editor
  const { caret, lines } = buffer
  const { first, last } = drawnLines(editor)
  const near = Buffer.spanAround(buffer, -surroundingReach, surroundingReach)
  return {
    lines: Array.map(lines.slice(first, last + 1), (line, offset) => {
      const index = first + offset
      return {
        id: line.id,
        index,
        number: index + 1,
        parts: partsOf(
          line,
          index === caret.line && editor.preedit !== ''
            ? Option.some({ column: caret.column, text: editor.preedit })
            : Option.none(),
        ),
      }
    }),
    undrawnAbove: first,
    undrawnBelow: lines.length - 1 - last,
    gutter: gutterWidth(buffer),
    caret: {
      ...caret,
      atRowEnd: editor.caretAtRowEnd,
      shape: Option.exists(editor.vim, vim => vim.mode === 'Insert')
        ? 'Bar'
        : 'Block',
    },
    surrounding: {
      text: (lines[caret.line]?.text ?? '').slice(
        near.from.column,
        near.to.column,
      ),
      caret: caret.column - near.from.column,
    },
    discards: editor.discards,
    status: {
      mode: Option.match(editor.vim, {
        onNone: () => 'Plain' as const,
        onSome: vim => vim.mode,
      }),
      pending: Option.match(editor.vim, {
        onNone: () => '',
        onSome: Vim.pendingKeys,
      }),
      line: caret.line + 1,
      column: caretGrapheme(lines[caret.line]?.text ?? '', caret.column) + 1,
      lineCount: lines.length,
    },
    revision: editor.drawnRevision,
  }
}

export const dump = (frame: Frame): string =>
  Array.join(
    Array.map(frame.lines, line => {
      const text = Array.join(
        Array.map(line.parts, part => part.text),
        '',
      )
      if (line.index !== frame.caret.line) {
        return text
      }
      const { column } = frame.caret
      const after = Array.fromIterable(
        Buffer.segmenter.segment(text.slice(column)),
      )[0]?.segment
      return `${text.slice(0, column)}[${after ?? ' '}]${text.slice(column + (after?.length ?? 0))}`
    }),
    '\n',
  )

export const html = (editor: Editor): string =>
  Markdown.toHtml(Markdown.parse(editor.buffer.lines))

export const outline = (editor: Editor): string =>
  Markdown.outline(Markdown.parse(editor.buffer.lines))
