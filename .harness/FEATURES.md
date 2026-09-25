# Features

<!--
Purpose: index of active verified behavior — passing-only. A row's presence IS its passing state; there is no other status field here. The full record lives in `features/F-NNN.md`.
Written by: the orchestrator (main session) only, at a merge moment (completion of a verified work unit; never at init, since nothing is verified yet). Never written by implementor or reviewer agents.
Reading: read this index in full; read a detail file only when the work at hand touches what its row covers. Archived entries are not read unless a detail file points at one.
Entry format: each detail file follows the plugin's FEATURE-ENTRY template and MUST record a behavior description, the executable verification command that proves it, and evidence — at minimum the reviewer verdict date, a verification output summary, and the work-unit identifier. Commit hashes are NOT used as evidence references. An entry whose verification is not an executable command is malformed — produce the command first. IDs are allocated sequentially across `features/` and `features/archive/` and never reused.
Rule: entries are never demoted and evidence is never removed; pre-passing states (not_started, active, blocked) live in the work-unit state file (short-term memory), not here. A detail file's content is never edited. The only permitted change is retirement, made at the merge moment of a work unit whose contract Scope names the removal or replacement of that behavior: set the entry's Status to `superseded by F-NNN` or `retired in <work-unit identifier>`, move it to `features/archive/`, and remove its row here.
-->

| ID | Behavior | Work unit |
|---|---|---|
