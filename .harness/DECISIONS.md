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
