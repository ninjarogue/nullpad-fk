# Vim replace (`r`)

With vim on, `r` and a letter puts that letter in place of letters, in NORMAL and over a VISUAL, V-LINE or V-BLOCK selection.

## Sub-features

- `replace-normal`: `rx` replaces the letter under the cursor, `3rx` three letters with the cursor on the last. `r` then Enter breaks the line. `.status .pending` reads `r` or `3r` while it waits.
- `replace-cancel`: `r` then Esc, an arrow or another named key cancels, and nothing changes.
- `replace-dot-undo`: `.` repeats the letter and the count, and one `u` brings the letters back.
- `replace-visual`: `rx` over a selection replaces every letter of it and returns to NORMAL. `r` then Enter over VISUAL or V-LINE does nothing and keeps the selection.
- `replace-block`: `rx` over a block replaces its screen columns; a short line is replaced to its end.

## How to get to it (user POV)

- Turn vim on with Ctrl-, and type `r` and a letter in NORMAL or a VISUAL mode.

## Proof

`node e2e/drive.ts .claude/skills/verify-nullpad/features/vim-replace.json`
