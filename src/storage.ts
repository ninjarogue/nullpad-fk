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

export type Draft = Pick<Note, 'id' | 'folder' | 'text'>

const storeName = 'notes'

const channel = new BroadcastChannel('nullpad-notes')

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

export const write = (
  draft: Draft,
  expectedRevision: number,
): Effect.Effect<Note, StorageConflict | StorageUnavailable> =>
  Effect.gen(function* () {
    const modified = yield* Clock.currentTimeMillis
    const transaction = yield* begin('readwrite')
    const note: Note = {
      id: draft.id,
      folder: draft.folder,
      text: draft.text,
      revision: expectedRevision + 1,
      modified,
    }
    yield* Effect.callback<void, StorageConflict | StorageUnavailable>(
      resume => {
        const store = transaction.objectStore(storeName)
        const outcome = { isConflict: false }
        const current = store.get(note.id)
        current.addEventListener('success', () => {
          const stored = Option.match(decodeRevision(current.result), {
            onNone: () => 0,
            onSome: ({ revision }) => revision,
          })
          if (stored === expectedRevision) {
            store.put(note)
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
                ? new StorageConflict({ id: note.id })
                : unavailable(transaction.error),
            ),
          ),
        )
      },
    )
    yield* broadcast(NoteChange.cases.Saved.make({ note }))
    return note
  })

export const remove = (id: NoteId): Effect.Effect<void, StorageUnavailable> =>
  Effect.flatMap(begin('readwrite'), transaction =>
    Effect.callback<void, StorageUnavailable>(resume => {
      transaction.objectStore(storeName).delete(id)
      transaction.addEventListener('complete', () => resume(Effect.void))
      transaction.addEventListener('abort', () =>
        resume(Effect.fail(unavailable(transaction.error))),
      )
    }),
  ).pipe(Effect.andThen(broadcast(NoteChange.cases.Removed.make({ id }))))

export const watch: Stream.Stream<NoteChange> = Dom.streamFromEventFilterMap({
  target: channel,
  type: 'message',
  filterMapEvent: event => decodeChange(event.data),
})

export const persist: Effect.Effect<boolean, unknown> = Effect.tryPromise(() =>
  navigator.storage.persist(),
)
