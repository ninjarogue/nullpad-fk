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
node e2e/drive.ts steps.json --record   # plays slowly and writes recording.mp4 with the captions on it
node e2e/drive.ts steps.json --width 600 --height 400 --out verify-out/my-check
```

A step is an object with exactly one of these keys. A malformed step (an unknown key or field, a wrong type, `times` below 1, an empty list) exits 2 before anything builds. A key name Playwright does not know fails only when that step plays.

| Step                                                                                                                                                                               | What a person does                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `{"type": "abc"}`                                                                                                                                                                  | Types each character as a key press.                                                                  |
| `{"press": "ArrowUp", "times": 3}`                                                                                                                                                 | Presses a key (Playwright key names, chords as `Control+Home`). `times` is optional.                  |
| `{"paste": "a\nb"}`                                                                                                                                                                | Pastes from the clipboard with Ctrl+V.                                                                |
| `{"compose": "に", "replacing": {"start": 0, "end": 1}}`                                                                                                                           | Shows IME preedit text. `replacing` is optional and counts UTF-16 units of the EditContext text.      |
| `{"commit": "日"}`                                                                                                                                                                 | Ends the composition, inserting the text.                                                             |
| `{"click": {"row": 2, "cell": 5}}`                                                                                                                                                 | Clicks drawn row 2 (0 is the top row on screen) at cell 5.                                            |
| `{"click": {"x": 120, "y": 40}}`                                                                                                                                                   | Clicks a page pixel, for clicks off the text such as below the last line.                             |
| `{"wheel": 300}`                                                                                                                                                                   | Turns the mouse wheel by that many pixels over the text, and waits for the scroll to end.             |
| `{"resize": {"width": 600, "height": 400}}`                                                                                                                                        | Resizes the window.                                                                                   |
| `{"shot": "before-fix"}`                                                                                                                                                           | Saves a screenshot as `before-fix.png`. Names use letters, digits, `-` and `_`. Proves nothing alone. |
| `{"reload": true}`                                                                                                                                                                 | Reloads the page and waits until the editor is ready again.                                           |
| `{"wait": 900}`                                                                                                                                                                    | Waits that many milliseconds, up to 10000, such as for a save to land.                                |
| `{"caption": "Press Ctrl and Z", "note": "The sentence goes away."}`                                                                                                               | Shows nothing in the app. `--record` draws it above the app until the next caption.                   |
| `{"expect": {"text": "…", "status": "2:4 3L", "under": "o", "top": "40", "full": true, "title": "…", "finder": "…", "mode": "NORMAL", "pending": "2g", "keydown": "z cancelled"}}` | Checks the screen. Give any of the fields. A miss prints `FAIL` and stops the run.                    |

Each `expect` field is an exact match:

- `text` is every line on screen joined with `\n`, wrapped rows rejoined. It leaves out IME preedit and lines scrolled off screen.
- `status` is the status line, `line:column lineCount L`. The column counts letters from 1.
- `under` is the character the block cursor covers, `" "` at a line end or on a space.
- `top` is the line number of the first line on screen.
- `title` is the tab title, which is the open note's title.
- `mode` is the status line's mode (`EDIT`, `NORMAL`, `INSERT` or `READ`), and `pending` the vim keys waiting there, `""` when none.
- `keydown` is the last keydown that reached `window`: its `key`, then `cancelled` when the page cancelled it or `passed` when the browser was left to act on it, such as `r passed`. `none` before any key.
- `finder` is the finder as text: `prompt` and the prompt line, then one line per row with `>` on the highlighted one and cells joined by `|`, or `closed`.
- `full: true` fails when the drawn rows leave more than a row of the text area blank, the check for a screen left blank after a scroll settles. A blank frame in the middle of a turn needs `e2e/flicker.spec.ts`, which watches pixels.

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

## Explore with the nullpad MCP server

When the session lists the `nullpad` tools (`mcp__nullpad__type` and the rest), use them to try things out. The server keeps Chromium open on the build in `dist/`, so a call answers in about 50 ms and you write no steps file first. It plays the steps above with the same driver as `e2e/drive.ts`.

| Tool         | Arguments                        | Step it plays and records                                                                                                  |
| ------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `type`       | `text`                           | `{"type"}`                                                                                                                 |
| `press`      | `key`, `times`                   | `{"press", "times"}`                                                                                                       |
| `paste`      | `text`                           | `{"paste"}`                                                                                                                |
| `compose`    | `text`, `replacing`              | `{"compose", "replacing"}`                                                                                                 |
| `commit`     | `text`                           | `{"commit"}`                                                                                                               |
| `click`      | `row` and `cell`, or `x` and `y` | `{"click"}`                                                                                                                |
| `wheel`      | `pixels`                         | `{"wheel"}`                                                                                                                |
| `resize`     | `width`, `height`                | `{"resize"}`                                                                                                               |
| `screenshot` | `name`                           | `{"shot"}`. Prints the path of the PNG, which is beside the recording.                                                     |
| `batch`      | `steps`                          | Each step of the list, `expect` steps too. Stops at the first failed `expect`.                                             |
| `screen`     |                                  | None. Prints the screen as a `drive.ts` run prints it at its end, with a `composing` line for preedit.                     |
| `checkpoint` | `fields`                         | An `expect` of the current screen: `text` and `status`, or the `fields` you name from `text`, `status`, `under` and `top`. |
| `reset`      | `wipe`, `steps_file`             | None. Opens a fresh page with an empty editor at 1000 by 600 and starts a new recording.                                   |

An input tool answers with one line, such as `2:4 2L | cursor row 1 cell 3 on "o"`. Pass `detail: true` to get the drawn rows as well. An error names the fix.

1. Build with `pnpm build`. The server never builds. After a later `pnpm build`, the next call opens the new build in a fresh page and starts its result with `reloaded:`. A result that ends with `stale:` means that `src/` changed after the build.
2. Drive the app with the tools.
3. Call `checkpoint` where the screen shows what the change promises. Read the values it prints and judge them against that promise, because a checkpoint pins whatever the app showed, right or wrong. When you know the promised value before you look, send it as an `expect` step in a `batch`.
4. Replay the recording: `node e2e/drive.ts <steps.json>`. The first call, `reset` and `checkpoint` print the path. `reset` with `steps_file` writes the recording where you say.

The recording is a proof only once `drive.ts` replays it and prints `PASS`. The proof standards below apply to that replay. A recording starts at an empty editor, so after `reset` or a reload the earlier steps stay in their own file and the next recording starts over.

`reset` and a reload after a build clear the notes the page saved (IndexedDB and the localStorage drafts), as a `drive.ts` replay starts with none. `wipe: true` also opens a fresh browser profile. A `reload` step keeps the notes, as a reload does for a person.

The server stops when the session closes it, and its Chromium stops with it.

## Evidence

Each run writes to `verify-out/<time>/` (gitignored), or to `--out`:

- `steps.json`, the steps as played.
- `log.txt`, the same lines the run printed.
- `screen.json`, the last screen as data: rows with line ids, starts and pixel boxes, the cursor, the status, the cell width.
- `final.png`, plus one PNG per `shot` step. Open them with the Read tool to look at them.
- `video.webm` with `--video`.
- `recording.mp4` and `video.webm`, the same video without captions, with `--record`.

The last line is `PASS evidence in <folder>` or `FAIL evidence in <folder>`. The exit code is 0 on a pass, 1 on a failed `expect`, a thrown step or any page error, 2 on bad steps or options, and 130 or 143 when interrupted. Read `FAIL` lines for a missed `expect` and `ERROR` lines for a step that threw.

Proof standards:

- Drive the path a person takes. Never call app code, set state or read a window global.
- Show the action and the state after it. Put an `expect` after each step that matters, not only at the end.
- A behavior change needs a run that fails on the old build and passes on the new one. Build the old commit with `git worktree add` and `pnpm exec vite build --outDir <folder>`, then pass `--dist <folder>`.
- A page error fails the run even when every `expect` passed. Read the `PAGE ERROR` lines.
- When the proof should guard the behavior for good, write it as a scenario in `e2e/` (see Testing in `AGENTS.md`). The steps map to the `nullpad` fixture one to one: `type`, `press`, `paste`, `compose`, `commit`, `click`, `wheel`, `resize`.
- A PR that changes behavior needs a recording. See Record a PR.

## Record a PR

The recording is the proof, played slowly, with a caption before each action. No agent drives the app for it.

1. Put a `caption` step before each action of the proof a person should follow. `caption` says what is done, in at most 60 characters. `note` says what to look for, in at most 90. Each is one line.
2. Run `node e2e/drive.ts steps.json --record`. It types key by key, holds each caption long enough to read, and still checks every `expect`.
3. Attach `recording.mp4` from the evidence folder.

The captions sit in a strip above the app. Chromium draws each one as a picture, so any script and emoji show, and `ffmpeg` lays the pictures over the video after the run. Nothing is added to the app's page. A window narrower than 960 pixels is centred in a 960 pixel frame, so the captions keep their size. A caption too wide for the frame ends in `…`.

- A record run is slower than a plain run: about 90 ms a key, 0.7 s after each step and 1.5 s or more on each caption. A proof that passes only at full speed fails here, such as one that looks at the finder before the 800 ms save lands. Fix the proof so that it holds at any speed.
- A failed `expect` still stops the run and exits 1. `recording.mp4` then shows the run up to that step.
- `--record` exits 2 before it builds when the steps hold no `caption`, when they hold a `resize` (a video keeps one size, so set the window with `--width` and `--height`), or when `ffmpeg` is not on the path. `--doctor` says whether it is.

## Cleanup

The runner stops the `vite preview` it started (by its own process group), closes its browser and deletes its scratch build, even when a step fails. It never kills a process it did not start. It keeps `verify-out/`. Delete old runs there by hand when you no longer need them.

Ctrl+C, SIGTERM and SIGHUP clean up the same way and keep the evidence written so far. Only SIGKILL leaks. Then find the server with `pgrep -af "vite preview --outDir /tmp/nullpad-verify-<id>"`. It shows three processes (pnpm, node and the pnpm binary) in one process group. Stop that group with `kill -- -<pgid>` (`ps -o pgid= <pid>` gives it), then remove that `/tmp/nullpad-verify-<id>` folder.
