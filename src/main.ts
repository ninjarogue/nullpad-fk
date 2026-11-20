import { Schema } from 'effect'
import type { Runtime, Update } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'

import * as Editor from './core/editor'
import { Keyboard, keyboardPort } from './keyboard'
import { Message } from './message'
import { statusLine, surface } from './surface'

export { Message }

export const Model = Schema.Struct({
  editor: Editor.Editor,
  keyboard: Keyboard,
  path: Schema.String,
})
export type Model = typeof Model.Type

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { editor: Editor.open(''), keyboard: 'Blurred', path: 'untitled.md' },
})

/** Every arm is one core call. Nothing here returns a Command. */
export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ReceivedInput: ({ input }) => ({
      model: modifyFields(model, {
        editor: editor => Editor.feed(editor, input),
      }),
    }),
    ClickedText: ({ lineId, column, atRowEnd }) => ({
      model: modifyFields(model, {
        editor: editor => Editor.click(editor, lineId, column, atRowEnd),
      }),
    }),
    ScrolledWheel: ({ rows }) => ({
      model: modifyFields(model, {
        editor: editor => Editor.scroll(editor, rows),
      }),
    }),
    ResizedScreen: ({ columns, rows }) => ({
      model: modifyFields(model, {
        editor: editor => Editor.resize(editor, columns, rows),
      }),
    }),
    FocusedKeyboard: () => ({
      model: modifyFields(model, { keyboard: () => 'Focused' }),
    }),
    BlurredKeyboard: () => ({
      model: modifyFields(model, { keyboard: () => 'Blurred' }),
    }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const frame = Editor.paint(model.editor)
  return {
    title: model.path,
    body: h.main(
      [h.Class('app')],
      [
        surface(frame, model.keyboard, h),
        statusLine(frame.status, model.path, h),
        keyboardPort(h),
      ],
    ),
  }
}
