# Typing

A person types into the note as into a browser text box. Letters land at the cursor, Enter splits the line, Tab puts in two spaces, Backspace deletes the whole letter before the cursor and Delete the one after it.

## Sub-features

- `type-text` puts typed characters at the cursor.
- `type-enter` splits the line at the cursor and moves to the start of the new line.
- `type-tab` inserts two spaces.
- `type-backspace` deletes the letter before the cursor, a whole emoji, flag or accented letter at once, and joins a line to the one above at a line start.
- `type-delete` deletes the letter after the cursor, and joins the next line at a line end.

## How to get to it (user POV)

- Click in the page or just start typing. The editor has the keyboard as soon as the page loads.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/typing.json` plays the proof below and ends `PASS`. Copy its steps as the start of a new check.

- **Text.** `{"type": "foo bar"}` gives `foo bar` at `1:8 1L`.
- **Enter.** Three Lefts and Enter give `foo ` and `bar` at `2:1 2L`, the cursor on `b`.
- **Tab.** Tab gives `  bar` at `2:3 2L`.
- **Backspace at a line start.** Home and Backspace join the lines into `foo   bar` at `1:5 1L`.
- **Whole-letter Backspace.** End, a typed family emoji and one Backspace leave `foo   bar` at `1:10 1L`, with no part of the emoji behind.
- **Delete.** Home and Delete give `oo   bar`, the cursor on `o`.
- **Delete at a line end.** A new line `next`, then Up, End and Delete join it into `oo   barnext` at `1:9 1L`, the cursor on `n`.

## Gotchas

- `type` sends each code point as its own key, so a typed emoji arrives as several keys. Use `paste` or `commit` to put a whole cluster in at once.
- There is no selection yet. `Control+a` does nothing and a paste after it lands at the cursor.
- The status column counts letters (grapheme clusters) from 1, not UTF-16 units. A cursor cell counts screen cells, and a wide letter takes two.
- `under` reads `" "` at a line end, the same as a real space. Check `status` to tell them apart.
