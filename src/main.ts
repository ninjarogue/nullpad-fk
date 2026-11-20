import { Schema } from 'effect'
import { Runtime, type Update } from 'foldkit'
import { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'

import { appName } from './core/appName'

export const Model = Schema.Struct({ name: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({})
export type Message = typeof Message.Type

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {})

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { name: appName },
})

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: model.name,
  body: h.main(
    [h.Class('min-h-screen bg-neutral-950 p-4 font-mono text-neutral-200')],
    [h.h1([h.Class('text-base font-normal')], [model.name])],
  ),
})
