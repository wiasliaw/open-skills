---
name: codewalk
description: Walks a reader through code as an interactive, conversation-paced tour — an orientation to a whole codebase, or one real execution path traced end to end — then lands the route as a markdown walkthrough pinned to a commit and anchored to code content. Use whenever someone wants to understand how existing code works, even if they never say "tour" — "walk me through the checkout flow", "how does X work end to end", "give me a tour of this codebase", "onboard me", "explain how a request flows through this". Skip for single-fact questions answered directly (where is X defined, what does this flag do), for contexts where no one can reply turn by turn (subagents, headless runs), and for finding defects or judging changes — send those to request-code-review.
---

# Codewalk

An anchored walkthrough: a guided route through real code, delivered one
stop per turn, then landed as a file a later reader can check against the
source. The reader is learning, not auditing.

Core loop rules — they hold in every step:

- **The walk is interactive only:** it needs a reader replying here. Where
  no one can (a subagent, a headless run), do not walk or land: answer the
  question directly, or say the walk needs an interactive session.
- **One stop per turn.** The reader sets the pace and keeps room to steer.
- **Cite only what you have read** in this session. One citation that does
  not resolve teaches the reader to distrust the whole route.
- **Understanding order, not file order.** Present code in the order the
  reader needs it — usually execution order, never tree order.
- **Explain, never judge.** Verdicts on code quality belong to a review.
- **The landed file is a reading record** of this walk, not a project
  deliverable: the session running the walk writes it directly, even where
  project instructions route deliverables through an orchestrator.

## Step 1: Determine mode and anchor

- **Codebase tour** — orientation to a repository or module; the default
  when the user names no question or feature. Its anchor is the system's
  primary path — what it does, starting from the main entry point found in
  recon; a named directory or module scopes the tour.
- **Topic trace** — follow one real execution path to answer one question
  ("how does auth work?"); the anchor is that question plus its entry point.

Infer mode, reader (new contributor, reviewer, returning author), and depth
(quick, standard, deep; default standard) from the user's words. Ask at
most one clarifying question, only when genuinely ambiguous — each delays
the first stop. In the first turn only (with that question, else with the
first stop, never alone), ask where to land the file; no answer means the
default, `.codewalk/<topic>.md` — tool output to commit or gitignore.

## Step 2: Recon

Recon opens, before your first reply, by copying HEAD into a temporary git
worktree, so the pin is exact by construction. In a git repository with at
least one commit, `<path>` is `codewalk-<repo-name>-<short-sha>` in the system
temp directory, outside the repository, so a rerun finds its own stale copy:

- Run `git worktree prune`, `git worktree remove --force <path>` (an error
  only means no stale copy), then `git worktree add --detach <path> HEAD`.
  The pin is `git -C <path> rev-parse HEAD`, recorded now.
- Read, Grep and Glob code only inside `<path>`. Every `file:line` you show
  or land is repo-relative: strip the `<path>/` prefix.
- In the first turn, say in one clause that the walk describes the last
  commit (short SHA) and excludes uncommitted changes (commit first).
- Run `git worktree remove --force <path>` after landing, and when the walk
  ends without landing; to go on after landing, re-add it at the pin first.

If git is unavailable, this is not a repository, it has no commits, or the
worktree cannot be created, read the working tree directly, record the pin as
`unknown`, and say so — never invent a SHA. Either way, cite only tracked
project code: never gitignored paths (dependencies such as `node_modules`,
build output) or files outside the repository; where the path crosses into
one, name the boundary in prose ("hands off to the framework's router")
without citing its code.

Read progressively, never front to back: structural signals (manifests,
entry points, CLI definitions, route tables, directory shape), then Grep and
Glob to locate the symbols and call sites the route needs, then only the
files and ranges it uses. Trace one vertical slice end to end, not every module.

