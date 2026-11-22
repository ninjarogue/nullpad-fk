import { Array, Clock, Effect, Option, Schema, Stream } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { Command, Dom, type Runtime, Subscription, Update } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'

import { BrowserCrypto } from '@effect/platform-browser'

import * as Editor from './core/editor'
import * as Finder from './core/finder'
import type { Input } from './core/input'
import * as Notes from './core/notes'
import { finder } from './finder'
import { Keyboard, browserUnsupportedNotice, keyboardPort } from './keyboard'
import { Message } from './message'
import * as Storage from './storage'
import { locate, revealCaret, statusLine, surface } from './surface'

export { Message }

export const Flags = Schema.Struct({
  notes: Schema.Array(Notes.Note),
  seed: Schema.String,
  now: Schema.Finite,
})
export type Flags = typeof Flags.Type

export const flags: Effect.Effect<Flags> = Effect.gen(function* () {
  const random = yield* SecureRandom.SecureRandom
  const seed = yield* random.uuidV4()
  const notes = yield* Storage.list.pipe(Effect.orElseSucceed(() => []))
  const now = yield* Clock.currentTimeMillis
  return { notes, seed, now }
}).pipe(Effect.provide(BrowserCrypto.layerSecureRandom))

const SaveState = Schema.TaggedUnion({
  Idle: {},
  Saving: { held: Schema.Option(Storage.NoteChange) },
})
type SaveState = typeof SaveState.Type

const OpenNote = Schema.Struct({
  id: Notes.NoteId,
  folder: Schema.String,
  revision: Schema.Int,
  savedEdits: Schema.Int,
  save: SaveState,
})
type OpenNote = typeof OpenNote.Type

export const Model = Schema.Struct({
  editor: Editor.Editor,
  keyboard: Keyboard,
  notes: Schema.Array(Notes.Note),
  note: OpenNote,
  pending: Schema.Array(Storage.Draft),
  finder: Schema.Option(Finder.Finder),
  edits: Schema.Int,
  seed: Schema.String,
  created: Schema.Int,
  now: Schema.Finite,
  persistence: Schema.Literals(['Unrequested', 'Requested']),
})
export type Model = typeof Model.Type

type UpdateReturn = Update.Return<Model, Message>

const newNoteId = (model: Model): Notes.NoteId =>
  Notes.NoteId.make(`${model.seed}-${model.created}`)

const show = (
  model: Model,
  note: Pick<OpenNote, 'id' | 'folder' | 'revision'>,
  text: string,
  caretAt: 'Start' | 'End',
): Model =>
  modifyFields(model, {
    editor: editor => Editor.reopen(editor, text, caretAt),
    note: () => ({
      id: note.id,
      folder: note.folder,
      revision: note.revision,
      savedEdits: model.edits,
      save: SaveState.cases.Idle.make({}),
    }),
  })

export const init: Runtime.ApplicationInit<Model, Message, Flags> = ({
  notes,
  seed,
  now,
}) => {
  const blank: Model = {
    editor: Editor.open(''),
    keyboard: 'Blurred',
    notes,
    note: {
      id: Notes.NoteId.make(`${seed}-0`),
      folder: '',
      revision: 0,
      savedEdits: 0,
      save: SaveState.cases.Idle.make({}),
    },
    pending: [],
    finder: Option.none(),
    edits: 0,
    seed,
    created: 1,
    now,
    persistence: 'Unrequested',
  }
  return {
    model: Option.match(Notes.newest(notes), {
      onNone: () => blank,
      onSome: note => show(blank, note, note.text, 'Start'),
    }),
  }
}

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
    Storage.write(draft, expectedRevision).pipe(
      Effect.map(note => Message.SucceededSaveNote({ note })),
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
  args: { id: Notes.NoteId },
  messages: [Message.CompletedRemoveNote],
  execute: ({ id }) =>
    Storage.remove(id).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedRemoveNote()),
    ),
})

