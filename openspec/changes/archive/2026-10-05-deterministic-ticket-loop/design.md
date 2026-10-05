## Context

Today every build dispatch runs worker → reviewer, each attempt leaving `report-<n>.md`, `review-<n>.md`, `steps-<n>.md`, and red/green stdout dumps in one flat stage directory (30+ files for 6 tickets in the demo). The per-ticket reviewer mostly re-runs one command. Red is produced by the same worker that implements, so it is a claim, not an observation, and the implementer can weaken the test. The e2e also hit the harness guardrail on subagent `report-*.md` writes and shipped with a stale `failed` ticket status.

## Goals / Non-Goals

**Goals:**
- Per-ticket verification is deterministic, orchestrator-run, and counted by the existing escalation rules.
- Red precedes implementation as the orchestrator's own observation; test tampering is mechanically detected.
- One file per worker attempt (the transcribed report); all command runs live in `log.ndjson`.
- Ticket status discipline enforced at the review-node boundary.

**Non-Goals:**
- No change to the final review validator node — it stays the single independent reviewer dispatch per path.
- No per-ticket worktrees or parallel tickets.
- No change to reviewer/advisor writing their own files (fallback only).
- No re-run of the demo unit's archived folder (a fresh e2e validates the change).

## Decisions

- **`verification.runner` on the node, validated by graph.mjs** (`reviewer` default, `orchestrator` opt-in). Routing-relevant behavior stays declared data (dispatch.md:3 principle), not prose special-casing of "ticketed paths". The build node declares it in the template; chore/maintenance builds get the same deterministic treatment, and the review node then provides the one independent review on every path (resolving the double-review of ticketless paths).
- **Escalation integration: orchestrator-run verdicts count exactly like reviewer verdicts** (signature `dims:…|cmd:…`, finest scope `ticket:<id>`/`node:<id>`), because escalation.md's "deterministic failures open problems directly" rule would otherwise skip the retry loop for every green failure. Exit 126/127 and unresolvable programs stay blocked-class (defect), so a broken environment cannot masquerade as red or as a counted failure.
- **Red is orchestrator work, sequenced as: land tests → red run → commit → dispatch worker.** Tickets therefore declare repo-relative target paths for their test artifacts (ticket node instruction; the ticket skill's output contract). `ticket-invalid` on a zero-exit red run needs no worker and no basis verification — the evidence is the orchestrator's own run.
- **Test integrity via git, not hashes on the side:** the tests were committed at red; `git -C "$WU_WORKTREE" diff --name-only <red-commit> -- <test paths>` names any drift before green is recorded. No sidecar hash files.
- **Verdict records:** `reviews[]` entries remain reviewer verdicts only (their schema requires a report file). Orchestrator-run verification is recorded as `step` log lines plus the ordinary `fail_counters` write; evidence references use `kind: "log"`. This keeps the work-unit.mjs change to one line (the `step` event) instead of loosening the reviews schema.
- **`step` log event** (`source: orchestrator`): `description` carries command, exit status, and a bounded output tail. Replaces `steps-<n>.md` everywhere (pre/post/terminal) and the red/green dump files; `log.ndjson` stays bounded by truncating tails.
- **Worker reports transcribed by the orchestrator, verbatim, no editorial header** beyond a fixed one-line provenance note; reviewer/advisor keep their own writes with the transcribe-on-block fallback (user decision: minimal change, extend only if the guardrail widens).

## Risks / Trade-offs

- [Orchestrator (an LLM) now produces verdicts] → The verdict is derived from exit statuses and a git diff — both recorded as `step` lines a third party can re-check; judgment-dependent review still exists at the review node.
- [Worker restriction violations no longer caught per attempt] → Build post-steps commit per ticket, so `git log -p` at the review node attributes worktree changes; main-checkout and `.harness/` writes were never visible in any diff — the review node's restriction-compliance dimension and the gate's consistency checks remain the detectors, unchanged from before for those paths.
- [Tickets without usable target paths] → The decomposition's verification already requires executable tests as artifacts; target paths become part of the same contract, checked when the ticket node's output is reviewed. A ticket whose test cannot land is a failing decomposition, caught before build.
- [log.ndjson growth] → Tails are truncated (reference: last 20 lines); full output is reproducible by re-running the command in the worktree.

## Migration Plan

Docs, template, and two one-line script changes land together; the demo's archived unit is historical and untouched. Acceptance: scripts' test suites green, template re-validates, and a fresh demo e2e run exercises red-by-orchestrator, a deterministic green, the transcribed reports, and the ticket-status invariant.
