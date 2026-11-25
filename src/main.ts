import {
  Array,
  Clock,
  Effect,
  Equivalence,
  Number,
  Option,
  Schema,
  Stream,
} from 'effect'
import { SecureRandom } from 'effect/crypto'
import { Command, Dom, type Runtime, Subscription, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'

import { BrowserCrypto } from '@effect/platform-browser'

import * as Editor from './core/editor'
import * as Finder from './core/finder'
import { Input } from './core/input'
import * as Notes from './core/notes'
import * as Reading from './core/reading'
import { finder, finderBounds } from './finder'
import {
  type Bounds,
  Keyboard,
  browserUnsupportedNotice,
  keyboardPort,
} from './keyboard'
import { Message } from './message'
import { readBounds, reading, reveal, scrollReading } from './reading'
import * as Storage from './storage'
import { locate, revealCaret, statusLine, surface } from './surface'

export { Message }

export const Pane = Schema.Literals(['None', 'Html', 'Outline'])
export type Pane = typeof Pane.Type

const paneNames: Readonly<Record<string, Pane>> = {
  html: 'Html',
  outline: 'Outline',
}

const paneOf = (search: string): Pane =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromNullishOr(new URLSearchParams(search).get('pane')),
      name => Option.fromUndefinedOr(paneNames[name]),
    ),
    () => 'None',
  )

export const Flags = Schema.Struct({
  maybeNotes: Schema.Option(Schema.Array(Notes.Note)),
  stashed: Schema.Array(Storage.Stashed),
  seed: Schema.String,
  now: Schema.Finite,
  pane: Pane,
  vim: Schema.Boolean,
})
export type Flags = typeof Flags.Type

export const flags: Effect.Effect<Flags, never, Storage.NoteStore> = Effect.gen(
  function* () {
    const random = yield* SecureRandom.SecureRandom
    const seed = yield* random.uuidV4()
    const store = yield* Storage.NoteStore
    const maybeNotes = yield* Effect.option(store.list)
    const stashed = yield* Storage.takeStashed
    const now = yield* Clock.currentTimeMillis
    const pane = paneOf(window.location.search)
    const vim = yield* Storage.readVimSetting
    return Flags.make({ maybeNotes, stashed, seed, now, pane, vim })
  },
).pipe(Effect.provide(BrowserCrypto.layerSecureRandom))

const SaveState = Schema.TaggedUnion({
  Idle: {},
  Saving: {
    maybeHeld: Schema.Option(Storage.NoteChange),
    sentText: Schema.String,
  },
})
type SaveState = typeof SaveState.Type

const OpenNote = Schema.Struct({
  id: Notes.NoteId,
  folder: Schema.String,
  revision: Schema.Int,
  savedText: Schema.String,
  savedEdits: Schema.Int,
  save: SaveState,
})
type OpenNote = typeof OpenNote.Type

const Screen = Schema.TaggedUnion({
  Edit: {},
  Opening: { queued: Schema.Array(Input) },
  Read: { top: Schema.Int },
})
type Screen = typeof Screen.Type

export const Model = Schema.Struct({
  editor: Editor.Editor,
  keyboard: Keyboard,
  notes: Schema.Array(Notes.Note),
  note: OpenNote,
  pending: Schema.Array(Storage.Draft),
  store: Schema.Literals(['Saving', 'Unavailable']),
  finder: Schema.Option(Finder.Finder),
  screen: Screen,
  edits: Schema.Int,
  seed: Schema.String,
  created: Schema.Int,
  now: Schema.Finite,
  persistence: Schema.Literals(['Unrequested', 'Requested']),
  pane: Pane,
})
export type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message, Storage.NoteStore>

const newNoteId = (model: Model): Notes.NoteId =>
  Notes.NoteId.make(`${model.seed}-${model.created}`)

const show = (
  model: Model,
  note: Pick<OpenNote, 'id' | 'folder' | 'revision'>,
  text: string,
  caretAt: 'Start' | 'End',
  landing: 'AnotherNote' | 'SameNote' = 'SameNote',
): Model =>
  modifyFields(model, {
    editor: editor => Editor.reopen(editor, text, caretAt, landing),
    note: () => ({
      id: note.id,
      folder: note.folder,
      revision: note.revision,
      savedText: text,
      savedEdits: model.edits,
      save: SaveState.cases.Idle.make({}),
    }),
  })

