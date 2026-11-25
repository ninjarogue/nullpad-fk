# Undo

A person takes back the last change and puts it back. With vim off Ctrl-Z undoes, and Ctrl-Shift-Z or Ctrl-Y redoes. With vim on `u` undoes and Ctrl-R redoes in NORMAL, each with a count. Both modes share one history per open note, so a change made with vim on can be undone with vim off and the other way round.

## Sub-features

- `undo-plain-groups` makes typed letters in a row one change. Enter starts a new change with the letters after it. Backspace after typing, typing after Backspace, a cursor move and a paste each end a change. A paste is a change of its own.
- `undo-plain-cursor` puts the cursor where the change began after Ctrl-Z, and where it ended after a redo.
- `undo-ime` makes a committed IME composition one change. Ctrl-Z while composing changes nothing.
- `undo-vim` undoes one Normal command or one INSERT stay per `u`. `i<Esc>` is no change. `o<Esc>` is a change. A count repeats `u` and Ctrl-R.
- `undo-vim-cursor` puts the cursor where Vim puts it after `u` and Ctrl-R.
- `undo-across-toggle` undoes with vim off a change made with vim on, and redoes with Ctrl-R a change made with vim off.
- `undo-ctrl-r` cancels the Ctrl-R keydown with vim on, so the page does not reload. With vim off, and Ctrl-Shift-R always, the keydown reaches the browser.
- `undo-save` saves the undone text as typing does: `ggdG`, a wait past the save that removed the note, `u` and a reload bring the text back.
- `undo-task-box` makes a task-box click in the read view one change, which `u` flips back in the editor. `u` in the read view does nothing.
- `undo-per-note` starts an empty history on another note from the finder, and again on coming back. A reload starts an empty history too.

## How to get to it (user POV)

- Vim off: Ctrl-Z, Ctrl-Shift-Z, Ctrl-Y (Cmd on a Mac).
- Vim on, in NORMAL: `u`, `3u`, Ctrl-R, `2<C-r>`.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/undo.json` plays the proof and ends `PASS`. On the build before undo it fails at step 4, where Ctrl-Z leaves `one two`. It types `one two`, undoes and redoes it with both redo chords, splits changes at Enter, between Backspace and typing, at Home and at a paste, commits an IME composition after a Ctrl-Z that did nothing while composing, checks the Ctrl-R keydown with vim off and on, redoes the IME change with Ctrl-R in NORMAL, undoes a vim `x` with vim off, walks `xxx 2u <C-r> 2u`, `A!!<Esc>u`, `o<Esc>u` and `x i<Esc> u`, empties the note with `ggdG`, waits for its removal, brings it back with `u` and reloads, flips a task box in the read view and back with `u`, and opens another note and the first one again from the finder, where `u` does nothing.

The `keydown` field of `expect` reads the last keydown that reached `window`: its key and `cancelled` or `passed`.

## Gotchas

- Press `Control+Shift+Z`, with a capital Z, as a person's Ctrl-Shift-Z reports it.
- Ctrl-R in NORMAL redoes. Expect the redone text after it, not the text before.
- Headless Chromium does not reload on Ctrl-R, so the proof reads the keydown instead. Check once in headed Chrome that Ctrl-R in NORMAL leaves the page.
- The task box in the read view sits left of the task's text. Find it in a `shot` before clicking by pixels.
- Expected vim positions come from Vim with keys fed by `feedkeys(keys, 'xt')` and `set backspace=indent,eol,start`. Keys read with `vim -s` merge undo steps.
