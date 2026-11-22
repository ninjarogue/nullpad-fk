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

const OpenNote = Schema.Struct({
  id: Notes.NoteId,
  folder: Schema.String,
  revision: Schema.Int,
  savedEdits: Schema.Int,
})
type OpenNote = typeof OpenNote.Type

export const Model = Schema.Struct({
  editor: Editor.Editor,
  keyboard: Keyboard,
  notes: Schema.Array(Notes.Note),
  note: OpenNote,
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
    },
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
    id: Notes.NoteId,
    folder: Schema.String,
    text: Schema.String,
    expectedRevision: Schema.Int,
  },
  messages: [Message.SucceededSaveNote, Message.FailedSaveNote],
  execute: ({ expectedRevision, ...draft }) =>
    Storage.write(draft, expectedRevision).pipe(
      Effect.map(note => Message.SucceededSaveNote({ note })),
      Effect.catch(error =>
        Effect.succeed(
          Message.FailedSaveNote({
            id: draft.id,
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

const saveNow = (model: Model): UpdateReturn => {
  if (Editor.isBlank(model.editor)) {
    return { model }
  }
  const { note } = model
  return {
    model: modifyFields(model, {
      note: open =>
        modifyFields(open, {
          revision: revision => revision + 1,
          savedEdits: () => model.edits,
        }),
    }),
    commands: [
      SaveNote({
        id: note.id,
        folder: note.folder,
        text: Editor.text(model.editor),
        expectedRevision: note.revision,
      }),
    ],
  }
}

const saveIfDirty = (model: Model): UpdateReturn =>
  isDirty(model) ? saveNow(model) : { model }

const leave = (model: Model): UpdateReturn => {
  const { id, revision } = model.note
  return Editor.isBlank(model.editor) && revision > 0
    ? {
        model: modifyFields(model, {
          notes: notes => Notes.without(notes, id),
          note: open => modifyFields(open, { revision: () => 0 }),
        }),
        commands: [RemoveNote({ id })],
      }
    : saveIfDirty(model)
}

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
        note: open => modifyFields(open, { folder: () => folder }),
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
            id,
            folder,
            text: note.text,
            expectedRevision: note.revision,
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

const receiveChange = (
  model: Model,
  change: Storage.NoteChange,
): UpdateReturn =>
  Storage.NoteChange.match(change, {
    Saved: ({ note }) => {
      const listed = modifyFields(model, {
        notes: notes => Notes.upsert(notes, note),
      })
      if (note.id !== model.note.id || note.revision <= model.note.revision) {
        return { model: listed }
      }
      return isDirty(model)
        ? conflictCopy(listed)
        : { model: show(listed, note, note.text, 'Start') }
    },
    Removed: ({ id }) => {
      const listed = modifyFields(model, {
        notes: notes => Notes.without(notes, id),
      })
      if (id !== model.note.id) {
        return { model: listed }
      }
      return {
        model: isDirty(model)
          ? modifyFields(listed, {
              note: open => modifyFields(open, { revision: () => 0 }),
            })
          : show(
              listed,
              { id, folder: model.note.folder, revision: 0 },
              '',
              'Start',
            ),
      }
    },
  })

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
      })
      return model.persistence === 'Unrequested'
        ? {
            model: modifyFields(listed, { persistence: () => 'Requested' }),
            commands: [RequestPersistence()],
          }
        : { model: listed }
    },
    FailedSaveNote: ({ id, reason }) => {
      if (id !== model.note.id) {
        return { model }
      }
      return reason === 'Conflict'
        ? conflictCopy(model)
        : {
            model: modifyFields(model, {
              note: open => modifyFields(open, { savedEdits: () => -1 }),
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
