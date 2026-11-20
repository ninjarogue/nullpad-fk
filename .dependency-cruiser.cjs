const core = '^src/core/'

module.exports = {
  forbidden: [
    {
      name: 'core-imports-shell',
      severity: 'error',
      from: { path: core },
      to: { path: '^src/', pathNot: core },
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
