import type { TestInfo } from '@playwright/test'

export const unitKinds = ['scenario', 'sweep row', 'named script'] as const

export type Unit = Readonly<{
  kind: (typeof unitKinds)[number]
  path: ReadonlyArray<string>
  ms: number
  failed: boolean
}>

const annotation = 'unit'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const nameOf = (unit: Pick<Unit, 'path'>): string =>
  unit.path.join(' › ')

export const recordUnit = (testInfo: TestInfo, unit: Unit): void => {
  testInfo.annotations.push({
    type: annotation,
    description: JSON.stringify(unit),
  })
}

const parseUnit = (description: string | undefined): Unit => {
  const fail = (): never => {
    throw new Error(`a unit annotation holds ${description}, not a unit`)
  }
  const parsed: unknown = JSON.parse(description ?? 'null')
  if (!isRecord(parsed)) {
    return fail()
  }
  const { kind, path, ms, failed } = parsed
  const known = unitKinds.find(candidate => candidate === kind)
  return known !== undefined &&
    Array.isArray(path) &&
    path.every(part => typeof part === 'string') &&
    typeof ms === 'number' &&
    typeof failed === 'boolean'
    ? { kind: known, path, ms, failed }
    : fail()
}

export const unitsOf = (
  annotations: ReadonlyArray<Readonly<{ type: string; description?: string }>>,
): ReadonlyArray<Unit> =>
  annotations
    .filter(({ type }) => type === annotation)
    .map(({ description }) => parseUnit(description))
