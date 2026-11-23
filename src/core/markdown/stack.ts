import { Array, Iterable, Option } from 'effect'

export type Pushed<A> = Readonly<{
  _tag: 'Pushed'
  top: A
  under: Stack<A>
  size: number
}>

export type Stack<A> = Readonly<{ _tag: 'Empty' }> | Pushed<A>

export const empty: Stack<never> = { _tag: 'Empty' }

export const sizeOf = <A>(stack: Stack<A>): number =>
  stack._tag === 'Empty' ? 0 : stack.size

export const push = <A>(stack: Stack<A>, top: A): Pushed<A> => ({
  _tag: 'Pushed',
  top,
  under: stack,
  size: sizeOf(stack) + 1,
})

export const pushAll = <A>(stack: Stack<A>, tops: ReadonlyArray<A>): Stack<A> =>
  Array.reduce(tops, stack, push)

export const pushedFromTop = <A>(stack: Stack<A>): Iterable<Pushed<A>> =>
  Iterable.unfold(stack, (at): Option.Option<readonly [Pushed<A>, Stack<A>]> =>
    at._tag === 'Empty' ? Option.none() : Option.some([at, at.under]),
  )

export const toArray = <A>(stack: Stack<A>): ReadonlyArray<A> =>
  Array.reverse(
    Array.fromIterable(Iterable.map(pushedFromTop(stack), at => at.top)),
  )

export const since = <A>(
  stack: Stack<A>,
  size: number,
): Readonly<{ pushed: ReadonlyArray<A>; under: Stack<A> }> => {
  const above = Array.fromIterable(
    Iterable.takeWhile(pushedFromTop(stack), at => at.size > size),
  )
  return {
    pushed: Array.reverse(Array.map(above, at => at.top)),
    under: Option.match(Array.last(above), {
      onNone: () => stack,
      onSome: lowest => lowest.under,
    }),
  }
}

export const whileSome = <S>(
  start: S,
  next: (state: S) => Option.Option<S>,
): S =>
  Iterable.reduce(
    Iterable.unfold(start, state =>
      Option.map(next(state), (after): readonly [S, S] => [after, after]),
    ),
    start,
    (_, after) => after,
  )
