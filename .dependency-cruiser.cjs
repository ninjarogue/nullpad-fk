const core = '^src/core/'

module.exports = {
  forbidden: [
    {
      name: 'core-imports-outside-core',
      severity: 'error',
      from: { path: core },
      to: { pathNot: [core, '^node_modules/'] },
    },
    {
      name: 'core-imports-foldkit',
      severity: 'error',
      from: { path: core },
      to: { path: 'node_modules/(foldkit|@foldkit)/' },
    },
    {
      name: 'core-imports-platform-browser',
      severity: 'error',
      from: { path: core },
      to: { path: 'node_modules/@effect/platform-browser/' },
    },
    {
      name: 'shell-imports-core-internals',
      severity: 'error',
      from: { path: '^src/', pathNot: core },
      to: {
        path: core,
        pathNot: '^src/core/(editor|finder|input|notes)[.]ts$',
      },
    },
    {
      name: 'src-imports-outside-src',
      severity: 'error',
      from: { path: '^src/' },
      to: { pathNot: ['^src/', '^node_modules/'] },
    },
    {
      name: 'ui-components-outside-keyboard',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/keyboard[.]ts$' },
      to: { path: 'node_modules/@foldkit/ui/' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    parser: 'swc',
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
}
