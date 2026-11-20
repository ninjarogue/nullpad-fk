import { describe, expect, test } from 'vitest'

import { cruise, lint, plantedTree, repo } from './tree'

const coreFile = 'src/core/plant.ts'

const importBreaks = [
  {
    name: 'core imports a shell module',
    source: "import { init } from '../main'\nexport const plant = init\n",
    rule: 'core-imports-shell',
  },
  {
    name: 'core imports foldkit',
    source: "import { Runtime } from 'foldkit'\nexport const plant = Runtime\n",
    rule: 'core-imports-foldkit',
  },
  {
    name: 'core imports only a type from a foldkit subpath',
    source:
      "import type { Html } from 'foldkit/html'\nexport type Plant = Html\n",
    rule: 'core-imports-foldkit',
  },
  {
    name: 'core re-exports from foldkit',
    source: "export { Runtime } from 'foldkit'\n",
    rule: 'core-imports-foldkit',
  },
  {
    name: 'core imports foldkit with a dynamic import',
    source: "export const plant = import('foldkit')\n",
    rule: 'core-imports-foldkit',
  },
  {
    name: 'core imports @foldkit/ui',
    source:
      "import { Button } from '@foldkit/ui'\nexport const plant = Button\n",
    rule: 'core-imports-foldkit',
  },
  {
    name: 'core imports @effect/platform-browser',
    source:
      "import { BrowserKeyValueStore } from '@effect/platform-browser'\nexport const plant = BrowserKeyValueStore\n",
    rule: 'core-imports-platform-browser',
  },
  {
    name: 'core imports a file that does not exist',
    source:
      "import { missing } from './missing'\nexport const plant = missing\n",
    rule: 'not-to-unresolvable',
  },
]

describe('the architecture check', () => {
  test('passes on the real tree and examines the core', () => {
    const result = cruise(repo)

    expect(result.violations).toEqual([])
    expect(result.status).toBe(0)
    expect(result.modules).toContain('src/core/appName.ts')
  })

  test('lets the core import effect and other core modules', () => {
    const tree = plantedTree({
      [coreFile]:
        "import { Option } from 'effect'\nimport { appName } from './appName'\nexport const plant = Option.some(appName)\n",
    })

    const result = cruise(tree)

    expect(result.modules).toContain(coreFile)
    expect(result.violations).toEqual([])
    expect(result.status).toBe(0)
  })

  test.each(importBreaks)('fails when $name', ({ source, rule }) => {
    const tree = plantedTree({ [coreFile]: source })

    const result = cruise(tree)

    expect(result.status).not.toBe(0)
    expect(result.violations.map(violation => violation.rule)).toEqual([rule])
    expect(result.violations.map(violation => violation.from)).toEqual([
      coreFile,
    ])
  })

  test('lets the shell import the core and foldkit', () => {
    const tree = plantedTree({
      'src/shell.ts':
        "import { Runtime } from 'foldkit'\nimport { appName } from './core/appName'\nexport const plant = [Runtime, appName]\n",
    })

    expect(cruise(tree).violations).toEqual([])
  })
})

const domBreaks = [
  { global: 'document', source: 'export const plant = document.title\n' },
  { global: 'window', source: 'export const plant = window.innerWidth\n' },
  {
    global: 'globalThis',
    source: 'export const plant = globalThis.document\n',
  },
  {
    global: 'localStorage',
    source: "export const plant = localStorage.getItem('a')\n",
  },
]

describe('the core DOM check', () => {
  test('passes on the real tree', () => {
    const result = lint(plantedTree())

    expect(result.findings).toEqual([])
    expect(result.status).toBe(0)
  })

  test.each(domBreaks)('fails when core uses $global', ({ source }) => {
    const result = lint(plantedTree({ [coreFile]: source }))

    expect(result.status).not.toBe(0)
    expect(result.findings).toEqual([
      { code: 'eslint(no-restricted-globals)', filename: coreFile },
    ])
  })

  test('lets the shell use the DOM', () => {
    const result = lint(
      plantedTree({ 'src/shell.ts': 'export const plant = document.title\n' }),
    )

    expect(result.findings).toEqual([])
    expect(result.status).toBe(0)
  })

  test('lets core name its own variable document', () => {
    const result = lint(
      plantedTree({
        [coreFile]:
          'export const plant = (document: string) => document.length\n',
      }),
    )

    expect(result.findings).toEqual([])
  })
})
