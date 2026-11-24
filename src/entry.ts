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
import { NoteStore, clearLeavingStash, stashLeaving } from './storage'

// Effect's runMain stops the app on pagehide and an unloading page does not wait for IndexedDB, so this listener comes first and writes localStorage.
window.addEventListener('pagehide', stashLeaving)
window.addEventListener('pageshow', clearLeavingStash)

const readFonts = ["1em 'Inter Variable'", "italic 1em 'Inter Variable'"]

readFonts.forEach(font => void document.fonts.load(font))

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  resources: NoteStore.layer,
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags })
