import {
  Array,
  Clock,
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Schema,
  type Stream,
} from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Dom } from 'foldkit'

import { BrowserKeyValueStore } from '@effect/platform-browser'

import { Note, NoteId } from './core/notes'

export const NoteChange = Schema.TaggedUnion({
  Saved: { note: Note },
  Removed: { id: NoteId },
})
export type NoteChange = typeof NoteChange.Type

export class StorageConflict extends Schema.TaggedError<
  StorageConflict,
  { readonly brand: unique symbol }
>()('StorageConflict', { id: NoteId }) {}

export class StorageUnavailable extends Schema.TaggedError<
  StorageUnavailable,
  { readonly brand: unique symbol }
>()('StorageUnavailable', { cause: Schema.Defect() }) {}

export const Draft = Schema.Struct({
  id: NoteId,
  folder: Schema.String,
  text: Schema.String,
})
export type Draft = typeof Draft.Type

export const Stashed = Schema.Struct({
  id: NoteId,
  folder: Schema.String,
  text: Schema.String,
  baseRevision: Schema.Int,
  maybeSentText: Schema.Option(Schema.String),
})
export type Stashed = typeof Stashed.Type

const storeName = 'notes'

const stashPrefix = 'nullpad-draft:'

const decodeNote = Schema.decodeUnknownOption(Note)
const decodeRecords = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))
const decodeRevision = Schema.decodeUnknownOption(
  Schema.Struct({ revision: Schema.Int }),
)
const decodeChange = Schema.decodeUnknownOption(NoteChange)

const unavailable = (cause: unknown) => new StorageUnavailable({ cause })

const openDatabase = Effect.callback<IDBDatabase, StorageUnavailable>(
  resume => {
    try {
      const request = indexedDB.open('nullpad', 1)
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore(storeName, { keyPath: 'id' })
      })
      request.addEventListener('success', () => {
        const opened = request.result
        opened.addEventListener('versionchange', () => opened.close())
        resume(Effect.succeed(opened))
      })
      request.addEventListener('error', () =>
        resume(Effect.fail(unavailable(request.error))),
      )
    } catch (error) {
      resume(Effect.fail(unavailable(error)))
    }
  },
)

const abortUnlessSettled = (
  transaction: IDBTransaction,
  outcome: { isSettled: boolean },
) =>
  Effect.sync(() => {
    if (!outcome.isSettled) {
      transaction.abort()
    }
  })

const settle = <A, E>(
  outcome: { isSettled: boolean },
  resume: (effect: Effect.Effect<A, E>) => void,
  effect: Effect.Effect<A, E>,
) => {
  outcome.isSettled = true
  resume(effect)
}

const makeNoteStore = Effect.gen(function* () {
  const database = yield* Effect.acquireRelease(
    Effect.exit(openDatabase),
    opened =>
      Exit.match(opened, {
        onSuccess: connection => Effect.sync(() => connection.close()),
        onFailure: () => Effect.void,
      }),
  )
  const channel = yield* Effect.acquireRelease(
    Effect.sync(() => new BroadcastChannel('nullpad-notes')),
    opened => Effect.sync(() => opened.close()),
  )

  const begin = (
    mode: IDBTransactionMode,
  ): Effect.Effect<IDBTransaction, StorageUnavailable> =>
    Effect.flatMap(database, connection =>
      Effect.try({
        try: () =>
          connection.transaction(storeName, mode, { durability: 'relaxed' }),
        catch: unavailable,
      }),
    )

  const broadcast = (change: NoteChange): Effect.Effect<void> =>
    Effect.sync(() => channel.postMessage(change))

  const list: Effect.Effect<
    ReadonlyArray<Note>,
    StorageUnavailable
  > = Effect.flatMap(begin('readonly'), transaction =>
    Effect.callback<ReadonlyArray<Note>, StorageUnavailable>(resume => {
      const outcome = { isSettled: false }
      const request = transaction.objectStore(storeName).getAll()
      request.addEventListener('success', () =>
        settle(
          outcome,
          resume,
          Effect.succeed(
            Option.match(decodeRecords(request.result), {
              onNone: () => [],
              onSome: found =>
                Array.getSomes(Array.map(found, record => decodeNote(record))),
            }),
          ),
        ),
      )
      request.addEventListener('error', () =>
        settle(outcome, resume, Effect.fail(unavailable(request.error))),
      )
      return abortUnlessSettled(transaction, outcome)
    }),
  )

  const whenRevision = (
    id: NoteId,
    expectedRevision: number,
    change: (store: IDBObjectStore) => void,
  ): Effect.Effect<void, StorageConflict | StorageUnavailable> =>
    Effect.flatMap(begin('readwrite'), transaction =>
      Effect.callback<void, StorageConflict | StorageUnavailable>(resume => {
        const store = transaction.objectStore(storeName)
        const outcome = { isSettled: false, isConflict: false }
        const current = store.get(id)
        current.addEventListener('success', () => {
          const stored = Option.match(decodeRevision(current.result), {
            onNone: () => 0,
            onSome: ({ revision }) => revision,
          })
          if (stored === expectedRevision) {
            try {
              change(store)
            } catch {
              transaction.abort()
            }
          } else {
            outcome.isConflict = true
            transaction.abort()
          }
        })
        transaction.addEventListener('complete', () =>
          settle(outcome, resume, Effect.void),
        )
        transaction.addEventListener('abort', () =>
          settle(
            outcome,
            resume,
            Effect.fail(
              outcome.isConflict
                ? new StorageConflict({ id })
                : unavailable(transaction.error),
            ),
          ),
        )
        return abortUnlessSettled(transaction, outcome)
      }),
    )

  const write = Effect.fnUntraced(function* (
    draft: Draft,
    expectedRevision: number,
  ) {
    const modified = yield* Clock.currentTimeMillis
    const note: Note = {
      id: draft.id,
      folder: draft.folder,
      text: draft.text,
      revision: expectedRevision + 1,
      modified,
    }
    yield* whenRevision(note.id, expectedRevision, store => store.put(note))
    yield* broadcast(NoteChange.cases.Saved.make({ note }))
    return note
  })

  const remove = Effect.fnUntraced(function* (
    id: NoteId,
    expectedRevision: number,
  ) {
    yield* whenRevision(id, expectedRevision, store => store.delete(id))
    yield* broadcast(NoteChange.cases.Removed.make({ id }))
  })

  const changes: Stream.Stream<NoteChange> = Dom.streamFromEventFilterMap({
    target: channel,
    type: 'message',
    filterMapEvent: event => decodeChange(event.data),
  })

  return NoteStore.of({ list, write, remove, changes })
})

