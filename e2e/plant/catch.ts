import { type Bug, kinds } from './bugs.ts'
import { type Unit, nameOf, unitKinds } from './unit.ts'

export type Ran = Pick<Unit, 'kind' | 'path' | 'ms'>

export type Verdict =
  | Readonly<{ status: 'stale'; occurrences: number }>
  | Readonly<{ status: 'build-failed'; error: string }>
  | Readonly<{ status: 'inert' }>
  | Readonly<{ status: 'boots-dead'; error: string }>
  | Readonly<{ status: 'run-failed'; error: string }>
  | Readonly<{ status: 'caught'; ms: number; failed: ReadonlyArray<Ran> }>
  | Readonly<{ status: 'missed'; ms: number }>

export type Planted = Pick<Bug, 'set' | 'id' | 'kind'> &
  Readonly<{ buildMs: number | null }> &
  Verdict

export type Catch = Readonly<{
  mode: 'quick' | 'matrix'
  ready: boolean
  playwright: ReadonlyArray<string>
  baseline: Readonly<{ ms: number; units: ReadonlyArray<Ran> }>
  bugs: ReadonlyArray<Planted>
  heldOut: ReadonlyArray<Count>
}>

export type Count = Readonly<{
  kind: Bug['kind']
  status: Planted['status']
  bugs: number
}>

export const leavesAHole = (bug: Planted): boolean =>
  bug.status === 'stale' ||
  bug.status === 'build-failed' ||
  bug.status === 'inert' ||
  bug.status === 'run-failed'

const seconds = (ms: number | null): string =>
  ms === null ? '' : (ms / 1000).toFixed(1)

