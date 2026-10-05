#!/bin/bash
# Fixture: same minimal project, but the target worktree path already
# exists as a plain directory that is NOT a registered worktree, so
# `ensure --branch wu/demo-1` must fail with the "collision" error code.
set -euo pipefail

git init -q -b main
git config user.email "eval@example.com"
git config user.name "Eval Fixture"

mkdir -p .harness src
cat > .harness/config.json <<'EOF'
{
  "schema_version": "1.0.0",
  "vcs": { "strategy": "github-flow", "default_branch": "main" },
  "locations": {
    "work_units": ".project/work-units",
    "archive": ".project/work-units/archive",
    "worktrees": ".project/worktrees"
  },
  "worktree_setup": { "setup": [], "copy": [] }
}
EOF
echo "console.log('hello');" > src/index.js

git add -A
git commit -qm "initial commit"

# The colliding path: exists, holds data, is not a worktree.
mkdir -p .project/worktrees/demo-1
echo "precious unrelated data" > .project/worktrees/demo-1/keep.txt
