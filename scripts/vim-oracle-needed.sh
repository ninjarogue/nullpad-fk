#!/bin/sh
# Exits 0 when the vim oracle must run: the commits since origin/main touch a vim table's rows
# or the oracle, or no base is known. Exits 1 when it can be left out.
base=$(git merge-base HEAD origin/main 2>/dev/null) || exit 0
git diff --name-only "$base" HEAD | grep -qE '^e2e/(vim-rows/|vim-oracle\.ts$)'