const Locate = Command.define('Locate', {
  args: { ticket: Schema.Int, query: Editor.Query, revision: Schema.Int },
  messages: [Message.CompletedLocate],
  execute: ({ ticket, query, revision }) =>
    locate(query, revision).pipe(
      Effect.map(answer => Message.CompletedLocate({ ticket, answer })),
    ),
})

const RevealCaret = Command.define('RevealCaret', {
  args: { align: Schema.Literals(['Nearest', 'Top']) },
  messages: [Message.CompletedRevealCaret],
  execute: ({ align }) =>
    revealCaret(align).pipe(Effect.as(Message.CompletedRevealCaret())),
})

const autosaveDelay = '800 millis'

const WaitBeforeSave = Command.define('WaitBeforeSave', {
  args: { edits: Schema.Int },
  messages: [Message.CompletedWaitBeforeSave],
  execute: ({ edits }) =>
    Effect.sleep(autosaveDelay).pipe(
      Effect.as(Message.CompletedWaitBeforeSave({ edits })),
    ),
})

const SaveNote = Command.define('SaveNote', {
  args: {
    draft: Storage.Draft,
    expectedRevision: Schema.Int,
    isEdit: Schema.Boolean,
  },
  messages: [Message.SucceededSaveNote, Message.FailedSaveNote],
  execute: ({ draft, expectedRevision, isEdit }) =>
    Effect.gen(function* () {
      const store = yield* Storage.NoteStore
      const note = yield* store.write(draft, expectedRevision)
      return Message.SucceededSaveNote({ note })
    }).pipe(
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedSaveNote({
            draft,
            expectedRevision,
            isEdit,
            reason:
              error._tag === 'StorageConflict' ? 'Conflict' : 'Unavailable',
          }),
        ),
      ),
    ),
})

const RemoveNote = Command.define('RemoveNote', {
  args: { id: Notes.NoteId, expectedRevision: Schema.Int },
  messages: [Message.CompletedRemoveNote],
  execute: ({ id, expectedRevision }) =>
    Effect.gen(function* () {
      const store = yield* Storage.NoteStore
      yield* store.remove(id, expectedRevision)
      return Message.CompletedRemoveNote({ isStoreAvailable: true })
    }).pipe(
      Effect.catchTag('StorageConflict', () =>
        Effect.succeed(Message.CompletedRemoveNote({ isStoreAvailable: true })),
      ),
      Effect.orElseSucceed(() =>
        Message.CompletedRemoveNote({ isStoreAvailable: false }),
      ),
    ),
})

const ReadStoredNote = Command.define('ReadStoredNote', {
  args: { id: Notes.NoteId },
  messages: [Message.CompletedReadStoredNote],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const store = yield* Storage.NoteStore
      const maybeNote = yield* store.read(id)
      return Message.CompletedReadStoredNote({ id, maybeNote })
    }).pipe(
      Effect.orElseSucceed(() =>
        Message.CompletedReadStoredNote({ id, maybeNote: Option.none() }),
      ),
    ),
})

const RequestPersistence = Command.define('RequestPersistence', {
  messages: [Message.CompletedRequestPersistence],
  execute: Storage.persist.pipe(
    Effect.orElseSucceed(() => false),
    Effect.as(Message.CompletedRequestPersistence()),
  ),
})

const RememberVim = Command.define('RememberVim', {
  args: { isOn: Schema.Boolean },
  messages: [Message.CompletedRememberVim],
  execute: ({ isOn }) =>
    Storage.writeVimSetting(isOn).pipe(
      Effect.as(Message.CompletedRememberVim()),
    ),
})

const ReadClock = Command.define('ReadClock', {
  messages: [Message.CompletedReadClock],
  execute: Clock.currentTimeMillis.pipe(
    Effect.map(now => Message.CompletedReadClock({ now })),
  ),
})

const RevealFinderRow = Command.define('RevealFinderRow', {
  messages: [Message.CompletedRevealFinderRow],
  execute: Dom.scrollIntoViewIfNotVisible('.finder .row.sel', {
    block: 'nearest',
    when: 'Commit',
  }).pipe(Effect.ignore, Effect.as(Message.CompletedRevealFinderRow())),
})

const RevealReading = Command.define('RevealReading', {
  args: { target: Reading.Reveal },
  messages: [Message.CompletedRevealReading],
  execute: ({ target }) =>
    reveal(target).pipe(Effect.as(Message.CompletedRevealReading())),
})