const columns = (
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): string => {
  const widths = rows.reduce<ReadonlyArray<number>>(
    (widest, row) =>
      row.map((cell, index) =>
        Math.max(widest[index] ?? 0, String(cell).length),
      ),
    [],
  )
  return rows
    .map(row =>
      row
        .map((cell, index) =>
          index === row.length - 1
            ? String(cell)
            : typeof cell === 'number'
              ? String(cell).padStart(widths[index] ?? 0)
              : cell.padEnd(widths[index] ?? 0),
        )
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

const oneLine = (text: string): string => {
  const line = text.replaceAll(/\s+/g, ' ').trim()
  return line.length > 160 ? `${line.slice(0, 160)}…` : line
}

const detail = (bug: Planted): string => {
  switch (bug.status) {
    case 'stale':
      return `find occurs ${bug.occurrences} times in its file, not once`
    case 'inert':
      return 'the build is the same as the build without the bug'
    case 'build-failed':
    case 'boots-dead':
    case 'run-failed':
      return oneLine(bug.error)
    case 'missed':
      return ''
    case 'caught': {
      const [first] = bug.failed
      const more = bug.failed.length - 1
      return first === undefined
        ? ''
        : `${first.kind}: ${nameOf(first)}${more > 0 ? ` (+${more} more)` : ''}`
    }
  }
}

const bugRows = (bugs: ReadonlyArray<Planted>): string =>
  columns([
    ['verdict', 'bug', 'set', 'kind', 'build s', 'run s', 'caught by'],
    ...bugs.map(bug => [
      bug.status,
      bug.id,
      bug.set,
      bug.kind,
      seconds(bug.buildMs),
      'ms' in bug ? seconds(bug.ms) : '',
      detail(bug),
    ]),
  ])

const statuses = [
  'caught',
  'missed',
  'boots-dead',
  'stale',
  'build-failed',
  'inert',
  'run-failed',
] as const satisfies ReadonlyArray<Planted['status']>

export const countsOf = (bugs: ReadonlyArray<Planted>): ReadonlyArray<Count> =>
  kinds.flatMap(kind =>
    statuses.flatMap(status => {
      const of = bugs.filter(
        bug => bug.kind === kind && bug.status === status,
      ).length
      return of === 0 ? [] : [{ kind, status, bugs: of }]
    }),
  )

const sum = (
  counts: ReadonlyArray<Count>,
  keep: (count: Count) => boolean,
): number => counts.filter(keep).reduce((total, count) => total + count.bugs, 0)

type Section = Readonly<{ name: string; counts: ReadonlyArray<Count> }>

const totalRows = ({ name, counts }: Section): string =>
  [
    `${name}: ${statuses
      .map(
        status => `${sum(counts, count => count.status === status)} ${status}`,
      )
      .join(', ')}`,
    columns([
      ['', 'caught of caught and missed', 'boots-dead, not in it'],
      ...[
        ...kinds.map(kind => ({
          group: kind,
          of: counts.filter(count => count.kind === kind),
        })),
        { group: 'every kind', of: counts },
      ]
        .filter(({ of }) => of.length > 0)
        .map(({ group, of }) => {
          const caught = sum(of, count => count.status === 'caught')
          const judged = caught + sum(of, count => count.status === 'missed')
          return [
            group,
            judged === 0
              ? '-'
              : `${caught}/${judged} ${Math.round((100 * caught) / judged)}%`,
            sum(of, count => count.status === 'boots-dead'),
          ]
        }),
    ]),
  ].join('\n')

const totals = (caught: Catch): string => {
  const sections: ReadonlyArray<Section> = [
    ...[...new Set(caught.bugs.map(bug => bug.set))].map(set => ({
      name: set,
      counts: countsOf(caught.bugs.filter(bug => bug.set === set)),
    })),
    ...(caught.heldOut.length > 0
      ? [{ name: 'held-out, counts only', counts: caught.heldOut }]
      : []),
  ]
  return [
    ...sections.map(totalRows),
    ...(sections.length > 1
      ? [
          totalRows({
            name: 'every set',
            counts: sections.flatMap(({ counts }) => counts),
          }),
        ]
      : []),
  ].join('\n\n')
}

type Tally = Readonly<{ unit: Ran; catches: number; onlyCatcher: number }>

const talliesOf = (caught: Catch): ReadonlyArray<Tally> => {
  const tallies = new Map<string, Tally>(
    caught.baseline.units.map(unit => [
      nameOf(unit),
      { unit, catches: 0, onlyCatcher: 0 },
    ]),
  )
  for (const bug of caught.bugs) {
    if (bug.status !== 'caught') {
      continue
    }
    for (const unit of bug.failed) {
      const held = tallies.get(nameOf(unit)) ?? {
        unit,
        catches: 0,
        onlyCatcher: 0,
      }
      tallies.set(nameOf(unit), {
        unit: held.unit,
        catches: held.catches + 1,
        onlyCatcher: held.onlyCatcher + (bug.failed.length === 1 ? 1 : 0),
      })
    }
  }
  return [...tallies.values()]
}

const unitRows = (caught: Catch): string => {
  const tallies = talliesOf(caught)
  const alone = tallies
    .filter(({ onlyCatcher }) => onlyCatcher > 0)
    .sort((a, b) => b.onlyCatcher - a.onlyCatcher)
  return [
    alone.length === 0
      ? 'No unit is the only catcher of a bug.'
      : columns([
          ['only catcher of', 'catches', 'baseline s', 'unit'],
          ...alone.map(({ unit, catches, onlyCatcher }) => [
            onlyCatcher,
            catches,
            seconds(unit.ms),
            `${unit.kind}: ${nameOf(unit)}`,
          ]),
        ]),
    '',
    columns([
      [
        'units',
        'all',
        'catch a bug',
        'only catcher of a bug',
        'bugs no other kind catches',
        'catch none',
        'baseline s of those',
      ],
      ...unitKinds.map(kind => {
        const of = tallies.filter(({ unit }) => unit.kind === kind)
        const idle = of.filter(({ catches }) => catches === 0)
        return [
          kind,
          of.length,
          of.length - idle.length,
          of.filter(({ onlyCatcher }) => onlyCatcher > 0).length,
          caught.bugs.filter(
            bug =>
              bug.status === 'caught' &&
              bug.failed.every(unit => unit.kind === kind),
          ).length,
          idle.length,
          seconds(idle.reduce((sum, { unit }) => sum + unit.ms, 0)),
        ]
      }),
    ]),
  ].join('\n')
}

export const table = (caught: Catch): string =>
  [
    bugRows(caught.bugs),
    '',
    ...(caught.mode === 'matrix'
      ? [
          unitRows(caught),
          ...(caught.heldOut.length > 0
            ? ['The units count no held-out bug.']
            : []),
          '',
        ]
      : [
          'A quick run stops a bug at its first failing test, so it does not say which units catch a bug alone. Run --matrix for that.',
          '',
        ]),
    totals(caught),
  ].join('\n')
