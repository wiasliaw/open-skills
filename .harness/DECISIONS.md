# Decisions

<!--
Purpose: index of the active major decisions — the ones where "why is it this way" would not be evident from the code months later. One row per active decision; the full record lives in `decisions/D-NNN.md`.
Written by: the orchestrator (main session) only, at a merge moment (init completion, or completion of a verified work unit). Never written by implementor or reviewer agents.
Reading: read this index in full; read a detail file only when the work at hand touches what its row covers. Archived entries are not read unless a detail file points at one.
Entry format: each detail file follows the plugin's DECISION-ENTRY template — status, date, decision, rationale, rejected alternatives, supersedes. IDs are allocated sequentially across `decisions/` and `decisions/archive/` and never reused.
Rule: a detail file's content is never edited. The only permitted change is supersession, made at the merge moment that records the replacing decision: set the old entry's Status to `superseded by D-NNN`, move it to `decisions/archive/`, and remove its row here.
-->

| ID | Date | Decision |
|---|---|---|
| D-001 | 2026-09-27 | Adapt the thermo-nuclear rubric into Lens 2, not import it |
| D-002 | 2026-09-30 | codewalk resolves git paths dynamically instead of using WOR-31's literal path wording |
| D-003 | 2026-09-30 | Walkthrough template pins per walk in the header only, dropping WOR-31's per-stop SHA |
| D-005 | 2026-10-16 | use-worktree is config-free on main — no config file, no setup subcommand, fixed HEAD base and .project/worktrees location |
| D-006 | 2026-10-30 | pm ships public policy defaults only — workspace and project values live in the Linear project charter |
| D-007 | 2026-11-10 | The sentinel waits only inside foreground Bash calls, re-armed under a 9-minute timeout |
| D-008 | 2026-11-10 | The sentinel is read-only and the orchestrator alone writes the loop journal |
| D-009 | 2026-11-10 | use-loop covers change-waits inside one session only — periodic and cross-session work is pointed elsewhere |
