import { Array, Clock, Data, Effect, Option, Schema, type Stream } from 'effect'
import { Dom } from 'foldkit'

import { Note, NoteId } from './core/notes'

export const NoteChange = Schema.TaggedUnion({
  Saved: { note: Note },
  Removed: { id: NoteId },
})
export type NoteChange = typeof NoteChange.Type

export class StorageConflict extends Data.TaggedError('StorageConflict')<{
  readonly id: NoteId
}> {}

export class StorageUnavailable extends Data.TaggedError('StorageUnavailable')<{
  readonly cause: unknown
}> {}

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
  sentText: Schema.NullOr(Schema.String),
})
export type Stashed = typeof Stashed.Type

const storeName = 'notes'

const channel = new BroadcastChannel('nullpad-notes')

const decodeNote = Schema.decodeUnknownOption(Note)
const decodeRecords = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))
const decodeRevision = Schema.decodeUnknownOption(
  Schema.Struct({ revision: Schema.Int }),
)
const decodeChange = Schema.decodeUnknownOption(NoteChange)
const StashedJson = Schema.fromJsonString(Stashed)
const decodeStashed = Schema.decodeUnknownOption(StashedJson)
const encodeStashed = Schema.encodeOption(StashedJson)

const stashPrefix = 'nullpad-draft:'

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

const database = Effect.runSync(Effect.cached(openDatabase))

const begin = (
  mode: IDBTransactionMode,
): Effect.Effect<IDBTransaction, StorageUnavailable> =>
  Effect.flatMap(database, opened =>
    Effect.try({
      try: () => opened.transaction(storeName, mode, { durability: 'relaxed' }),
      catch: unavailable,
    }),
  )

const readRequest = <A>(
  make: (store: IDBObjectStore) => IDBRequest<A>,
): Effect.Effect<A, StorageUnavailable> =>
  Effect.flatMap(begin('readonly'), transaction =>
    Effect.callback<A, StorageUnavailable>(resume => {
      const request = make(transaction.objectStore(storeName))
      request.addEventListener('success', () =>
        resume(Effect.succeed(request.result)),
      )
      request.addEventListener('error', () =>
        resume(Effect.fail(unavailable(request.error))),
      )
    }),
  )

const broadcast = (change: NoteChange): Effect.Effect<void> =>
  Effect.sync(() => channel.postMessage(change))

export const list: Effect.Effect<
  ReadonlyArray<Note>,
  StorageUnavailable
> = Effect.map(
  readRequest(store => store.getAll()),
  records =>
    Option.match(decodeRecords(records), {
      onNone: () => [],
      onSome: found =>
        Array.getSomes(Array.map(found, record => decodeNote(record))),
    }),
)

export const read = (
  id: NoteId,
): Effect.Effect<Option.Option<Note>, StorageUnavailable> =>
  Effect.map(
    readRequest(store => store.get(id)),
    decodeNote,
  )

const whenRevision = (
  id: NoteId,
  expectedRevision: number,
  change: (store: IDBObjectStore) => void,
): Effect.Effect<void, StorageConflict | StorageUnavailable> =>
  Effect.flatMap(begin('readwrite'), transaction =>
    Effect.callback<void, StorageConflict | StorageUnavailable>(resume => {
      const store = transaction.objectStore(storeName)
      const outcome = { isConflict: false }
      const current = store.get(id)
      current.addEventListener('success', () => {
        const stored = Option.match(decodeRevision(current.result), {
          onNone: () => 0,
          onSome: ({ revision }) => revision,
        })
        if (stored === expectedRevision) {
          change(store)
        } else {
          outcome.isConflict = true
          transaction.abort()
        }
      })
      transaction.addEventListener('complete', () => resume(Effect.void))
      transaction.addEventListener('abort', () =>
        resume(
          Effect.fail(
            outcome.isConflict
              ? new StorageConflict({ id })
              : unavailable(transaction.error),
          ),
        ),
      )
    }),
  )

export const write = (
  draft: Draft,
  expectedRevision: number,
): Effect.Effect<Note, StorageConflict | StorageUnavailable> =>
  Effect.gen(function* () {
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

export const remove = (
  id: NoteId,
  expectedRevision: number,
): Effect.Effect<void, StorageConflict | StorageUnavailable> =>
  whenRevision(id, expectedRevision, store => store.delete(id)).pipe(
    Effect.andThen(broadcast(NoteChange.cases.Removed.make({ id }))),
  )

const stashKeys = (owner: string): ReadonlyArray<string> =>
  Array.filter(
    Array.getSomes(
      Array.makeBy(localStorage.length, index =>
        Option.fromNullishOr(localStorage.key(index)),
      ),
    ),
    key => key.startsWith(`${stashPrefix}${owner}`),
  )

const removeKeys = (keys: ReadonlyArray<string>) =>
  Array.forEach(keys, key => localStorage.removeItem(key))

export const stash = (
  owner: string,
  drafts: ReadonlyArray<Stashed>,
): Effect.Effect<void> =>
  Effect.try({
    try: () => {
      removeKeys(stashKeys(`${owner}:`))
      Array.forEach(drafts, draft =>
        Option.match(encodeStashed(draft), {
          onNone: () => undefined,
          onSome: json =>
            localStorage.setItem(`${stashPrefix}${owner}:${draft.id}`, json),
        }),
      )
    },
    catch: unavailable,
  }).pipe(Effect.ignore)

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

export const clearStash = (owner: string): Effect.Effect<void> =>
  Effect.try({
    try: () => removeKeys(stashKeys(`${owner}:`)),
    catch: unavailable,
  }).pipe(Effect.ignore)

export const takeStashed: Effect.Effect<ReadonlyArray<Stashed>> = Effect.try({
  try: () => {
    const keys = stashKeys('')
    const found = Array.getSomes(
      Array.map(keys, key => decodeStashed(localStorage.getItem(key))),
    )
    removeKeys(keys)
    return found
  },
  catch: unavailable,
}).pipe(Effect.orElseSucceed(() => []))

export const watch: Stream.Stream<NoteChange> = Dom.streamFromEventFilterMap({
  target: channel,
  type: 'message',
  filterMapEvent: event => decodeChange(event.data),
})

export const persist: Effect.Effect<boolean, unknown> = Effect.tryPromise(() =>
  navigator.storage.persist(),
)
