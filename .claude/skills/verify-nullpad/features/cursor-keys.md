# Cursor keys

A person moves the block cursor with the keyboard. Left and Right step one letter, Up and Down move by drawn row and keep the column they started from, Home and End go to the ends of the drawn row, ## Gotchas

- Use Playwright key names: `ArrowUp`, not `Up`. Chords join with `+`, such as `Control+Home`.
- Page size follows the window height. The proof's numbers hold only at its own 600-pixel height, so run it without `--height`.
- These keys need layout, so the app answers them a frame later. The runner waits for that before it reads the screen. Read the printed line, not your own guess.
- Ctrl+Right stops at the end of a word, not at the start of the next, on a Mac too.
- Compare a doubtful landing with a `<textarea>`. The typist in `e2e/typist/` does that at scale.
