# Handoff — 2026-10-03

Written by Wrap for work unit 2026-10-03-demo-slugify (the first full
graph-flow dogfooding run).

## What shipped
demo/ (slugify.mjs, slugify.test.mjs, README.md) on develop, built through
the full graph: research-explore -> grading gate (trivial) -> build ->
review (FAIL: hyphens stripped, non-idempotent; fast-path upgrade) ->
spec -> spec gate -> ticket -> build (T-1, T-2) -> review -> wrap -> ship.
Archived record: .project/work-units/archive/2026-10-03-demo-slugify/.

## Loop findings (for the graph-flow iteration)
1. Installed v0.1.0 reviewer agent lacks the Write tool, so reviewer reports
   were persisted by the orchestrator (deviation logged per occurrence).
   Fixed in agents/reviewer.md; takes effect when the plugin version ships.
2. Spec gap: fail_counters has no key shape for a fast-path Build/Review
   failure (no ticket exists yet). Harmless (that edge routes to Spec, not
   Advisor) but the schema should name it.
3. Next-ticket selection after a Review pass was done deterministically by
   the orchestrator instead of re-dispatching the LLM Ticket node (logged
   deviation L-0041); consider making selection-only re-entry deterministic
   in the node spec.
4. Wrap ran as orchestrator-deterministic steps (commit, verify-as-CI,
   merge to develop — no PR per session directive); no .harness/ long-term
   memory entries exist yet post-rebuild, so Wrap had nothing to write there.
