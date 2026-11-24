# Vim operators

With vim on, `d` deletes, `c` changes (deletes, then INSERT) and `y` yanks what a target covers: a motion, the operator key again for whole lines (`dd cc yy`), or a text object (`iw aw iW aW ip ap`, `i" a" i' a'`, `i( a( ib ab i[ a[ i{ a{ iB aB` and the closing-bracket forms). `p` and `P` put the last deleted or yanked text after or before the cursor, or below or above its line when it was taken as whole lines.

## Sub-features

- `vim-operate` runs `d c y` over a motion, `dd cc yy`, or a text object, with counts before and after the operator that multiply.
- `vim-shorthand` maps `x X s S D C Y` and Delete to their operator forms.
- `vim-put` puts with `p P` and a count. `ddp` swaps lines and `xp` swaps letters.
- `vim-store` keeps one store for deletes, changes and yanks. It survives vim off and opening another note from the finder, and a reload empties it.
- `vim-op-pending` shows the keys so far in `.status .pending` (`d`, `2d3`, `ci`). Esc, Ctrl-P, Ctrl-E and a key that is no target drop them.

## How to get to it (user POV)

- Turn vim on with Ctrl-, and type the keys in NORMAL.

## Driving it with e2e/drive.ts

`node e2e/drive.ts .claude/skills/verify-nullpad/features/vim-operators.json` plays the proof and ends `PASS`. It checks a pending `d`, `dw`, `cw` into INSERT and Esc back, `ddp`, `xp`, a pending `2d3` and `ci` dropped by Esc and the read view, a key that is no target, `di(`, `ci"`, `daw`, `2d3w`, `d2j`, `dj` on the last line doing nothing, `yy` in one note and `p` in a note made from the finder, `P` after vim off and on, `D Y p x X S`, `p` after a reload doing nothing, and `dG` leaving one empty line.

## Gotchas

- Expected values come from Vim. `vim -u NONE -N -es` with `feedkeys(keys, 'xt')` behaves as typed keys do after a failed command; `:normal` stops at the first failure instead.
- A note made from the finder opens in NORMAL with its name as the first line.
