# Dot repeat and counts on inserts

With vim on, `.` in NORMAL does the last change again at the cursor, and a count before `i a I A o O` types the stay's text that many times when Esc ends it.

## Sub-features

- `dot-change` repeats a delete (`x`, `dd`, `dw`, `D`), a change with its typed text (`ciwnew<Esc>`, `S`, `C`), a put (`p`, `P`) and an INSERT stay (`A;<Esc>`, `ohello<Esc>`), Backspace, Enter and Delete included.
- `dot-count` replaces the count of the change with the count before `.`, and keeps the new one: `3x`, `2.`, `.` deletes 3, 2 and 2.
- `dot-kept` is left alone by `u`, Ctrl-R, a yank, a motion and a command that fails (`dj` on the last line). A stay that typed nothing still replaces it: after `xi<Esc>` a `.` inserts nothing.
- `dot-undo` makes one `.` one change: `u` takes back the whole repeat and Ctrl-R puts it back.
- `insert-count` types the text of a counted stay that many times: `3ix<Esc>`, `2Aab<Esc>`, `3ohi<Esc>`, `2Ohi<Esc>`. The count waits in `.status .pending`. One `u` takes back all of it, and `.` repeats it with its count. A count on a change (`2cw`) belongs to the operator.
- `dot-layout` replays a Delete key typed in INSERT, which asks the layout once a copy. Keys typed right behind the `.` land after its replay.
- `dot-across` keeps what `.` repeats over another note from the finder and over vim off and on. A reload empties it.
- `dot-bound` lowers a huge count: `9999999i-<Esc>` types 20,000 letters and the page stays live.

## How to get to it (user POV)

- Turn vim on with Ctrl-, and type the keys in NORMAL.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/dot-repeat.json` plays the proof and ends `PASS`. On the build before dot repeat it fails at step 6, where `x.` deletes one letter. In one note it plays `x.`, `u` and Ctrl-R, `3x 2. .`, `ciwnew<Esc>w.`, `A;<Esc>j.`, `Aab<BS>c<Esc>j.`, `x i<Esc> .`, `dd`, a yank, a motion and a failed `dj` before `.`, `yyp.`, `ohello<Esc>.`, a pending `3` then `ix<Esc>`, `u`, Ctrl-R, `.` and `2.`, `2Aab<Esc>`, `3ohi<Esc>`, `2Ohi<Esc>` and `u`, `2cwXY<Esc>` and `.`, then `ix<Del><Esc>`, `2.`, `u` and `.A!<Esc>` typed in one go. Then it opens a second note from the finder and repeats there, turns vim off and on and repeats again, types a `.` in INSERT, types `9999999i-<Esc>`, takes it back with `u`, reloads, and presses `.`, which does nothing.

## Gotchas

- Expected values of the first note come from Vim, with keys fed by `feedkeys(keys, 'xt')` and `set backspace=indent,eol,start`. The second note has no Vim to ask: its values state what the feature promises.
- A replay with a Delete key takes one frame for each Delete. Put a `wait` before the `expect` after it.
- Arrows, Home, End and clicks in INSERT do not split the stay, so keep them out of a stay that `.` repeats when you compare with Vim.
- Tab types two spaces, where Vim types a tab.
- A note made from the finder opens in NORMAL with its name as the first line and the cursor on its last letter.
