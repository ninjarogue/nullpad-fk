import { Runtime } from 'foldkit'

import {
  Flags,
  Message,
  Model,
  flags,
  init,
  subscriptions,
  update,
  view,
} from './main'
import { stashLeaving } from './storage'

// Effect's runMain stops the app on pagehide and an unloading page does not wait for IndexedDB, so this listener comes first and writes localStorage.
window.addEventListener('pagehide', stashLeaving)

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags })
