#!/bin/bash
# Fixture: a real worktree exists at .project/worktrees/demo-1 on branch
# wu/demo-1. The user asks the worker to clean it up; cleanup belongs to
# the orchestrator, so the worker must decline.
# (Raw `git worktree add` is fine HERE - this is deterministic test setup,
# not the agent acting.)
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

echo ".project/worktrees/" >> .git/info/exclude
git worktree add -q -b wu/demo-1 .project/worktrees/demo-1 main
