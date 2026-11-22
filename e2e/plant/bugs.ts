import { isAbsolute, normalize, sep } from 'node:path'

export const kinds = ['timing', 'measure', 'input', 'paint', 'core'] as const

export type Bug = Readonly<{
  set: string
  id: string
  kind: (typeof kinds)[number]
  file: string
  find: string
  replace: string
  see: string
  heldOut: boolean
}>

const fields: ReadonlyArray<string> = [
  'id',
  'kind',
  'file',
  'find',
  'replace',
  'see',
  'heldOut',
]

const staysInside = (file: string): boolean => {
  const path = normalize(file)
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`)
}

const parseBug = (
  set: string,
  value: unknown,
): Readonly<{ bug: Bug; faults: ReadonlyArray<string> }> => {
  const faults: Array<string> = []
  const row: Record<string, unknown> =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ...value }
      : {}
  const text = (field: string, canBeEmpty = false): string => {
    const held = row[field]
    if (typeof held === 'string' && (canBeEmpty || held !== '')) {
      return held
    }
    faults.push(
      `${field} takes a string${canBeEmpty ? '' : ' that is not empty'}`,
    )
    return ''
  }
  const bug = {
    set,
    id: text('id'),
    kind: kinds.find(kind => kind === row['kind']) ?? 'core',
    file: text('file'),
    find: text('find'),
    replace: text('replace', true),
    see: text('see'),
    heldOut: row['heldOut'] === true,
  }
  return {
    bug,
    faults: [
      ...faults,
      ...Object.keys(row)
        .filter(key => !fields.includes(key))
        .map(key => `has an unknown field ${key}`),
      ...(bug.id === '' || /^[\w-]+$/u.test(bug.id)
        ? []
        : ['id takes letters, digits, - and _']),
      ...(kinds.some(kind => kind === row['kind'])
        ? []
        : [`kind takes one of ${kinds.join(', ')}`]),
      ...(staysInside(bug.file) ? [] : ['file takes a path inside the repo']),
      ...(bug.find !== '' && bug.find === bug.replace
        ? ['replace is the same as find']
        : []),
      ...(typeof row['heldOut'] === 'boolean'
        ? []
        : ['heldOut takes true or false']),
    ],
  }
}

export const parseBugs = (set: string, json: string): ReadonlyArray<Bug> => {
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${set} is not a JSON list of at least one bug`)
  }
  const rows = parsed.map(row => parseBug(set, row))
  const faults = rows.flatMap(({ bug, faults }, index) =>
    [
      ...faults,
      ...(bug.id !== '' &&
      rows.findIndex(other => other.bug.id === bug.id) < index
        ? ['an earlier bug has this id']
        : []),
    ].map(
      fault =>
        `${set} bug ${index + 1}${bug.id === '' ? '' : ` (${bug.id})`}: ${fault}`,
    ),
  )
  if (faults.length > 0) {
    throw new Error(faults.join('\n'))
  }
  return rows.map(({ bug }) => bug)
}
