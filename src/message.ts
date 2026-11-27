import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Answer, Scroll } from './core/editor'
import { Input } from './core/input'
import { Note, NoteId } from './core/notes'
import { At, Box } from './core/reading'
import { Draft, NoteChange } from './storage'

export const Message = defineMessageUnion({
  ReceivedInput: { input: Input, at: Schema.Finite },
  ClickedText: {
    x: Schema.Finite,
    line: Schema.Int,
    yInLine: Schema.Finite,
    at: Schema.Finite,
  },
  ScrolledSurface: Scroll.fields,
  ResizedScreen: { rows: Schema.Int },
  CompletedLocate: { ticket: Schema.Int, answer: Answer },
  CompletedReadClipboard: {
    ticket: Schema.Int,
    maybeText: Schema.Option(Schema.String),
  },
  SucceededWriteClipboard: {},
  FailedWriteClipboard: {},
  FocusedKeyboard: {},
  BlurredKeyboard: {},
  FoundBrowserUnsupported: {},
  CompletedWaitBeforeSave: { edits: Schema.Int },
  SucceededSaveNote: { note: Note },
  FailedSaveNote: {
    draft: Draft,
    expectedRevision: Schema.Int,
    isEdit: Schema.Boolean,
    reason: Schema.Literals(['Conflict', 'Unavailable']),
  },
  CompletedRemoveNote: { isStoreAvailable: Schema.Boolean },
  CompletedReadStoredNote: { id: NoteId, maybeNote: Schema.Option(Note) },
  CompletedRequestPersistence: {},
  CompletedReadClock: { now: Schema.Finite },
  CompletedRevealFinderRow: {},
  ReceivedNoteChange: { change: NoteChange },
  HidPage: {},
  LeftPage: {},
  ClickedFinderRow: { index: Schema.Int },
  ClickedFinderScope: { scope: Schema.String },
  ClickedFinderBackdrop: {},
  ClickedReadToggle: {},
  ClickedVimToggle: {},
  CompletedRememberVim: {},
  ScrolledReading: { at: At },
  ClickedTask: { box: Box },
  CompletedRevealReading: {},
  CompletedScrollReading: {},
})
export type Message = typeof Message.Type
