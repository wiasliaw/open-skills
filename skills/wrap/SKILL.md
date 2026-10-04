---
name: wrap
description: Use when a line of work is ending and the next session must be able to take over cold — "wrap up", "close out", "clean up before I stop" — or when mounted as the close-out node of a graph. Leaves verification green, consolidates draft deltas into pending memory entries, removes residue, closes workflow-tool state, and ends at handover with a handoff record. Skip mid-task; it is not a commit or PR command.
---

# wrap

Ends a line of work so a successor session can resume from versioned records alone. Close-out is the only place long-term memory is written, and the only place a unit's residue is cleaned.

## The clean-state guarantee

When you finish, all of these hold:

- Declared verification passes.
- Progress and outcomes are in versioned files, never only in conversation.
- No temporary or debugging artifacts remain.
- No workflow tool is mid-flight.
- The standard entry path of the project works.

A successor must not have to guess whether anything left behind is intentional. Every step below is idempotent: if close-out is interrupted, run it again and it converges to the same state with no extra side effects.

## Steps

1. **Verify.** Run the project's declared verification commands (from the root CLAUDE.md or `.harness/config.json`). Do not proceed on red; report blocked with the failing command and exit status.
2. **Consolidate deltas into memory.** Collect the durable outcomes of the line of work: decisions made, features landed, proposed constraint or architecture changes. Fold in any draft deltas written along the way: deduplicate, resolve relations, and drop every draft a review report named as rejected. Write each result as a pending entry in the delta ledger. Entry format, ids, and relation fields: see [references/delta-entries.md](references/delta-entries.md).
3. **Never touch current truth.** Do not edit a current-truth document (architecture, constraints) and do not create a separate graph file. Pending deltas are folded in later by a maintenance apply unit. Never edit an existing ledger entry; supersede it with a new one.
4. **Clean residue.** Remove, inside the working copy only: temp files, intermediate artifacts, debug output statements, commented-out experiments, and dead TODO markers introduced by this line of work. Leave pre-existing code alone.
5. **Close workflow-tool state.** If the work ran through a tool with its own lifecycle, complete it (for example `openspec archive` for an applied OpenSpec change). Leave nothing dangling.
6. **Write the handoff record.** What was done, what was decided (ids of the delta entries you created), what remains. Its reader is the next session or human.

## Ends at handover

Two halves:

- **LLM half (this skill):** the consolidated delta entries and the handoff record.
- **Deterministic half (not this skill):** commit, push, open the delivery channel the project uses (reference: a pull request), and remove the worktree. These run as commands, only after the deliverables pass review, so nothing irreversible precedes the reviewer's verdict.

Do not remove the worktree yourself. Do not wait for CI or any asynchronous result and do not hold open state for one. A failure found after handover (red CI, a merge conflict) re-enters as a new work unit with trigger `ci-failure` or the human's prompt; the closed unit is never reopened.

Standalone, finish by telling the human that the deliverables are ready and what the delivery steps will do.

## Graph profile

When mounted on a graph node (exactly one node per graph), additionally:

- Work inside the worktree the orchestrator provisions for this node, exactly as for a build node (reused when the unit's worktree is live). See the `use-worktree` skill.
- Read the draft deltas from the work unit's stage directories in the **main checkout**; merge the entries into the ledger **inside the worktree**, so they travel on the unit's own branch.
- Write the handoff record as a deliverable in your own stage directory (`handoff.md`). The terminal's deterministic steps copy it to the work-unit folder root. Do not write to the folder root, `state.json`, or `log.ndjson`.
- Report the outcome `handed-off`. The orchestrator routes by the node's declared edges. If you cannot finish, report blocked; the universal in-place fallback chain takes over.