const ScrollReading = Command.define('ScrollReading', {
  args: { to: Reading.Scroll },
  messages: [Message.CompletedScrollReading],
  execute: ({ to }) =>
    scrollReading(to).pipe(Effect.as(Message.CompletedScrollReading())),
})

const isDirty = (model: Model): boolean => model.edits !== model.note.savedEdits

const draftOf = (model: Model): Storage.Draft => ({
  id: model.note.id,
  folder: model.note.folder,
  text: Editor.text(model.editor),
})

const removeBlank = (model: Model): UpdateReturn => {
  const { id, revision } = model.note
  return {
    model: modifyFields(model, {
      notes: notes => Notes.without(notes, id),
      note: open =>
        modifyFields(open, {
          revision: () => 0,
          savedEdits: () => model.edits,
        }),
    }),
    commands:
      revision > 0 ? [RemoveNote({ id, expectedRevision: revision })] : [],
  }
}

const saveNow = (model: Model): UpdateReturn => {
  if (model.note.save._tag === 'Saving') {
    return { model }
  }
  if (Editor.isBlank(model.editor)) {
    return removeBlank(model)
  }
  const draft = draftOf(model)
  return {
    model: modifyFields(model, {
      note: open =>
        modifyFields(open, {
          savedEdits: () => model.edits,
          save: () =>
            SaveState.cases.Saving.make({
              maybeHeld: Option.none(),
              sentText: draft.text,
            }),
        }),
    }),
    commands: [
      SaveNote({
        draft,
        expectedRevision: model.note.revision,
        isEdit: true,
      }),
    ],
  }
}

const saveIfDirty = (model: Model): UpdateReturn =>
  isDirty(model) ? saveNow(model) : { model }

const leave = (model: Model): UpdateReturn => {
  const { id, save } = model.note
  if (isDirty(model) && save._tag === 'Saving') {
    return {
      model: modifyFields(model, {
        pending: pending => [
          ...Array.filter(pending, draft => draft.id !== id),
          draftOf(model),
        ],
      }),
    }
  }
  return saveIfDirty(model)
}

const takePending = (
  model: Model,
  id: Notes.NoteId,
): Readonly<{ model: Model; draft: Option.Option<Storage.Draft> }> => ({
  model: modifyFields(model, {
    pending: pending => Array.filter(pending, draft => draft.id !== id),
  }),
  draft: Array.findFirst(model.pending, draft => draft.id === id),
})

const closeFinder = (model: Model): Model =>
  modifyFields(model, { finder: () => Option.none() })

const backToEditor = (model: Model): Model =>
  modifyFields(model, { screen: () => Screen.cases.Edit.make({}) })

const conflictCopy = (model: Model): UpdateReturn =>
  saveNow(
    show(
      modifyFields(model, { created: Number.increment }),
      { id: newNoteId(model), folder: model.note.folder, revision: 0 },
      Notes.conflictCopy(Editor.text(model.editor)),
      'Start',
    ),
  )

const openStored = (model: Model, id: Notes.NoteId): UpdateReturn =>
  id === model.note.id
    ? { model: closeFinder(model) }
    : Option.match(
        Array.findFirst(model.notes, note => note.id === id),
        {
          onNone: () => ({ model }),
          onSome: note =>
            Update.combine(model, [
              leave,
              left => ({
                model: backToEditor(
                  closeFinder(
                    show(left, note, note.text, 'Start', 'AnotherNote'),
                  ),
                ),
              }),
            ]),
        },
      )

const createNote = (model: Model, folder: string, text: string): UpdateReturn =>
  Update.combine(model, [
    leave,
    left =>
      saveNow(
        backToEditor(
          closeFinder(
            show(
              modifyFields(left, { created: Number.increment }),
              { id: newNoteId(left), folder, revision: 0 },
              text,
              'End',
              'AnotherNote',
            ),
          ),
        ),
      ),
  ])

const moveNote = (
  model: Model,
  id: Notes.NoteId,
  folder: string,
): UpdateReturn => {
  const moved = modifyFields(model, {
    notes: notes =>
      Array.map(notes, note =>
        note.id === id ? modifyFields(note, { folder: () => folder }) : note,
      ),
  })
  if (id === model.note.id) {
    return saveNow(
      modifyFields(moved, {
        note: open =>
          modifyFields(open, { folder: () => folder, savedEdits: () => -1 }),
      }),
    )
  }
  return Option.match(
    Array.findFirst(model.notes, note => note.id === id),
    {
      onNone: () => ({ model }),
      onSome: note => ({
        model: moved,
        commands: [
          SaveNote({
            draft: { id, folder, text: note.text },
            expectedRevision: note.revision,
            isEdit: false,
          }),
        ],
      }),
    },
  )
}

