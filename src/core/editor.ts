import { Array, Option, Schema } from 'effect'

import * as Buffer from './buffer'
import { Input, type Modifiers, type NamedKey } from './input'
import * as Screen from './screen'

export type { Row, Span, SpanKind } from './screen'

/** Vim adds Normal, Insert and Visual here. Plain is the default typing mode. */
export const Mode = Schema.Literals(['Plain'])
export type Mode = typeof Mode.Type

export const Editor = Schema.Struct({
  buffer: Buffer.Buffer,
  view: Screen.View,
  mode: Mode,
  preedit: Schema.String,
})
export type Editor = typeof Editor.Type

/** Everything the view draws. The view reads nothing else from the Editor. */
export type Frame = Readonly<{
  rows: ReadonlyArray<Screen.Row>
  gutter: number
  status: Readonly<{
    mode: Mode
    line: number
    column: number
    lineCount: number
  }>
}>

export const open = (text: string): Editor => ({
  buffer: Buffer.fromText(text),
  view: {
    size: { columns: 80, rows: 24 },
    top: { line: 0, row: 0 },
    goalCell: Option.none(),
    caretAtRowEnd: false,
  },
  mode: 'Plain',
  preedit: '',
})

export const text = (editor: Editor): string => Buffer.toText(editor.buffer)

const show = (
  editor: Editor,
  buffer: Buffer.Buffer,
  view: Screen.View,
): Editor => ({
  ...editor,
  buffer,
  view: Screen.follow(buffer, view, editor.preedit),
})

/**
 * Chrome starts every command from the next boundary at or after a caret that inserted text left inside a grapheme,
 * but a command that then does nothing leaves the caret where it was.
 */
const settled = (editor: Editor): Editor => ({
  ...editor,
  buffer: Buffer.settle(editor.buffer),
})

const samePosition = (a: Buffer.Position, b: Buffer.Position): boolean =>
  a.line === b.line && a.column === b.column

const insertText =
  (text: string, atRowEnd = false) =>
  (editor: Editor): Editor => {
    const { buffer, view } = settled(editor)
    return show(editor, Buffer.insert(buffer, text), {
      ...view,
      goalCell: Option.none(),
      caretAtRowEnd: atRowEnd,
    })
  }

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

const eraseTo =
  (motion: Buffer.Motion) =>
  (editor: Editor): Editor => {
    const { buffer, view } = settled(editor)
    const target = Buffer.target(buffer, motion)
    return samePosition(target, buffer.caret)
      ? show(editor, editor.buffer, editor.view)
      : show(editor, Buffer.erase(buffer, buffer.caret, target), {
          ...view,
          caretAtRowEnd: false,
        })
  }

/** A move that leaves the caret where it was keeps the goal cell, as Chrome does; one that moves it clears it. */
const land = (editor: Editor, { caret, atRowEnd }: Screen.Landing): Editor => {
  const moved = Buffer.moveTo(editor.buffer, caret)
  return samePosition(moved.caret, editor.buffer.caret) &&
    atRowEnd === editor.view.caretAtRowEnd
    ? show(editor, editor.buffer, editor.view)
    : show(editor, moved, {
        ...editor.view,
        goalCell: Option.none(),
        caretAtRowEnd: atRowEnd,
      })
}

const moveBy =
  (motion: Buffer.Motion) =>
  (editor: Editor): Editor =>
    land(editor, {
      caret: Buffer.target(settled(editor).buffer, motion),
      atRowEnd: false,
    })

/** ArrowLeft and ArrowRight: at either end of the text they do nothing, even to a caret inside a grapheme. */
const step =
  (motion: Buffer.Motion) =>
  (editor: Editor): Editor => {
    const { buffer } = settled(editor)
    return samePosition(Buffer.target(buffer, motion), buffer.caret)
      ? show(editor, editor.buffer, editor.view)
      : moveBy(motion)(editor)
  }

const moveToRowEdge =
  (edge: 'Start' | 'End') =>
  (editor: Editor): Editor => {
    const { buffer, view } = settled(editor)
    return land(editor, Screen.rowEdge(buffer, view, edge))
  }

const moveRows =
  (rows: number) =>
  (editor: Editor): Editor => {
    const { buffer, view } = settled(editor)
    const aimed = {
      ...view,
      goalCell: Option.some(
        Option.getOrElse(view.goalCell, () => Screen.caretCell(buffer, view)),
      ),
    }
    const { caret, atRowEnd } = Screen.rowTarget(buffer, aimed, rows)
    const moved = Buffer.moveTo(buffer, caret)
    return show(
      editor,
      samePosition(moved.caret, buffer.caret) ? editor.buffer : moved,
      { ...aimed, caretAtRowEnd: atRowEnd },
    )
  }

/**
 * Page Up and Page Down move the caret a page of rows at the cell it is drawn on, then scroll its row to the top of
 * the screen, as far as the end of the text allows. Like Chrome, they forget the goal cell.
 */
