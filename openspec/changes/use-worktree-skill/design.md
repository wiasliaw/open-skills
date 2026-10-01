## Context

WOR-33 defines skills as capabilities mounted on a node, not nodes. Build is mounted with `use-worktree`; Wrap owns cleanup (`graph-node-wrap`: "Wrap cleans residue"). Claude Code natively supports agent worktree isolation and `EnterWorktree`, so the skill adds policy only. The work-unit folder (`graph-plugin-work-unit-state`) gives each stage a directory written by its actor, and only the orchestrator writes `state.json`.

## Goals / Non-Goals

**Goals:**
- Fix what the one-page skill must state: when to open, how often, what to name it, what Build leaves behind, who removes it.
- Stay consistent with the Build and Wrap node specs and the work-unit state layout.

**Non-Goals:**
- Reimplementing, wrapping, or scripting the platform worktree mechanism.
- Writing the skill itself, or updating docs and README.
- Adding fields to the `state.json` schema.

## Decisions

- **One worktree per work unit, reused across tickets.** Build implements tickets one at a time, sequentially, and later tickets build on earlier ones. A per-ticket worktree would need each ticket's result merged into the next, adding VCS choreography that the orchestrator, not the skill, owns. A single worktree also gives Wrap exactly one thing to remove and keeps the PR a single line of work. Alternative: one worktree per ticket; rejected for the integration overhead and for multiplying cleanup targets.
- **Open lazily at the first Build entry; reuse a live worktree, reopen after Wrap.** Build is re-entered after Review failure, Advisor guidance, or CI red. Wrap removes the worktree before opening the PR and runs CI afterwards, so on CI red the recorded worktree is gone while branch `wu/<id>` still carries the work. Rule: a live recorded worktree is reused; a record naming a missing worktree means Build opens a fresh worktree on the existing branch and rewrites `build/worktree.md`. A work unit that never reaches Build never opens one. Alternatives: open at Trigger, rejected because research-only and no-op units would leave residue; a new branch on CI red, rejected because it would orphan the PR's branch.
- **Name is the work-unit id.** The worktree name and its branch name derive from the work-unit id (`id` matches `^[a-z0-9][a-z0-9-]*$`), so the name is deterministic, unique per unit, valid for paths and refs, and traceable back to the folder. Ticket ids are deliberately not in the name because the worktree spans tickets. Alternatives: include the ticket id (contradicts the per-unit cadence); random or timestamp names (not reconstructable by Wrap or a human).
- **Record the location in a Build stage artifact, not in `state.json`.** Build writes `build/worktree.md` in its stage directory, which the work-unit state spec already allows the implementor to write. Adding a `state.json` field would change a schema owned by another change, and the schema forbids unknown top-level fields. Wrap reads it as part of "the worktree and temporary artifacts" it already takes as input. Alternative: orchestrator transcribes the path into `state.json`; rejected as a cross-change schema edit for a value only Wrap needs.
- **Wrap removes; the skill and Build never do.** This follows `graph-node-wrap` directly; Wrap removes the worktree, not the branch. Build's failure paths (blocked, retry) therefore leave the worktree in place, so Advisor guidance and Build retries can still use it. If Wrap cannot find or remove the worktree it reports blocked like any Wrap failure.
- **The skill defers to the platform.** The page tells Build to use native isolation and names only the policy inputs (name, cadence, record, ownership). It does not describe flags or internals, which would go stale.

## Risks / Trade-offs

- [Reused worktree accumulates state from failed attempts; a CI-red reopen starts clean from the branch] -> Review runs against the ticket's verification command, so stale state surfaces as a failing check; Build may discard its own uncommitted changes inside the worktree but never removes the worktree.
- [Name collision if a work-unit id is reused] -> Ids are unique per the state spec; if a worktree of that name already exists and no record names it, Build reports blocked instead of overwriting. A record naming a missing worktree with the branch present is the CI-red case, not a collision.
- [Path recorded in a markdown file, not machine-validated] -> Acceptable because only Wrap reads it; a later change can move it into state if more consumers appear.