const applyFinder = (model: Model, outcome: Finder.Outcome): UpdateReturn => {
  const kept = modifyFields(model, {
    finder: () => Option.some(outcome.finder),
  })
  return Finder.Action.match(outcome.action, {
    Stay: () => ({ model: kept, commands: [RevealFinderRow()] }),
    Close: () => ({ model: closeFinder(model) }),
    Open: ({ id }) => openStored(kept, id),
    Create: ({ folder, text }) => createNote(kept, folder, text),
    Move: ({ id, folder }) => moveNote(kept, id, folder),
  })
}

const respond = (model: Model, outcome: Editor.Outcome): UpdateReturn => {
  const changed = !Editor.sameText(model.editor, outcome.editor)
  const edits = changed ? model.edits + 1 : model.edits
  return {
    model: modifyFields(model, {
      editor: () => outcome.editor,
      edits: () => edits,
    }),
    commands: [
      ...Option.match(outcome.locate, {
        onNone: () => [],
        onSome: ({ ticket, query, revision }) => [
          Locate({ ticket, query, revision }),
        ],
      }),
      ...(outcome.reveal === 'None'
        ? []
        : [RevealCaret({ align: outcome.reveal })]),
      ...(changed ? [WaitBeforeSave({ edits })] : []),
    ],
  }
}

const openFinder = (model: Model): UpdateReturn => ({
  model: modifyFields(model, { finder: () => Option.some(Finder.open()) }),
  commands: [ReadClock()],
})

const readAt = (model: Model, top: number): Model =>
  modifyFields(model, { screen: () => Screen.cases.Read.make({ top }) })

const openReading = (model: Model): UpdateReturn => {
  const read = Reading.page(model.editor.buffer.lines)
  const { line } = model.editor.buffer.caret
  return {
    model: readAt(model, Reading.unitOfLine(read, line)),
    commands: [RevealReading({ target: Reading.revealLine(read, line) })],
  }
}

const scrollReadingTo = (model: Model, to: Reading.Scroll): UpdateReturn => {
  const scrolled =
    to === 'Start'
      ? readAt(model, 0)
      : to === 'End'
        ? readAt(
            model,
            Reading.lastUnit(Reading.page(model.editor.buffer.lines)),
          )
        : model
  return { model: scrolled, commands: [ScrollReading({ to })] }
}

const scrolledReading = (model: Model, at: Reading.At): UpdateReturn => {
  const { top, reveal: target } = Reading.landing(
    Reading.page(model.editor.buffer.lines),
    at,
    model.editor.screenRows,
  )
  return {
    model: readAt(model, top),
    commands: Option.match(target, {
      onNone: () => [],
      onSome: shown => [RevealReading({ target: shown })],
    }),
  }
}

const thenOpen = (
  fed: UpdateReturn,
  open: (model: Model) => UpdateReturn,
): UpdateReturn => {
  const opened = open(fed.model)
  return {
    model: opened.model,
    commands: [...(fed.commands ?? []), ...(opened.commands ?? [])],
  }
}

const editInput = (model: Model, input: Input): UpdateReturn => {
  const fed = respond(model, Editor.feed(model.editor, input))
  if (Finder.opensFinder(input)) {
    return thenOpen(fed, openFinder)
  }
  if (Reading.togglesReading(input)) {
    return thenOpen(fed, fedModel =>
      Option.isSome(fedModel.editor.locating)
        ? {
            model: modifyFields(fedModel, {
              screen: () => Screen.cases.Opening.make({ queued: [] }),
            }),
          }
        : openReading(fedModel),
    )
  }
  return fed
}

const readAct = (model: Model, act: Reading.Act): UpdateReturn =>
  Reading.Act.match(act, {
    Close: () => ({ model: backToEditor(model) }),
    OpenFinder: () => openFinder(model),
    Scroll: ({ to }) => scrollReadingTo(model, to),
    Flip: ({ box }) => respond(model, Reading.flip(model.editor, box)),
    Ignore: () => ({ model }),
  })

const readInput = (model: Model, input: Input): UpdateReturn =>
  readAct(model, Reading.act(input))

