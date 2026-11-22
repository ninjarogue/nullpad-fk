---
name: verify-nullpad
description: Drive nullpad, the markdown editor in this repo, in real headless Chromium the way a person does (typing, cursor keys, clicks, wheel scrolling, IME, paste) and capture proof (screen text, cursor, status line, screenshots, video). Use to prove a change to nullpad works, to reproduce an editor bug before fixing it, or to record a PR.
---

# Verify nullpad

nullpad has one surface: the editor page in Chrome or Edge. It has no form fields or ARIA handles to target. Input goes through an EditContext, so it must be trusted input (Playwright keyboard and mouse, CDP `Input.*`). `e2e/drive.ts` does that for you from a JSON list of steps and prints what a person would see after each one.

## Launch

There is nothing to keep running. Each run of `e2e/drive.ts` builds the working tree into a scratch folder (about 1.5 s), serves it with `vite preview` on a free port, opens a fresh Chromium context, plays the steps, writes the evidence, and tears everything down. Runs never share a port, a build or a browser profile, so several can run at once.

Once per checkout:

```sh
pnpm install
```

Ready means `#caret` is on screen and fonts are loaded. The runner waits for both before step 1.

## Doctor

Run this first, and again whenever a run fails before step 1:

```sh
node e2e/drive.ts --doctor
```

It prints the Node and Chromium versions, whether Chromium has EditContext, and whether `dist/` is older than `src/`. It ends with `ok` or `not ok` and a `problem:` line for each fault. A Chromium that will not launch usually means `@playwright/test` in `package.json` does not match the installed browser. Cloud sessions have it at `/opt/pw-browsers`. Elsewhere run `pnpm exec playwright install chromium` once.

## Drive

```sh
node e2e/drive.ts steps.json            # or - to read the steps from stdin
node e2e/drive.ts steps.json --video    # also records video.webm
node e2e/drive.ts steps.json --width 600 --height 400 --out verify-out/my-check
```

A step is an object with exactly one of these keys. A malformed step (an unknown key or field, a wrong type, `times` below 1, an empty list) exits 2 before anything builds. A key name Playwright does not know fails only when that step plays.

| Step                                                                                     | What a person does                                                                                    |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `{"type": "abc"}`                                                                        | Types each character as a key press.                                                                  |
| `{"press": "ArrowUp", "times": 3}`                                                       | Presses a key (Playwright key names, chords as `Control+Home`). `times` is optional.                  |
| `{"paste": "a\nb"}`                                                                      | Pastes from the clipboard with Ctrl+V.                                                                |
| `{"compose": "に", "replacing": {"start": 0, "end": 1}}`                                 | Shows IME preedit text. `replacing` is optional and counts UTF-16 units of the EditContext text.      |
| `{"commit": "日"}`                                                                       | Ends the composition, inserting the text.                                                             |
| `{"click": {"row": 2, "cell": 5}}`                                                       | Clicks drawn row 2 (0 is the top row on screen) at cell 5.                                            |
| `{"click": {"x": 120, "y": 40}}`                                                         | Clicks a page pixel, for clicks off the text such as below the last line.                             |
| `{"wheel": 300}`                                                                         | Turns the mouse wheel by that many pixels over the text, and waits for the scroll to end.             |
| `{"resize": {"width": 600, "height": 400}}`                                              | Resizes the window.                                                                                   |
| `{"shot": "before-fix"}`                                                                 | Saves a screenshot as `before-fix.png`. Names use letters, digits, `-` and `_`. Proves nothing alone. |
| `{"expect": {"text": "…", "status": "2:4 3L", "under": "o", "top": "40", "full": true}}` | Checks the screen. Give any of the fields. A miss prints `FAIL` and stops the run.                    |

Each `expect` field is an exact match:

- `text` is every line on screen joined with `\n`, wrapped rows rejoined. It leaves out IME preedit and lines scrolled off screen.
- `status` is the status line, `line:column lineCount L`. The column counts letters from 1.
- `under` is the character the block cursor covers, `" "` at a line end or on a space.
- `top` is the line number of the first line on screen.
- `full: true` fails when the drawn rows leave more than a row of the text area blank, the check for blank screen after a scroll.

After each step the runner prints one line, such as:

```
7. {"click":{"row":1,"cell":3}} | 2:4 2L | cursor row 1 cell 3 on "o"
```

At the end it prints the screen. The first column is the drawn row, the second the line number, and `^` marks the cursor cell:

```
status 3:6 3L, cursor row 2 cell 5 on "o"
  0     1 |hello world
  1     2 |sec日
  2     3 |thirdond
           |     ^
```

Rows and cells are what is on screen. A wrapped line takes several rows. A wide character such as `日` or an emoji takes two cells. Read the printed screen to find the row and cell to click.

The feature map in [features/README.md](features/README.md) holds one recipe per feature. Use the matching one, and prove every entry point it lists.

## Evidence

Each run writes to `verify-out/<time>/` (gitignored), or to `--out`:

- `steps.json`, the steps as played.
- `log.txt`, the same lines the run printed.
- `screen.json`, the last screen as data: rows with line ids, starts and pixel boxes, the cursor, the status, the cell width.
- `final.png`, plus one PNG per `shot` step. Open them with the Read tool to look at them.
- `video.webm` with `--video`.

The last line is `PASS evidence in <folder>` or `FAIL evidence in <folder>`. The exit code is 0 on a pass, 1 on a failed `expect`, a thrown step or any page error, 2 on bad steps or options, and 130 or 143 when interrupted. Read `FAIL` lines for a missed `expect` and `ERROR` lines for a step that threw.

Proof standards:

- Drive the path a person takes. Never call app code, set state or read a window global.
- Show the action and the state after it. Put an `expect` after each step that matters, not only at the end.
- A behavior change needs a run that fails on the old build and passes on the new one. Build the old commit with `git worktree add` and `pnpm exec vite build --outDir <folder>`, then pass `--dist <folder>`.
- A page error fails the run even when every `expect` passed. Read the `PAGE ERROR` lines.
- When the proof should guard the behavior for good, write it as a scenario in `e2e/` (see Testing in `AGENTS.md`). The steps map to the `nullpad` fixture one to one: `type`, `press`, `paste`, `compose`, `commit`, `click`, `wheel`, `resize`.
- A PR that changes behavior needs a recording. Run its steps with `--video` and attach `video.webm`.

## Cleanup

The runner stops the `vite preview` it started (by its own process group), closes its browser and deletes its scratch build, even when a step fails. It never kills a process it did not start. It keeps `verify-out/`. Delete old runs there by hand when you no longer need them.

Ctrl+C, SIGTERM and SIGHUP clean up the same way and keep the evidence written so far. Only SIGKILL leaks. Then find the server with `pgrep -af "vite preview --outDir /tmp/nullpad-verify-<id>"`. It shows three processes (pnpm, node and the pnpm binary) in one process group. Stop that group with `kill -- -<pgid>` (`ps -o pgid= <pid>` gives it), then remove that `/tmp/nullpad-verify-<id>` folder.
