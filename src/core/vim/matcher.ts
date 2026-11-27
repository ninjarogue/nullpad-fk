import { Array, Match, Option, Result } from 'effect'

import { classStarts, classValues } from './classes'

export type Assertion = 'LineStart' | 'LineEnd' | 'WordStart' | 'WordEnd'

export type Node =
  | Readonly<{ _tag: 'Letter'; char: string }>
  | Readonly<{ _tag: 'Any' }>
  | Readonly<{
      _tag: 'Class'
      ranges: ReadonlyArray<readonly [number, number]>
      negated: boolean
      folds: boolean
    }>
  | Readonly<{ _tag: 'Concat'; nodes: ReadonlyArray<Node> }>
  | Readonly<{ _tag: 'Alternate'; branches: ReadonlyArray<Node> }>
  | Readonly<{
      _tag: 'Repeat'
      node: Node
      min: number
      max: number
      lazy: boolean
    }>
  | Readonly<{ _tag: 'Group'; node: Node }>
  | Readonly<{ _tag: 'Assert'; kind: Assertion }>

export type Span = Readonly<{ start: number; end: number }>

export type Matcher = Readonly<{
  find: (text: string, from: number) => Option.Option<Span>
}>

export const largestProgram = 5000

export const tooLarge = 'not supported in a search: a pattern this large'

export const blankClass = 0
export const punctuationClass = 1
export const wordClass = 2

export const isWordClass = (kind: number): boolean => kind >= wordClass