const receiveInput = (model: Model, input: Input): UpdateReturn =>
  Editor.togglesVim(input)
    ? respond(model, Editor.toggledVim(model.editor))
    : routeInput(model, input)

const routeInput = (model: Model, input: Input): UpdateReturn =>
  Option.match(model.finder, {
    onSome: open => applyFinder(model, Finder.feed(open, model.notes, input)),
    onNone: () =>
      Screen.match(model.screen, {
        Edit: () => editInput(model, input),
        Opening: ({ queued }) => ({
          model: modifyFields(model, {
            screen: () =>
              Screen.cases.Opening.make({ queued: [...queued, input] }),
          }),
        }),
        Read: () => readInput(model, input),
      }),
  })

const finishOpening = (model: Model): UpdateReturn =>
  model.screen._tag === 'Opening' && Option.isNone(model.editor.locating)
    ? Update.combine(model, [
        openReading,
        ...Array.map(
          model.screen.queued,
          input => (stepModel: Model) => receiveInput(stepModel, input),
        ),
      ])
    : { model }

const laterChange = (
  held: Option.Option<Storage.NoteChange>,
  change: Storage.NoteChange,
): Storage.NoteChange =>
  Option.match(held, {
    onNone: () => change,
    onSome: earlier =>
      earlier._tag === 'Saved' &&
      change._tag === 'Saved' &&
      earlier.note.revision > change.note.revision
        ? earlier
        : change,
  })

const changedId = (change: Storage.NoteChange): Notes.NoteId =>
  Storage.NoteChange.match(change, {
    Saved: ({ note }) => note.id,
    Removed: ({ id }) => id,
  })

const adoptStored = (model: Model, note: Notes.Note): Model =>
  modifyFields(model, {
    note: open =>
      modifyFields(open, {
        folder: () => note.folder,
        revision: () => note.revision,
        save: () => SaveState.cases.Idle.make({}),
      }),
  })

const applyChange = (model: Model, change: Storage.NoteChange): UpdateReturn =>
  Storage.NoteChange.match(change, {
    Saved: ({ note }) => {
      if (note.id !== model.note.id || note.revision <= model.note.revision) {
        return { model }
      }
      if (note.text === model.note.savedText) {
        return saveIfDirty(adoptStored(model, note))
      }
      return isDirty(model)
        ? conflictCopy(model)
        : { model: show(model, note, note.text, 'Start') }
    },
    Removed: ({ id }) => {
      if (id !== model.note.id) {
        return { model }
      }
      return {
        model: isDirty(model)
          ? modifyFields(model, {
              note: open => modifyFields(open, { revision: () => 0 }),
            })
          : show(
              model,
              { id, folder: model.note.folder, revision: 0 },
              '',
              'Start',
            ),
      }
    },
  })

const receiveChange = (
  model: Model,
  change: Storage.NoteChange,
): UpdateReturn => {
  const listed = modifyFields(model, {
    notes: notes =>
      Storage.NoteChange.match(change, {
        Saved: ({ note }) => Notes.upsert(notes, note),
        Removed: ({ id }) => Notes.without(notes, id),
      }),
  })
  const { save } = model.note
  return save._tag === 'Saving' && changedId(change) === model.note.id
    ? {
        model: modifyFields(listed, {
          note: open =>
            modifyFields(open, {
              save: () =>
                SaveState.cases.Saving.make({
                  maybeHeld: Option.some(laterChange(save.maybeHeld, change)),
                  sentText: save.sentText,
                }),
            }),
        }),
      }
    : applyChange(listed, change)
}

const heldChange = (save: SaveState): Option.Option<Storage.NoteChange> =>
  SaveState.match(save, {
    Idle: () => Option.none(),
    Saving: ({ maybeHeld }) => maybeHeld,
  })

const confirmSave = (model: Model, note: Notes.Note): UpdateReturn => {
  const confirmed = modifyFields(model, {
    note: open =>
      modifyFields(open, {
        revision: () => note.revision,
        savedText: () => note.text,
        save: () => SaveState.cases.Idle.make({}),
      }),
    store: () => 'Saving',
  })
  return Option.match(heldChange(model.note.save), {
    onNone: () => saveIfDirty(confirmed),
    onSome: change =>
      Update.combine(confirmed, [
        stepModel => applyChange(stepModel, change),
        saveIfDirty,
      ]),
  })
}

