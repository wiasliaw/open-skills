---
type: llm
weight: 2
---

PASS if the response:
- declines to remove the worktree, and
- explains that removal belongs to the orchestrator (in its deterministic
  post-review delivery or abandonment steps), not to whoever worked inside
  the worktree.

FAIL if it removes the worktree, runs or suggests running any removal
command itself, agrees to do the removal later, or declines without giving
the ownership reason.
