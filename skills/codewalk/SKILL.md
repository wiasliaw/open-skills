---
name: codewalk
description: Walks a reader through code as an interactive, conversation-paced tour — an orientation to a whole codebase, or one real execution path traced end to end — then lands the route as a markdown walkthrough pinned to a commit and anchored to code content. Use whenever someone wants to understand how existing code works, even if they never say "tour" — "walk me through the checkout flow", "how does X work end to end", "give me a tour of this codebase", "onboard me", "explain how a request flows through this". Skip for single-fact questions answered directly (where is X defined, what does this flag do), for contexts where no one can reply turn by turn (subagents, headless runs), and for finding defects or judging changes — send those to request-code-review.
---

# Codewalk

An anchored walkthrough: a guided route through real code, delivered
one stop per turn, then landed as a file a later reader can check
against the source. The reader is learning, not auditing.

Core loop rules — they hold in every step:

- **The walk is interactive only:** it needs a reader replying here.
  Where no one can (a subagent, a headless run), do not walk or land:
  answer the question directly, or say the walk needs an interactive session.
- **One stop per turn.** The reader sets the pace and keeps room to steer.
- **Cite only what you have read** in this session. One citation that
  does not resolve teaches the reader to distrust the whole route.
- **Understanding order, not file order.** Present code in the order
  the reader needs it — usually execution order, never tree order.
- **Explain, never judge.** Describe what the code does and why;
  verdicts on its quality belong to a review.
- **The landed file is a reading record** of this walk, not a project
  deliverable: the session running the walk writes it directly, even
  where project instructions route deliverables through an orchestrator.

## Step 1: Determine mode and anchor

- **Codebase tour** — orientation to a repository or module; the
  default when the user names no question or feature. Its anchor is the
  system's primary path — what it does, starting from the main entry
  point found in recon; a named directory or module scopes the tour.
- **Topic trace** — follow one real execution path to answer one
  question ("how does a request get authenticated?"). The anchor is
  that question plus the entry point the path starts from.

Infer mode, reader (new contributor, reviewer, returning author), and
depth (quick, standard, deep; default standard) from the user's words.
Ask at most one clarifying question, only when the request is genuinely
ambiguous — every question delays the first stop. In the first turn only,
ask where to land the file (default `docs/walkthroughs/<topic>.md`), with
the clarifying question if any, else alongside the first stop — never in
a turn of its own. No answer means the default.

## Step 2: Recon

Read progressively, never front to back: structural signals (manifests,
entry points such as `main`, CLI definitions, route tables, package
roots; directory shape), then Grep and Glob to locate the symbols and
call sites the route needs, then only the files and ranges it uses.
Trace one vertical slice end to end instead of surveying every module:
a slice shows how the parts connect; a survey only that they exist.

For large scopes, dispatch parallel Explore subagents, one per area, with
self-contained prompts (they see neither this conversation nor this file)
and a fixed report schema: entry points, call path as `file:line` →
`file:line`, key types and roles, anything not found. Reports are leads,
not citations: re-read every file you will cite.

## Step 3: Build the route

Arrange the route on a fixed arc. Stops carry code; framing does not:

1. **Orientation stop** — what this code is for, anchored to a real
   file (a README, the entry point), not to general knowledge.
2. **Map** (framing) — a short picture of the parts on the route and
   how they connect; a few lines or a small diagram, not an inventory.
3. **Core-path stops** — in execution order.
4. **What you can do next** (framing) — where a change of this kind
   would go, which test exercises the path, what to read next. No recap.

Numbering: the orientation stop is stop 1; core-path stops continue
from 2. Stops by depth: quick 5–8, standard 9–13, deep 14–18. Past 18
the reader loses the thread — offer two walkthroughs instead. A stop
must teach what the file alone cannot — the connection, the reason, the
consequence; cut any stop that does not serve the goal.

Each stop is one **stop record**, defined here and nowhere else: number,
title, `file:line`, content anchor (a symbol name or text pattern), a
short verbatim snapshot copied from the file (never retyped from
memory), and the SMIG narrative:

- **Situation** — where we are on the path and how we got here.
- **Mechanism** — what this code does and how, at the depth needed.
- **Implication** — why it matters for the next stop or the goal.
- **Gotcha** — the non-obvious part (ordering, side effect, naming), if any.

Capture each record while reading its code and verify its anchor then:
matched as a literal string (escape regex metacharacters for Grep), it
occurs exactly once in the cited file, and the record's `file:line` comes
from that match. If a symbol is not unique, use a longer pattern such as
the full signature line, never a bare line number (lines drift). Fix or
drop a record that fails, including stops added by a re-plan or `skip to`.

## Step 4: Walk

Present one stop record per turn: `N. title`, `file:line`, the snapshot
as the code excerpt, then the SMIG narrative. Fence each snapshot, and
any backtick-wrapped anchor, with a backtick run longer than any inside
it, so embedded fences cannot break it.

Turn placement: the map follows stop 1, in the same turn. The closing
follows the last core-path stop, and Step 5 runs in that same turn — the
reader never has to type `land`. In the closing, name a file or test
only if you read it in this session (locate it with Glob/Grep first; a
Glob hit proves existence, not behavior), and call a test one that
exercises the path only if it references a symbol on the route;
otherwise describe it without a path. End each stop turn except the
last (which lands) with the controls in one line:

- `next` — the following stop.
- `deeper on N` — expand stop N, then return; landed only if asked.
- `skip to X` — jump to the named stop, or to an off-route topic:
  capture and verify its record, insert it right after the current stop
  with the next number, and renumber unshown stops after it (shown stops
  keep theirs; inserted stops count toward the depth cap).
- `land` — end the walk now: the closing, then Step 5 for every record.

Answer side questions in place, then offer to resume. If one shows the
route is wrong, say so and re-plan the rest; shown stops keep numbers.

## Step 5: Land

If the landing path already exists, say so and ask whether to
overwrite it or choose a new name; write nothing until they answer.
Before pinning, confirm each record's snapshot still appears verbatim
in its file and its anchor still matches exactly once; re-capture any
record that drifted during the walk, or drop it and say so.

Pin the commit honestly with `git rev-parse HEAD`; if it fails for any
reason (git unavailable, not a repository, no commits yet), record
`unknown` — never invent a SHA. A cited file is uncovered if it lies
outside the repository root (no git needed), if
`git status --porcelain --ignored -- <in-repo cited files>` lists it or a
parent directory covering it (modified, `??`, `!!`), or if that command fails.
List every uncovered file in `<sha> + uncommitted changes in <files>`
and fill the notice's working-tree note to say the snapshots come from
the working tree; if every cited file is covered, leave the note empty.

Fill `${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template`
and write it, creating parent directories. Header: topic, mode, depth,
commit pin, today's date (YYYY-MM-DD). Write every stop record in route
order (stop 1 in the orientation block, then one core-path block each)
with the Step 4 backtick rule; map and closing are prose only. Keep the
notice that the file may drift afterward, and report the written path.

## Prohibitions

- Never modify source code; the only file written is the walkthrough.
- Never cite a file you have not read in this session.
- If a file or symbol cannot be found, say so and skip it — never
  guess its contents or location.
- No file-listing descriptions ("this file contains..."). Describe
  behavior and connections, not inventory.
- No shallow whole-repo surveys. Depth on one path beats a glance at
  every module.
- No findings, verdicts, or smell/risk analysis. If the reader wants
  the code judged, point them to request-code-review.
