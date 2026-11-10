# Handoff — 2026-11-10

> If you are picking up this work: read this file fully. Goal, completed work, and task state live in short-term memory (the work-unit state file and any declared work-unit tool), not here. This file is overwritten or deleted at the next clock-out — do not hand-edit it to track ongoing state.

## Decisions & Rationale

- The use-loop skill is a one-shot sentinel subagent, not a watcher script or a daemon. The user excluded cross-session survival and periodic jobs, which removed the need for any resident process. Rationale and rejected shapes are in the work unit's Notes.
- The sentinel waits only in foreground Bash calls. Probe 1 showed a subagent that ends its turn on background Bash is not rewoken; probe 2 showed a foreground `until` loop costs zero model turns while waiting and wakes the orchestrator within a second.
- The sentinel is read-only and the orchestrator alone writes `.project/loops/<id>.md`. This keeps the unattended agent unable to mutate the project and matches the agents-never-write-state boundary in ARCHITECTURE.
- Verification uses `perl -CSD -ne '/\p{Han}/'` for the English-only check instead of `grep -P`, because the machine's `grep` is ugrep and a reviewer's grep can differ.

## Dead Ends

- Architecture A (`CronCreate` in the orchestrator dispatching a subagent per fire): every fire still lands a prompt in the orchestrator, and events need `Monitor`.
- Architecture B (child watcher `scripts/loop.mjs` plus `claude -p` workers reporting over the inbox socket): needs a new script, and messages into a `bypassPermissions` session are held for approval unless `crossSessionInbound: accept` is set. Documented in the work unit for a later version.
- Background Bash inside a subagent as the wait primitive: fails, see probe 1.
- Channels as the event path: custom servers need `--dangerously-load-development-channels`, which `-p` mode ignores.

## Next Steps

1. Clock in. Resume work unit `2026-11-10-use-loop-skill`; its Contract is the spec.
2. Create a feature branch for the implementation per GitHub flow, or keep `research-use-loop-skill-spec` if the user prefers one branch.
3. Dispatch `open-skills:implementor` for Feature 1 (`agents/sentinel.md`) with the Contract, C-001, and C-002.
4. After a reviewer pass, Features 2, 3, 4 in order. Feature 4 is the token-spending acceptance probe; run it once, just before the reviewer verdict.
5. At the merge moment record the three decision candidates listed in the work unit's Notes and add `agents/sentinel.md` and `skills/use-loop/` to ARCHITECTURE.