const asciiClasses = Uint8Array.from({ length: 128 }, (_, code) =>
  code === 32 || code === 9
    ? blankClass
    : (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        code === 95
      ? wordClass
      : punctuationClass,
)

const firstBefore = (code: number): number => {
  let low = 0
  let high = classStarts.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if ((classStarts[middle] ?? 0) <= code) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return low
}

export const classOfCodePoint = (code: number): number =>
  code < 0
    ? blankClass
    : code < 128
      ? (asciiClasses[code] ?? punctuationClass)
      : (classValues[firstBefore(code)] ?? wordClass)

type CaseMap = Readonly<{
  first: number
  last: number
  shift: number
  method: 'toLowerCase' | 'toUpperCase'
}>

const caseMapped =
  ({ first, last, shift, method }: CaseMap) =>
  (code: number): number => {
    if (code < 128) {
      return code >= first && code <= last ? code + shift : code
    }
    const mapped = String.fromCodePoint(code)[method]()
    const head = mapped.codePointAt(0) ?? code
    return mapped.length === (head > 0xffff ? 2 : 1) ? head : code
  }

const lowerOf = caseMapped({
  first: 65,
  last: 90,
  shift: 32,
  method: 'toLowerCase',
})

const upperOf = caseMapped({
  first: 97,
  last: 122,
  shift: -32,
  method: 'toUpperCase',
})

const sizeOf = (node: Node): number =>
  Match.value(node).pipe(
    Match.tagsExhaustive({
      Letter: () => 1,
      Any: () => 1,
      Class: () => 1,
      Assert: () => 1,
      Concat: ({ nodes }) =>
        nodes.reduce((total, child) => total + sizeOf(child), 0),
      Alternate: ({ branches }) =>
        branches.reduce((total, child) => total + sizeOf(child), 0) +
        2 * Math.max(0, branches.length - 1),
      Group: group => sizeOf(group.node),
      Repeat: repeat => {
        const body = sizeOf(repeat.node)
        return repeat.max === Infinity
          ? repeat.min * body + body + 2
          : repeat.min * body + (repeat.max - repeat.min) * (body + 1)
      },
    }),
  )

const Op = {
  Char: 0,
  Any: 1,
  Class: 2,
  Split: 3,
  Jump: 4,
  Assert: 5,
  Match: 6,
  Back: 7,
} as const

const assertionCodes: Readonly<Record<Assertion, number>> = {
  LineStart: 0,
  LineEnd: 1,
  WordStart: 2,
  WordEnd: 3,
}

type ClassTable = Readonly<{
  ranges: Int32Array
  negated: boolean
  folds: boolean
  ascii: Uint8Array
}>

type Program = Readonly<{
  ops: Uint8Array
  first: Int32Array
  second: Int32Array
  classes: ReadonlyArray<ClassTable>
  ignoreCase: boolean
}>

const inRanges = (ranges: Int32Array, code: number): boolean => {
  for (let at = 0; at < ranges.length; at += 2) {
    if (code >= (ranges[at] ?? 0) && code <= (ranges[at + 1] ?? -1)) {
      return true
    }
  }
  return false
}

const classMatches = (
  ranges: Int32Array,
  negated: boolean,
  ignoreCase: boolean,
  code: number,
): boolean => {
  const hit =
    inRanges(ranges, code) ||
    (ignoreCase &&
      (inRanges(ranges, lowerOf(code)) || inRanges(ranges, upperOf(code))))
  return hit !== negated
}

const tableOf = (
  node: Extract<Node, { _tag: 'Class' }>,
  ignoreCase: boolean,
): ClassTable => {
  const folds = ignoreCase && node.folds
  const ranges = Int32Array.from(
    node.ranges.flatMap(([from, to]) => [from, to]),
  )
  return {
    ranges,
    negated: node.negated,
    folds,
    ascii: Uint8Array.from({ length: 128 }, (_, code) =>
      classMatches(ranges, node.negated, folds, code) ? 1 : 0,
    ),
  }
}

type Code = {
  ops: Array<number>
  first: Array<number>
  second: Array<number>
  classes: Array<ClassTable>
}

const emit = (code: Code, node: Node, ignoreCase: boolean): void => {
  const push = (op: number, first = 0, second = 0): number => {
    code.ops.push(op)
    code.first.push(first)
    code.second.push(second)
    return code.ops.length - 1
  }
  const copies = (count: number, body: () => void): void => {
    for (let done = 0; done < count; done += 1) {
      body()
    }
  }
  Match.value(node).pipe(
    Match.tagsExhaustive({
      Letter: ({ char }) => {
        const point = char.codePointAt(0) ?? 0
        push(Op.Char, ignoreCase ? lowerOf(point) : point)
      },
      Any: () => {
        push(Op.Any)
      },
      Class: classNode => {
        code.classes.push(tableOf(classNode, ignoreCase))
        push(Op.Class, code.classes.length - 1)
      },
      Assert: ({ kind }) => {
        push(Op.Assert, assertionCodes[kind])
      },
      Group: group => {
        emit(code, group.node, ignoreCase)
      },
      Concat: ({ nodes }) => {
        nodes.forEach(child => emit(code, child, ignoreCase))
      },
      Alternate: ({ branches }) => {
        const jumps: Array<number> = []
        branches.forEach((branch, index) => {
          if (index < branches.length - 1) {
            const split = push(Op.Split)
            code.first[split] = split + 1
            emit(code, branch, ignoreCase)
            jumps.push(push(Op.Jump))
            code.second[split] = code.ops.length
          } else {
            emit(code, branch, ignoreCase)
          }
        })
        jumps.forEach(jump => {
          code.first[jump] = code.ops.length
        })
      },
      Repeat: repeat => {
        copies(repeat.min, () => emit(code, repeat.node, ignoreCase))
        if (repeat.max === Infinity) {
          const split = push(Op.Split)
          emit(code, repeat.node, ignoreCase)
          const back = push(Op.Back, split)
          const after = code.ops.length
          code.second[back] = after
          code.first[split] = repeat.lazy ? after : split + 1
          code.second[split] = repeat.lazy ? split + 1 : after
          return
        }
        const splits: Array<number> = []
        copies(repeat.max - repeat.min, () => {
          splits.push(push(Op.Split))
          emit(code, repeat.node, ignoreCase)
        })
        const after = code.ops.length
        splits.forEach(split => {
          code.first[split] = repeat.lazy ? after : split + 1
          code.second[split] = repeat.lazy ? split + 1 : after
        })
      },
    }),
  )
}

type Firsts = Readonly<{
  nullable: boolean
  points: Option.Option<ReadonlySet<number>>
}>

const mostFirsts = 256

const unknownFirsts: Firsts = { nullable: false, points: Option.none() }

const joined = (left: Firsts, right: Firsts): Firsts => ({
  nullable: left.nullable || right.nullable,
  points: Option.flatMap(left.points, a =>
    Option.map(right.points, b => new Set([...a, ...b])),
  ),
})

const withCases = (points: ReadonlyArray<number>, ignoreCase: boolean) =>
  ignoreCase
    ? points.flatMap(point => [point, lowerOf(point), upperOf(point)])
    : points

const noPoints: Firsts = { nullable: false, points: Option.some(new Set()) }

const firstsOf = (node: Node, ignoreCase: boolean): Firsts =>
  Match.value(node).pipe(
    Match.tagsExhaustive({
      Letter: ({ char }) => ({
        nullable: false,
        points: Option.some(
          new Set(withCases([char.codePointAt(0) ?? 0], ignoreCase)),
        ),
      }),
      Any: () => unknownFirsts,
      Class: ({ ranges, negated, folds }): Firsts => {
        const size = ranges.reduce((sum, [from, to]) => sum + to - from + 1, 0)
        return negated || size > mostFirsts
          ? unknownFirsts
          : {
              nullable: false,
              points: Option.some(
                new Set(
                  withCases(
                    ranges.flatMap(([from, to]) =>
                      Array.makeBy(to - from + 1, offset => from + offset),
                    ),
                    ignoreCase && folds,
                  ),
                ),
              ),
            }
      },
      Assert: (): Firsts => ({
        nullable: true,
        points: Option.some(new Set<number>()),
      }),
      Group: group => firstsOf(group.node, ignoreCase),
      Repeat: (repeat): Firsts => {
        const inner = firstsOf(repeat.node, ignoreCase)
        return {
          nullable: inner.nullable || repeat.min === 0,
          points: inner.points,
        }
      },
      Alternate: ({ branches }) =>
        branches
          .map(branch => firstsOf(branch, ignoreCase))
          .reduce(joined, noPoints),
      Concat: ({ nodes }) => {
        const walk = (rest: ReadonlyArray<Node>, seen: Firsts): Firsts => {
          const [head, ...tail] = rest
          if (head === undefined) {
            return { ...seen, nullable: true }
          }
          const next = firstsOf(head, ignoreCase)
          const together: Firsts = {
            nullable: false,
            points: joined(seen, next).points,
          }
          return next.nullable ? walk(tail, together) : together
        }
        return walk(nodes, noPoints)
      },
    }),
  )

const literalRuns = (node: Node): ReadonlyArray<string> =>
  Match.value(node).pipe(
    Match.tagsExhaustive({
      Letter: ({ char }) => [char],
      Any: () => [],
      Class: () => [],
      Alternate: () => [],
      Assert: () => [],
      Group: group => literalRuns(group.node),
      Repeat: repeat => (repeat.min >= 1 ? literalRuns(repeat.node) : []),
      Concat: ({ nodes }) => {
        const runs = nodes.reduce<{
          done: ReadonlyArray<string>
          open: string
        }>(
          (state, child) =>
            child._tag === 'Letter'
              ? { ...state, open: state.open + child.char }
              : child._tag === 'Assert'
                ? state
                : {
                    done: [...state.done, state.open, ...literalRuns(child)],
                    open: '',
                  },
          { done: [], open: '' },
        )
        return [...runs.done, runs.open]
      },
    }),
  )

const requiredLiteral = (node: Node): string =>
  literalRuns(node).reduce(
    (best, run) => (run.length > best.length ? run : best),
    '',
  )

type Plain = Readonly<{
  before: ReadonlyArray<Assertion>
  text: string
  after: ReadonlyArray<Assertion>
}>

const plainLiteral = (node: Node): Option.Option<Plain> => {
  const nodes = node._tag === 'Concat' ? node.nodes : [node]
  const firstLetter = nodes.findIndex(child => child._tag === 'Letter')
  const afterLetters = nodes.findIndex(
    (child, index) => index >= firstLetter && child._tag !== 'Letter',
  )
  const lettersEnd = afterLetters < 0 ? nodes.length : afterLetters
  const edges = [...nodes.slice(0, firstLetter), ...nodes.slice(lettersEnd)]
  return firstLetter < 0 || !edges.every(child => child._tag === 'Assert')
    ? Option.none()
    : Option.some({
        before: nodes
          .slice(0, firstLetter)
          .flatMap(child => (child._tag === 'Assert' ? [child.kind] : [])),
        text: nodes
          .slice(firstLetter, lettersEnd)
          .map(child => (child._tag === 'Letter' ? child.char : ''))
          .join(''),
        after: nodes
          .slice(lettersEnd)
          .flatMap(child => (child._tag === 'Assert' ? [child.kind] : [])),
      })
}

const codePointBefore = (text: string, at: number): number => {
  if (at <= 0) {
    return -1
  }
  const low = text.charCodeAt(at - 1)
  const high = at >= 2 ? text.charCodeAt(at - 2) : 0
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff
    ? (text.codePointAt(at - 2) ?? low)
    : low
}

const classAt = (text: string, at: number): number =>
  classOfCodePoint(at < text.length ? (text.codePointAt(at) ?? -1) : -1)

const holds = (kind: number, text: string, at: number): boolean => {
  switch (kind) {
    case assertionCodes.LineStart:
      return at === 0
    case assertionCodes.LineEnd:
      return at === text.length
    case assertionCodes.WordStart: {
      const here = classAt(text, at)
      return (
        isWordClass(here) &&
        classOfCodePoint(codePointBefore(text, at)) !== here
      )
    }
    default: {
      const before = classOfCodePoint(codePointBefore(text, at))
      return isWordClass(before) && classAt(text, at) !== before
    }
  }
}

const assertionHolds = (
  assertion: Assertion,
  text: string,
  at: number,
): boolean => holds(assertionCodes[assertion], text, at)

const plainFinder = (plain: Plain): Matcher => ({
  find: (text, from) => {
    const anchored = plain.before.includes('LineStart')
    let index = from
    for (;;) {
      const at = text.indexOf(plain.text, index)
      if (at < 0) {
        return Option.none()
      }
      const end = at + plain.text.length
      if (
        plain.before.every(kind => assertionHolds(kind, text, at)) &&
        plain.after.every(kind => assertionHolds(kind, text, end))
      ) {
        return Option.some({ start: at, end })
      }
      if (anchored) {
        return Option.none()
      }
      index = at + 1
    }
  },
})

const virtualMachine = (
  program: Program,
  literal: string,
  firsts: Option.Option<ReadonlySet<number>>,
): Matcher => {
  const { ops, first, second, classes, ignoreCase } = program
  const size = ops.length
  const marks = new Int32Array(size)
  const stack = new Int32Array(2 * size + 2)
  const currentPc = new Int32Array(size)
  const currentStart = new Int32Array(size)
  const nextPc = new Int32Array(size)
  const nextStart = new Int32Array(size)
  const startsAt = Option.getOrNull(firsts)
  const ascii = Uint8Array.from({ length: 128 }, (_, code) =>
    startsAt === null || startsAt.has(code) ? 1 : 0,
  )
  let generation = 0
  const generationLimit = 1_000_000_000

  const canStart = (text: string, at: number): boolean => {
    if (startsAt === null) {
      return true
    }
    if (at >= text.length) {
      return false
    }
    const code = text.codePointAt(at) ?? 0
    return code < 128 ? ascii[code] === 1 : startsAt.has(code)
  }

  const add = (
    pcs: Int32Array,
    starts: Int32Array,
    length: number,
    entry: number,
    start: number,
    text: string,
    at: number,
  ): number => {
    let top = 0
    let count = length
    stack[top] = entry
    top += 1
    while (top > 0) {
      top -= 1
      const pc = stack[top] ?? 0
      const op = ops[pc]
      if (op === Op.Back) {
        stack[top] =
          marks[first[pc] ?? 0] === generation
            ? (second[pc] ?? 0)
            : (first[pc] ?? 0)
        top += 1
        continue
      }
      if (marks[pc] === generation) {
        continue
      }
      marks[pc] = generation
      if (op === Op.Jump) {
        stack[top] = first[pc] ?? 0
        top += 1
      } else if (op === Op.Split) {
        stack[top] = second[pc] ?? 0
        stack[top + 1] = first[pc] ?? 0
        top += 2
      } else if (op === Op.Assert) {
        if (holds(first[pc] ?? 0, text, at)) {
          stack[top] = pc + 1
          top += 1
        }
      } else {
        pcs[count] = pc
        starts[count] = start
        count += 1
      }
    }
    return count
  }

  const accepts = (pc: number, code: number): boolean => {
    const op = ops[pc]
    if (op === Op.Any) {
      return true
    }
    if (op === Op.Char) {
      const wanted = first[pc] ?? 0
      return code === wanted || (ignoreCase && lowerOf(code) === wanted)
    }
    const table = classes[first[pc] ?? 0]
    if (table === undefined) {
      return false
    }
    return code < 128
      ? table.ascii[code] === 1
      : classMatches(table.ranges, table.negated, table.folds, code)
  }

  return {
    find: (text, from) => {
      if (literal !== '' && text.indexOf(literal, from) < 0) {
        return Option.none()
      }
      if (generation > generationLimit) {
        marks.fill(0)
        generation = 0
      }
      const length = text.length
      let current = currentPc
      let currentFrom = currentStart
      let upcoming = nextPc
      let upcomingFrom = nextStart
      let count = 0
      let at = from
      let matched = false
      let matchStart = -1
      let matchEnd = -1

      const seed = (): boolean => {
        while (at <= length) {
          if (canStart(text, at)) {
            generation += 1
            count = add(current, currentFrom, 0, 0, at, text, at)
            if (count > 0) {
              return true
            }
          }
          at += (text.codePointAt(at) ?? 0) > 0xffff ? 2 : 1
        }
        return false
      }

      if (!seed()) {
        return Option.none()
      }
      for (;;) {
        const code = at < length ? (text.codePointAt(at) ?? -1) : -1
        const width = code > 0xffff ? 2 : 1
        generation += 1
        let upcomingCount = 0
        for (let index = 0; index < count; index += 1) {
          const pc = current[index] ?? 0
          const op = ops[pc]
          if (op === Op.Match) {
            matched = true
            matchStart = currentFrom[index] ?? 0
            matchEnd = at
            break
          }
          if (code >= 0 && accepts(pc, code)) {
            upcomingCount = add(
              upcoming,
              upcomingFrom,
              upcomingCount,
              pc + 1,
              currentFrom[index] ?? 0,
              text,
              at + width,
            )
          }
        }
        if (at >= length) {
          break
        }
        at += width
        if (!matched && canStart(text, at)) {
          upcomingCount = add(
            upcoming,
            upcomingFrom,
            upcomingCount,
            0,
            at,
            text,
            at,
          )
        }
        const swapPc = current
        const swapFrom = currentFrom
        current = upcoming
        currentFrom = upcomingFrom
        upcoming = swapPc
        upcomingFrom = swapFrom
        count = upcomingCount
        if (count === 0) {
          if (matched || !seed()) {
            break
          }
        }
      }
      return matched
        ? Option.some({ start: matchStart, end: matchEnd })
        : Option.none()
    },
  }
}

export const build = (
  node: Node,
  ignoreCase: boolean,
): Result.Result<Matcher, string> => {
  if (sizeOf(node) > largestProgram) {
    return Result.fail(tooLarge)
  }
  const plain = ignoreCase ? Option.none() : plainLiteral(node)
  if (Option.isSome(plain)) {
    return Result.succeed(plainFinder(plain.value))
  }
  const code: Code = { ops: [], first: [], second: [], classes: [] }
  emit(code, node, ignoreCase)
  code.ops.push(Op.Match)
  code.first.push(0)
  code.second.push(0)
  const program: Program = {
    ops: Uint8Array.from(code.ops),
    first: Int32Array.from(code.first),
    second: Int32Array.from(code.second),
    classes: code.classes,
    ignoreCase,
  }
  const startable = firstsOf(node, ignoreCase)
  return Result.succeed(
    virtualMachine(
      program,
      ignoreCase ? '' : requiredLiteral(node),
      startable.nullable ? Option.none() : startable.points,
    ),
  )
}