export class NoteStore extends Context.Service<
  NoteStore,
  {
    readonly list: Effect.Effect<ReadonlyArray<Note>, StorageUnavailable>
    readonly write: (
      draft: Draft,
      expectedRevision: number,
    ) => Effect.Effect<Note, StorageConflict | StorageUnavailable>
    readonly remove: (
      id: NoteId,
      expectedRevision: number,
    ) => Effect.Effect<void, StorageConflict | StorageUnavailable>
    readonly changes: Stream.Stream<NoteChange>
  }
>()('nullpad/NoteStore') {
  static readonly layer = Layer.effect(this, makeNoteStore)
}

const draftsOf = (store: KeyValueStore.KeyValueStore, prefix: string) =>
  KeyValueStore.toSchemaStore(KeyValueStore.prefix(store, prefix), Stashed)

const ownPrefix = (owner: string) => `${stashPrefix}${owner}:`

export const stash = Effect.fnUntraced(
  function* (owner: string, drafts: ReadonlyArray<Stashed>) {
    const own = draftsOf(yield* KeyValueStore.KeyValueStore, ownPrefix(owner))
    yield* own.clear
    yield* Effect.forEach(drafts, draft => own.set(draft.id, draft), {
      discard: true,
    })
  },
  effect => Effect.ignore(effect),
  Effect.provide(BrowserKeyValueStore.layerLocalStorage),
)

const clearStash = Effect.fnUntraced(
  function* (owner: string) {
    yield* draftsOf(yield* KeyValueStore.KeyValueStore, ownPrefix(owner)).clear
  },
  effect => Effect.ignore(effect),
  Effect.provide(BrowserKeyValueStore.layerLocalStorage),
)

export const takeStashed: Effect.Effect<ReadonlyArray<Stashed>> = Effect.gen(
  function* () {
    const all = draftsOf(yield* KeyValueStore.KeyValueStore, stashPrefix)
    const keys = yield* all.keys
    const found = yield* Effect.forEach(keys, key =>
      all.get(key).pipe(Effect.orElseSucceed(() => Option.none())),
    )
    yield* all.clear
    return Array.getSomes(found)
  },
).pipe(
  Effect.orElseSucceed(() => []),
  Effect.provide(BrowserKeyValueStore.layerLocalStorage),
)

const leaving: { owner: string; read: () => ReadonlyArray<Stashed> } = {
  owner: '',
  read: () => [],
}

export const stashOnLeave = (
  owner: string,
  read: () => ReadonlyArray<Stashed>,
): Effect.Effect<void> =>
  Effect.sync(() => {
    leaving.owner = owner
    leaving.read = read
  })

export const stashLeaving = (): void =>
  Effect.runSync(stash(leaving.owner, leaving.read()))

export const clearLeavingStash = (): void =>
  Effect.runSync(clearStash(leaving.owner))

export const persist: Effect.Effect<boolean, unknown> = Effect.tryPromise(() =>
  navigator.storage.persist(),
)
