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

## Markdown

The parser is written for nullpad, uses no library and follows CommonMark 0.31.2. It reads a note's lines and returns a tree in which every node knows its place in the note. Nothing draws the tree yet, so the default screen is the editor alone.

- `src/core/markdown.ts` is the whole public surface: `parse(lines)`, `toHtml(document)`, `outline(document)`, `positionOf(placed, point)` and the tree's types. The parts live under `src/core/markdown/`.
- A `Document` holds `lines`, `sections` and `definitions`. A section is one top-level block and the blank lines after it, so it holds whole lines. A place in a section is a `Point`: `lineInSection` and a UTF-16 `column`. `positionOf` is the one function that adds the section's first line. Every node has a half-open `span`. A paragraph or a heading keeps one slice per line.
- `parse` makes two passes. The block pass in `blocks.ts` folds over the lines with an immutable state and returns the sections. The inline pass in `inlines.ts` then reads each paragraph and heading: tokens, a delimiter stack for emphasis in `emphasis.ts`, and a bracket stack for links. A link reference definition is a block in the tree, and `toHtml` leaves it out.
- The parser has no `for`, no `while` and no `let`. A walk whose length follows the note is a fold or a regex, and no regex nests one quantifier in another. Recursion stops at `deepestNesting`, so parsing time grows in line with the note.
- `deepestNesting` is 100. It counts the levels of the tree: a block quote, a list and a list item are one level each, and so are emphasis, strong emphasis, a link and an image. A marker that would open level 101 stays text.
- `toHtml` writes the HTML of the spec's examples, character for character. nullpad draws that string as text and never puts it in the page as markup.
- `/?pane=html` and `/?pane=outline` draw `Editor.html` or `Editor.outline` as text in a `<pre class="pane">` under the editor. `src/entry.ts` reads the flag once at boot into the Model. The pane is there for tests. Without the flag the page has no pane and the parser does not run.

### Outline

`outline` prints one row per node, in the order of the note. A line feed ends every row but the last.

```
<two spaces per level><tag> <line>:<column>-<line>:<column>[ <JSON string>]
```

```
Paragraph 3:0-4:12
  Text 3:0-3:4 "see "
  Emphasis 3:4-3:10
    Text 3:5-3:9 "this"
  SoftBreak 3:10-3:10
  Link 4:0-4:12 "/url"
    Text 4:1-4:5 "here"
```

- A top-level block has no indent. A child is one level under its parent.
- The tag is the node's `_tag`. A block is a `Paragraph`, `Heading`, `ThematicBreak`, `CodeBlock`, `HtmlBlock`, `Definition`, `Quote`, `List` or `Item`. An inline is a `Text`, `Escape`, `Entity`, `SoftBreak`, `HardBreak`, `Code`, `Emphasis`, `Strong`, `Link`, `Image`, `Autolink` or `Html`.
- The two places are the node's `span`, and the end is half open. The line is the note's line number as the gutter shows it, counted from 1. The column is a UTF-16 offset into that line, counted from 0.
- A `Text`, `Escape`, `Entity`, `Code`, `Html`, `Autolink`, `CodeBlock` or `HtmlBlock` shows its text as a JSON string. A `Link`, `Image` or `Definition` shows its destination. No other node shows a string.
- A JSON string holds no raw line feed, and the tag and the places hold no space. So the pane splits into rows at line feeds, and a row without its indent splits into tag, places and string at its first two spaces.

### Differences from commonmark.js

`commonmark@0.31.2` is the reference parser, a dev dependency that tests may call and `src` never imports. These are the known differences in the HTML.