const savePending = (
  model: Model,
  id: Notes.NoteId,
  expectedRevision: number,
): UpdateReturn => {
  const taken = takePending(model, id)
  return Option.match(taken.draft, {
    onNone: () => ({ model: taken.model }),
    onSome: pending =>
      Notes.isBlank(pending.text)
        ? {
            model: modifyFields(taken.model, {
              notes: notes => Notes.without(notes, id),
            }),
            commands: [RemoveNote({ id, expectedRevision })],
          }
        : {
            model: taken.model,
            commands: [
              SaveNote({ draft: pending, expectedRevision, isEdit: true }),
            ],
          },
  })
}

const copyLeftNote = (model: Model, draft: Storage.Draft): UpdateReturn => {
  const taken = takePending(model, draft.id)
  const latest = Option.getOrElse(taken.draft, () => draft)
  if (Notes.isBlank(latest.text)) {
    return { model: taken.model }
  }
  return {
    model: modifyFields(taken.model, { created: Number.increment }),
    commands: [
      SaveNote({
        draft: {
          id: newNoteId(taken.model),
          folder: latest.folder,
          text: Notes.conflictCopy(latest.text),
        },
        expectedRevision: 0,
        isEdit: true,
      }),
    ],
  }
}

const storedNote = (
  model: Model,
  id: Notes.NoteId,
): Option.Option<Notes.Note> =>
  Array.findFirst(model.notes, note => note.id === id)

const restoreStashed = (
  model: Model,
  stashed: Storage.Stashed,
): UpdateReturn => {
  const stored = storedNote(model, stashed.id)
  const storedRevision = Option.match(stored, {
    onNone: () => 0,
    onSome: ({ revision }) => revision,
  })
  if (Option.exists(stored, ({ text }) => text === stashed.text)) {
    return { model }
  }
  const isRestored =
    model.note.id === stashed.id && model.note.save._tag === 'Saving'
  const isStillBase =
    storedRevision === stashed.baseRevision ||
    Option.exists(
      stored,
      ({ revision, text }) =>
        revision === stashed.baseRevision + 1 &&
        Option.contains(stashed.maybeSentText, text),
    )
  const draft = { id: stashed.id, folder: stashed.folder, text: stashed.text }
  if (Notes.isBlank(stashed.text)) {
    const listed = modifyFields(model, {
      notes: notes => Notes.without(notes, stashed.id),
    })
    return isStillBase && Option.isSome(stored)
      ? {
          model:
            model.note.id === stashed.id
              ? show(
                  listed,
                  { id: stashed.id, folder: stashed.folder, revision: 0 },
                  '',
                  'Start',
                )
              : listed,
          commands: [
            RemoveNote({ id: stashed.id, expectedRevision: storedRevision }),
          ],
        }
      : { model }
  }
  if (!isStillBase || isRestored) {
    return {
      model: modifyFields(model, { created: Number.increment }),
      commands: [
        SaveNote({
          draft: {
            ...draft,
            id: newNoteId(model),
            text: Notes.conflictCopy(stashed.text),
          },
          expectedRevision: 0,
          isEdit: true,
        }),
      ],
    }
  }
  const shown = show(
    model,
    { id: stashed.id, folder: stashed.folder, revision: storedRevision },
    stashed.text,
    'Start',
  )
  return saveNow(
    modifyFields(shown, {
      note: open => modifyFields(open, { savedEdits: () => -1 }),
    }),
  )
}

export const init: Runtime.ApplicationInit<
  Model,
  Message,
  Flags,
  Storage.NoteStore
> = ({ maybeNotes, stashed, seed, now, pane, vim }) => {
  const notes = Option.getOrElse(maybeNotes, () => [])
  const blank: Model = {
    editor: Editor.open('', vim),
    keyboard: 'Blurred',
    notes,
    note: {
      id: Notes.NoteId.make(`${seed}-0`),
      folder: '',
      revision: 0,
      savedText: '',
      savedEdits: 0,
      save: SaveState.cases.Idle.make({}),
    },
    pending: [],
    store: Option.isSome(maybeNotes) ? 'Saving' : 'Unavailable',
    finder: Option.none(),
    screen: Screen.cases.Edit.make({}),
    edits: 0,
    seed,
    created: 1,
    now,
    persistence: 'Unrequested',
    pane,
  }
  const opened = Option.match(Notes.newest(notes), {
    onNone: () => blank,
    onSome: note => show(blank, note, note.text, 'Start'),
  })
  return Update.combine(
    opened,
    Array.map(stashed, found => (model: Model) => restoreStashed(model, found)),
  )
}

