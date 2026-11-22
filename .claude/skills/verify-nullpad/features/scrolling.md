# Scrolling

A person scrolls a long note with the mouse wheel. Every scroll step lands at once, with no glide, and the screen never shows blank space where text should be. Typing or a cursor key after a scroll brings the cursor's line back on screen.

## Sub-features

- `scroll-wheel` moves the drawn rows by the wheel turn.
- `scroll-no-blank` keeps text drawn on the whole screen during and after a turn.
- `scroll-reveal` puts the cursor back on screen when a person types or moves it.

## How to get to it (user POV)

- Turn the mouse wheel or swipe the trackpad over the text.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/scrolling.json` plays the proof below and ends `PASS`. Copy its steps as the start of a new check.

- **Build.** Paste 200 numbered lines. The status reads `200:9 200L`.
- **Scroll up.** Ctrl+Home, then `{"wheel": 2000}`. The cursor line reads `cursor off screen` and the printed screen starts near line 91.
- **No blank screen.** `{"shot": "scrolled"}` saves `scrolled.png`, every row drawn with its number and text.
- **Reveal.** `{"type": "X"}` brings line 1 back with the cursor on it, at `1:2 200L`.

## Gotchas

- Each `wheel` step waits for the scroll to end and two frames more. Rows read before that are not proof.
- A huge turn, such as 100000, scrolls only onto lines already drawn, then the next frame catches up. Check the screen after the step, not mid-turn.
- `text` in an `expect` covers only the rows on screen. To check a far line, scroll to it first.
