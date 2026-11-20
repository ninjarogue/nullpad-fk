# nullpad

A markdown note editor that feels like a terminal, built with Foldkit. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing Foldkit code. Foldkit owns that file and replaces it on upgrade, so this file holds everything specific to nullpad.

`FOLDKIT.md` reads the line below to decide whether to offer to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Layout

- `src/core/` is the pure core: domain logic such as the buffer, the parser and vim. It runs without a browser.
- `src/` outside `core/` is the shell: Model, Message, update, view and the runtime boot in `entry.ts`.
- New behavior goes in the core first. The shell routes messages to it.

## Editor

The editor works like a terminal program. The core owns the text, the caret, the line wrap and the scroll position, and paints only the rows on screen.

- `src/keyboard.ts` turns every key, text, IME and paste event of one hidden, always-focused textarea into an `Input`. `update` passes it to `Editor.feed` in `src/core/editor.ts`. A keypress crosses only these three files.
- `src/surface.ts` draws the rows of `Editor.paint` and reports clicks, wheel turns and the screen size in cells.
- A new key binding goes in `plainKeys` in `src/core/editor.ts`.
- `script()` in `src/core/input.ts` and `Editor.dump` run the editor without a browser and print a screen as text. Bundle a file that calls them with `pnpm dlx rolldown@1.2.19 <file>.ts --platform node -o <file>.mjs`, then run it with `node`.

## Architecture rules

| Rule                                                                                                                                                                                                                                                                                                                                                                                                    | Checked by                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The core imports only other `src/core` files and packages from `node_modules`. No shell file and no file outside `src/`, such as a `lib/` re-export.                                                                                                                                                                                                                                                    | `pnpm arch`, rule `core-imports-outside-core`                                                              |
| The core imports nothing from `foldkit` or `@foldkit/*`.                                                                                                                                                                                                                                                                                                                                                | `pnpm arch`, rule `core-imports-foldkit`                                                                   |
| The core imports nothing from `@effect/platform-browser`.                                                                                                                                                                                                                                                                                                                                               | `pnpm arch`, rule `core-imports-platform-browser`                                                          |
| Every import resolves, so no rule above is skipped by a path it cannot read.                                                                                                                                                                                                                                                                                                                            | `pnpm arch`, rule `not-to-unresolvable`                                                                    |
| The core uses no DOM or Node type or global (`document`, `fetch`, `HTMLElement`, `KeyboardEvent`, `console` and so on).                                                                                                                                                                                                                                                                                 | `pnpm typecheck`, which checks `src/core` alone with `src/core/tsconfig.json` (`lib: ES2022`, `types: []`) |
| `src/core` holds only `.ts`, `.mts` and `.cts` files, so no extension skips the typecheck or the lint.                                                                                                                                                                                                                                                                                                  | `pnpm arch`, script `arch:core-ts-only`                                                                    |
| No `/// <reference>` directive in `src`, because one could pull the DOM lib back into the core.                                                                                                                                                                                                                                                                                                         | `pnpm lint`, rule `typescript/triple-slash-reference`                                                      |
| Code follows the Foldkit and Effect conventions in `FOLDKIT.md`.                                                                                                                                                                                                                                                                                                                                        | `pnpm lint`                                                                                                |
| Only `src/keyboard.ts` reads the keyboard. No other file in `src`, and not `index.html`, names a key, input, paste or composition handler (`OnKey*`, `OnInput`, `OnBeforeInput*`, `OnPaste*`, `OnComposition*`) by any builder or destructure, makes a `textarea`, an `input` or a `Value`, says `contenteditable`, assigns an `on<event>` property, or names a key, input, paste or composition event. | `pnpm arch`, script `arch:one-keyboard`                                                                    |
| Only `src/keyboard.ts` imports `@foldkit/ui`, whose components attach their own key handlers.                                                                                                                                                                                                                                                                                                           | `pnpm arch`, rule `ui-components-outside-keyboard`                                                         |
| The shell imports only `src/core/editor.ts` and `src/core/input.ts` from the core.                                                                                                                                                                                                                                                                                                                      | `pnpm arch`, rule `shell-imports-core-internals`                                                           |
| No `src` file imports a file outside `src` other than a package, so no re-export outside `src` hides an import from the rules above.                                                                                                                                                                                                                                                                    | `pnpm arch`, rule `src-imports-outside-src`                                                                |

`.dependency-cruiser.cjs` holds the import rules. Dependency-cruiser reads the resolved imports, so a type import, a re-export, a dynamic import, a `require` and a chain through a file outside `src/` all count. The one form it does not see is a `typeof import('x')` type query. A core file can name a Foldkit type that way and nothing checks it. It parses with swc because it cannot read TypeScript 7.

`scripts/one-keyboard.sh` matches text, not types. It does not see `input` or `Value` destructured over several lines, or an event name built from parts.

A rule that breaks twice gets a check, not a reminder. Add the rule to its config and to the table above.

## Checks

```sh
pnpm format:check
pnpm lint        # oxlint with the Foldkit and Effect presets, read-only
pnpm typecheck   # the shell (tsconfig.json), the core (src/core/tsconfig.json) and the tests (e2e/tsconfig.json)
pnpm arch        # import rules and the one-keyboard check
pnpm build
pnpm test:e2e    # every end-to-end test in headless Chromium
```

`.githooks/pre-push` runs them in that order and gives the tests the build it just made. `pnpm install` turns the hook on (`prepare` sets `core.hooksPath`) and applies the Effect lint patch to `node_modules` (`postinstall`). `lint` itself changes nothing.

Use pnpm, never npm or npx. `package.json` pins its version for corepack. pnpm fails the install when a dependency has a build script it was not told to run, so a dependency that needs one goes under `allowBuilds` in `pnpm-workspace.yaml`.

