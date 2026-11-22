# IME and paste

A person types Japanese, Chinese, Korean or accented text through an input method, which shows preedit text that turns into the final text on commit. A person pastes text from the clipboard with Ctrl+V, newlines included.

## Sub-features

- `ime-preedit` shows the composing text at the cursor without putting it in the note.
- `ime-commit` puts the committed text in the note at the cursor.
- `ime-replace` lets the input method replace letters already typed, such as kana turned into kanji.
- `paste-text` inserts clipboard text at the cursor, multi-line included.

## How to get to it (user POV)

- Switch the OS input method and type, or copy text and press Ctrl+V.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/ime-and-paste.json` plays the proof below and ends `PASS`. Copy its steps as the start of a new check.

- **Preedit.** `{"type": "ab"}`, `{"compose": "に"}`. The step line ends `composing "に"`, and the text is still `ab` at `1:3`, because preedit is not text yet.
- **Commit.** `{"commit": "日"}` gives `ab日` at `1:4`.
- **Replace typed letters.** `{"type": "ka"}`, `{"compose": "か", "replacing": {"start": 3, "end": 5}}`, `{"commit": "か"}` turn `ka` into `か`: `ab日か` at `1:5`.
- **Paste.** `{"paste": "one\ntwo"}` gives `ab日かone` and `two` at `2:4 2L`.

## Gotchas

- `replacing` counts UTF-16 units of the EditContext's text, which holds the cursor's line, not the whole note. An emoji is two units or more.
- Preedit spans are drawn but are not text. `expect.text` leaves them out.
- `paste` goes through the real clipboard. It needs the clipboard permission the runner grants, so a pasted string over a megabyte is slow.
