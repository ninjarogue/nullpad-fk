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
- A key that needs layout (Left, Right, Delete, Home, End, Up, Down, Page Up, Page Down) or a click makes the core return a `Query` and queue every input after it. `src/surface.ts` answers it once the DOM shows the core's `revision`, with `Selection.modify` and `caretPositionFromPoint` on the drawn lines, and `CompletedLocate` lands the answer and replays the queue. The core never reads layout and the shell never moves the caret from a stale frame.
- `src/surface.ts` draws the lines of `Editor.paint`: one `.line` per text line, wrapped by CSS, each piece between joins its own text node, one spacer row per undrawn line above and below, and a `#caret` overlay placed from a Range rect after each patch. `.surface` scrolls natively and reports its first line and its height in rows.
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
pnpm lint        # oxlint with the Foldkit and Effect presets, read-only
pnpm typecheck   # the shell (tsconfig.json) and the core (src/core/tsconfig.json)
pnpm arch        # import rules and the one-keyboard check
pnpm build
```

`.githooks/pre-push` runs them in that order. `pnpm install` turns the hook on (`prepare` sets `core.hooksPath`) and applies the Effect lint patch to `node_modules` (`postinstall`). `lint` itself changes nothing.

Use pnpm, never npm or npx. `package.json` pins its version for corepack. pnpm fails the install when a dependency has a build script it was not told to run, so a dependency that needs one goes under `allowBuilds` in `pnpm-workspace.yaml`.

## Process

- No tests yet. The test approach is chosen with pstack before the first test is written. Ignore the Testing section of `FOLDKIT.md` until then.
- Before a PR is ready, an agent that did not write the change breaks it. It plants bugs, drives the app, and reports what got through.
- Few comments. Name things better instead. Skip the `// MODEL` section headers that `FOLDKIT.md` suggests.
