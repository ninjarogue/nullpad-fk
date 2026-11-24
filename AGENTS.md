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

## Notes and finder

- `src/core/notes.ts` holds the `Note` record, its title and the folder helpers. A folder is a note's path prefix and exists while a note is in it. A folder path drops empty, `.` and `..` segments. `src/core/fuzzy.ts` scores titles and paths fzf-style over graphemes. `src/core/finder.ts` is the finder's state, fed the same `Input`s as the editor.
- While the finder is open, `update` sends every `Input` to `Finder.feed` instead of `Editor.feed`, and the port's EditContext holds the finder prompt (`Finder.surrounding`), so `keyboard.ts` stays the one keyboard. The port's `data-control` and `data-selection` name the elements whose rects `keyboard.ts` hands the EditContext, so an IME window sits at the prompt. Ctrl-P opens it. Chrome keeps Ctrl-N for a new window, so that chord never reaches the page.
- `src/storage.ts` keeps one IndexedDB record per note in database `nullpad`, store `notes`. The `NoteStore` service holds the connection and the BroadcastChannel `nullpad-notes`, which carries every save and removal to the other tabs, and offers list, read, write and remove with an expected revision, and the stream of changes. `entry.ts` passes its Layer as the runtime's `resources`, so Flags, Commands and Subscriptions share one connection and the runtime closes it at teardown. Boot reads every note through the `flags` Effect before the first render and opens the one edited last. When IndexedDB cannot open or a write fails, the status line says notes are not being saved and the editor keeps working.
- A text change starts an 800 ms wait. A save goes out when no change came after it, at once on a switch of notes, and when the page hides. Saves of the open note go out one at a time, each expecting the revision the last one confirmed. A change from another tab that arrives while a save is out waits until it settles. A change from another tab that keeps the text this tab last saved, such as a move, takes its folder and revision under this tab's unsaved edits. Whenever the store moved to other text under text this tab has not saved, this tab's text goes into a conflict copy. A note that goes blank is removed from the store at its save moment and leaves the list, and typing again saves it anew.
- Effect's runMain stops the app at `pagehide`, and an unloading page does not finish IndexedDB work. So `entry.ts` listens to `pagehide` before the runtime starts and writes the open note's unsaved text, and the text of notes left mid-save, to localStorage through Effect's `KeyValueStore` as `nullpad-draft:<tab>:<id>`, with the revision it was based on. Boot takes every draft. A draft whose note is still at that revision, or at the one its own save in flight made, reopens and saves. A blank one removes its note. Any other becomes a conflict copy.
- The finder draws at most 60 rows around the selection, ranks only the last matches while the query grows, and caches each text's graphemes and bonuses, so a keystroke over 2,000 notes stays near one frame.

## Read view

Ctrl-E, or the `read ^E` button at the end of the status line, swaps the editor for the note drawn as markdown. Ctrl-E or Esc swaps it back, with the cursor and the editor's scroll where they were. The status line's mode says READ.

