# nullpad

A markdown note editor that feels like a terminal, built with Foldkit. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing Foldkit code. Foldkit owns that file and replaces it on upgrade, so this file holds everything specific to nullpad.

`FOLDKIT.md` reads the line below to decide whether to offer to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Layout

- `src/core/` is the pure core: domain logic such as the buffer, the parser and vim. It runs without a browser.
- `src/` outside `core/` is the shell: Model, Message, update, view and the runtime boot in `entry.ts`.
- New behavior goes in the core first. The shell routes messages to it.

## Editor

The editor types like a browser text box because the browser makes the decisions a text box makes. The core owns the text, the caret and which lines are drawn. The browser owns typed text, IME composition, line wrap, caret steps, hit testing and scrolling.

- `src/keyboard.ts` puts an EditContext on `#port`, the app's one focusable element, and turns every key, text, IME and paste event into an `Input`. The EditContext holds the caret's line, up to 1,000 UTF-16 units each side of the caret (`Frame.surrounding`, carried on the port's attributes), so an IME can convert letters already typed. A range an IME replaces becomes an `Erase` counted from the caret, so a copy a frame behind still erases the right letters. `update` passes the `Input` to `Editor.feed` in `src/core/editor.ts`. Only this file knows about EditContext; a fallback for browsers without one slots in here.
- Backspace deletes the whole letter (grapheme cluster) before the caret, as an EditContext does, where a textarea deletes one code point of an accent, a conjunct or a jamo. `fromKeyDown` takes Backspace in `keydown`, which keeps it in order with the other keys, and `backspaceTarget` in `src/core/buffer.ts` finds the letter with `Intl.Segmenter`.
- A key that needs layout (Left, Right, Delete, Home, End, Up, Down, Page Up, Page Down) or a click makes the core return a `Query` and queue every input after it. `src/surface.ts` answers it once the DOM shows the core's `revision`, with `Selection.modify` and `caretPositionFromPoint` on the drawn lines, and `CompletedLocate` lands the answer and replays the queue. The core never reads layout and the shell never moves the caret from a stale frame. A click is held as a line, client x and pixels below the line's top, so no scroll before its answer moves it off the line it was made on. The line is the one under the pointer in the frame on screen when the pointer went down. A scroll the app makes for a key or a click is on screen once the frame after it begins, so a click whose `timeStamp` is older than that is read without the scroll, however late Chrome hands it over. A wheel turn is the user's own scroll and a click is level with it. A click below the last line is the end of the text. The core keeps the line the shell has yet to read or reveal drawn: it draws a clicked line that has left the drawn lines, and it leaves out a scroll report that would undraw the clicked line, or the caret's line while a key's query or a reveal has yet to run.
- `src/surface.ts` draws the lines of `Editor.paint`: one `.line` per text line, wrapped by CSS, each piece between joins its own text node, one spacer row per undrawn line above and below, and a `#caret` overlay placed from a Range rect after each patch. `.surface` scrolls natively and reports its first line and its height in rows. It scrolls a wheel turn itself, on the main thread, and only onto drawn lines: when the turn lands past them, the screen stays put until the patch that draws that place scrolls there. Chrome's own wheel scroll runs ahead of the drawn lines and paints blank screen. Chrome hands a wheel turn to the page at the next frame, after keys pressed later than it, so a turn whose `timeStamp` is older than the moment an input last asked for the caret on screen is dropped: the key came after it.
- A new key binding goes in `plainKeys` in `src/core/editor.ts`.
- `script()` in `src/core/input.ts` and `Editor.dump` run the editor without a browser for keys that need no layout, and print the drawn lines as text. Bundle a file that calls them with `pnpm dlx rolldown@1.2.19 <file>.ts --platform node -o <file>.mjs`, then run it with `node`.

## Architecture rules

| Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Checked by                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The core imports only other `src/core` files and packages from `node_modules`. No shell file and no file outside `src/`, such as a `lib/` re-export.                                                                                                                                                                                                                                                                                                                                                          | `pnpm arch`, rule `core-imports-outside-core`                                                              |
| The core imports nothing from `foldkit` or `@foldkit/*`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `pnpm arch`, rule `core-imports-foldkit`                                                                   |
| The core imports nothing from `@effect/platform-browser`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `pnpm arch`, rule `core-imports-platform-browser`                                                          |
| Every import resolves, so no rule above is skipped by a path it cannot read.                                                                                                                                                                                                                                                                                                                                                                                                                                  | `pnpm arch`, rule `not-to-unresolvable`                                                                    |
| The core uses no DOM or Node type or global (`document`, `fetch`, `HTMLElement`, `KeyboardEvent`, `console` and so on).                                                                                                                                                                                                                                                                                                                                                                                       | `pnpm typecheck`, which checks `src/core` alone with `src/core/tsconfig.json` (`lib: ES2022`, `types: []`) |
| `src/core` holds only `.ts`, `.mts` and `.cts` files, so no extension skips the typecheck or the lint.                                                                                                                                                                                                                                                                                                                                                                                                        | `pnpm arch`, script `arch:core-ts-only`                                                                    |
| No `/// <reference>` directive in `src`, because one could pull the DOM lib back into the core.                                                                                                                                                                                                                                                                                                                                                                                                               | `pnpm lint`, rule `typescript/triple-slash-reference`                                                      |
| Code follows the Foldkit and Effect conventions in `FOLDKIT.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                              | `pnpm lint`                                                                                                |
| Only `src/keyboard.ts` reads the keyboard. No other file in `src`, and not `index.html`, names a key, input, paste or composition handler (`OnKey*`, `OnInput`, `OnBeforeInput*`, `OnPaste*`, `OnComposition*`) by any builder or destructure, makes a `textarea`, an `input` or a `Value`, says `contenteditable` or `EditContext` in any case, assigns an `on<event>` property, or names a key, input, paste, composition or EditContext event (`textupdate`, `textformatupdate`, `characterboundsupdate`). | `pnpm arch`, script `arch:one-keyboard`                                                                    |
| Only `src/keyboard.ts` imports `@foldkit/ui`, whose components attach their own key handlers.                                                                                                                                                                                                                                                                                                                                                                                                                 | `pnpm arch`, rule `ui-components-outside-keyboard`                                                         |
| The shell imports only `src/core/editor.ts` and `src/core/input.ts` from the core.                                                                                                                                                                                                                                                                                                                                                                                                                            | `pnpm arch`, rule `shell-imports-core-internals`                                                           |
| No `src` file imports a file outside `src` other than a package, so no re-export outside `src` hides an import from the rules above.                                                                                                                                                                                                                                                                                                                                                                          | `pnpm arch`, rule `src-imports-outside-src`                                                                |

`.dependency-cruiser.cjs` holds the import rules. Dependency-cruiser reads the resolved imports, so a type import, a re-export, a dynamic import, a `require` and a chain through a file outside `src/` all count. The one form it does not see is a `typeof import('x')` type query. A core file can name a Foldkit type that way and nothing checks it. It parses with swc because it cannot read TypeScript 7.

`scripts/one-keyboard.sh` matches text, not types. It does not see `input` or `Value` destructured over several lines, or an event name built from parts.

A rule that breaks twice gets a check, not a reminder. Add the rule to its config and to the table above.

## Checks

```sh
pnpm format:check
pnpm lint        # oxlint with the Foldkit and Effect presets and type-aware TypeScript rules, read-only
pnpm typecheck   # the shell (tsconfig.json), the core (src/core/tsconfig.json) and the tests (e2e/tsconfig.json)
pnpm arch        # import rules and the one-keyboard check
pnpm build
pnpm test:e2e    # the end-to-end tests of the push gate, in headless Chromium
pnpm test:ready  # before a merge: the push gate, every sweep and the scout
```

`.githooks/pre-push` runs all but `test:ready` in that order and gives the tests the build it just made. `pnpm install` turns the hook on (`prepare` sets `core.hooksPath`) and applies the Effect lint patch to `node_modules` (`postinstall`). `lint` itself changes nothing.

Use pnpm, never npm or npx. `package.json` pins its version for corepack. pnpm fails the install when a dependency has a build script it was not told to run, so a dependency that needs one goes under `allowBuilds` in `pnpm-workspace.yaml`.

## Testing

The only tests are end-to-end tests: Playwright Test drives the production build in headless Chromium with trusted input, the way a person types, clicks and scrolls. Write no unit tests and no Foldkit story or scene tests, and ignore the Testing section of `FOLDKIT.md`.

A test reads only the screen: the drawn rows (`[data-line-id]`, `[data-start]`, `[data-n]`, with `[data-ghost]` spans left out as not text), the drawn cursor `#caret`, the status line's `line:column NL`, and pixels from a screenshot. It never reads app state or a window global. It sends input only through `page.keyboard`, `page.mouse` and CDP `Input.*` (paste, IME, raw key events). A test may listen for an event on `window` to see what the browser was left to do, such as whether a keydown was cancelled. A test may add an element outside the app, such as an `<input>` that takes the keyboard, to stand for the rest of a page.

A bug fix starts with a scenario that fails on the bug. Run it on the broken build, see it fail, fix the code, see it pass.

### Run

```sh
pnpm test:e2e                       # builds, then runs the push gate: scenarios, named scripts and the every-push sweeps
pnpm test:ready                     # builds, then runs the push gate, every sweep and the scout, before a merge
pnpm test:e2e -g "huge wheel"       # tests whose name matches
pnpm test:e2e --trace on            # keeps a trace of each test; open one with pnpm exec playwright show-trace
NULLPAD_DIST=/path/to/dist pnpm test:e2e   # tests a build made elsewhere, such as an old commit, without building
```

Without `NULLPAD_DIST`, Playwright builds the working tree into `dist/` first, so a run always tests the current source. Traces are off by default. Pass `--trace retain-on-failure` to keep them for failing tests only.

On a machine without Playwright's Chromium, install it once with `pnpm exec playwright install chromium`. Cloud sessions have it at `/opt/pw-browsers` already. The `@playwright/test` version in `package.json` must match that browser's revision.

### Layout

| File                                                             | What it covers                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/nullpad.ts`                                                 | The `nullpad` fixture: opens the app and reads the screen (`screen()`, `text()`, `status()`, `cursor()`, `inkIn()`), and sends input.                                                                                                             |
| `typing`, `ime`, `paste`, `pointer`, `layout`, `wrap` `.spec.ts` | Scenarios, one feature each. Every bug found so far has one here. `wrap` also checks where lines break against a textarea of the same width (`textareaRowStarts`).                                                                                |
| `browser-support.spec.ts`                                        | A browser without EditContext shows that nullpad needs Chrome or Edge instead of an editor that takes no typing.                                                                                                                                  |
| `click-sweep.spec.ts`                                            | Clicks a grid across the whole window and checks that the cursor lands on the nearest drawn character boundary each time.                                                                                                                         |
| `extremes.spec.ts`                                               | Giant and tiny wheel turns, 120,000-line pastes, line counts crossing 9,999 and 99,999, very long lines, AltGr keys, IME compositions.                                                                                                            |
| `sweep.spec.ts`, `e2e/typist/sweeps.ts`                          | The sweeps: grids of scripts, each compared with a textarea. Some play on every push, the rest before a merge.                                                                                                                                    |
| `typist.spec.ts`, `typist-flicker.spec.ts`, `e2e/typist/`        | The named scripts, which run on every push. The scout and the typist flicker checks, which run only with `TYPIST_SCOUT_MINUTES`. `run.ts` holds the comparison, `script.ts` the named scripts and accepted differences, and `scout.ts` the scout. |
| `e2e/reporters/require-tests.ts`                                 | Fails a run in which no test ran, so a filter or a skip cannot turn the gate green.                                                                                                                                                               |

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

The typist types a script into nullpad and into a `<textarea>`, each in its own browser context, and compares the text, the cursor (line and grapheme column) and where each line breaks into rows after every step. The textarea is in nullpad's font and exactly as wide as nullpad's text column, so it wraps at the same edge. Rows are compared while nullpad's screen shows the whole text.

A script is a list of steps. A `text` step types one code point, or an ASCII run key by key. An `insert` step puts a whole string in at once, as an IME does. A `key` step presses Left, Right, Up, Down, Home, End, Ctrl+Home, Ctrl+End, Backspace, Delete or Enter. Page Up, Page Down and Tab are left out.

Backspace is judged against a bare EditContext element in a third browser context, not against the textarea. Before each Backspace the typist reads the textarea's own text nodes over the DevTools protocol, because Chrome keeps the halves of a joined line in separate nodes as nullpad keeps a join. The text node before the cursor goes into the EditContext, with the cursor moved to the next grapheme boundary, and the EditContext takes a real Backspace. The textarea takes its own Backspace too. Where the EditContext took more, the rest of that letter is deleted from the textarea as a selection, so the textarea holds the EditContext's result for the comparison and the steps after it. At a line start the textarea joins the lines itself.

Three kinds of script run. Named scripts and the sweeps marked `every push` run on every push. The other sweeps and the scout run before a merge, with `pnpm test:ready`.

#### Named scripts

`namedScripts` in `e2e/typist/script.ts` holds every script that once broke, each as its shortest form. `pnpm test:typist` plays them.

#### Sweeps

A sweep covers one class of bugs with a grid of scripts. It plays the same scripts on every run, so a failing row fails again until the bug is fixed. `e2e/typist/sweeps.ts` holds the table and `e2e/sweep.spec.ts` plays it.

A sweep has a `name` that states its rule in plain words, `runs` that says whether it plays on every push or before a merge, and these lists.

- `documents`. Each has a name and the steps that build it.
- `placements`. Each has a name, the steps that put the cursor in a document, and its `moves`. A move is a short script, such as one key and then `y`, so the text shows where the cursor stood.

A row is one document, one placement and one move. Its script is the document's steps, the placement's steps and the move, in that order. `scripts` holds the number of rows as a literal. A test fails when the grid has another size, so a grid that shrinks shows as a changed number in the diff.

A row types every step before its last placement step back to back, without comparing. It then compares after that step, where the placement left the cursor, and after each step of the move. A row passes when nullpad and the textarea agree each time, or when an accepted difference covers the text. A failing row prints as `document | placement | move | differs after step N of M | nullpad L:C textarea L:C | text same: true`. A row that throws prints `threw:` and the error in place of the step. The rows go round-robin to `TYPIST_SHARDS` shards (8 by default), and each shard prints how many rows it checked, how many differ, and how many differences each accepted difference covered.

The sweeps today:

- Up or Down, any key, Up or Down lands where a textarea lands. Runs on every push. 6 documents (three short lines, a wrapped line of words, a long word that moved to the next row, one word longer than a row, a full row that ends in spaces, and rows of emoji and accents), 7 placements, and 52 moves in each: Up or Down, then any of 13 keys, then Up or Down. 2,184 rows, about 3 minutes on 4 cores.
- One Backspace, Delete, Left or Right takes what a textarea takes around emoji, flags and accents. Runs before a merge, as two sweeps. The documents are twelve pieces (a letter, an accent, two flag letters, a thumbs up, a skin tone, a man, a ZWJ, a heart, a variation selector, a Devanagari letter and a virama) in every ordered pair, and seven fixed documents (two of Hangul, a keycap, a family of three, a family of four and a kiss with skin tones, which are letters of 11 and 15 UTF-16 units, and a flag split by an x). Each move is one key and then `y`.
  - Typed in order: 151 documents, 3 placements (at the end, at the start, one Right from the start). 906 rows.
  - Met at a line join, or typed one in front of the other: 302 documents, the same 3 placements and where the build left the cursor. 3,020 rows.

The second rule has 54 named scripts on every push, and its sweeps would add about 5 minutes to each push on 4 cores, so they run before a merge. Add a row only for a shape the grid does not reach. When a bug turns up, run the sweep on the broken build first and see the new row fail.

1. If the bug fits a sweep's rule, add the document that shows it. If the bug needs a cursor spot or a key the grid lacks, add a placement or a move too. Set `scripts` to the new count.
2. If the bug breaks another rule, add a sweep to `sweeps` with its own name, documents, placements, `scripts` and `runs`.
3. Add the shortest failing script to `namedScripts`. The sweep finds the neighbors of the bug, and the named script keeps the bug itself.

`pnpm test:sweep` plays every sweep alone, the ones that run before a merge too.

#### The scout

The scout plays random scripts, aimed at the texts the sweeps use. It looks for bugs the grids miss. It does not run on a push. `pnpm test:ready` runs it before a merge, and `pnpm test:scout` runs it alone.

`scoutScript(seed)` in `e2e/typist/scout.ts` makes these draws in order:

1. A sweep.
2. One of that sweep's documents, or one time in four a line of 50 to 90 characters built from a list of words with hyphens, dashes, URLs, markdown, brackets, quotes and runs of spaces.
3. One of that sweep's placements.
4. Four to ten more steps. Most are steps from that sweep's moves. The rest are any key, a word, a whole emoji, flag or accent cluster typed one code point at a time, or a lone code point.

Each shard plays scripts until `TYPIST_SCOUT_MINUTES` minutes pass, and prints how many it played. A script that fails is played again from empty and shrunk to the shortest script that still fails. The report prints the sequence seed, the shortest script, and that script as JSON for `namedScripts`. A sequence seed names the same script only while `sweeps.ts` and `scout.ts` stay the same, so keep the printed script.

Every scout find becomes a sweep row, or a new sweep, and a named script. If a month of scout runs finds nothing new, drop the scout.

#### Commands

```sh
pnpm test:e2e                                           # the push gate: scenarios, named scripts and the every-push sweeps, with no random scripts
pnpm test:ready                                         # before a merge: the push gate, every sweep, the scout for 5 minutes and the typist flicker checks
pnpm test:sweep                                         # every sweep alone
pnpm test:typist                                        # the named scripts alone
pnpm test:scout                                         # the scout for 5 minutes, and the typist flicker checks
TYPIST_SCOUT_MINUTES=1 pnpm test:typist                 # the scout for any number of minutes
TYPIST_SEED=123 TYPIST_SCOUT_MINUTES=1 pnpm test:typist # the scout's scripts of run seed 123, in the same order
TYPIST_REPLAY=456 pnpm test:typist                      # the one scout script of sequence seed 456, from a failure report
```

A scout run prints its run seed.

#### Accepted differences

Where a malformed sequence makes Chrome's textarea or EditContext disagree with `Intl.Segmenter`, nullpad follows `Intl.Segmenter`. A mismatch counts as accepted, not failed, only when the text before the step, the textarea's text after it, or the piece a Backspace was judged on holds one of these. A piece that starts at a line join can be malformed where the whole line is not, such as a ZWJ that starts one. nullpad's own text after the step does not count, so a bug that leaves a broken letter behind is not excused. They are listed in `acceptedDifferences` in `e2e/typist/script.ts`:

- ZWJ next to a non-pictograph.
- A mark, ZWJ or skin tone on a flag letter.
- A skin tone after a character that takes none.
- A virama with no letter before it.
- A variation selector not after a pictograph.
- A mark on a space.

Each sweep shard and each scout shard reports how many mismatches each accepted difference covered.

## Process

- Tests are end-to-end only. See Testing.
- Before a PR is ready, `pnpm test:ready` passes on its tip, and the PR body says so.
- Before a PR is ready, an agent that did not write the change breaks it. It plants bugs, drives the app, and reports what got through.
- Few comments. Name things better instead. Skip the `// MODEL` section headers that `FOLDKIT.md` suggests.
