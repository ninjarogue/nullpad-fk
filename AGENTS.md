# nullpad

A markdown note editor that feels like a terminal, built with Foldkit. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing Foldkit code. Foldkit owns that file and replaces it on upgrade, so this file holds everything specific to nullpad.

`FOLDKIT.md` reads the line below to decide whether to offer to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Layout

- `src/core/` is the pure core: domain logic such as the buffer, the parser and vim. It runs without a browser.
- `src/` outside `core/` is the shell: Model, Message, update, view and the runtime boot in `entry.ts`.
- New behavior goes in the core first. The shell routes messages to it.

## Architecture rules

| Rule                                                                                                              | Checked by                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| The core imports nothing from the shell.                                                                          | `npm run arch`, rule `core-imports-shell`                         |
| The core imports nothing from `foldkit` or `@foldkit/*`.                                                          | `npm run arch`, rule `core-imports-foldkit`                       |
| The core imports nothing from `@effect/platform-browser`.                                                         | `npm run arch`, rule `core-imports-platform-browser`              |
| Every import resolves, so no rule above is skipped by a path it cannot read.                                      | `npm run arch`, rule `not-to-unresolvable`                        |
| The core names no DOM global (`window`, `document`, `localStorage` and the rest of the list in `.oxlintrc.json`). | `npm run lint`, rule `no-restricted-globals` scoped to `src/core` |
| Code follows the Foldkit and Effect conventions in `FOLDKIT.md`.                                                  | `npm run lint`                                                    |

`.dependency-cruiser.cjs` holds the import rules. Dependency-cruiser reads the resolved imports, so a type import, a re-export and a dynamic import all count. It parses with swc because it cannot read TypeScript 7.

A rule that breaks twice gets a check, not a reminder. Add the rule to its config and to the table above.

## Checks

```sh
npm run format:check
npm run lint        # oxlint with the Foldkit and Effect presets
npm run typecheck
npm run arch        # import rules
npm run build
```

`.githooks/pre-push` runs them in that order. Run `git config core.hooksPath .githooks` once per clone to turn it on.

## Process

- No tests yet. The test approach is chosen with pstack before the first test is written. Ignore the Testing section of `FOLDKIT.md` until then.
- Before a PR is ready, an agent that did not write the change breaks it. It plants bugs, drives the app, and reports what got through.
- Few comments. Name things better instead. Skip the `// MODEL` section headers that `FOLDKIT.md` suggests.
