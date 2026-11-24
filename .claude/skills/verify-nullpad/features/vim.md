# Vim

A person turns vim on with Ctrl-, or the `vim off` button in the status line. The status line then says NORMAL, letters move the block cursor instead of typing, and `i a I A o O` switch to INSERT, where the cursor is a thin bar and keys type as they do with vim off. Esc goes back to NORMAL. The setting survives a reload.

## Sub-features

- `vim-toggle` turns vim on and off with Ctrl-, or `.status .toggle-vim`, and remembers it across a reload.
- `vim-motions` moves with `h j k l w b e 0 ^ $ gg G`, the arrows, Home and End, each with a count.
- `vim-pending` shows a count or a waiting `g` in `.status .pending`. Esc, Ctrl-P, Ctrl-E and a click drop it.
- `vim-delete` deletes the letters under the cursor with `x` and a count, never past the line end.
- `vim-insert` enters Insert with `i a I A o O` and leaves it with Esc, one letter left.
- `vim-clamp` keeps the cursor on a letter in Normal, after a click too.
- `vim-ime` drops IME text in Normal, and an IME conversion in Insert after swallowed Normal keys replaces only what it should.

## How to get to it (user POV)

- Press Ctrl-, or click `vim off` at the end of the status line.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/vim.json` plays the proof and ends `PASS`. It pastes four lines, checks `EDIT`, turns vim on and walks the motions, a pending `2g` and Esc, `x`, a letter that does nothing, `A`, `O`, a pending `g` across the finder, a click past a line end, an IME commit in Normal, an IME replacement after swallowed keys, and the setting across two reloads.

## Gotchas

- Use `Control+Comma` for the toggle. Normal keys are typed with `type`, so `{"type": "2g"}` presses `2` then `g`.
- Expected positions come from Vim: `vim -u NONE -N -es`. Without `-N` Vim runs Vi-compatible, where `9j` on a three-line note does not move.
- `$` makes `j` and `k` stay at line ends until a horizontal move.
- A reload keeps the setting. `reset` and a fresh run clear it, as they clear notes.
