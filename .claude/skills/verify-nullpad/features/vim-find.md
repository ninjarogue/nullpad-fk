# Vim find (`f F t T ; ,`)

With vim on, `f` and a letter moves the cursor to the next such letter on its line, `F` to the one before, `t` and `T` to the letter beside it. `;` and `,` repeat the last find, forward and back. They take a count, work after `d c y` with `.`, and move the cursor end in VISUAL, V-LINE and V-BLOCK.

## Sub-features

- `find-normal`: `fx`, `Fx`, `tx`, `Tx` with a count. A find that finds too few letters fails and the cursor stays. `.status .pending` reads `f` or `2f` while it waits.
- `find-repeat`: `;` and `,` repeat the last find, a failed one included.
- `find-cancel`: `f` then Esc, an arrow or another named key cancels, and the next key runs alone.
- `find-operator`: `dtx`, `dfx` and a `.` that repeats them with their own letter; a failed find deletes nothing.
- `find-visual`: `vfx` and `;` grow the selection.

## How to get to it (user POV)

- Turn vim on with Ctrl-, and type `f` and a letter in NORMAL or a VISUAL mode.

## Proof

`node e2e/drive.ts .claude/skills/verify-nullpad/features/vim-find.json`
