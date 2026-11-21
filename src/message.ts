import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Answer } from './core/editor'
import { Input } from './core/input'

export const Message = defineMessageUnion({
  ReceivedInput: { input: Input },
  ClickedText: { x: Schema.Number, y: Schema.Number },
  ScrolledSurface: { top: Schema.Number },
  ResizedScreen: { rows: Schema.Number },
  CompletedLocate: { answer: Answer },
  CompletedRevealCaret: {},
  FocusedKeyboard: {},
  BlurredKeyboard: {},
})
export type Message = typeof Message.Type