## Testing

The only tests are end-to-end tests: Playwright Test drives the production build in headless Chromium with trusted input, the way a person types, clicks and scrolls. Write no unit tests and no Foldkit story or scene tests, and ignore the Testing section of `FOLDKIT.md`.

A test reads only the screen: the drawn rows (`[data-line-id]`, `[data-start]`, `[data-n]`, with `[data-ghost]` spans left out as not text), the drawn cursor `#caret`, the status line's `line:column NL`, and pixels from a screenshot. It never reads app state or a window global. It sends input only through `page.keyboard`, `page.mouse` and CDP `Input.*` (paste, IME, raw key events). A test may listen for an event on `window` to see what the browser was left to do, such as whether a keydown was cancelled. A test may add an element outside the app, such as an `<input>` that takes the keyboard, to stand for the rest of a page.

A bug fix starts with a scenario that fails on the bug. Run it on the broken build, see it fail, fix the code, see it pass.

### Run

```sh
pnpm test:e2e                       # builds, then runs everything: scenarios, sweeps and the short typist
pnpm test:e2e -g "huge wheel"       # tests whose name matches
pnpm test:e2e --trace on            # keeps a trace of each test; open one with pnpm exec playwright show-trace
NULLPAD_DIST=/path/to/dist pnpm test:e2e   # tests a build made elsewhere, such as an old commit, without building
```

Without `NULLPAD_DIST`, Playwright builds the working tree into `dist/` first, so a run always tests the current source. Traces are off by default. Pass `--trace retain-on-failure` to keep them for failing tests only.

On a machine without Playwright's Chromium, install it once with `pnpm exec playwright install chromium`. Cloud sessions have it at `/opt/pw-browsers` already. The `@playwright/test` version in `package.json` must match that browser's revision.

### Layout

| File                                                     | What it covers                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/nullpad.ts`                                         | The `nullpad` fixture: opens the app and reads the screen (`screen()`, `text()`, `status()`, `cursor()`, `inkIn()`), and sends input.  |
| `typing`, `ime`, `paste`, `pointer`, `layout` `.spec.ts` | Scenarios, one feature each. Every bug found so far has one here.                                                                      |
| `click-sweep.spec.ts`                                    | Clicks a grid across the whole window and checks that the cursor lands on the nearest drawn character boundary each time.              |
| `extremes.spec.ts`                                       | Giant and tiny wheel turns, 120,000-line pastes, line counts crossing 9,999 and 99,999, very long lines, AltGr keys, IME compositions. |
| `typist.spec.ts`, `e2e/typist/`                          | The robot typist and its named scripts.                                                                                                |
| `e2e/reporters/require-tests.ts`                         | Fails a run in which no test ran, so a filter or a skip cannot turn the gate green.                                                    |

### Add a scenario

Put it in the spec file of its feature, or a new `e2e/<feature>.spec.ts`. Import `test` and `expect` from `./nullpad` and take the `nullpad` fixture. The test name says what a person sees, and each assertion message names the step. Expected values come from what the feature promises, not from a run of the app.

```ts
test('Backspace at a line start joins it to the line above', async ({
  nullpad,
}) => {
  await nullpad.paste('ab\ncd')
  await nullpad.press('Home')
  await nullpad.press('Backspace')
  expect(await nullpad.text()).toBe('abcd')
  expect(await nullpad.status()).toEqual({ line: 1, column: 3, lineCount: 1 })
})
```

The fixture fails any test whose page logs an error or throws. A known bug that is not fixed yet gets a scenario marked `test.fail(true, 'known bug: ...')`. It passes while the bug stays and fails once the bug is gone, so whoever fixes it removes the mark.

### Robot typist

The typist types random scripts into nullpad and into a plain `<textarea>`, each in its own browser context, and compares the text and the caret (line and grapheme column) after every step. A script mixes whole emoji, flag and accented clusters typed one code point at a time, lone code points, and the keys Left, Right, Home, End, Ctrl+Home, Ctrl+End, Backspace, Delete and Enter. Up, Down, Page Up, Page Down and Tab are left out because a textarea moves or acts on them differently by design.

On a mismatch it replays the script from empty, shrinks it to the shortest script that still fails, and prints the sequence seed, the shortest script, and the shortest script as JSON for `namedScripts` in `e2e/typist/script.ts`.

```sh
pnpm test:typist                         # named scripts and 240 random scripts from a random run seed
TYPIST_SEED=123 pnpm test:typist         # the same 240 scripts as run seed 123
TYPIST_REPLAY=456 pnpm test:typist       # the one script of sequence seed 456, from a failure report
pnpm test:typist:long                    # 3,000 random scripts
TYPIST_SEQUENCES=500 pnpm test:typist    # any number
```

Every run prints its run seed. A script that once broke goes into `namedScripts` so it runs on every push.

Accepted differences. Where a malformed sequence makes Chrome's textarea and `Intl.Segmenter` disagree, nullpad follows `Intl.Segmenter`. A mismatch counts as accepted, not failed, only when the text around it holds one of these, listed in `acceptedDifferences` in `e2e/typist/script.ts`:

- ZWJ next to a non-pictograph.
- A mark, ZWJ or skin tone on a flag letter.
- A skin tone after a character that takes none.
- A variation selector not after a pictograph.

Each run reports how many mismatches each accepted difference covered.

## Process

- Tests are end-to-end only. See Testing.
- Before a PR is ready, an agent that did not write the change breaks it. It plants bugs, drives the app, and reports what got through.
- Few comments. Name things better instead. Skip the `// MODEL` section headers that `FOLDKIT.md` suggests.