const handle = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ReceivedInput: ({ input }) => receiveInput(model, input),
    ClickedText: ({ x, line, yInLine }) =>
      respond(model, Editor.click(model.editor, x, line, yInLine)),
    CompletedLocate: ({ ticket, answer }) =>
      Update.combine(model, [
        stepModel =>
          respond(stepModel, Editor.located(stepModel.editor, ticket, answer)),
        finishOpening,
      ]),
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
    CompletedWaitBeforeSave: ({ edits }) =>
      edits === model.edits ? saveIfDirty(model) : { model },
    SucceededSaveNote: ({ note }) => {
      const listed = modifyFields(model, {
        notes: notes => Notes.upsert(notes, note),
        persistence: () => 'Requested',
      })
      const settled =
        note.id === model.note.id
          ? confirmSave(listed, note)
          : savePending(listed, note.id, note.revision)
      return model.persistence === 'Unrequested'
        ? {
            model: settled.model,
            commands: [...(settled.commands ?? []), RequestPersistence()],
          }
        : settled
    },
    FailedSaveNote: ({ draft, expectedRevision, isEdit, reason }) => {
      const noted =
        reason === 'Unavailable'
          ? modifyFields(model, { store: () => 'Unavailable' })
          : model
      if (draft.id !== noted.note.id) {
        if (reason === 'Unavailable') {
          return savePending(noted, draft.id, expectedRevision)
        }
        return isEdit ? copyLeftNote(noted, draft) : { model: noted }
      }
      return reason === 'Conflict'
        ? { model: noted, commands: [ReadStoredNote({ id: draft.id })] }
        : {
            model: modifyFields(noted, {
              note: open =>
                modifyFields(open, {
                  savedEdits: () => -1,
                  save: () => SaveState.cases.Idle.make({}),
                }),
            }),
          }
    },
    CompletedReadStoredNote: ({ id, maybeNote }) => {
      if (id !== model.note.id) {
        return { model }
      }
      const failed = modifyFields(model, {
        note: open =>
          modifyFields(open, {
            savedEdits: () => -1,
            save: () => SaveState.cases.Idle.make({}),
          }),
      })
      return Option.match(
        Option.filter(maybeNote, ({ text }) => text === model.note.savedText),
        {
          onNone: () => conflictCopy(failed),
          onSome: note => saveNow(adoptStored(failed, note)),
        },
      )
    },
    CompletedRemoveNote: ({ isStoreAvailable }) => ({
      model: isStoreAvailable
        ? model
        : modifyFields(model, { store: () => 'Unavailable' }),
    }),
    CompletedRequestPersistence: () => ({ model }),
    CompletedReadClock: ({ now }) => ({
      model: modifyFields(model, { now: () => now }),
    }),
    CompletedRevealFinderRow: () => ({ model }),
    ReceivedNoteChange: ({ change }) => receiveChange(model, change),
    HidPage: () => saveIfDirty(model),
    LeftPage: () => leave(model),
    ClickedFinderRow: ({ index }) =>
      Option.match(model.finder, {
        onNone: () => ({ model }),
        onSome: open =>
          applyFinder(model, Finder.pick(open, model.notes, index)),
      }),
    ClickedFinderScope: ({ scope }) => ({
      model: modifyFields(model, {
        finder: maybeFinder =>
          Option.map(maybeFinder, open => Finder.enterScope(open, scope)),
      }),
    }),
    ClickedFinderBackdrop: () => ({ model: closeFinder(model) }),
    ClickedReadToggle: () => receiveInput(model, Reading.toggle),
    ClickedVimToggle: () => respond(model, Editor.toggledVim(model.editor)),
    CompletedRememberVim: () => ({ model }),
    ScrolledReading: ({ at }) =>
      model.screen._tag === 'Read' ? scrolledReading(model, at) : { model },
    ClickedTask: ({ box }) =>
      model.screen._tag === 'Read'
        ? readAct(model, Reading.click(model.editor.buffer.lines, box))
        : { model },
    CompletedRevealReading: () => ({ model }),
    CompletedScrollReading: () => ({ model }),
  })

export const update = (model: Model, message: Message): UpdateReturn => {
  const next = handle(model, message)
  const isOn = Editor.isVimOn(next.model.editor)
  return Editor.isVimOn(model.editor) === isOn
    ? next
    : { ...next, commands: [...(next.commands ?? []), RememberVim({ isOn })] }
}

