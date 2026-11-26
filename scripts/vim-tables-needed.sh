#!/bin/sh
# Exits 0 when the vim tables must run: the commits since origin/main touch code or tests they cover,
# or no base is known. Exits 1 when they can be left out.
base=$(git merge-base HEAD origin/main 2>/dev/null) || exit 0
git diff --name-only "$base" HEAD | grep -qE '^(src/core/|src/(keyboard|main|surface|clipboard)\.ts$|e2e/(dot|registers|undo|vim|vim-find|vim-replace|visual|visual-block|visual-block-stay)\.spec\.ts$|e2e/vim-rows/|e2e/nullpad\.ts$|playwright\.config\.ts$|package\.json$|pnpm-lock\.yaml$|\.githooks/pre-push$|scripts/vim-tables-needed\.sh$)'
