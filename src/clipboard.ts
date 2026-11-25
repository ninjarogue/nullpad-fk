import { Effect, Option, Predicate } from 'effect'

const readTimeout = '3 seconds'

type Permissions = {
  query(descriptor: { readonly name: string }): Promise<PermissionStatus>
}

const isAskingPermission: Effect.Effect<boolean> = Effect.tryPromise(() => {
  const permissions: Permissions = navigator.permissions
  return permissions.query({ name: 'clipboard-read' })
}).pipe(
  Effect.map(({ state }) => state === 'prompt'),
  Effect.orElseSucceed(() => false),
)

const read: Effect.Effect<Option.Option<string>> = Effect.tryPromise(
  (): Promise<unknown> => navigator.clipboard.readText(),
).pipe(
  Effect.map(Option.liftPredicate(Predicate.isString)),
  Effect.orElseSucceed(() => Option.none<string>()),
)

export const readText: Effect.Effect<Option.Option<string>> =
  isAskingPermission.pipe(
    Effect.flatMap(isAsking =>
      isAsking
        ? read
        : read.pipe(
            Effect.timeoutOption(readTimeout),
            Effect.map(Option.flatten),
          ),
    ),
  )

export const writeText = (text: string): Effect.Effect<boolean> =>
  Effect.isSuccess(Effect.tryPromise(() => navigator.clipboard.writeText(text)))
