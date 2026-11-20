# nullpad

A markdown note editor that feels like a terminal, built with Foldkit. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing Foldkit code. Foldkit owns that file and replaces it on upgrade, so this file holds everything specific to nullpad.

`FOLDKIT.md` reads the line below to decide whether to offer to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Layout

- `src/core/` is the pure core: domain logic such as the buffer, the parser and vim. It runs without a browser.
- `src/` outside `core/` is the shell: Model, Message, update, view and the runtime boot in `entry.ts`.
- New behavior goes in the core first. The shell routes messages to it.

## Architecture rules

| Rule                                                                                                                                                 | Checked by                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| The core imports only other `src/core` files and packages from `node_modules`. No shell file and no file outside `src/`, such as a `lib/` re-export. | `npm run arch`, rule `core-imports-outside-core`                                                              |
| The core imports nothing from `foldkit` or `@foldkit/*`.                                                                                             | `npm run arch`, rule `core-imports-foldkit`                                                                   |
| The core imports nothing from `@effect/platform-browser`.                                                                                            | `npm run arch`, rule `core-imports-platform-browser`                                                          |
| Every import resolves, so no rule above is skipped by a path it cannot read.                                                                         | `npm run arch`, rule `not-to-unresolvable`                                                                    |
| The core uses no DOM or Node type or global (`document`, `fetch`, `HTMLElement`, `KeyboardEvent`, `console` and so on).                              | `npm run typecheck`, which checks `src/core` alone with `src/core/tsconfig.json` (`lib: ES2022`, `types: []`) |
| `src/core` holds only `.ts`, `.mts` and `.cts` files, so no extension skips the typecheck or the lint.                                               | `npm run arch`, script `arch:core-ts-only`                                                                    |
| No `/// <reference>` directive in `src`, because one could pull the DOM lib back into the core.                                                      | `npm run lint`, rule `typescript/triple-slash-reference`                                                      |
| Code follows the Foldkit and Effect conventions in `FOLDKIT.md`.                                                                                     | `npm run lint`                                                                                                |

`.dependency-cruiser.cjs` holds the import rules. Dependency-cruiser reads the resolved imports, so a type import, a re-export, a dynamic import, a `require` and a chain through a file outside `src/` all count. The one form it does not see is a `typeof import('x')` type query. A core file can name a Foldkit type that way and nothing checks it. It parses with swc because it cannot read TypeScript 7.

A rule that breaks twice gets a check, not a reminder. Add the rule to its config and to the table above.

## Checks

```sh
npm run format:check
npm run lint        # oxlint with the Foldkit and Effect presets, read-only
npm run typecheck   # the shell (tsconfig.json) and the core (src/core/tsconfig.json)
npm run arch        # import rules
npm run build
```

`.githooks/pre-push` runs them in that order. `npm install` turns the hook on (`prepare` sets `core.hooksPath`) and applies the Effect lint patch to `node_modules` (`postinstall`). `lint` itself changes nothing.

## Process

- No tests yet. The test approach is chosen with pstack before the first test is written. Ignore the Testing section of `FOLDKIT.md` until then.
- Before a PR is ready, an agent that did not write the change breaks it. It plants bugs, drives the app, and reports what got through.
- Few comments. Name things better instead. Skip the `// MODEL` section headers that `FOLDKIT.md` suggests.
