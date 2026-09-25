---
name: handoff
description: Persist in-flight decisions, dead ends, and next steps into the CLAUDE.md-declared session-memory file so a cold-start agent can resume the work. Invoked from the harness-flow clock-in/clock-out loop and from the manual /open-skills:handoff command. Do not invoke automatically.
disable-model-invocation: true
---

# handoff

Write a handoff file that lets an agent with NO access to this conversation resume the work. The reader is a cold-start agent: it has the repo and this one file, nothing else. Write for that reader.

Session memory is a third memory tier, distinct from `.harness/` (long-term, merge-moment writes only) and short-term memory — the work-unit state file and any declared work-unit tool (goal, completed work, task/contract state). The handoff records only what those two tiers cannot: in-flight decisions and rationale, dead ends, and cold-start-executable next steps. It MUST NOT record goal, completed-work, or task-state content — that belongs to the short-term tool, and duplicating it here recreates the drift better-handoff had.

## 1. Resolve the declared location

Read the root CLAUDE.md's Harness section for a `session memory:` bullet.

- If the bullet is present, its value is the handoff file's location (the default a project's init run would have filled is `.project/handoff.md`, but always use the declared value, not this default).
- If the bullet is missing, do NOT guess a path and do NOT write anywhere. Report that no session memory location is declared, suggest running `/open-skills:init` in update mode to add the bullet, and stop here.

## 2. Collect state

From the current session, gather exactly these three categories:

- **Decisions & rationale** — in-flight decisions not yet recorded at a merge moment, and why each was made (trade-offs, rejected alternatives). This is the context a cold-start agent most lacks; do not omit it.
- **Dead ends** — approaches already tried and ruled out, each naming the approach and why it failed, so the next session does not re-walk them.
- **Next steps** — concrete and ordered. Each step must be actionable by a cold-start agent without asking the user anything.

Do NOT collect a goal statement, a completed-items list, or task/scope state — if any surfaces while gathering, drop it; short-term memory remains its only home.

## 3. Nothing-to-hand-off guard

Check the next steps gathered above: does at least one actionable unfinished next step exist?

- If none exist (all work is done, nothing left to act on):
  - Do NOT write the handoff file.
  - If the declared file already exists, delete it — it is stale.
  - Report that there is nothing to hand off (mention the stale file was cleared, if one existed). Stop here; skip the remaining steps.
- If at least one actionable unfinished next step exists, proceed.

## 4. Write the file

Fill this skill's template at `${CLAUDE_PLUGIN_ROOT}/skills/handoff/templates/handoff.md.template` and write it to the declared location, overwriting any existing file. `{{date}}` is today's date in YYYY-MM-DD format.

- One file, overwritten each time. History is git's job — never create dated copies like `handoff-2026-07-07.md`.
- If the declared location's parent directory does not exist, create it.

## 5. Cold-reader self-check

Re-read the finished file as if you had no session context:

- Does every file path attributed to existing work actually exist? Check each one. Paths a next step will create are exempt — they are not supposed to exist yet.
- Is every next step concrete enough to act on directly, without guessing?
- Any conversation-only references? Phrases like "the approach we discussed" are failures — expand them in place.
- Does each dead end name the approach and why it failed?

Fix any failure and re-check. Then report the file path.