For large scopes, dispatch parallel Explore subagents, one per area, with
self-contained prompts (they see neither this conversation nor this file) that
give the worktree path and confine reading to it, and a fixed report schema:
entry points, call path as `file:line` → `file:line`, key types and roles,
anything not found. Reports are leads, not citations: re-read what you cite.

## Step 3: Build the route

Arrange the route on a fixed arc. Stops carry code; framing does not:

1. **Orientation stop** — what this code is for, anchored to a real file
   (a README, the entry point), not to general knowledge.
2. **Map** (framing) — a short picture of the parts on the route and how
   they connect; a few lines or a small diagram, not an inventory.
3. **Core-path stops** — in execution order.
4. **What you can do next** (framing) — where a change of this kind would
   go, which test exercises the path, what to read next. No recap.

Numbering: the orientation stop is stop 1; core-path stops continue from 2.
Stops by depth: quick 5–8, standard 9–13, deep 14–18; past 18, offer two
walkthroughs instead. A stop must teach what the file alone cannot — the
connection, the reason, the consequence; cut any that does not serve the goal.

Each stop is one **stop record**, defined here and nowhere else: number,
title, `file:line`, content anchor (a symbol name or text pattern), a short
verbatim snapshot copied from the file (never retyped), and SMIG narrative:

- **Situation** — where we are on the path and how we got here.
- **Mechanism** — what this code does and how, at the depth needed.
- **Implication** — why it matters for the next stop or the goal.
- **Gotcha** — the non-obvious part (ordering, side effect, naming), if any.

Capture each record while reading its code and verify its anchor then:
matched as a literal string (escape regex metacharacters for Grep), it
occurs exactly once in the cited file, and it gives the record's `file:line`.
If a symbol is not unique, use a longer pattern such as the full signature
line, never a bare line number. Fix or drop a record that fails, including
stops added by a re-plan or `skip to`.

## Step 4: Walk

Present one stop record per turn: `N. title`, `file:line`, the snapshot as
the code excerpt, then the SMIG narrative. Fence each snapshot, and any
backtick-wrapped anchor, with a backtick run longer than any inside it.

Turn placement: the map follows stop 1, in the same turn. The closing follows
the last core-path stop, and Step 5 runs in that same turn — the reader never
has to type `land`. In the closing, name a file or test only if you read it
this session (locate it with Glob/Grep first; a hit proves existence, not
behavior), and call a test one that exercises the path only if it references a
symbol on the route; otherwise describe it without a path. End each stop turn
except the last (which lands) with the controls line:

- `next` — the following stop.
- `deeper on N` — expand stop N, then return; landed only if asked,
  appended to that stop's narrative.
- `skip to X` — jump to the named stop, or to an off-route topic: capture
  and verify its record, insert it right after the current stop with the
  next number, and renumber unshown stops after it (shown stops keep
  theirs; inserted stops count toward the depth cap).
- `land` — end the walk now: the closing, then Step 5 for every record.

Answer side questions in place, then offer to resume. If one shows the
route is wrong, say so and re-plan the rest; shown stops keep numbers.

## Step 5: Land

Write in the real repository, never inside the worktree. If the landing
path already exists and existed before this walk, say so and ask whether
to overwrite it or choose a new name; write nothing until they answer.
Re-landing the file this walk already wrote overwrites it without asking.

Fill `${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template`
and write it, creating parent directories: header (topic, mode, depth, the
pin, today's date as YYYY-MM-DD), then every stop record in route order
(stop 1 in the orientation block, then one core-path block each) with the
Step 4 backtick rule; map and closing are prose only. Keep the notice that
the file may drift afterward, report the path, then remove the worktree.

## Prohibitions

- Never modify source code; the only files written are the walkthrough and
  the temporary worktree, which you remove.
- Never cite a file you have not read in this session.
- If a file or symbol cannot be found, say so and skip it — never guess.
- No file-listing descriptions ("this file contains..."); describe behavior.
- No shallow whole-repo surveys: depth on one path beats breadth.
- No findings, verdicts, or smell/risk analysis — refer to request-code-review.
