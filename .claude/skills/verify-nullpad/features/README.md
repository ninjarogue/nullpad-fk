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