- `src/core/reading.ts` turns `Markdown.parse` of the buffer's lines into a `Page`: one `Shown` per top-level block, with its first source line, the lines it spans and a small tree of what the view draws. A definition draws nothing. Raw HTML stays text. A link whose destination starts with `javascript:`, `vbscript:`, `file:` or `data:`, read as a browser reads it (tabs and line feeds removed, control characters and spaces trimmed from the ends, any case), is drawn as its text. An image is drawn only from `http:`, `https:` or a `data:image/` gif, png, jpeg or webp, and otherwise as its alt text. `page` keeps its result for each lines array, so a text is parsed once.
- `act` in the core decides what an `Input` does in the read view. Esc and Ctrl-E close it, Ctrl-P opens the finder, Up, Down, Page Up, Page Down, Ctrl-Home and Ctrl-End scroll, and every other input does nothing. A new key goes in its `keys` table.
- The Model's `screen` is `Edit`, `Opening` or `Read`. Ctrl-E pressed while the editor waits for a layout answer moves to `Opening`, which holds every input after it until the answer lands. The keys before Ctrl-E reach the editor and the keys after it reach the read view.
- `src/reading.ts` draws the page in `.read`, the scroll container. Each top-level block carries `data-source-line`, the gutter's number for its first line. Only the blocks within 125 lines (or a screen, if that is more) of the top line are drawn, with a spacer of one row per line for the rest, as in the editor. `.read` reports its top line as it scrolls. A scroll that lands on a spacer pins the block there to the top once it is drawn, because the spacer's height is a guess.
- Opening the read view scrolls the block that holds the cursor's line to the top. Opening another note from the finder returns to the editor.
- Closing it draws a new `.surface`. Each scroll report carries the surface's `scrollTop`, and the Model keeps the last one, so closing puts the editor back to the pixel. The surface reports its size only when its box changed, so a new surface of the same size is not a resize and does not scroll to the cursor.
- While the read view is open the port's `data-control` names `.read`. Text typed there still reaches the EditContext and is thrown away, so `keyboard.ts` sets the EditContext's text again whenever `data-control` changes.
- Opening the read view on a 10,000-line note takes about 170 ms to the first paint, and about 130 ms of that is `Markdown.parse`. Opening it again on the same text takes about 25 ms.

## Markdown

The parser is written for nullpad, uses no library and follows CommonMark 0.31.2. It reads a note's lines and returns a tree in which every node knows its place in the note. The read view draws the tree. The default screen is the editor.

- `src/core/markdown.ts` is the whole public surface: `parse(lines)`, `toHtml(document)`, `outline(document)`, `positionOf(placed, point)` and the tree's types. The parts live under `src/core/markdown/`.
- A `Document` holds `lines`, `sections` and `definitions`. A section is one top-level block and the blank lines after it, so it holds whole lines. A place in a section is a `Point`: `lineInSection` and a UTF-16 `column`. `positionOf` is the one function that adds the section's first line. Every node has a half-open `span`. A paragraph or a heading keeps one slice per line.
- `parse` makes two passes. The block pass in `blocks.ts` folds over the lines with an immutable state and returns the sections. The inline pass in `inlines.ts` then reads each paragraph and heading: tokens, a delimiter stack for emphasis in `emphasis.ts`, and a bracket stack for links. A link reference definition is a block in the tree, and `toHtml` leaves it out.
- The parser has no `for`, no `while` and no `let`. A walk whose length follows the note is a fold or a regex, and no regex nests one quantifier in another. Recursion stops at `deepestNesting`, so parsing time grows in line with the note.
- `deepestNesting` is 100. It counts the levels of the tree: a block quote, a list and a list item are one level each, and so are emphasis, strong emphasis, a link and an image. A marker that would open level 101 stays text.
- `toHtml` writes the HTML of the spec's examples, character for character. nullpad draws that string as text and never puts it in the page as markup.
- `/?pane=html` and `/?pane=outline` draw `Editor.html` or `Editor.outline` as text in a `<pre class="pane">` under the editor. The `flags` Effect in `src/main.ts` reads the flag once at boot into the Model. The pane is there for tests. Without the flag the page has no pane, and the parser runs only when the read view opens.

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
| The shell imports only `src/core/editor.ts`, `src/core/input.ts`, `src/core/notes.ts`, `src/core/finder.ts` and `src/core/reading.ts` from the core.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `pnpm arch`, rule `shell-imports-core-internals`                                                           |
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
pnpm test:all    # on demand only: the push gate, every sweep, the markdown grids and the slow checks
```

`.githooks/pre-push` runs all but `test:all` in that order and gives the tests the build it just made. `pnpm install` turns the hook on (`prepare` sets `core.hooksPath`) and applies the Effect lint patch to `node_modules` (`postinstall`). `lint` itself changes nothing.

Use pnpm, never npm or npx. `package.json` pins its version for corepack. pnpm fails the install when a dependency has a build script it was not told to run, so a dependency that needs one goes under `allowBuilds` in `pnpm-workspace.yaml`.

## Testing

The only tests are end-to-end tests: Playwright Test drives the production build in headless Chromium with trusted input, the way a person types, clicks and scrolls. Write no unit tests and no Foldkit story or scene tests, and ignore the Testing section of `FOLDKIT.md`.

A test reads only the screen: the drawn rows (`[data-line-id]`, `[data-start]`, `[data-n]`, with `[data-ghost]` spans left out as not text), the drawn cursor `#caret`, the status line's `line:column NL`, the text of the pane (`.pane`) on a page opened with `/?pane=html` or `/?pane=outline`, and pixels from a screenshot. It never reads app state or a window global. It sends input only through `page.keyboard`, `page.mouse` and CDP `Input.*` (paste, IME, raw key events). A test may listen for an event on `window` to see what the browser was left to do, such as whether a keydown was cancelled. A test may add an element outside the app, such as an `<input>` that takes the keyboard, to stand for the rest of a page.

