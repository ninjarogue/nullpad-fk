import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Answer } from './core/editor'
import { Input } from './core/input'
import { Note, NoteId } from './core/notes'
import { Draft, NoteChange } from './storage'

export const Message = defineMessageUnion({
  ReceivedInput: { input: Input },
  ClickedText: { x: Schema.Finite, line: Schema.Int, yInLine: Schema.Finite },
  ScrolledSurface: { top: Schema.Int },
  ResizedScreen: { rows: Schema.Int },
  CompletedLocate: { answer: Answer },
  CompletedRevealCaret: {},
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
})
export type Message = typeof Message.Type
