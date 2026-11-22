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
- **Row edges.** Home lands at `1:1` on `f`, End at `1:12`.
- **Word moves.** From the line start, Ctrl+Right lands at `1:4`, again at `1:8`. Ctrl+Left lands at `1:5` on `b`.
- **Note edges.** Ctrl+End lands at `3:12`.
- **Past the last and first line.** Home and Down on the last line land at its end, `3:12`. Up on the first line lands at its start, `1:1`.
- **No select-all.** Ctrl+A leaves the cursor where it was.
- **Wrapped rows.** `{"resize": {"width": 400, "height": 600}}`, then a 155-letter line of words pasted as line 4 wraps into five rows. Home lands at the start of the last row, `4:130` on `d`. Up lands at the start of the row above, `4:97` on `s`. End lands at the end of that row, `4:130` drawn after its hanging space, as in a textarea.

Page Up and Page Down move by a screen less one row and keep the cursor's row on screen. On a 200-line note at 1000 by 600, Ctrl+Home and Page Down land at `23:1`, a second Page Down at `45:1`, and Page Up back at `23:1`, the cursor on row 0 each time. That is not in the proof file, because the page size follows the window height.

## Gotchas

- Use Playwright key names: `ArrowUp`, not `Up`. Chords join with `+`, such as `Control+Home`.
- These keys need layout, so the app answers them a frame later. The runner waits for that before it reads the screen. Read the printed line, not your own guess.
- Ctrl+Right stops at the end of a word, not at the start of the next, on a Mac too.
- Compare a doubtful landing with a `<textarea>`. The typist in `e2e/typist/` does that at scale.
