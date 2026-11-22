# Cursor keys

A person moves the block cursor with the keyboard. Left and Right step one letter, Up and Down move by drawn row and keep the column they started from, Home and End go to the ends of the drawn row, Page Up and Page Down move by a screen, Ctrl+Left and Ctrl+Right move by word the Linux way, and Ctrl+Home and Ctrl+End go to the ends of the note.

## Sub-features

- `keys-step` Left and Right by one letter, across line ends.
- `keys-vertical` Up and Down by drawn row, wrapped rows included, landing where a textarea lands.
- `keys-row-edge` Home and End of the drawn row.
- `keys-page` Page Up and Page Down by a screen of rows.
- `keys-word` Ctrl+Right to the end of a word, Ctrl+Left to its start, on every OS.
- `keys-note-edge` Ctrl+Home and Ctrl+End.

## How to get to it (user POV)

- Press the key with the editor focused, which it is from page load.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/cursor-keys.json` plays the proof below and ends `PASS`. Copy its steps as the start of a new check.

- **Build.** `{"paste": "foo bar baz\nab\nlonger line"}` ends at `3:12 3L`.
- **Up keeps the column.** Up lands at `2:3` (line 2 is shorter), a second Up at `1:12`.
- **Row edges.** Home lands at `1:1` on `f`.
- **Word moves.** Ctrl+Right lands at `1:4`, again at `1:8`. Ctrl+Left lands at `1:5` on `b`.
- **Note edges.** Ctrl+End lands at `3:12`.
- **No select-all.** Ctrl+A leaves the cursor at `3:12`.

Page Up, Page Down and Up or Down on wrapped rows have no proof file yet. Build a long note with `paste`, or a narrow window with `--width 400`, and check the status and cursor row after each key.

## Gotchas

- Use Playwright key names: `ArrowUp`, not `Up`. Chords join with `+`, such as `Control+Home`.
- These keys need layout, so the app answers them a frame later. The runner waits for that before it reads the screen. Read the printed line, not your own guess.
- Ctrl+Right stops at the end of a word, not at the start of the next, on a Mac too.
- Compare a doubtful landing with a `<textarea>`. The typist in `e2e/typist/` does that at scale.
