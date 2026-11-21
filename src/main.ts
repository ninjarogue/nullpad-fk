import { Effect, Option, Schema } from 'effect'
import { Command, type Runtime, type Update } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'

import * as Editor from './core/editor'
import { Keyboard, browserUnsupportedNotice, keyboardPort } from './keyboard'
import { Message } from './message'
import { locate, revealCaret, statusLine, surface } from './surface'

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

/** Answers the editor's query from the screen, once the screen shows every input before it. */
const Locate = Command.define('Locate', {
  args: { query: Editor.Query, revision: Schema.Number },
  messages: [Message.CompletedLocate],
  execute: ({ query, revision }) =>
    locate(query, revision).pipe(
      Effect.map(answer => Message.CompletedLocate({ answer })),
    ),
})

const RevealCaret = Command.define('RevealCaret', {
  args: { align: Schema.Literals(['Nearest', 'Top']) },
  messages: [Message.CompletedRevealCaret],
  execute: ({ align }) =>
    revealCaret(align).pipe(Effect.as(Message.CompletedRevealCaret())),
})

const respond = (
  model: Model,
  outcome: Editor.Outcome,
): Update.Return<Model, Message> => ({
  model: modifyFields(model, { editor: () => outcome.editor }),
  commands: [
    ...Option.match(outcome.locate, {
      onNone: () => [],
      onSome: ({ query, revision }) => [Locate({ query, revision })],
    }),
    ...(outcome.reveal === 'None'
      ? []
      : [RevealCaret({ align: outcome.reveal })]),
  ],
})

/** Every arm is one core call, plus the Commands its Outcome asks for. */
export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ReceivedInput: ({ input }) =>
      respond(model, Editor.feed(model.editor, input)),
    ClickedText: ({ x, line, y }) =>
      respond(model, Editor.click(model.editor, x, line, y)),
    CompletedLocate: ({ answer }) =>
      respond(model, Editor.located(model.editor, answer)),
    ScrolledSurface: ({ top }) => ({
      model: modifyFields(model, {
        editor: editor => Editor.scrolled(editor, top),
      }),
    }),
    ResizedScreen: ({ rows }) =>
      respond(model, Editor.resized(model.editor, rows)),
    CompletedRevealCaret: () => ({
      model: modifyFields(model, { editor: Editor.revealed }),
    }),
    FocusedKeyboard: () => ({
      model: modifyFields(model, { keyboard: () => 'Focused' }),
    }),
    BlurredKeyboard: () => ({
      model: modifyFields(model, { keyboard: () => 'Blurred' }),
    }),
    FoundBrowserUnsupported: () => ({
      model: modifyFields(model, { keyboard: () => 'Unsupported' }),
    }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const frame = Editor.paint(model.editor)
  return {
    title: model.path,
    body: h.main(
      [h.Class('app')],
      [
        ...(model.keyboard === 'Unsupported'
          ? [browserUnsupportedNotice(h)]
          : [
              surface(frame, model.keyboard, h),
              statusLine(frame.status, model.path, h),
            ]),
        keyboardPort(frame.surrounding, model.keyboard, h),
      ],
    ),
  }
}