const unsaved = ({
  editor,
  note,
  pending,
  edits,
}: Pick<
  Model,
  'editor' | 'note' | 'pending' | 'edits'
>): ReadonlyArray<Storage.Stashed> => {
  const maybeSentText = SaveState.match(note.save, {
    Idle: () => Option.none<string>(),
    Saving: ({ sentText }) => Option.some(sentText),
  })
  const open =
    edits !== note.savedEdits || Option.isSome(maybeSentText)
      ? [
          {
            id: note.id,
            folder: note.folder,
            text: Editor.text(editor),
            baseRevision: note.revision,
            maybeSentText,
          },
        ]
      : []
  return [
    ...open,
    ...Array.map(pending, draft => ({
      ...draft,
      baseRevision: -1,
      maybeSentText: Option.none<string>(),
    })),
  ]
}

export const subscriptions = Subscription.make<
  Model,
  Message,
  Storage.NoteStore
>()(entry => ({
  noteChanges: Subscription.persistentEntry(
    Stream.unwrap(
      Effect.gen(function* () {
        const store = yield* Storage.NoteStore
        return Stream.map(store.changes, change =>
          Message.ReceivedNoteChange({ change }),
        )
      }),
    ),
  ),
  pageExits: Subscription.persistentEntry(
    Stream.merge(
      Dom.streamFromEventFilterMap({
        target: document,
        type: 'visibilitychange',
        filterMapEvent: () =>
          document.visibilityState === 'hidden'
            ? Option.some(Message.HidPage())
            : Option.none(),
      }),
      Dom.streamFromEvent({
        target: window,
        type: 'pagehide',
        mapEvent: () => Message.LeftPage(),
      }),
    ),
  ),
  unsavedStash: entry(
    {
      editor: Editor.Editor,
      note: OpenNote,
      pending: Schema.Array(Storage.Draft),
      edits: Schema.Int,
      seed: Schema.String,
    },
    {
      modelToDependencies: ({ editor, note, pending, edits, seed }) => ({
        editor,
        note,
        pending,
        edits,
        seed,
      }),
      keepAliveEquivalence: Equivalence.Struct({ seed: Equivalence.String }),
      dependenciesToStream: ({ seed }, readDependencies) =>
        Stream.fromEffectDrain(
          Storage.stashOnLeave(seed, () => unsaved(readDependencies())),
        ),
    },
  ),
}))

const editorBounds: Bounds = { control: '.surface', selection: '#caret' }

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

const isReading = (model: Model): boolean => model.screen._tag === 'Read'

const screenView = (
  model: Model,
  frame: Editor.Frame,
  h: HtmlBuilder<Message>,
): Html => {
  const editorSurface = surface(
    frame,
    Option.isSome(model.finder) ? 'Blurred' : model.keyboard,
    h,
  )
  return h.div(
    [h.Class(model.screen._tag === 'Read' ? 'stage reading' : 'stage')],
    [
      editorSurface,
      ...(model.screen._tag === 'Read'
        ? [
            reading(
              Reading.drawn(
                Reading.page(model.editor.buffer.lines),
                model.screen.top,
                model.editor.screenRows,
              ),
              h,
            ),
          ]
        : []),
    ],
  )
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const frame = Editor.paint(model.editor)
  const title = Editor.title(model.editor)
  const bounds = Option.isSome(model.finder)
    ? finderBounds
    : isReading(model)
      ? readBounds
      : editorBounds
  return {
    title,
    body: h.main(
      [h.Class('app')],
      [
        ...(model.keyboard === 'Unsupported'
          ? [browserUnsupportedNotice(h)]
          : [
              screenView(model, frame, h),
              paneView(model, h),
              statusLine(
                frame.status,
                isReading(model) ? 'Read' : 'Edit',
                Notes.joinFolder(model.note.folder, Notes.fileName(title)),
                model.store === 'Unavailable'
                  ? Option.some('notes are not being saved')
                  : Option.none(),
                h,
              ),
              ...Option.match(model.finder, {
                onNone: () => [],
                onSome: open => [finder(open, model.notes, model.now, h)],
              }),
            ]),
        keyboardPort(
          Option.match(model.finder, {
            onNone: () => frame.surrounding,
            onSome: Finder.surrounding,
          }),
          frame.discards,
          Editor.isVimOn(model.editor) ? 'vim' : 'plain',
          bounds,
          model.keyboard,
          h,
        ),
      ],
    ),
  }
}
