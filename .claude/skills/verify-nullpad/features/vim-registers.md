# Vim registers and the system clipboard

With vim on, a `"` and a name before a command pick the register it writes or reads: `"a` to `"z`, `"A` to `"Z` to add to one, `"0` for the last yank, `""` for the unnamed one, `"_` for none, and `"+` or `"*` for the system clipboard.

## Sub-features

- `register-named` keeps text under a letter: `"ayy` then `"ap`, `"byiw` then `"bP`. A named write is in the unnamed register too, and leaves `"0`.
- `register-append` adds to a letter with its capital: `"Ayiw` after `"ayy` makes two lines.
- `register-yank` puts the last yank with `"0p` after a delete took the unnamed register.
- `register-none` deletes with `"_dd` and writes no register.
- `register-pending` shows the prefix in `.status .pending` (`2"a3`), with counts before the `"`, after the name and after an operator, which multiply. A name that is no register, and a `"` after an operator (`d"x`), drop the keys.
- `register-dot` repeats a put with its register: `"bp.` puts `"b` twice.
- `clipboard-write` copies with `"+yy`, so another app pastes the line.
- `clipboard-read` puts what another app copied with `"+p`, `"+P` and `"*p`. Text that ends in a line break goes in as whole lines. A `.` reads the clipboard again.
- `clipboard-blocked` shows `clipboard blocked, use Ctrl-V` in `.status .notice` when the browser refuses a read or a write, or a read has no answer in 3 seconds (no limit while Chrome asks the person for permission). The note stays as it was. The next key clears the notice.
- `clipboard-wait` holds keys typed while the read is out and runs them in order after it. Ctrl-E in the wait opens the read view when the answer lands.

## How to get to it (user POV)

- Turn vim on with Ctrl-, and type the keys in NORMAL.
- The browser asks for the clipboard permission at the first `"+p`. In a run, a `clipboard` step stands for the person's answer and for the other app.

## Driving it with e2e/drive.ts

Preconditions: the baseline in [README.md](./README.md).

`node e2e/drive.ts .claude/skills/verify-nullpad/features/vim-registers.json` plays the proof and ends `PASS`. On the build before registers it fails at step 6, where `"ayy` types `yy` into the note. On one note it plays `"ayyj"byiw"ap`, `k"bP`, `w"Ayiwgg"ap`, `G"_ddp`, `yiw"cdd"0P`, `"bp.`, `2"c2P`, `u""p`, `d"x` and a pending `2"a3` dropped by Esc. Then it empties the note and plays the clipboard: `"+yy` read by another app, `"+p` of that line, `"+p` and `.` of text another app copied, `u`, `"+P` of text with CRLF line ends, `3"*p`, a refused `"+p` with the notice and `l` clearing it, a refused `"+yiW` with the notice and `P` of the unnamed register, `"+pxix<Esc>` with the read held and then answered, `"+pdd` with the read held for 3.3 seconds, and Ctrl-E pressed in a held read that is answered and in one that times out.

## Gotchas

- Expected values of the first note come from Vim, with keys fed by `feedkeys(keys, 'xt')`. Vim has no browser clipboard, so the clipboard rows state what the feature promises.
- Headless Chromium has one clipboard for the whole browser and shows no permission prompt. A read or a write without the permission is refused at once, so only `{"clipboard": {"hold": true}}` makes a read wait. It stands in for the prompt by keeping the page's `readText` open, and a reload removes it.
- A `paste` step copies its text to the system clipboard first, so the clipboard holds that text after it.
- The wait ends between 2.5 and 3.3 seconds after the `p`. Put a `wait` on each side of it, as the proof does.
- While a read is out, `.status .pending` shows the prefix (`"+`) and the mode stays NORMAL.
- A `clipboard` field in an `expect`, and a `copy` step, open a second page in another browser context. It has its own permission, so `{"clipboard": {"allow": []}}` does not stop it.
