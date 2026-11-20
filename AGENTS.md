# nullpad

A markdown note editor that feels like a terminal, built with Foldkit. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing Foldkit code. Foldkit owns that file and replaces it on upgrade, so this file holds everything specific to nullpad.

`FOLDKIT.md` reads the line below to decide whether to offer to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Layout

- `src/core/` is the pure core: domain logic such as the buffer, the parser and vim. It runs without a browser.
- `src/` outside `core/` is the shell: Model, Message, update, view and the runtime boot in `entry.ts`.
- New behavior goes in the core first, with unit tests. The shell routes messages to it.
- `checks/` tests the checks themselves. `scripts/` holds the helpers the pre-push hook runs. `e2e/` holds the browser tests and is its own package.

## Architecture rules

| Rule                                                                                                              | Checked by                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| The core imports nothing from the shell.                                                                          | `npm run arch`, rule `core-imports-shell`                                |
| The core imports nothing from `foldkit` or `@foldkit/*`.                                                          | `npm run arch`, rule `core-imports-foldkit`                              |
| The core imports nothing from `@effect/platform-browser`.                                                         | `npm run arch`, rule `core-imports-platform-browser`                     |
| Every import resolves, so no rule above is skipped by a path it cannot read.                                      | `npm run arch`, rule `not-to-unresolvable`                               |
| The core names no DOM global (`window`, `document`, `localStorage` and the rest of the list in `.oxlintrc.json`). | `npm run lint`, rule `no-restricted-globals` scoped to `src/core`        |
| Each rule above fails for its own rule on a planted break, and a clean tree passes.                               | `npm test`, `checks/architecture.test.ts`                                |
| Code follows the Foldkit and Effect conventions in `FOLDKIT.md`.                                                  | `npm run lint`                                                           |
| A test step that runs zero tests, or skips one, fails the push.                                                   | `.githooks/pre-push`, `scripts/ran-tests.mjs`, `checks/ranTests.test.ts` |

`.dependency-cruiser.cjs` holds the import rules. Dependency-cruiser reads the resolved imports, so a type import, a re-export and a dynamic import all count. It parses with swc because it cannot read TypeScript 7.

A rule that breaks twice gets a check, not a reminder. Add the rule to its config, add its row to the table, and add the planted break that proves it to `checks/`.

## Checks

```sh
npm run format:check        # format
npm run lint                      # oxlint with the Foldkit and Effect presets
npm run typecheck                 # app, checks and e2e
npm test                          # unit tests: stories, scenes, and the planted-break checks
npm run arch                      # import rules
npm run build
npm --prefix e2e test             # browser tests in Chromium
```

`.githooks/pre-push` runs them in that order. Run `git config core.hooksPath .githooks` once per clone to turn it on.

### Browser tests in a cloud session

The e2e runner pins a Playwright whose Chromium revision is not the one a cloud session has preinstalled, and the download is blocked. `npm --prefix e2e test` handles this through `e2e/run.mjs`. When `PLAYWRIGHT_BROWSERS_PATH` is set and lacks the pinned revision, the script makes a scratch directory in the temp folder. In it, `chromium-<rev>`, `chromium_headless_shell-<rev>` and `ffmpeg-<rev>` link to the installed builds in `$PLAYWRIGHT_BROWSERS_PATH`. It points `PLAYWRIGHT_BROWSERS_PATH` at that directory for the run and sets `E2E_TELEMETRY_DISABLED=1`.

To do it by hand, make the same links, then run `PLAYWRIGHT_BROWSERS_PATH=<scratch> E2E_TELEMETRY_DISABLED=1 npx e2e run --retries 0` in `e2e/`. Do not run `playwright install` in a cloud session.

## Process

- Write the failing test first. Watch it fail for the reason you expect, then make it pass. The test checks the goal, not the fix.
- A test asserts what a user can see or do: what the page shows, what a key does. It does not assert the internals. Drive `update` with stories and the view with scenes, and use real Chromium for behavior that needs a browser.
- Before a PR is ready, an agent that did not write the change breaks it. It plants bugs, drives the app, and reports which ones the tests missed. Missed ones get a test. The PR is not ready until that pass is clean.
- Few comments. Name things better instead. Skip the `// MODEL` section headers that `FOLDKIT.md` suggests.