const page =
  (direction: -1 | 1) =>
  (editor: Editor): Editor => {
    const { buffer, view } = settled(editor)
    const { caret, atRowEnd } = Screen.pageTarget(buffer, view, direction)
    const moved = Buffer.moveTo(buffer, caret)
    const next = samePosition(moved.caret, buffer.caret) ? editor.buffer : moved
    return {
      ...editor,
      buffer: next,
      view: Screen.caretRowFirst(next, {
        ...view,
        goalCell: Option.none(),
        caretAtRowEnd: atRowEnd,
      }),
    }
  }

const plainKeys: Readonly<
  Record<NamedKey, (editor: Editor, modifiers: Modifiers) => Editor>
> = {
  Escape: editor => editor,
  Enter: typeText('\n'),
  Tab: typeText('  '),
  Backspace: eraseTo('BackspaceStart'),
  Delete: eraseTo('Right'),
  ArrowLeft: step('Left'),
  ArrowRight: step('Right'),
  ArrowUp: moveRows(-1),
  ArrowDown: moveRows(1),
  Home: (editor, { ctrl }) =>
    ctrl ? moveBy('DocumentStart')(editor) : moveToRowEdge('Start')(editor),
  End: (editor, { ctrl }) =>
    ctrl ? moveBy('DocumentEnd')(editor) : moveToRowEdge('End')(editor),
  PageUp: page(-1),
  PageDown: page(1),
}

/**
 * The one way the keyboard changes the editor. Total: an Input the mode has no use for
 * (Escape, a Chord) returns the same Editor, so a caret the wheel scrolled away stays off screen.
 * Every other Input puts the caret row on screen, even a motion that cannot move the caret.
 */
export const feed = (editor: Editor, input: Input): Editor =>
  Input.match(input, {
    Key: ({ key, modifiers }) => plainKeys[key](editor, modifiers),
    Chord: () => editor,
    Text: ({ text, byKey }) =>
      byKey ? typeText(text)(editor) : insertText(text)(editor),
    Paste: ({ text }) => insertText(text)(editor),
    Preedit: ({ text }) => {
      const { buffer } = settled(editor)
      return {
        ...editor,
        buffer,
        preedit: text,
        view: Screen.follow(buffer, editor.view, text),
      }
    },
    Commit: ({ text }) => insertText(text)({ ...editor, preedit: '' }),
  })

/**
 * The pointer chose a place. An unknown line id returns the same Editor. The column is clamped.
 * `atRowEnd` says the pointer was past the end of the row the column ends, rather than on the row it starts.
 */
export const click = (
  editor: Editor,
  lineId: number,
  column: number,
  atRowEnd: boolean,
): Editor =>
  Option.match(Buffer.indexOf(editor.buffer, lineId), {
    onNone: () => editor,
    onSome: line =>
      show(editor, Buffer.moveTo(editor.buffer, { line, column }), {
        ...editor.view,
        goalCell: Option.none(),
        caretAtRowEnd: atRowEnd,
      }),
  })

/** The wheel moved the screen by whole rows. The caret may leave the screen until a `feed` that follows it. */
export const scroll = (editor: Editor, rows: number): Editor =>
  rows === 0
    ? editor
    : { ...editor, view: Screen.scroll(editor.buffer, editor.view, rows) }

/** The screen has this many cells now. The same size returns the same Editor. */
export const resize = (
  editor: Editor,
  columns: number,
  rows: number,
): Editor => {
  const size = {
    columns: Math.max(1, Math.floor(columns)),
    rows: Math.max(1, Math.floor(rows)),
  }
  if (
    size.columns === editor.view.size.columns &&
    size.rows === editor.view.size.rows
  ) {
    return editor
  }
  const view = Screen.settle(editor.buffer, { ...editor.view, size })
  return {
    ...editor,
    view: Screen.follow(editor.buffer, view, editor.preedit),
  }
}

export const paint = (editor: Editor): Frame => {
  const { caret, lines } = editor.buffer
  return {
    rows: Screen.rows(editor.buffer, editor.view, editor.preedit),
    gutter: Screen.gutterWidth(editor.buffer),
    status: {
      mode: editor.mode,
      line: caret.line + 1,
      column:
        Screen.caretGrapheme(editor.buffer, editor.view, editor.preedit) + 1,
      lineCount: lines.length,
    },
  }
}

const dumpSpan: Readonly<Record<Screen.SpanKind, (text: string) => string>> = {
  Text: text => text,
  Preedit: text => text,
  Caret: text => `[${text}]`,
  CaretPastEnd: () => '[ ]',
}

/** The frame as plain text, one row per line, the caret cell in brackets. For an agent to read a screen. */
export const dump = (frame: Frame): string =>
  Array.join(
    Array.map(frame.rows, row =>
      Array.join(
        Array.map(row.spans, span => dumpSpan[span.kind](span.text)),
        '',
      ),
    ),
    '\n',
  )
