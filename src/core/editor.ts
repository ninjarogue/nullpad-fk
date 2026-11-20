import { Array, Option, Schema } from 'effect'

import * as Buffer from './buffer'
import { Input, type Modifiers, type NamedKey } from './input'
import * as Screen from './screen'

export type { Row, Span, SpanKind, Width } from './screen'

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
  },
  mode: 'Plain',
  preedit: '',
})

export const text = (editor: Editor): string => Buffer.toText(editor.buffer)

const edit = (editor: Editor, buffer: Buffer.Buffer): Editor => ({
  ...editor,
  buffer,
  view: Screen.follow(
    buffer,
    { ...editor.view, goalCell: Option.none() },
    editor.preedit,
  ),
})

const insertText =
  (text: string) =>
  (editor: Editor): Editor =>
    edit(editor, Buffer.insert(editor.buffer, text))

const moveBy =
  (motion: Buffer.Motion) =>
  (editor: Editor): Editor =>
    edit(
      editor,
      Buffer.moveTo(editor.buffer, Buffer.target(editor.buffer, motion)),
    )

const eraseTo =
  (motion: Buffer.Motion) =>
  (editor: Editor): Editor =>
    edit(
      editor,
      Buffer.erase(
        editor.buffer,
        editor.buffer.caret,
        Buffer.target(editor.buffer, motion),
      ),
    )

const moveRows =
  (rowsOf: (view: Screen.View) => number) =>
  (editor: Editor): Editor => {
    const view = {
      ...editor.view,
      goalCell: Option.some(
        Option.getOrElse(editor.view.goalCell, () =>
          Screen.caretCell(editor.buffer, editor.view),
        ),
      ),
    }
    const buffer = Buffer.moveTo(
      editor.buffer,
      Screen.rowTarget(editor.buffer, view, rowsOf(view)),
    )
    return {
      ...editor,
      buffer,
      view: Screen.follow(buffer, view, editor.preedit),
    }
  }

const plainKeys: Readonly<
  Record<NamedKey, (editor: Editor, modifiers: Modifiers) => Editor>
> = {
  Escape: editor => editor,
  Enter: insertText('\n'),
  Tab: insertText('  '),
  Backspace: eraseTo('BackspaceStart'),
  Delete: eraseTo('Right'),
  ArrowLeft: moveBy('Left'),
  ArrowRight: moveBy('Right'),
  ArrowUp: moveRows(() => -1),
  ArrowDown: moveRows(() => 1),
  Home: (editor, { ctrl }) =>
    moveBy(ctrl ? 'DocumentStart' : 'LineStart')(editor),
  End: (editor, { ctrl }) => moveBy(ctrl ? 'DocumentEnd' : 'LineEnd')(editor),
  PageUp: moveRows(view => 1 - view.size.rows),
  PageDown: moveRows(view => view.size.rows - 1),
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
    Text: ({ text }) => insertText(text)(editor),
    Paste: ({ text }) => insertText(text)(editor),
    Preedit: ({ text }) => ({
      ...editor,
      preedit: text,
      view: Screen.follow(editor.buffer, editor.view, text),
    }),
    Commit: ({ text }) => insertText(text)({ ...editor, preedit: '' }),
  })

/** The pointer chose a place. An unknown line id returns the same Editor. The column is clamped. */
export const click = (editor: Editor, lineId: number, column: number): Editor =>
  Option.match(Buffer.indexOf(editor.buffer, lineId), {
    onNone: () => editor,
    onSome: line =>
      edit(editor, Buffer.moveTo(editor.buffer, { line, column })),
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
