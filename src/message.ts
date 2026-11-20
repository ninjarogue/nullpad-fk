import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Input } from './core/input'

export const Message = defineMessageUnion({
  ReceivedInput: { input: Input },
  ClickedText: { row: Schema.Number, cell: Schema.Number },
  ScrolledWheel: { rows: Schema.Number },
  ResizedScreen: { columns: Schema.Number, rows: Schema.Number },
  FocusedKeyboard: {},
  BlurredKeyboard: {},
})
export type Message = typeof Message.Type
