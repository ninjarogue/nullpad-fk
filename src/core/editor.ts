import { Array, Option, Order, Schema } from 'effect'

import * as Buffer from './buffer'
import { Input, type Modifiers, type NamedKey } from './input'

/** Vim adds Normal, Insert and Visual here. Plain is the default typing mode. */
export const Mode = Schema.Literals(['Plain'])
export type Mode = typeof Mode.Type

/**
 * What the core asks the browser, which alone knows where the text it drew wraps and where a pixel falls in it.
 * `at` is the caret the move starts from and `atRowEnd` the row it is drawn on where its line wraps.
 * Step is one grapheme along the line, as the browser moves its own caret. Point is a click, in client pixels.
 */
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
    goal: Schema.Option(Schema.Finite),
    goalRow: Schema.Option(Schema.Int),
  },
  Page: {
    at: Buffer.Position,
    atRowEnd: Schema.Boolean,
    direction: Schema.Literals([-1, 1]),
  },
  Point: { x: Schema.Finite, y: Schema.Finite },
})
export type Query = typeof Query.Type

/** Where the browser puts the caret. Stay means the target is not drawn, so the move does nothing. */
export const Landing = Schema.TaggedUnion({
  At: { line: Schema.Int, column: Schema.Int, atRowEnd: Schema.Boolean },
  TextStart: {},
  TextEnd: {},
  Stay: {},
})
export type Landing = typeof Landing.Type

/**
 * `aim` is the x, in pixels from the text's left edge, that a vertical move aimed at: the goal it keeps. `row` is
 * the row of its line, counted from 0, that a vertical move left the caret on.
 */
export const Answer = Schema.Struct({
  landing: Landing,
  aim: Schema.Finite,
  row: Schema.Int,
})
export type Answer = typeof Answer.Type

const Queued = Schema.TaggedUnion({
  Fed: { input: Input },
  Clicked: { x: Schema.Finite, y: Schema.Finite },
})
type Queued = typeof Queued.Type

/** The input that asked the browser, and every input since, held in order until the answer lands. */
const Locating = Schema.Struct({ cause: Queued, queued: Schema.Array(Queued) })

/**
 * The text, the caret and what is drawn. The core never reads layout: rows, pixels and graphemes on screen are the
 * browser's, and come back as Answers. `goal` is the x that Up and Down aim for. As in Chrome, typing, a click or a
 * move that lands elsewhere clears it; Backspace, Delete, Enter inside a line and a move that stays put keep it.
 * `goalRow` is the row of its line the last vertical move landed on: the goal holds only while the caret is still
 * drawn there, so a Backspace that takes the caret to another row forgets it, as in Chrome. Enter lifts the limit.
 * `caretAtRowEnd` draws a caret where its line wraps at the end of the upper row, as Chrome's upstream caret after
 * End, a click past a row end or a vertical move onto one. `top` is the line the shell reports at the top of the
 * screen and `rows` how many rows the screen holds. `revision` counts changes to the drawn text, so the shell answers
 * a query only from a screen that shows every input before it.
 */
export const Editor = Schema.Struct({
  buffer: Buffer.Buffer,
  mode: Mode,
  preedit: Schema.String,
  goal: Schema.Option(Schema.Finite),
  goalRow: Schema.Option(Schema.Int),
  caretAtRowEnd: Schema.Boolean,
  top: Schema.Int,
  rows: Schema.Int,
  revision: Schema.Int,
  locating: Schema.Option(Locating),
})
export type Editor = typeof Editor.Type

/** How the shell scrolls after a step: not at all, as little as puts the caret on screen, or its row to the top. */
export type Reveal = 'None' | 'Nearest' | 'Top'

/** A step's result: the editor, the query the browser must answer before it goes on, and how to scroll. */
export type Outcome = Readonly<{
  editor: Editor
  locate: Option.Option<Readonly<{ query: Query; revision: number }>>
  reveal: Reveal
}>

export type Part = Readonly<{ text: string; isPreedit: boolean }>

/**
 * A drawn line. Its parts are its pieces between joins, each a text node of its own, and the preedit at the caret.
 * `number` counts from 1.
 */
