---
name: codewalk
description: Walks a reader through code as an interactive, conversation-paced tour — an orientation to a whole codebase, or one real execution path traced end to end — then lands the route as a markdown walkthrough pinned to a commit and anchored to code content. Use whenever someone wants to understand how existing code works, even if they never say "tour" — "walk me through the checkout flow", "how does X work end to end", "give me a tour of this codebase", "onboard me", "explain how a request flows through this". Skip for single-fact questions answered directly (where is X defined, what does this flag do), and for finding defects or judging changes — send those to request-code-review.
---

# Codewalk

An anchored walkthrough: a guided route through real code, delivered
one stop per turn, then landed as a file a later reader can check
against the source. The reader is learning, not auditing — every stop
exists to move their understanding forward.

Core loop rules — they hold in every step:

- **One stop per turn.** The reader sets the pace; ten stops in one
  message take away their chance to steer.
- **Cite only what you have read.** Every file, symbol, and line you
  mention was opened in this session. A citation that does not resolve
  teaches the reader to distrust the whole route.
- **Understanding order, not file order.** Present code in the order
  the reader needs it to make sense — usually execution order, never
  the order the directory tree happens to list it.
- **Explain, never judge.** Describe what the code does and why;
  verdicts on its quality belong to a review.

## Step 1: Determine mode and anchor

Pick one of two modes:

- **Codebase tour** — orientation to a whole repository or module. The
  default when the user names no specific question, path, or feature.
- **Topic trace** — follow one real execution path to answer one
  question ("how does a request get authenticated?"). The anchor is
  that question plus the entry point the path starts from.

Infer mode, reader (new contributor, reviewer, returning author), and
depth (quick, standard, deep; default standard) from the user's words.
Ask at most one clarifying question, only when the request is
genuinely ambiguous — every question delays the first stop.

Ask where the landed file should go, offering a default such as
`docs/walkthroughs/<topic>.md`, in the same message as the clarifying
question if there is one. When an orchestrator (e.g. harness-flow)
invoked this skill rather than the user directly, choose the location
yourself and state it — nobody is there to answer.

## Step 2: Recon

Read progressively, never front to back:

1. Structural signals — manifests, entry points (`main`, CLI
   definitions, route tables, package roots), directory shape.
2. Grep and Glob to locate the symbols and call sites the route needs.
3. Read only the files and ranges the route will actually use.

Trace one vertical slice end to end — input through each layer to
output — instead of surveying every module shallowly. A slice shows
how the parts connect; a survey only shows that they exist.

For large scopes, dispatch Explore subagents in parallel, one per
area, each with a self-contained prompt — it sees neither this
conversation nor this file. Require a fixed report schema: entry
points, the call path as `file:line` → `file:line`, key types and
roles, and anything not found. A report is a lead, not a citation:
re-read every file you will cite.

## Step 3: Build the route

Arrange the route on a fixed arc. Stops carry code; framing does not:

1. **Orientation stop** — what this code is for, anchored to a real
   file (a README, the entry point), not to general knowledge.
2. **Map** (framing) — a short high-level picture of the parts on the
   route and how they connect. A few lines or a small diagram, not an
   inventory. It goes in the same turn as the orientation stop.
3. **Core-path stops** — in execution order.
4. **What you can do next** (framing) — concrete follow-ups: where a
   change of this kind would go, which test exercises the path, what
   to read next. No recap. It comes after the last core-path stop.

Stop count by depth covers the orientation stop plus the core-path
stops; the map and the closing are framing and do not count: quick
5–8, standard 9–13, deep 14–18. Past 18 the reader loses the thread —
offer two walkthroughs instead.

Every stop passes SMIG:

- **Situation** — where we are on the path and how we got here.
- **Mechanism** — what this code does and how, at the level the
  reader's goal needs.
- **Implication** — why it matters for the next stop or the goal.
- **Gotcha** — the non-obvious part: an ordering constraint, a hidden
  side effect, a misleading name. If there is none, omit it.

A stop must teach something the reader could not get by reading the
file alone — the connection, the reason, the consequence. Cut any stop
that does not serve the reader's goal, however interesting.

Before presenting the first stop, verify every anchor: each cited file
was read, and each symbol or text pattern is found by Grep at the
cited location. Fix or drop anything that does not resolve.

## Step 4: Walk

Present one stop per turn: title, `file:line`, a short code excerpt,
then the SMIG narrative. The first turn adds the map after the
orientation stop; the closing follows the last core-path stop. End
each turn with the controls in one line:

- `next` — the following stop.
- `deeper on N` — expand stop N with more of its code or callees, then
  return to the route.
- `skip to X` — jump to the named stop or topic.
- `land` — end the walk at any time: give the closing, then land the
  full planned route (already verified) per Step 5.

Answer side questions in place, then offer to resume; if one shows the
route is wrong for this reader, re-plan the remaining stops and say so.

## Step 5: Land

Fill `${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template`
and write it to the agreed location, creating parent directories as
needed. Repeat the core-path stop block once per core-path stop, in
route order.

- **Header** — topic or question, mode, depth, the repo commit SHA at
  generation time (`git rev-parse HEAD`), and today's date
  (YYYY-MM-DD). If git is unavailable or this is not a repository,
  record the SHA as `unknown` and say so — never invent one.
- **Each stop** (orientation and core path) — title; `file:line`
  display reference; a content anchor (a symbol name or unique text
  pattern Grep can find); a short verbatim code snapshot copied from
  the file, not retyped from memory; the narrative. Line numbers drift
  with every edit, so a bare line number is never the only anchor.
- **Map** and **What you can do next** — framing sections: prose only,
  no anchor or snapshot.
- Keep the template's notice that the file describes that commit and
  may drift afterward — it is what keeps the file honest.

Report the written path.

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
