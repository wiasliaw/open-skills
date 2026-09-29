---
name: codewalk
description: Use when the user wants to be guided through code they do not know yet — "walk me through", "how does X work end to end", "give me a tour of this codebase", "onboard me". Runs an interactive, reader-paced walkthrough of one real execution path (topic trace) or the system's main path (codebase tour), anchored to verified file:line citations pinned to a commit, and lands a reading record. Interactive only; skip for single-fact questions (just answer them) and for finding defects (use request-code-review).
---

# Codewalk

Guide a reader through real code, one verified stop at a time, then
leave them a reading record they can check against the pinned commit.
The value is in the order and the explanation — what to read first, why
it matters, what will trip you up — not in listing files.

## Core rules

- **Interactive only.** The walk needs a reader who replies in this
  conversation. Never run under orchestrator dispatch (for example
  from harness-flow). If no reader can reply, say so and stop — do not
  even create the worktree.
- **Reading record, not a deliverable.** The landed file records this
  walkthrough. It is not a project deliverable and never a spec.
- **One stop at a time.** Show a stop, then wait for the reader.
- **Anchored.** Every stop is a record verified against real code
  while reading (see Step 3). The walk and the landing use the same
  records.
- **Read-only.** Any code change made during a walkthrough goes to the
  real repo, never into the worktree.

## Modes

- **Codebase tour** — the default when there is no clear anchor. The
  anchor defaults to the system's primary execution path. A directory
  or module the user names narrows the scope.
- **Topic trace** — follow one real execution path (a request, a
  command, an event) from its entry point through the code it touches.

## Step 1: Determine mode and anchor

First establish whose question this walkthrough answers — the
reader's. Infer mode and depth from their words: "how does login work"
is a topic trace; "onboard me" is a tour. Ask at most one clarifying
question, and only when the request is genuinely ambiguous.

Ask for the landing location only in this first turn — folded into the
clarifying question or the first stop, never as its own turn. Default
`.codewalk/<topic>.md`, with `<topic>` a kebab-case slug. The slug
`worktree` is reserved for the worktree directory; never use it as a
filename.

## Step 2: Recon

Create the pinned worktree (below) and do all reading inside it. The
pin is that worktree's HEAD SHA. The walkthrough describes only the
last commit; uncommitted changes appear only if the user commits and
restarts.

Read progressively: structural signals (entry points, manifests,
directory layout) → Grep to locate → read only what is needed.
Vertical slices beat shallow overviews. If the scope is too large to
read directly, dispatch an Explore subagent with a self-contained
prompt (question, scope, what to skip) and a fixed report format
(symbol, `file:line`, one-line role) — then verify what you cite.

### Worktree lifecycle

- Path: `.codewalk/worktree/codewalk-<short-sha>` inside the repo, so
  reads stay inside the session working directory (including when
  launched from a linked worktree). The name comes from the pinned
  commit.
- If a worktree for the same SHA already exists, reuse it — never
  rebuild.
- Create it with hooks disabled and LFS smudge off. Never execute
  project code.
- On creation, add `.codewalk/worktree/` to `.git/info/exclude` if not
  already present. Touch no tracked file.
- Probe-read one tracked file inside the worktree before recording the
  pin. If the probe fails, use the fallback and pin `unknown`.
- If creation fails because the path is already registered to git (a
  stale registration whose directory was deleted by hand), run
  `git worktree remove --force` on that exact path only, then retry the
  add once. NEVER run global `git worktree prune`.
- No automatic cleanup. Worktrees persist for reuse; the `codewalk-`
  prefix marks their purpose. Removal is the user's, via
  `git worktree remove .codewalk/worktree/codewalk-<sha>`.

### Fallback

If there is no git, no repository, no commits, or the worktree cannot
be created or read, read the working tree directly and pin `unknown`.
Read and cite only the project's own source — never dependencies,
build output, or vendored code. Apply that as judgment; do not write a
`.gitignore` parser.

### Citation boundaries

Never cite gitignored or out-of-repo code. When a path reaches a
dependency, describe the boundary without citing its code. Submodules
are boundaries: describe them, never cite their content.

## Step 3: Build the route

Order the narrative by understanding, not by file-tree order. Fixed
arc: orientation → high-level map → core path → next steps. End with
next steps, not a recap.

Stop count by depth: quick 5–8, standard 9–13, deep 14–18.

Every stop passes the SMIG check and must teach something the reader
would not get from just opening the file:

- **Situation** — where we are and why we are here.
- **Mechanism** — how the code does it.
- **Implication** — what this means for the rest of the path.
- **Gotcha** — what will surprise or mislead a newcomer.

A stop record is defined once: while reading the code, create the
anchor (a symbol or pattern) and verify it — it must match uniquely in
the cited file — then record `file:line`. Stops added by replanning or
jumps are verified the same way.

## Step 4: Walk

Present one stop, then wait. The reader paces the walk:

- `next` — the following stop.
- `deeper on N` — sub-stops for stop N, explicitly numbered (N.1, N.2).
- `skip to X` — jump to stop X, or to landing at any time.

Orientation is stop 1; the core path starts at stop 2. Jumping back
never produces duplicate numbers — revisit a stop by its existing
number.

## Step 5: Land

After the last stop (or when the reader skips to landing), write the
walkthrough file into the real repo — never into the worktree — by
filling
`${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template`.

Per stop, record the content anchor, `file:line`, the commit SHA
pinned at generation, and a verbatim code snapshot fenced with more
backticks than the content contains. Cite only files confirmed to
exist. Promise verifiability against the pin, not permanent
correctness.

If the landing file already existed before this walkthrough began,
ask before overwriting. Re-landing the file this walkthrough itself
wrote needs no second ask. Create the parent directory if missing.

## The six prohibitions

1. Never modify any source code.
2. Never cite a file you have not read.
3. When something cannot be found, say so — never guess.
4. No file-listing-style descriptions.
5. No whole-repo shallow overviews.
6. No judging: no findings, no verdicts. For defects, refer the user
   to request-code-review.
