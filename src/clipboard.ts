import { Effect, Option } from 'effect'

const readTimeout = '3 seconds'

export const readText: Effect.Effect<Option.Option<string>> = Effect.tryPromise(
  () => navigator.clipboard.readText(),
).pipe(
  Effect.timeoutOption(readTimeout),
  Effect.orElseSucceed(() => Option.none<string>()),
)

export const writeText = (text: string): Effect.Effect<boolean> =>
  Effect.isSuccess(Effect.tryPromise(() => navigator.clipboard.writeText(text)))
