# Clicking

A person clicks to put the cursor at the nearest letter boundary under the pointer. A click on a wrapped row lands on that row. A click below the last line puts the cursor at the end of the note.

## Sub-features

- `click-text` lands on the nearest letter boundary on the clicked row.
- `click-wrapped` lands on the clicked row of a wrapped line.
- `click-below` below the last line goes to the end of the note.
- `click-after-scroll` lands on the row the pointer was over, after a wheel turn.

## How to get to it (user POV)

- Left click anywhere in the page.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/clicking.json` plays the proof below and ends `PASS`. Copy its steps as the start of a new check.

- **Build.** `{"paste": "hello world\nsecond"}`.
- **Click a letter.** `{"click": {"row": 0, "cell": 6}}` lands at `1:7` on `w`.
- **Click past a line end.** `{"click": {"row": 1, "cell": 40}}` lands at `2:7`, the end of line 2.
- **Click below the text.** Ctrl+Home, then `{"click": {"x": 500, "y": 500}}` lands at `2:7`, the end of the note.

Clicks on wrapped rows and after a wheel turn have no proof file yet. Read the screen printed by the step before the click, click a row, and `expect` the line number that row shows in its gutter.

## Gotchas

- `{row, cell}` clicks a quarter cell to the right of that cell's left edge, so it lands at the boundary before the cell. To land after the letter, click the next cell.
- Rows are counted on the screen as it is now. Read the screen printed by the step before the click.
- Clicks in the line number gutter are pixel clicks. Take `x` from `screen.json` (`rows[i].left` is the text's left edge, `cell` the cell width).