const RequestPersistence = Command.define('RequestPersistence', {
  messages: [Message.CompletedRequestPersistence],
  execute: Storage.persist.pipe(
    Effect.orElseSucceed(() => false),
    Effect.as(Message.CompletedRequestPersistence()),
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

const isDirty = (model: Model): boolean => model.edits !== model.note.savedEdits

const draftOf = (model: Model): Storage.Draft => ({
  id: model.note.id,
  folder: model.note.folder,
  text: Editor.text(model.editor),
})

const saveNow = (model: Model): UpdateReturn =>
  Editor.isBlank(model.editor) || model.note.save._tag === 'Saving'
    ? { model }
    : {
        model: modifyFields(model, {
          note: open =>
            modifyFields(open, {
              savedEdits: () => model.edits,
              save: () => SaveState.cases.Saving.make({ held: Option.none() }),
            }),
        }),
        commands: [
          SaveNote({
            draft: draftOf(model),
            expectedRevision: model.note.revision,
            isEdit: true,
          }),
        ],
      }

const saveIfDirty = (model: Model): UpdateReturn =>
  isDirty(model) ? saveNow(model) : { model }

const leave = (model: Model): UpdateReturn => {
  const { id, revision, save } = model.note
  if (Editor.isBlank(model.editor)) {
    return revision > 0 || save._tag === 'Saving'
      ? {
          model: modifyFields(model, {
            notes: notes => Notes.without(notes, id),
            note: open => modifyFields(open, { revision: () => 0 }),
          }),
          commands: [RemoveNote({ id })],
        }
      : { model }
  }
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

const conflictCopy = (model: Model): UpdateReturn =>
  saveNow(
    show(
      modifyFields(model, { created: created => created + 1 }),
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
                model: closeFinder(show(left, note, note.text, 'Start')),
              }),
            ]),
        },
      )

const createNote = (model: Model, folder: string, text: string): UpdateReturn =>
  Update.combine(model, [
    leave,
    left =>
      saveNow(
        closeFinder(
          show(
            modifyFields(left, { created: created => created + 1 }),
            { id: newNoteId(left), folder, revision: 0 },
            text,
            'End',
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
        onSome: ({ query, revision }) => [Locate({ query, revision })],
      }),
      ...(outcome.reveal === 'None'
        ? []
        : [RevealCaret({ align: outcome.reveal })]),
      ...(changed ? [WaitBeforeSave({ edits })] : []),
    ],
  }
}

const receiveInput = (model: Model, input: Input): UpdateReturn =>
  Option.match(model.finder, {
    onSome: open => applyFinder(model, Finder.feed(open, model.notes, input)),
    onNone: () =>
      Finder.opensFinder(input)
        ? {
            model: modifyFields(model, {
              finder: () => Option.some(Finder.open()),
            }),
            commands: [ReadClock()],
          }
        : respond(model, Editor.feed(model.editor, input)),
  })

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

const applyChange = (model: Model, change: Storage.NoteChange): UpdateReturn =>
  Storage.NoteChange.match(change, {
    Saved: ({ note }) => {
      if (note.id !== model.note.id || note.revision <= model.note.revision) {
        return { model }
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
                  held: Option.some(laterChange(save.held, change)),
                }),
            }),
        }),
      }
    : applyChange(listed, change)
}

const heldChange = (save: SaveState): Option.Option<Storage.NoteChange> =>
  SaveState.match(save, {
    Idle: () => Option.none(),
    Saving: ({ held }) => held,
  })

const confirmSave = (model: Model, note: Notes.Note): UpdateReturn => {
  const confirmed = modifyFields(model, {
    note: open =>
      modifyFields(open, {
        revision: () => note.revision,
        save: () => SaveState.cases.Idle.make({}),
      }),
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
    onSome: pending => ({
      model: taken.model,
      commands: [SaveNote({ draft: pending, expectedRevision, isEdit: true })],
    }),
  })
}

const copyLeftNote = (model: Model, draft: Storage.Draft): UpdateReturn => {
  const taken = takePending(model, draft.id)
  const latest = Option.getOrElse(taken.draft, () => draft)
  return {
    model: modifyFields(taken.model, { created: created => created + 1 }),
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

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ReceivedInput: ({ input }) => receiveInput(model, input),
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
      if (draft.id !== model.note.id) {
        if (reason === 'Unavailable') {
          return savePending(model, draft.id, expectedRevision)
        }
        return isEdit ? copyLeftNote(model, draft) : { model }
      }
      return reason === 'Conflict'
        ? conflictCopy(model)
        : {
            model: modifyFields(model, {
              note: open =>
                modifyFields(open, {
                  savedEdits: () => -1,
                  save: () => SaveState.cases.Idle.make({}),
                }),
            }),
          }
    },
    CompletedRemoveNote: () => ({ model }),
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
  })

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  noteChanges: Subscription.persistentEntry(
    Stream.map(Storage.watch, change => Message.ReceivedNoteChange({ change })),
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
}))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const frame = Editor.paint(model.editor)
  const title = Editor.title(model.editor)
  return {
    title,
    body: h.main(
      [h.Class('app')],
      [
        ...(model.keyboard === 'Unsupported'
          ? [browserUnsupportedNotice(h)]
          : [
              surface(
                frame,
                Option.isSome(model.finder) ? 'Blurred' : model.keyboard,
                h,
              ),
              statusLine(
                frame.status,
                Notes.joinFolder(model.note.folder, Notes.fileName(title)),
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
          model.keyboard,
          h,
        ),
      ],
    ),
  }
}
