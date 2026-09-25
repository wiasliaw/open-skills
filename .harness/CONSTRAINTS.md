# Constraints

<!--
Purpose: the project's non-negotiable hard constraints.
Written by: the orchestrator (main session) only, at a merge moment (init completion, or completion of a verified work unit). Never written by implementor or reviewer agents.
Format: each entry is phrased MUST or MUST NOT, and MUST carry a source (why it exists) and an applicability condition (when it applies).
Budget: at most 15 entries. Adding a 16th requires removing or consolidating an existing one first — if a new constraint is warranted and the file already holds 15, the orchestrator completes the merge moment without writing it and surfaces the conflict to the user for resolution.
-->

## C-001: Repository content in English

- **Rule**: All tracked files (skills, agents, docs, README, CLAUDE.md, `.harness/`) MUST be written in English.
- **Source**: Declared by the project owner at init; the plugin is published for a public audience.
- **Applicability**: Any change that adds or edits tracked file content.

## C-002: User-facing docs stay in sync with skills

- **Rule**: Every user-facing skill MUST be covered by a `docs/` page and a row in README's Skills table, and those MUST be updated in the same change that adds, renames, removes, or changes the usage of the skill.
- **Source**: Declared by the project owner at init; README and `docs/` are the plugin's only user-facing discovery path.
- **Applicability**: Changes to `skills/` or `agents/` that alter a skill's existence, name, invocation, or user-visible behavior.