export type PaintedLine = Readonly<{
  id: Buffer.LineId
  index: number
  number: number
  parts: ReadonlyArray<Part>
}>

/** Everything the view draws. `above` and `below` count the lines not drawn, each estimated at one row. */
export type Frame = Readonly<{
  lines: ReadonlyArray<PaintedLine>
  above: number
  below: number
  gutter: number
  caret: Readonly<{ line: number; column: number; atRowEnd: boolean }>
  status: Readonly<{
    mode: Mode
    line: number
    column: number
    lineCount: number
  }>
  revision: number
}>

export const open = (text: string): Editor => ({
  buffer: Buffer.fromText(text),
  mode: 'Plain',
  preedit: '',
  goal: Option.none(),
  goalRow: Option.none(),
  caretAtRowEnd: false,
  top: 0,
  rows: 24,
  revision: 0,
  locating: Option.none(),
})

export const text = (editor: Editor): string => Buffer.toText(editor.buffer)

type Drawn = Partial<
  Pick<Editor, 'buffer' | 'preedit' | 'caretAtRowEnd' | 'top' | 'rows'>
>

/**
 * The editor with what the view draws changed. The revision counts only changes to the drawn text and which lines are
 * drawn: a caret move alone leaves every answer the browser gives about the text as it was.
 */
const redraw = (editor: Editor, drawn: Drawn): Editor => {
  const next = { ...editor, ...drawn }
  return next.buffer.lines === editor.buffer.lines &&
    next.preedit === editor.preedit &&
    next.top === editor.top &&
    next.rows === editor.rows
    ? next
    : { ...next, revision: editor.revision + 1 }
}

/** Lines drawn on each side of the screen, so Up, Down and paging find their target drawn. */
const margin = (editor: Editor): number => editor.rows

const drawnLines = (
  editor: Editor,
): Readonly<{ first: number; last: number }> => {
  const lastLine = editor.buffer.lines.length - 1
  const top = Math.max(0, Math.min(lastLine, editor.top))
  return {
    first: Math.max(0, top - margin(editor)),
    last: Math.min(lastLine, top + editor.rows + margin(editor)),
  }
}

/** A caret that left the drawn lines brings them along, so the shell can scroll it on screen. */
const withCaretDrawn = (editor: Editor): Editor => {
  const { first, last } = drawnLines(editor)
  const { line } = editor.buffer.caret
  return line >= first && line <= last
    ? editor
    : redraw(editor, {
        top: line < first ? line : Math.max(0, line - editor.rows + 1),
      })
}

