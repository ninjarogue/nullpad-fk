import { Effect, Option, Schema } from 'effect'
import { Command, type Runtime, type Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'

import * as Editor from './core/editor'
import { Keyboard, browserUnsupportedNotice, keyboardPort } from './keyboard'
import { Message } from './message'
import { locate, revealCaret, statusLine, surface } from './surface'

export { Message }

export const Pane = Schema.Literals(['None', 'Html', 'Outline'])
export type Pane = typeof Pane.Type

export const Flags = Schema.Struct({ pane: Pane })
export type Flags = typeof Flags.Type

const paneNames: Readonly<Record<string, Pane>> = {
  html: 'Html',
  outline: 'Outline',
}

export const flagsOf = (search: string): Flags => ({
  pane: Option.getOrElse(
    Option.flatMap(
      Option.fromNullishOr(new URLSearchParams(search).get('pane')),
      name => Option.fromUndefinedOr(paneNames[name]),
    ),
    () => 'None',
  ),
})

export const Model = Schema.Struct({
  editor: Editor.Editor,
  keyboard: Keyboard,
  path: Schema.String,
  pane: Pane,
})
export type Model = typeof Model.Type

export const init: Runtime.ApplicationInit<Model, Message, Flags> = ({
  pane,
}) => ({
  model: {
    editor: Editor.open(''),
    keyboard: 'Blurred',
    path: 'untitled.md',
    pane,
  },
})

const Locate = Command.define('Locate', {
  args: { query: Editor.Query, revision: Schema.Int },
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

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ReceivedInput: ({ input }) =>
      respond(model, Editor.feed(model.editor, input)),
    ClickedText: ({ x, line, yInLine }) =>
      respond(model, Editor.click(model.editor, x, line, yInLine)),
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

const paneView = (model: Model, h: HtmlBuilder<Message>): Html =>
  model.pane === 'None'
    ? h.empty
    : h.pre(
        [h.Class('pane')],
        [
          model.pane === 'Html'
            ? Editor.html(model.editor)
            : Editor.outline(model.editor),
        ],
      )

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
              paneView(model, h),
              statusLine(frame.status, model.path, h),
            ]),
        keyboardPort(frame.surrounding, model.keyboard, h),
      ],
    ),
  }
}
