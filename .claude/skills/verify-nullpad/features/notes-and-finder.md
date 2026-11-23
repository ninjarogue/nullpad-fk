# Notes and finder

nullpad keeps every note in the browser and opens the one edited last. Ctrl-P opens a floating finder: a prompt box with a folder row, a results box and a preview. A person filters notes by typing, makes a note from the prompt, goes into folders and moves notes between them.

## Sub-features

- `notes-persist` saves a note 800 ms after typing stops and brings it back after a reload.
- `notes-boot` opens the note edited last on load. With no notes, an empty note that is not saved.
- `finder-open` opens the finder with Ctrl-P. Escape closes it.
- `finder-create` makes a note from the prompt: Enter on the `+ new note` row opens it with the query as its first line and the cursor at its end.
- `finder-switch` opens the highlighted note with Enter. Up and Down, or Ctrl-P, move the highlight.
- `finder-drill` goes into a child folder when the prompt is a unique prefix of its name and a `/`. Backspace on an empty prompt goes up a level. Tab and Shift-Tab step through the top-level folders.
- `finder-move` moves the highlighted note with Ctrl-G: the prompt asks for a folder path, prefilled with the note's folder, and Enter moves it there. Escape goes back to finding.

## How to get to it (user POV)

- Type in the editor. The note saves itself.
- Press Ctrl-P anywhere in the editor.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md). Each run starts with no notes saved.

`node e2e/drive.ts .claude/skills/verify-nullpad/features/notes-and-finder.json` plays the proof below and ends `PASS`.

- **Persist.** `# Groceries`, Enter and `milk and eggs`, a 1.2 s wait and a reload bring the note back, titled `Groceries`.
- **Create.** Ctrl-P and `Client call` offer only the `+ new note` row. Enter opens `Client call` at `1:12 1L`.
- **Switch.** Ctrl-P lists both notes, newest first. Down and Enter open `Groceries`.
- **Move.** Ctrl-P, `cli`, Ctrl-G and `work/clients` offer `+ new folder work/clients/`. Enter moves it, and the list then starts with the folder row `work/`.
- **Drill.** `wo/` goes into `work`, `cl/` into `work/clients`. Backspace twice goes back to all folders, and Tab steps into `work`.
- **Close.** Escape closes the finder on `Groceries`.
- **Boot.** Opening `Client call` and reloading opens it again, since the move saved it last.

The `title` field of `expect` reads the tab title, which is the note's title. The `finder` field reads the finder as text: `prompt` and the prompt line, then one line per row, `>` on the highlighted one, cells joined by `|`, or `closed`.

## Gotchas

- A save waits 800 ms after the last change. Put a `wait` of more than that before a `reload`.
- Folders exist only while a note is in one. Make one by moving a note into a new path.
- Chrome keeps Ctrl-N for a new window, so it never moves the highlight. Use Down.
- Rows show ages such as `now` and `5m`. A proof that waits minutes sees other ages.
