# nullpad verification map

One file per thing a person does in nullpad. Read this index, then drive the matching file's recipe with `node e2e/drive.ts`.

## Baseline

- Every run starts on an empty note in a fresh browser profile with no notes saved: one empty line, status `1:1 1L`, cursor on row 0 cell 0.
- The window is 1000 by 600 unless the run passes `--width` and `--height`. At 1000 wide a row holds 76 cells.
- `node e2e/drive.ts --doctor` ends with `ok`.

## Conventions

- Build the note with steps. `paste` builds a long note in one step. `type` builds text that a test of typing needs.
- Find a row and cell to click in the screen the previous run printed. Prefer `{row, cell}` over pixels.
- Put an `expect` after each step whose result matters.
- Report a recipe that cannot run with the step that failed and the reason. Never swap in an easier step and report the feature as proven.

## Feature entry contract

Each file opens with what the person sees, then four sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with e2e/drive.ts`, `Gotchas`.

## Features

- [Typing](./typing.md) covers letters, Enter, Tab, Backspace and Delete, including whole-letter Backspace on emoji and accents.
- [Cursor keys](./cursor-keys.md) covers arrows, Home, End, Page Up, Page Down and the Ctrl moves by word and to the note's ends.
- [Clicking](./clicking.md) covers placing the cursor with the mouse on text, wrapped rows and below the last line.
- [Scrolling](./scrolling.md) covers the wheel on long notes and the cursor coming back on screen when a person types.
- [IME and paste](./ime-and-paste.md) covers composing text with an input method and pasting from the clipboard.
- [Notes and finder](./notes-and-finder.md) covers saving notes, reloading, and the Ctrl-P finder with its folders and moves.
- [Vim](./vim.md) covers turning vim on and off, Normal mode motions, counts, `x`, entering and leaving Insert, and the remembered setting.
- [Vim operators](./vim-operators.md) covers `d c y` with motions, doubled keys and text objects, counts on both sides, the shorthands, `p P`, and the store across notes, vim off and a reload.
- [Undo](./undo.md) covers Ctrl-Z, Ctrl-Shift-Z and Ctrl-Y with vim off, `u` and Ctrl-R with counts in NORMAL, how changes group, where the cursor lands, the task box, saving and the history per note.
- [Dot repeat](./dot-repeat.md) covers `.` after deletes, changes, puts and INSERT stays, a count before it, what leaves it alone, undo of a repeat, counts on `i a I A o O`, a replayed Delete key, another note, vim off and on, a reload and the bound.
- [Vim registers](./vim-registers.md) covers `"a` to `"z` and their capitals, `"0`, `""`, `"_`, the prefix with counts, a dot of a put from a register, and the system clipboard as `"+` and `"*`: a write another app reads, a read, a refusal, the 3 second wait and keys typed in it.
- [Vim Visual mode](./vim-visual.md) covers `v` and `V`, motions and text objects on the selection, `o`, `gv`, the operators, `p P` and a paste over a selection, `I` and `A`, a dot of a VISUAL operator, and what leaves VISUAL.
- [Vim blockwise Visual mode](./vim-visual-block.md) covers Ctrl-V, `o` and `O`, `$`, the operators on a block, `I`, `A` and `c` on every line, a block yank put as a rectangle, a dot of a block operator and of `I`, `gv`, a block through a tab and a wide letter, and a paste over a block.
- [Vim replace](./vim-replace.md) covers `r` and a letter with a count, its pending text, Esc as a cancel, `.` and `u`, `r` over V-LINE and over a block with a short line, `r` then Enter over VISUAL, and `r` then Enter in NORMAL.
- [Vim find](./vim-find.md) covers `f F t T` with a letter and a count, its pending text, a find that fails, `;` and `,`, Esc as a cancel, `dt` and `df` with `.` and `u`, a failed find under `d`, and a find and `;` in VISUAL.
