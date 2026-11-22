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

- **Build.** Paste 200 numbered lines. The status reads `200:9 200L`, the top line on screen is 176 and the rows fill the screen.
- **Back to the top.** Ctrl+Home puts line 1 at the top.
- **Huge turn.** `{"wheel": 100000}` scrolls to the end: the top line is 176 again and the screen is full, not blank.
- **Turn back.** `{"wheel": -3000}` leaves a full screen. `{"shot": "scrolled"}` saves it as `scrolled.png`.
- **Reveal.** `{"type": "X"}` brings line 1 back to the top with the cursor on it, at `1:2 200L`.

## Gotchas

- Each `wheel` step waits for the scroll to end and two frames more. Rows read before that are not proof.
- A huge turn, such as 100000, scrolls only onto lines already drawn, then the next frame catches up. Check the screen after the step, not mid-turn.
- `text` in an `expect` covers only the rows on screen. To check a far line, scroll to it first.
- A `shot` proves nothing by itself. Check the screen with `expect` `full` and `top`, and look at the PNG.
- `full` reads the screen after the scroll has settled. A blank frame that shows for a moment during the turn and is gone by the next frame does not fail it. `e2e/flicker.spec.ts` watches pixels during the turn for that.