nullpad keeps notes across reloads, so a test that loads the page again in the same browser context does it with `openFresh(page)` from `e2e/nullpad.ts`. It leaves the page, then clears the notes database and the localStorage drafts the leaving page wrote, as a fresh browser profile would. A plain reload brings the last note back, unsaved text included.

A bug fix starts with a scenario that fails on the bug. Run it on the broken build, see it fail, fix the code, see it pass.

### Run

```sh
pnpm test:e2e                       # builds, then runs the push gate: scenarios, named scripts and the every-push sweeps
pnpm test:all                       # builds, then runs everything, on demand only
pnpm test:e2e -g "huge wheel"       # tests whose name matches
pnpm test:e2e --trace on            # keeps a trace of each test; open one with pnpm exec playwright show-trace
NULLPAD_DIST=/path/to/dist pnpm test:e2e   # tests a build made elsewhere, such as an old commit, without building
```

Without `NULLPAD_DIST`, Playwright builds the working tree into `dist/` first, so a run always tests the current source. Traces are off by default. Pass `--trace retain-on-failure` to keep them for failing tests only.

Playwright runs one and a half workers for each core (`workers: '150%'` in `playwright.config.ts`). A test spends much of its time waiting for frames, so one worker for each core left about a quarter of the CPU idle. With 8 workers on 4 cores the slowest scenario took 49 of its 60 seconds.

On a machine without Playwright's Chromium, install it once with `pnpm exec playwright install chromium`. Cloud sessions have it at `/opt/pw-browsers` already. The `@playwright/test` version in `package.json` must match that browser's revision.

### Layout