const done = (editor: Editor, reveal: Reveal = 'Nearest'): Outcome => ({
  editor: reveal === 'None' ? editor : withCaretDrawn(editor),
  locate: Option.none(),
  reveal,
})

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
    redraw(
      { ...editor, goal: Option.none() },
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

/** Enter. Chrome keeps the goal when the break splits a line, and clears it at a line end. */
const breakLine = (editor: Editor): Editor => {
  const { caret } = settled(editor)
  const typed = typeText('\n')(editor)
  return caret.column < Buffer.lineEnd(editor.buffer, caret.line)
    ? { ...typed, goal: editor.goal, goalRow: Option.none() }
    : typed
}

const eraseTo = (editor: Editor, target: Buffer.Position): Editor => {
  const buffer = settled(editor)
  return samePosition(target, buffer.caret)
    ? editor
    : redraw(editor, {
        buffer: Buffer.erase(buffer, buffer.caret, target),
        caretAtRowEnd: false,
      })
}

/** A move that leaves the caret where it was keeps the goal, as Chrome does; one that moves it clears it. */
const moveTo = (
  editor: Editor,
  caret: Buffer.Position,
  atRowEnd: boolean,
): Editor => {
  const moved = Buffer.moveTo(editor.buffer, caret)
  return samePosition(moved.caret, editor.buffer.caret) &&
    atRowEnd === editor.caretAtRowEnd
    ? editor
    : redraw(
        { ...editor, goal: Option.none() },
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

/** Lands a move, or leaves the editor as it was when the browser could not place it. */
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

/** ArrowLeft and ArrowRight: at either end of the text they do nothing, even to a caret inside a grapheme. */
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

/** Delete erases what ArrowRight would step over, so it removes the grapheme the browser draws as one. */
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

/**
 * Up and Down aim at the goal while the caret is on its row, or else at the caret's own x, which becomes the goal even
 * if the caret cannot move.
 */
const vertical =
  (rows: -1 | 1) =>
  (editor: Editor): Plan =>
    ask(
      Query.cases.Vertical.make({
        at: settled(editor).caret,
        atRowEnd: editor.caretAtRowEnd,
        rows,
        goal: editor.goal,
        goalRow: editor.goalRow,
      }),
      ({ landing, aim, row }) => {
        const goal = { goal: Option.some(aim), goalRow: Option.some(row) }
        return done(
          Option.match(landingPosition(editor, landing), {
            onNone: () => ({ ...editor, ...goal }),
            onSome: ({ caret, atRowEnd }) => ({
              ...moveTo(editor, caret, atRowEnd),
              ...goal,
            }),
          }),
        )
      },
    )

/**
 * Page Up and Page Down move the caret a page at the x it is drawn at, then scroll its row to the top of the screen,
 * as far as the end of the text allows. Like Chrome, they forget the goal.
 */
const page =
  (direction: -1 | 1) =>
  (editor: Editor): Plan =>
    ask(
      Query.cases.Page.make({
        at: settled(editor).caret,
        atRowEnd: editor.caretAtRowEnd,
        direction,
      }),
      answer => {
        const landed = landMove(editor, 'Top')(answer)
        return { ...landed, editor: { ...landed.editor, goal: Option.none() } }
      },
    )

const plainKeys: Readonly<
  Record<NamedKey, (editor: Editor, modifiers: Modifiers) => Plan>
> = {
  Escape: editor => now(editor, 'None'),
  Enter: editor => now(breakLine(editor)),
  Tab: editor => now(typeText('  ')(editor)),
  Backspace: editor => {
    const erased = eraseTo(editor, Buffer.backspaceTarget(settled(editor)))
    return now(
      erased.buffer.caret.line === editor.buffer.caret.line
        ? erased
        : { ...erased, goal: Option.none() },
    )
  },
  Delete: deleteForward,
  ArrowLeft: step('Backward'),
  ArrowRight: step('Forward'),
  ArrowUp: vertical(-1),
  ArrowDown: vertical(1),
  Home: (editor, { ctrl }) =>
    ctrl ? documentEdge(editor, 'Start') : rowEdge('Start')(editor),
  End: (editor, { ctrl }) =>
    ctrl ? documentEdge(editor, 'End') : rowEdge('End')(editor),
  PageUp: page(-1),
  PageDown: page(1),
}

const inputPlan = (editor: Editor, input: Input): Plan =>
  Input.match(input, {
    Key: ({ key, modifiers }) => plainKeys[key](editor, modifiers),
    Chord: () => now(editor, 'None'),
    Text: ({ text, byKey }) =>
      now(byKey ? typeText(text)(editor) : insertText(text)(editor)),
    Paste: ({ text }) => now(insertText(text)(editor)),
    Preedit: ({ text }) =>
      now(redraw(editor, { buffer: settled(editor), preedit: text })),
    Commit: ({ text }) => now(insertText(text)({ ...editor, preedit: '' })),
  })

const clickPlan = (editor: Editor, x: number, y: number): Plan =>
  ask(Query.cases.Point.make({ x, y }), ({ landing }) =>
    done(
      Option.match(landingPosition(editor, landing), {
        onNone: () => editor,
        onSome: ({ caret, atRowEnd }) => moveTo(editor, caret, atRowEnd),
      }),
    ),
  )

const planOf = (editor: Editor, queued: Queued): Plan =>
  Queued.match(queued, {
    Fed: ({ input }) => inputPlan(editor, input),
    Clicked: ({ x, y }) => clickPlan(editor, x, y),
  })

const run = (editor: Editor, queued: Queued): Outcome => {
  const plan = planOf(editor, queued)
  if (plan._tag === 'Done') {
    return plan.outcome
  }
  const drawn = plan.query._tag === 'Point' ? editor : withCaretDrawn(editor)
  return {
    editor: {
      ...drawn,
      locating: Option.some({ cause: queued, queued: [] }),
    },
    locate: Option.some({ query: plan.query, revision: drawn.revision }),
    reveal: 'None',
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

/** Runs held inputs in order. Once one asks the browser, the rest wait behind it again. */
const replay = (start: Outcome, queued: ReadonlyArray<Queued>): Outcome =>
  Array.reduce(queued, start, (outcome, next) => {
    const result = enqueue(outcome.editor, next)
    return {
      editor: result.editor,
      locate: Option.isSome(result.locate) ? result.locate : outcome.locate,
      reveal: strongest(outcome.reveal, result.reveal),
    }
  })

/**
 * The one way the keyboard changes the editor. An Input the mode has no use for (Escape, a Chord) changes nothing
 * and scrolls nothing. Every other Input puts the caret on screen, even a motion that cannot move the caret.
 * An Input that arrives while the browser has a query to answer waits for the answer.
 */
export const feed = (editor: Editor, input: Input): Outcome =>
  enqueue(editor, Queued.cases.Fed.make({ input }))

/** The pointer pressed at client pixel (x, y). It lands where it would after every input fed before it. */
export const click = (editor: Editor, x: number, y: number): Outcome =>
  enqueue(editor, Queued.cases.Clicked.make({ x, y }))

/** The browser answered the query the editor is waiting on. The caret lands, then the held inputs run. */
export const located = (editor: Editor, answer: Answer): Outcome =>
  Option.match(editor.locating, {
    onNone: () => done(editor, 'None'),
    onSome: ({ cause, queued }) => {
      const asked = { ...editor, locating: Option.none() }
      const plan = planOf(asked, cause)
      const landed = plan._tag === 'Ask' ? plan.land(answer) : plan.outcome
      return replay(landed, queued)
    },
  })

/** The screen shows `top` as its first line. The caret may leave the screen until an input brings it back. */
export const scrolled = (editor: Editor, top: number): Editor =>
  top === editor.top ? editor : redraw(editor, { top })

/** The screen holds this many rows now. The same size returns the same Editor. */
export const resized = (editor: Editor, rows: number): Editor => {
  const size = Math.max(1, Math.floor(rows))
  return size === editor.rows ? editor : redraw(editor, { rows: size })
}

/** Cells left of the text: the largest line number, at least four digits, then two blank cells. */
const gutterWidth = (buffer: Buffer.Buffer): number =>
  Math.max(4, String(buffer.lines.length).length) + 2

const caretGrapheme = (text: string, column: number): number =>
  Array.fromIterable(Buffer.segmenter.segment(text.slice(0, column))).length

/** The line split at its joins, and at the caret when a preedit is drawn there. */
const partsOf = (
  line: Buffer.Line,
  preedit: Option.Option<Readonly<{ column: number; text: string }>>,
): ReadonlyArray<Part> => {
  const column = Option.match(preedit, {
    onNone: () => [],
    onSome: ({ column }) => [column],
  })
  const cuts = Array.dedupeAdjacent(
    Array.sort([0, ...line.joins, ...column, line.text.length], Order.Number),
  )
  const texts = Array.map(Array.zip(cuts, cuts.slice(1)), ([from, to]) => ({
    from,
    text: line.text.slice(from, to),
    isPreedit: false,
  }))
  const pieces = Array.isArrayNonEmpty(texts)
    ? texts
    : [{ from: 0, text: '', isPreedit: false }]
  return Option.match(preedit, {
    onNone: () => pieces,
    onSome: ({ column, text }) => {
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
}

export const paint = (editor: Editor): Frame => {
  const { buffer } = editor
  const { caret, lines } = buffer
  const { first, last } = drawnLines(editor)
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
    above: first,
    below: lines.length - 1 - last,
    gutter: gutterWidth(buffer),
    caret: { ...caret, atRowEnd: editor.caretAtRowEnd },
    status: {
      mode: editor.mode,
      line: caret.line + 1,
      column: caretGrapheme(lines[caret.line]?.text ?? '', caret.column) + 1,
      lineCount: lines.length,
    },
    revision: editor.revision,
  }
}

/** The drawn lines as plain text, the caret in brackets. For an agent to read a screen without a browser. */
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