- The nesting limit. commonmark.js nests without a limit. This is the one difference we chose.
- Emoji and other punctuation or symbols outside the Basic Multilingual Plane count as punctuation next to `*` and `_`, as sections 2.1 and 6.2 of the spec say. commonmark.js reads one UTF-16 unit there and takes them for letters.
- A paragraph and a heading lose only spaces and tabs at their ends, as sections 4.2 and 4.8 say. commonmark.js also takes off a form feed, a no-break space and other Unicode whitespace.
- `&#128;` to `&#159;` are the characters U+0080 to U+009F, as section 2.5 says. commonmark.js reads them as Windows-1252.
- A space written as `&#32;` before a line ending stays. commonmark.js drops it as it drops a typed space.
- The first definition of a label in the note wins, as section 4.7 says. In commonmark.js a later definition wins when it opens a paragraph that becomes a setext heading.
- A paragraph that holds only definitions and ends at a `---` line leaves no paragraph. commonmark.js leaves `<p></p>`.

## Architecture rules

| Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Checked by                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The core imports only other `src/core` files and packages from `node_modules`. No shell file and no file outside `src/`, such as a `lib/` re-export.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `pnpm arch`, rule `core-imports-outside-core`                                                              |
| The core imports nothing from `foldkit` or `@foldkit/*`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `pnpm arch`, rule `core-imports-foldkit`                                                                   |
| The core imports nothing from `@effect/platform-browser`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `pnpm arch`, rule `core-imports-platform-browser`                                                          |
| Every import resolves, so no rule above is skipped by a path it cannot read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `pnpm arch`, rule `not-to-unresolvable`                                                                    |
| The core uses no DOM or Node type or global (`document`, `fetch`, `HTMLElement`, `KeyboardEvent`, `console` and so on).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `pnpm typecheck`, which checks `src/core` alone with `src/core/tsconfig.json` (`lib: ES2022`, `types: []`) |
| `src/core` holds only `.ts`, `.mts` and `.cts` files, so no extension skips the typecheck or the lint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `pnpm arch`, script `arch:core-ts-only`                                                                    |
| No `/// <reference>` directive in `src`, because one could pull the DOM lib back into the core.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `pnpm lint`, rule `typescript/triple-slash-reference`                                                      |
| Code follows the Foldkit and Effect conventions in `FOLDKIT.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `pnpm lint`                                                                                                |
| Only `src/keyboard.ts` reads the keyboard. No other file in `src`, and not `index.html`, names a key, input, paste or composition handler (`OnKey*`, `OnInput`, `OnBeforeInput*`, `OnPaste*`, `OnComposition*`) by any builder or destructure, makes a `textarea`, an `input` or a `Value`, says `contenteditable` or `EditContext` in any case, assigns an `on<event>` property, or names a key, input, paste, composition or EditContext event (`textupdate`, `textformatupdate`, `characterboundsupdate`). One file is let off one word: `src/core/markdown/htmlBlocks.ts` holds the spec's list of HTML tags, and `textarea` is one of them. Every other pattern still covers that file. | `pnpm arch`, script `arch:one-keyboard`                                                                    |
| Only `src/keyboard.ts` imports `@foldkit/ui`, whose components attach their own key handlers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `pnpm arch`, rule `ui-components-outside-keyboard`                                                         |
| The shell imports only `src/core/editor.ts` and `src/core/input.ts` from the core.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `pnpm arch`, rule `shell-imports-core-internals`                                                           |
| Only `src/core/markdown.ts` and the files under `src/core/markdown/` import a file under `src/core/markdown/`. The rest of the core and the shell reach the parser through `markdown.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `pnpm arch`, rule `markdown-internals-outside-markdown`                                                    |
| No `src` file imports a file outside `src` other than a package, so no re-export outside `src` hides an import from the rules above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `pnpm arch`, rule `src-imports-outside-src`                                                                |
| The TypeScript files hold exactly as many comments as `scripts/comment-budget.txt` says, counted by a parser (`oxc-parser`). A new comment must state a fact we cannot change, such as a browser rule, and raises the number in the same diff. Deleting one lowers it.                                                                                                                                                                                                                                                                                                                                                                                                                       | `pnpm arch`, script `arch:comment-budget`                                                                  |

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

