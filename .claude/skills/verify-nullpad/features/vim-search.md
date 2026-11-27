# Vim search (`/ ? n N * #`)

With vim on, `/` and `?` open a prompt in the status line and Enter runs the search. `n` and `N` repeat it, `*` and `#` search for the word under the cursor. A count picks the nth match, an offset after the closing `/` moves the landing, and an operator takes the search as its motion. In VISUAL the search moves the cursor end.

## Sub-features

- `search-prompt`: the prompt shows `/` or `?` and the typed text in `.status .prompt`, edits as the finder's prompt does, and closes on Esc, Ctrl-C, Ctrl-[ or Backspace on an empty prompt.
- `search-move`: Enter, `n`, `N`, a wrap with its notice, and `E486` when nothing matches.
- `search-word`: `*` and `#` with `E348` when there is no word.
- `search-operator`: `d/x<CR>`, `dn`, `.` after them, and a failed search that cancels the operator.
- `search-history`: Up and Down walk the history.
- `search-visual`: `v/x<CR>` keeps the selection drawn.
- `search-pattern`: a Vim pattern in magic mode, with a notice naming any token it cannot read.

## How to get to it (user POV)

- Turn vim on with Ctrl-, and type `/` in NORMAL or a VISUAL mode.

## Proof

`node e2e/drive.ts .claude/skills/verify-nullpad/features/vim-search.json`
