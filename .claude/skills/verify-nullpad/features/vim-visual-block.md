# Vim blockwise Visual mode

With vim on, Ctrl-V in NORMAL selects a block: the letters between two screen columns on every line from one corner to the other. The mode reads `V-BLOCK`, and each line's part of the block is drawn highlighted.

## Sub-features

- `block-select` starts with Ctrl-V, moves the cursor corner with every NORMAL motion and its count, goes to the other corner with `o` and to the other corner of the same line with `O`, and leaves with Esc or Ctrl-V. `v` and `V` switch the kind and keep both ends, and Ctrl-V in VISUAL or V-LINE makes the selection a block.
- `block-line-ends` runs the block to the end of every line after `$`.
- `block-operators` runs `d x X` and Delete, `y Y`, `D` and `C` to the line ends, `c s`, and the whole-line `S R`, each with a register before it. The cursor lands on the block's top left.
- `block-insert` types on every line of the block: `I` at the left edge, `A` after the right edge, `c` in place of the block. The text goes on the first line as it is typed and on the other lines at Esc.
- `block-put` puts a yanked or deleted block as a rectangle with `p` and `P`, one row a line, and puts a register over a block.
- `block-cut` cuts a tab or a wide letter that an edge passes through: a yank takes its columns inside the block as spaces, and a delete leaves its columns outside as spaces.
- `block-dot` repeats a block's operator, `I` or `A` from the cursor on the same number of lines and columns.
- `block-gv` selects the last block again with `gv`.
- `block-paste` replaces the block with a paste (Ctrl-Shift-V), once, at its top left, as one undo change.

## How to get to it (user POV)

- Turn vim on with Ctrl-, and press Ctrl-V in NORMAL.
- While vim is in NORMAL or a VISUAL mode, paste with Ctrl-Shift-V. In INSERT, in the finder and with vim off Ctrl-V still pastes.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/vim-visual-block.json` plays the proof and ends `PASS`. On the build before V-BLOCK it fails at step 8, where Ctrl-V pastes and leaves the mode at `NORMAL`. On a note of six lines, with a short line, a line with tabs and a line with a wide letter, it plays `l<C-v>jjl`, `o` and `O`, `d`, `u` and `.`, `<C-v>3j$A!<Esc>`, `<C-v>3jI- <Esc>` and `j.`, `gg<C-v>jjey` and `$p`, `4G<C-v>jl` through a tab with `d`, `u` and `gv`, then `v`, `V` and Ctrl-V twice, `G0<C-v>ggll` and `d` through a tab and a wide letter, a paste over `gg<C-v>j` with one `u`, and a paste with Ctrl-V in INSERT.

A step `{"press": "Control+v"}` is the key Ctrl-V. A `paste` step presses Ctrl-Shift-V while the mode is NORMAL, VISUAL, V-LINE or V-BLOCK, and Ctrl-V otherwise. An `expect` step takes `selection`, and `mode` reads `V-BLOCK`.

## Gotchas

- Expected values come from Vim (`vim -u NONE -N`), with keys fed by `feedkeys(keys, 'xt')`. Vim has no paste key, so the paste rows state what the feature promises.
- For a block, `selection` is the letters covered on each line of the block, joined by `\n`. A line the block does not reach gives an empty string, so `ab\n\nab` is a block over three lines whose middle line is short. No line ends in `\n`, since a block has no line-break cell.
- A tab or a wide letter that an edge cuts is highlighted whole, so `selection` reads it whole. The operator still takes only the columns inside the block: check a cut by the text after `d` or by a put of the yank.
- `selection` reads only the lines drawn near the screen. Check a tall block by its operator's result.
- `j` and `k` keep the screen column, so from a tab the cursor corner lands in the tab's last column, as in NORMAL. Use `0` or `l` to set the column.
- `r J ~ u U > < = :` are not built on a block and change nothing.
- A count before Ctrl-V is ignored.