A test reads only the screen: the drawn rows (`[data-line-id]`, `[data-start]`, `[data-n]`, with `[data-ghost]` spans left out as not text), the drawn cursor `#caret`, the status line's `line:column NL`, the text of the pane (`.pane`) on a page opened with `/?pane=html` or `/?pane=outline`, and pixels from a screenshot. It never reads app state or a window global. It sends input only through `page.keyboard`, `page.mouse` and CDP `Input.*` (paste, IME, raw key events). A test may listen for an event on `window` to see what the browser was left to do, such as whether a keydown was cancelled. A test may add an element outside the app, such as an `<input>` that takes the keyboard, to stand for the rest of a page.

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

| File                                                                                | What it covers                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/nullpad.ts`                                                                    | The `nullpad` fixture: opens the app and reads the screen (`screen()`, `text()`, `status()`, `cursor()`, `inkIn()`), and sends input.                                                                                                                                                                                   |
| `typing`, `ime`, `paste`, `pointer`, `layout`, `wrap` `.spec.ts`                    | Scenarios, one feature each. Every bug found so far has one here. `wrap` also checks where lines break against a textarea of the same width (`textareaRowStarts`).                                                                                                                                                      |
| `browser-support.spec.ts`                                                           | A browser without EditContext shows that nullpad needs Chrome or Edge instead of an editor that takes no typing.                                                                                                                                                                                                        |
| `e2e/pane.ts`, `pane.spec.ts`                                                       | The `pane` fixture: opens `/?pane=html` or `/?pane=outline`, pastes a note through the editor and returns the pane's text (`timedPaste` also times the paste, on a page with the pane or without one). The scenarios check the outline's rows, that the default screen has no pane, and that raw HTML is drawn as text. |
| `commonmark.spec.ts`, `e2e/markdown/examples.ts`                                    | The 652 examples of CommonMark 0.31.2, read from `commonmark-spec`. Each is pasted through the editor, and the HTML pane must show the example's HTML to the character. One test per section of the spec.                                                                                                               |
| `markdown-sweep.spec.ts`, `e2e/markdown/grids.ts`, `reference.ts`, `differences.ts` | The markdown grids: every short string over an alphabet, every stack of two or three line shapes, every list of up to three items, each compared with `commonmark@0.31.2` run in the test process. Some play on every push, the rest before a merge. See Markdown grids.                                                |
| `markdown-places.spec.ts`, `e2e/markdown/places.ts`                                 | Reads the outline pane and checks the rules that hold for any note: children lie inside their parent, the source under a node has the shape of its tag, and no line with text lies outside the top-level blocks. The notes are the 652 spec examples and the every-push grids.                                          |
| `markdown-slow.spec.ts`, `e2e/markdown/slow.ts`                                     | Inputs that a careless parser reads in quadratic time. Each is pasted at n and 4n, and the time the pane adds to the paste must grow in line with the size.                                                                                                                                                             |
| `click-sweep.spec.ts`                                                               | Clicks a grid across the whole window and checks that the cursor lands on the nearest drawn character boundary each time.                                                                                                                                                                                               |
| `extremes.spec.ts`                                                                  | Giant and tiny wheel turns, 120,000-line pastes, line counts crossing 9,999 and 99,999, very long lines, AltGr keys, IME compositions.                                                                                                                                                                                  |
| `sweep.spec.ts`, `e2e/typist/sweeps.ts`                                             | The sweeps: grids of scripts, each compared with a textarea. Some play on every push, the rest before a merge.                                                                                                                                                                                                          |
| `typist.spec.ts`, `typist-flicker.spec.ts`, `e2e/typist/`                           | The named scripts, which run on every push. The scout and the typist flicker checks, which run only with `TYPIST_SCOUT_MINUTES`. `run.ts` holds the comparison, `script.ts` the named scripts and accepted differences, and `scout.ts` the scout.                                                                       |
| `e2e/drive.ts`, `.claude/skills/verify-nullpad/`                                    | Not a test. Plays a JSON list of steps on a fresh build with the fixture's driver, prints the screen after each step and saves evidence. The `verify-nullpad` skill says how, and its `features/*.json` are runnable proofs of each feature.                                                                            |
| `e2e/reporters/require-tests.ts`                                                    | Fails a run in which no test ran, so a filter or a skip cannot turn the gate green.                                                                                                                                                                                                                                     |

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

### Markdown grids

The parser is checked against `commonmark@0.31.2`, the reference, run in the test process, and against rules that hold for any note. `pnpm test:markdown` plays all three specs and the grids that run before a merge alone.

#### Grids against the reference

A grid has a `name` that states its rule in plain words, `runs` (every push or before a merge), `rows` as a literal that the test checks, and `units`, the notes that are pasted. A test fails when the grid has another size, so a grid that shrinks shows as a changed number in the diff. `e2e/markdown/grids.ts` holds the table and `e2e/markdown-sweep.spec.ts` plays it.

A unit is one paste. Where a case cannot reach its neighbour, many cases share a note, each followed by a blank line, a sentinel block (`---` or `<!-- -->`) and a blank line. The note's HTML is compared with the reference's HTML for the same note, and both are cut at the sentinel's HTML into one piece per case. The first pieces that differ are printed with their source. A case joins a batch only when the reference shows it alone with the sentinel after it as its own HTML plus the sentinel's, so no case can open a fence, a comment or a list that swallows the next. A case that fails this test is pasted alone in the grids of line shapes and line ends. The other grids leave it out, which drops only strings that open a fence, such as three backticks at the start of a code span string (121 of 12,288) or of a link string (21 of 13,310). The stacks of fence shapes cover them. Every stack of the 16 general line shapes is pasted alone. A row passes when the pane shows the reference's HTML, or an accepted difference covers the case.

The grids today, with `rows` and when they run:

- Short strings of one alphabet, one case each: `* _ a` space `.` up to 6 (12,500, every push) and 7 (50,000, before a merge); the same with `a`, `«`, `€`, a no-break space and a space, up to 5 (10,005); backtick, `a`, space and backslash up to 7 (12,167); `[ ] ( ) ! < > ` backslash `a` space up to 4 (26,578, with and without a definition of `[a]`) and 5 (265,820, before a merge); link parts (`[a`, `]`, `(`, `)`, `<b>`, `<b`, `b`, `"t"`, space, backslash, `!`) up to 4 (26,620); raw HTML parts after `x ` up to 3 (3,615) and 4 (50,625, before a merge); `* a` space, a line end, backtick, brackets, parentheses and backslash up to 4 (7,112) and 5 (64,000, before a merge); autolink parts up to 4 (9,000) and 5 (81,000, before a merge).
- Every HTML5 entity name spelt seven ways and numeric references at their edges, in text and in a link title (15,145).
- A backslash before each printable ASCII character in six contexts (570).
- Each of 28 inline constructs in each of 20 containers (560).
- Lists of one to three items with any of three markers, a blank line or none between items, and four item shapes (7,212).
- Any two lines of 16 line shapes, one paste each (256, every push), and any three (4,096, before a merge).
- Any one to three lines of 20 HTML block parts (8,420), of 16 fence parts (4,368) and of 16 definition parts (4,368), all before a merge. A stack that cannot share a note is pasted alone.

`NULLPAD_READY=1` plays the before-a-merge grids, the rest are skipped. `MARKDOWN_SHARDS` sets the number of parallel tests per grid (4 by default). Each shard prints how many rows it checked, how many differ, and how many differences each accepted difference covered. The every-push grids take about 28 s on 4 cores, the before-a-merge ones about 10 minutes.

When a bug turns up, add the shortest note to the grid whose rule it breaks, or a grid of its own, and set `rows`.

#### Accepted differences from the reference

`acceptedDifferences` in `e2e/markdown/differences.ts` has one entry for each item under "Differences from commonmark.js". An entry has a `covers(markdown)` that reads the note the case came from, never nullpad's output, and an `example` that the spec text decides. A test pastes each example, and the pane must show the spec's HTML where the reference shows something else. Another test checks that no entry covers an example of the spec, so an entry cannot grow wide unseen. A mismatch that no entry covers fails the row.

#### Outline places

`e2e/markdown/places.ts` reads the outline pane by its documented format and checks each row against the note that was pasted. The notes are the 652 spec examples, grouped into notes of up to 40 that the reference shows do not run into each other (the rest alone), and one note in four of each every-push grid. The rules:

- Every place lies in the note, and the start is not after the end. Only a `SoftBreak` is empty.
- A top-level node is a block, and each node sits under a parent that can hold it. A child lies inside its parent, and siblings are in order and do not overlap.
- Every character of a `Paragraph`, a `Heading`, an `Emphasis` or a `Strong` is under a child or is a marker, a space, a tab or a `>`.
- The first child of a `Paragraph` starts where it starts and the last ends where it ends. The children of `Emphasis` and `Strong` lie between their delimiters, and those of a `Link` or an `Image` after its opening bracket.
- The source under a `Text` is its text. An `Escape` is a backslash and one ASCII punctuation character. An `Entity` starts with `&`, ends with `;`, and its text is what the entity table decodes. A `Code` starts and ends with backtick runs of one length, and its text is its source less the runs and less one space at each end when both have one. A `SoftBreak` is empty or one space, and a `HardBreak` is a backslash or two or more spaces.
- `Emphasis` starts and ends with one `*` or `_` and `Strong` with two. A `Link` starts with `[`, an `Image` with `![`, both end with `)` or `]`. An `Autolink` and an `Html` start with `<` and end with `>`.
- A `Quote` starts with `>`. An ATX `Heading` (one line) starts with `#`, a setext one ends at its underline. A `ThematicBreak` is three or more of one of `- * _` and spaces. An `Item` starts with its marker, and the items of a `List` share a bullet or a delimiter. A `Definition` starts with `[`, and an `HtmlBlock` with `<` after up to three spaces that belong to it.
- Every line with text lies in a top-level block.

#### Slow inputs

`e2e/markdown/slow.ts` holds the generators: unclosed pointy destinations, unclosed comments, block quote markers on one line, many definitions, a run of `*` around a letter, backtick runs of growing length, a run of n backticks and then `a` and one backtick, nested list markers and blank lines, nested brackets, unclosed brackets before links, alternating openers, unclosed attribute values, links opened inside destinations, entity-like runs, and a lazy line under deep quotes. Each is pasted at n and 4n, three times each on a page with the pane and on a page without it, from the paste to the status line showing the line count. The parser's share is the best time with the pane less the best time without. A test fails when the share at 4n is over 8 times the larger of the share at n and 200 ms, so the editor's own cost, which is large on one very long line, cancels and tiny shares cannot flake. An input that nests deeper than the limit has its growth judged only, and every other input must show the reference's HTML at both sizes, except one whose reference is itself quadratic at 4n. A quadratic parser that costs under about 0.2 s at n is not caught. n is 1,250 for the two inputs that the editor itself draws slowly (5,000 `>` on one line takes about 0.6 s, 5,000 `*` about 0.3 s, and 20,000 of either 2 to 7 s), and 5,000 for the rest.

## Process

- Tests are end-to-end only. See Testing.
- Prove a change in the running app with the `verify-nullpad` skill (`node e2e/drive.ts`) before calling it done.
- Before a PR is ready, `pnpm test:ready` passes on its tip, and the PR body says so.
- Before a PR is ready, an agent that did not write the change breaks it. It plants bugs, drives the app, and reports what got through.
- Few comments. Name things better instead. Keep a comment only for a fact we cannot change, such as a browser rule. Skip the `// MODEL` section headers that `FOLDKIT.md` suggests.
- Before a PR is ready, a no-comments pass (`/pstack:no-comments`) runs on its diff.
