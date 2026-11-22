import { Effect } from 'effect'
import { Runtime } from 'foldkit'

import { Flags, Message, Model, flagsOf, init, update, view } from './main'

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application, {
  flags: Effect.sync(() => flagsOf(window.location.search)),
})