| File                                                                                | What it covers                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/nullpad.ts`                                                                    | The `nullpad` fixture: opens the app and reads the screen (`screen()`, `text()`, `status()`, `cursor()`, `inkIn()`), and sends input.                                                                                                                                                                                   |
| `typing`, `ime`, `paste`, `pointer`, `layout`, `wrap` `.spec.ts`                    | Scenarios, one feature each. Every bug found so far has one here. `wrap` also checks where lines break against a textarea of the same width (`textareaRowStarts`).                                                                                                                                                      |
| `browser-support.spec.ts`                                                           | A browser without EditContext shows that nullpad needs Chrome or Edge instead of an editor that takes no typing.                                                                                                                                                                                                        |
| `e2e/pane.ts`, `pane.spec.ts`                                                       | The `pane` fixture: opens `/?pane=html` or `/?pane=outline`, pastes a note through the editor and returns the pane's text (`timedPaste` also times the paste, on a page with the pane or without one). The scenarios check the outline's rows, that the default screen has no pane, and that raw HTML is drawn as text. |
| `commonmark.spec.ts`, `e2e/markdown/examples.ts`                                    | The 652 examples of CommonMark 0.31.2, read from `commonmark-spec`. Each is pasted through the editor, and the HTML pane must show the example's HTML to the character. One test per section of the spec.                                                                                                               |
| `markdown-sweep.spec.ts`, `e2e/markdown/grids.ts`, `reference.ts`, `differences.ts` | The markdown grids: every short string over an alphabet, every stack of one to three line shapes, each compared with `commonmark@0.31.2` run in the test process. They run on demand. See Markdown tests.                                                                                                               |
| `markdown-places.spec.ts`, `e2e/markdown/places.ts`                                 | Reads the outline pane and checks the rules that hold for any note: children lie inside their parent, the source under a node has the shape of its tag, and no line with text lies outside the top-level blocks. The notes are the 652 spec examples.                                                                   |
| `markdown-limits.spec.ts`                                                           | Scenarios whose expected value the spec or this file decides and a reference cannot give: where a setext heading ends, the nesting limit, the length of an autolink scheme.                                                                                                                                             |
| `markdown-slow.spec.ts`, `e2e/markdown/slow.ts`                                     | Inputs that a careless parser reads in quadratic time. Each is pasted at n and 4n, and the time the pane adds to the paste must grow in line with the size. They run on demand.                                                                                                                                         |
| `click-sweep.spec.ts`                                                               | Clicks a grid across the whole window and checks that the cursor lands on the nearest drawn character boundary each time.                                                                                                                                                                                               |
| `extremes.spec.ts`                                                                  | Giant and tiny wheel turns, 120,000-line pastes, line counts crossing 9,999 and 99,999, very long lines, AltGr keys, IME compositions.                                                                                                                                                                                  |
| `sweep.spec.ts`, `e2e/typist/sweeps.ts`                                             | The sweeps: grids of scripts, each compared with a textarea. They run on demand.                                                                                                                                                                                                                                        |
| `typist.spec.ts`, `typist-flicker.spec.ts`, `e2e/typist/`                           | The named scripts, which run on every push, and the typist flicker checks, which run on demand. `run.ts` holds the comparison and `script.ts` the named scripts and accepted differences.                                                                                                                               |
| `e2e/drive.ts`, `.claude/skills/verify-nullpad/`                                    | Not a test. Plays a JSON list of steps on a fresh build with the fixture's driver, prints the screen after each step and saves evidence. The `verify-nullpad` skill says how, and its `features/*.json` are runnable proofs of each feature.                                                                            |
| `e2e/mcp.ts`, `e2e/steps.ts`, `scripts/build-stamp.ts`                              | Not a test. The `nullpad` MCP server keeps headless Chromium open on the build in `dist/` and plays one step for each tool call with the player in `steps.ts` that `drive.ts` uses. `drive.ts` replays its recording. See The nullpad MCP server.                                                                       |
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

Two kinds of script run. Named scripts run on every push. Sweeps run on demand, with `pnpm test:sweep` or `pnpm test:all`.

#### Named scripts

`namedScripts` in `e2e/typist/script.ts` holds every script that once broke, each as its shortest form. `pnpm test:typist` plays them.

#### Sweeps

A sweep covers one class of bugs with a grid of scripts. It plays the same scripts on every run, so a failing row fails again until the bug is fixed. `e2e/typist/sweeps.ts` holds the table and `e2e/sweep.spec.ts` plays it.

A sweep has a `name` that states its rule in plain words, `runs` that says whether it plays on every push or on demand, and these lists.

- `documents`. Each has a name and the steps that build it.
- `placements`. Each has a name, the steps that put the cursor in a document, and its `moves`. A move is a short script, such as one key and then `y`, so the text shows where the cursor stood.

A row is one document, one placement and one move. Its script is the document's steps, the placement's steps and the move, in that order. `scripts` holds the number of rows as a literal. A test fails when the grid has another size, so a grid that shrinks shows as a changed number in the diff.

A row types every step before its last placement step back to back, without comparing. It then compares after that step, where the placement left the cursor, and after each step of the move. A comparison at the end of the row alone would cost about as much: nullpad answers one layout key a frame, so the move's keys take their frames anyway, and a single wait after a burst of them reads a caret that has not landed yet. A row passes when nullpad and the textarea agree each time, or when an accepted difference covers the text. A failing row prints as `document | placement | move | differs after step N of M | nullpad L:C textarea L:C | text same: true`. A row that throws prints `threw:` and the error in place of the step. The rows go round-robin to `TYPIST_SHARDS` shards (8 by default), and each shard prints how many rows it checked, how many differ, and how many differences each accepted difference covered.

The sweeps today:

- Up or Down, any key, Up or Down lands where a textarea lands. Runs on demand. 6 documents (three short lines, a wrapped line of words, a long word that moved to the next row, one word longer than a row, a full row that ends in spaces, and rows of emoji and accents), 7 placements, and 52 moves in each: Up or Down, then any of 13 keys, then Up or Down. 2,184 rows, about 3 minutes on 4 cores.
- One Backspace, Delete, Left or Right takes what a textarea takes around emoji, flags and accents. Runs on demand, as two sweeps. The documents are twelve pieces (a letter, an accent, two flag letters, a thumbs up, a skin tone, a man, a ZWJ, a heart, a variation selector, a Devanagari letter and a virama) in every ordered pair, and seven fixed documents (two of Hangul, a keycap, a family of three, a family of four and a kiss with skin tones, which are letters of 11 and 15 UTF-16 units, and a flag split by an x). Each move is one key and then `y`.
  - Typed in order: 151 documents, 3 placements (at the end, at the start, one Right from the start). 906 rows.
  - Met at a line join, or typed one in front of the other: 302 documents, the same 3 placements and where the build left the cursor. 3,020 rows.

The second rule has 54 named scripts on every push. Add a row only for a shape the grid does not reach. When a bug turns up, run the sweep on the broken build first and see the new row fail.

1. If the bug fits a sweep's rule, add the document that shows it. If the bug needs a cursor spot or a key the grid lacks, add a placement or a move too. Set `scripts` to the new count.
2. If the bug breaks another rule, add a sweep to `sweeps` with its own name, documents, placements, `scripts` and `runs`.
3. Add the shortest failing script to `namedScripts`. The sweep finds the neighbors of the bug, and the named script keeps the bug itself.

`pnpm test:sweep` plays every sweep alone.

#### Commands

```sh
pnpm test:e2e      # the push gate: scenarios and named scripts
pnpm test:all      # on demand: the push gate, every sweep, the markdown grids, the slow checks and the typist flicker checks
pnpm test:sweep    # every sweep alone
pnpm test:typist   # the named scripts alone
```

#### Accepted differences

Where a malformed sequence makes Chrome's textarea or EditContext disagree with `Intl.Segmenter`, nullpad follows `Intl.Segmenter`. A mismatch counts as accepted, not failed, only when the text before the step, the textarea's text after it, or the piece a Backspace was judged on holds one of these. A piece that starts at a line join can be malformed where the whole line is not, such as a ZWJ that starts one. nullpad's own text after the step does not count, so a bug that leaves a broken letter behind is not excused. They are listed in `acceptedDifferences` in `e2e/typist/script.ts`:

- ZWJ next to a non-pictograph.
- A mark, ZWJ or skin tone on a flag letter.
- A skin tone after a character that takes none.
- A virama with no letter before it.
- A variation selector not after a pictograph.
- A mark on a space.

Each sweep shard reports how many mismatches each accepted difference covered.

### The nullpad MCP server

`.mcp.json` registers `nullpad`, a stdio MCP server (`node e2e/mcp.ts`). It keeps one headless Chromium open on the build in `dist/`, so a key press answers in about 50 ms, where a `drive.ts` run spends several seconds on a build, a server and a browser first. It is not a test. Use it to explore, then replay its recording with `drive.ts` as the proof.

- **One driver.** The server plays each step with `play` from `e2e/steps.ts` and the fixture's driver, the code that `drive.ts` runs. `type`, `press`, `paste`, `compose`, `commit`, `click`, `wheel`, `resize` and `screenshot` each play one step, and `batch` plays a list. A new kind of step goes in `e2e/steps.ts`. It gets a row in `tools` in `e2e/mcp.ts` only if it needs a tool of its own.
- **Recording.** The server appends each step that plays to `verify-out/mcp-<time>-<pid>/<n>/steps.json`, and `checkpoint` appends an `expect` of the current screen. `node e2e/drive.ts <that file>` replays the recording on a fresh build. A recording belongs to one page. `reset` and a reload each start the next recording in the next numbered folder, so every recording starts from an empty editor. `reset` takes `steps_file` to write the recording elsewhere. A step that throws and an `expect` that fails are not recorded.
- **Reload.** Every `vite build` ends by writing `dist/build-stamp` (`scripts/build-stamp.ts`), the first 12 hex digits of the SHA-256 of the built `index.html`. Before each tool call the server compares that file with the stamp of the page it has open. If they differ, it opens a fresh page and starts its result with `reloaded:`. A `batch` is one call, so no reload lands inside it. While a build is being written, `dist/` has no stamp, and the server waits up to 10 seconds for one.
- **No build.** The server never builds. While a file under `src/` is newer than the stamp, each result ends with `stale:` and the fix, `pnpm build`.
- **Page errors.** A result that carries `PAGE ERROR` is marked as an error, because a `drive.ts` replay of that recording fails.
- **Another build.** `NULLPAD_DIST=/path/to/dist` serves that build, which needs its own `build-stamp`.

The `verify-nullpad` skill lists the tools and their arguments.

### Markdown tests

Each group catches a kind of bug no other group catches; the last column says which bug it caught alone when it was built. The push gate has a budget of about 3 minutes in all, so a slow group runs on demand.

| Group                     | Rule                                                                                                     | Rows                  | Runs       | Planted bug it caught alone                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `commonmark.spec.ts`      | The pane shows each example's HTML                                                                       | 652                   | every push | Emphasis ignoring the rule of three, and link labels matched without case folding (`ẞ` against `SS`).                              |
| `markdown-places.spec.ts` | The outline keeps the place rules, over the 652 examples                                                 | 652 notes, in batches | every push | A quote span ending a line late, a closing fence span ending a column late, an image span starting at `[` instead of `!`.          |
| `markdown-limits.spec.ts` | Exact values: heading end, nesting limit, autolink scheme length                                         | 3 scenarios           | every push | Written for a setext span that ends past a trailing-space underline, a limit off by one beside a quote, a scheme of 33 letters.    |
| Grid: entities            | Every HTML5 entity name and numeric references at the edges decode as the reference does                 | 15,145                | on demand  | `&#x10FFFF;` decoded wrong.                                                                                                        |
| Grid: raw HTML parts      | Every string of up to 3 raw HTML parts after `x ` reads as the reference does                            | 3,615                 | on demand  | A raw HTML attribute name that loses `-`.                                                                                          |
| Grid: definition parts    | One to three lines of 16 definition parts and neighbours make the blocks and links the reference makes   | 4,368                 | on demand  | A type-7 HTML block interrupting a lazy paragraph line.                                                                            |
| Grid: line shapes         | One to three lines of 16 shapes, with tabs and ordered markers of any start, make the reference's blocks | 4,368                 | on demand  | Written for a tab always 4 columns wide, and an ordered marker not starting at 1 interrupting a paragraph.                         |
| Grid: link parts          | A link or an image with each destination, gap, title and end reads as the reference does                 | 3,168                 | on demand  | Written for a link title with no whitespace before it.                                                                             |
| `markdown-slow.spec.ts`   | The parser's share of the paste grows in line with n, at n and 4n                                        | 17 inputs             | on demand  | Written for two quadratic cases: a closing backtick run searched again from each opener, and emphasis closers that find no opener. |

`pnpm test:markdown` plays every markdown spec with the on-demand groups. `NULLPAD_ALL=1` plays them, the rest are skipped.

#### Grids against the reference

A grid has a `name` that states its rule in plain words, `rows` as a literal that the test checks, and `units`, the notes that are pasted. A test fails when the grid has another size, so a grid that shrinks shows as a changed number in the diff. `e2e/markdown/grids.ts` holds the table and `e2e/markdown-sweep.spec.ts` plays it.

A unit is one paste. Where a case cannot reach its neighbour, many cases share a note, each followed by a blank line, a sentinel block (`<!-- -->`) and a blank line. The note's HTML is compared with the reference's HTML for the same note, and both are cut at the sentinel's HTML into one piece per case. The first pieces that differ are printed with their source. A case joins a batch only when the reference shows it alone with the sentinel after it as its own HTML plus the sentinel's, so no case can open a comment or a list that swallows the next. A case that fails this test is pasted alone in the definition grid, and left out of the raw HTML, entity and link grids. Every stack of line shapes is pasted alone. A row passes when the pane shows the reference's HTML, or an accepted difference covers the case.

- Raw HTML parts: `<a`, `</a`, `<!--`, `-->`, `<?`, `?>`, `>`, `/>`, ` b`, `=`, `"x"`, `'x'`, `x`, `!` and `--`, one to three of them after `x `.
- Entities: every name of the entity table spelt seven ways (with and without the semicolon, with a letter after it, case flipped, in a link title and destination and in a code span), and 90 numeric references at the edges of their ranges, each alone, between letters and in a link title.
- Definition parts: one to three lines of `[a]: /u`, `[a]:`, a bare and a pointy destination, three kinds of title, two broken titles, a definition with a title, `[a]`, `a`, a blank line, and a definition indented by two spaces, by four and in a quote.
- Line shapes: `a`, a blank line, tabs at the start, after a space, after `-`, after `> ` and after `1.`, a quote, a bullet, an indent, `1.`, `0.` and `2.` items, `---`, `===` and a definition.
- Link parts: `[a](` or `![a](`, one of 9 destinations (none, bare, pointy, an unclosed pointy, empty pointy, with a space, with parentheses, with an escaped parenthesis), a gap of none, a space, a tab, a line end or both, one of 6 titles (none, three kinds of quote, an unclosed one, one followed by `x`) and a space, a line end or nothing before `)`, with and without a definition of `[a]`. A gap between the destination and a title is the case the grid is for: `[a](<b>"t")` is text.

`MARKDOWN_SHARDS` sets the number of parallel tests per grid (4 by default). Each shard prints how many rows it checked, how many differ, and how many differences each accepted difference covered. The grids take about 3.7 minutes on 4 cores, and with the slow inputs and the every-push tests the markdown files take 4.6 minutes. The every-push markdown tests alone take 33 s.

When a bug turns up, first ask whether a spec example, a place rule or a scenario catches it. Add the shortest note to the grid whose rule it breaks only when none can, and set `rows`.

#### Accepted differences from the reference

`acceptedDifferences` in `e2e/markdown/differences.ts` has an entry for each difference under "Differences from commonmark.js" that a grid can meet: the numeric references from U+0080 to U+009F (entities), and a definition repeated before a setext heading and a paragraph of only definitions that ends at a `---` line (line shapes). The nesting limit, a symbol outside the BMP beside `*` or `_`, Unicode whitespace at the end of a line and a `&#32;` before a line ending have no entry, because no grid has a note that shows them. An entry has a `covers(markdown)` that reads the note the case came from, never nullpad's output, and an `example` that the spec text decides. A test pastes each example, and the pane must show the spec's HTML where the reference shows something else. Another test checks that no entry covers an example of the spec, so an entry cannot grow wide unseen. A mismatch that no entry covers fails the row. A grid that can meet another difference gets its entry in the same diff.

#### Outline places

`e2e/markdown/places.ts` reads the outline pane by its documented format and checks each row against the note that was pasted. The notes are the 652 spec examples, grouped into notes of up to 40 that the reference shows do not run into each other (the rest alone). The rules:

- Every place lies in the note, and the start is not after the end. Only a `SoftBreak` is empty.
- A top-level node is a block, and each node sits under a parent that can hold it. A child lies inside its parent, and siblings are in order and do not overlap.
- Every character of a `Paragraph`, a `Heading`, an `Emphasis` or a `Strong` is under a child or is a marker, a space, a tab or a `>`.
- The first child of a `Paragraph` starts where it starts and the last ends where it ends. The children of `Emphasis` and `Strong` lie between their delimiters, and those of a `Link` or an `Image` after its opening bracket.
- The source under a `Text` is its text. An `Escape` is a backslash and one ASCII punctuation character. An `Entity` starts with `&`, ends with `;`, and its text is what the entity table decodes. A `Code` starts and ends with backtick runs of one length, and its text is its source less the runs and less one space at each end when both have one. A `SoftBreak` is empty or one space, and a `HardBreak` is a backslash or two or more spaces.
- `Emphasis` starts and ends with one `*` or `_` and `Strong` with two. A `Link` starts with `[`, an `Image` with `![`, both end with `)` or `]`. An `Autolink` and an `Html` start with `<` and end with `>`.
- A `Quote` starts with `>`. An ATX `Heading` (one line) starts with `#`, a setext one ends at its underline. A `ThematicBreak` is three or more of one of `- * _` and spaces. An `Item` starts with its marker, and the items of a `List` share a bullet or a delimiter. A `Definition` starts with `[`, and an `HtmlBlock` with `<` after up to three spaces that belong to it.
- Every line with text lies in a top-level block.

#### Scenarios with an exact value

`e2e/markdown-limits.spec.ts` holds the checks whose expected value is not in a reference. Each assertion message gives its derivation.

- A setext heading ends where its underline ends (section 4.3 lets spaces and tabs follow the underline), so `Foo` over `===   ` is `Heading 1:0-2:3`.
- The nesting limit is 100 levels, and a quote, a list and an item are one level each. A quote and 49 lists make 99 levels and the 50th list marker stays text. 50 lists alone make 100. 100 quote markers open 100 quotes and the 101st stays text.
- An autolink scheme is 2 to 32 characters (section 6.5), so 32 letters make a link and 33 stay text.

#### Slow inputs

`e2e/markdown/slow.ts` holds the generators: unclosed pointy destinations, unclosed comments, block quote markers on one line, many definitions, a run of `*` around a letter, backtick runs of growing length, a run of n backticks and then `a` and one backtick, a backtick and a letter n times, n openers `*a ` then n closers `b_ `, nested list markers and blank lines, nested brackets, unclosed brackets before links, alternating openers, unclosed attribute values, links opened inside destinations, entity-like runs, and a lazy line under deep quotes. Each is pasted at n and 4n, three times each on a page with the pane and on a page without it, from the paste to the status line showing the line count. The parser's share is the best time with the pane less the best time without. A test fails when the share at 4n is over 8 times the larger of the share at n and 200 ms, so the editor's own cost, which is large on one very long line, cancels and tiny shares cannot flake. An input that nests deeper than the limit has its growth judged only, and every other input must show the reference's HTML at both sizes, except one whose reference is itself quadratic at 4n. A quadratic parser that costs under about 0.2 s at n is not caught. n is 1,250 for the two inputs that the editor itself draws slowly (5,000 `>` on one line takes about 0.6 s, 5,000 `*` about 0.3 s, and 20,000 of either 2 to 7 s), 40,000 for the backtick and letter input, 2,500 for the opener and closer input and 5,000 for the rest. On this build the backtick and letter input shares 504 ms at 40,000 and 2,040 ms at 160,000, and the opener and closer input 94 ms at 2,500 and 305 ms at 10,000. A parser that is quadratic on them takes about 17 s at 160,000 backticks and 50 s at n=20,000 openers, which is over 8 times the share at n.

## Process

- Tests are end-to-end only. See Testing.
- Prove a change in the running app with the `verify-nullpad` skill (`node e2e/drive.ts`) before calling it done. The `nullpad` MCP server is for trying things out. Its recording is a proof once `drive.ts` replays it.
- Every PR passes the pre-push hook: quick checks and the push gate, about 3 minutes. Nothing else runs as a gate. `pnpm test:all` runs on demand, such as after a change to the area a sweep covers.
- A PR adds a test only when it fixes a real bug (one scenario that fails on the bug) or opens a kind of bug no test can catch. Most PRs add none.
- A PR that changes app behavior gets one break-it pass: an agent that did not write the change drives the app, about 10 minutes, and reports what broke. A PR that only changes tests or tooling skips it.
- No planted-bug runs, random scouts or nightly runs.
- Few comments. Name things better instead. Keep a comment only for a fact we cannot change, such as a browser rule. Skip the `// MODEL` section headers that `FOLDKIT.md` suggests.
- Before a PR is ready, a no-comments pass (`/pstack:no-comments`) runs on its diff.
