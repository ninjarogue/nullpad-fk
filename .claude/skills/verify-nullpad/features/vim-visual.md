# Vim Visual mode

With vim on, `v` selects letters and `V` selects whole lines. Motions and text objects move the cursor end, and an operator, a put or a paste then acts on the selection. The mode reads `VISUAL` or `V-LINE`, and the selected text is drawn highlighted.

## Sub-features

- `visual-select` starts with `v` or `V`, moves the cursor end with every NORMAL motion and its count, swaps the ends with `o`, and leaves with Esc, Ctrl-[, `v` in VISUAL or `V` in V-LINE. `v` in V-LINE and `V` in VISUAL switch the kind and keep both ends.
- `visual-line-break` puts the cursor end on the line break with `$`, `l` or Space. The selection then holds that `\n`, and it is drawn one cell wide. `v` on an empty line selects its line break, and `vd` removes the line.
- `visual-objects` selects with `iw aw iW aW ip ap i" a" i' a' i( a( i[ a[ i{ a{ i< a<` and their other spellings, and a second object grows the selection. `ip` in `v` makes whole lines, and `iw`, `i(` and `i"` in `V` make letters.
- `visual-operators` runs `d x` and Delete, `y`, `c s`, the whole-line `X D Y C S R`, each with a register before it.
- `visual-put` replaces the selection with `p` or `P` and a count, and with a paste (Ctrl-V), which is one undo change.
- `visual-insert` types at the start of the selection's first line with `I` and after its cursor end with `A`, as Vim does.
- `visual-dot` repeats a VISUAL operator from the cursor on the same amount of text: the same count of lines, or on one line the same width on screen.
- `visual-gv` selects the last selection again with `gv`, with its kind.
- `visual-leave` returns to NORMAL with nothing selected on a click, Ctrl-E, Ctrl-P and the vim toggle. Keys that are not built (`J ~ u U r > < =`) change nothing and stay in VISUAL.

## How to get to it (user POV)

- Turn vim on with Ctrl-, and press `v` or `V` in NORMAL.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/vim-visual.json` plays the proof and ends `PASS`. On the build before Visual mode it fails at step 6, where `v` leaves the mode at `NORMAL`. On a note of six lines it plays `veoowd`, `u`, `Vjy` and `Gp`, `ggwviwc2<Esc>` and `j0.`, `2Gwvi(a(`, `3Gvi"y`, `ggvip` and `v`, Esc and `gv`, `4Gvd` on the empty line, `ggv$`, `ggveI!<Esc>` and `gvA?<Esc>`, `wviw"ay` and `jV"ap`, a paste over `viw` and over `V` with one `u` each, `v2<Esc>`, `vJ~`, a click in V-LINE, Ctrl-E in VISUAL, the vim toggle in VISUAL, and `ggvG$` with a screenshot.

An `expect` step takes `selection`, the selected text as drawn, and `mode` reads `VISUAL` or `V-LINE`.

## Gotchas

- Expected values come from Vim (`vim -u NONE -N`), with keys fed by `feedkeys(keys, 'xt')`. Vim has no paste key, so the paste rows state what the feature promises.
- `selection` reads the `#selection` boxes over the drawn rows, so it holds only lines near the screen. A selection longer than three screens reads short. Check a long one by its operator's result.
- A selected line break reads as `\n`: every line of a `V` selection ends with one, and a `v` selection ends with one when its cursor end is on the line break (`v$`).
- `G` and a counted `G` go to the line's first non-blank, so `4Gv` on a line that starts with a tab selects the letter after it. Use `4G0v` for the tab.
- `f` and `t` are not built, so place the cursor with `w`, `e`, `l` and counts.
- A put from an empty register over a selection deletes the selection, as Vim does.
- A count before `v` or `V` is ignored: `3v` is `v`.
