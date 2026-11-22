import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Answer } from './core/editor'
import { Input } from './core/input'

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
})
export type Message = typeof Message.Type
