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
  from graph-run) and never mount it on a graph node. If no reader can
  reply, say so and stop — do not even create the worktree.
- **Reading record, not a deliverable.** The landed file records this
  walkthrough. It is not a project deliverable and never a spec.
- **One stop at a time.** Show a stop, then wait for the reader.
- **Anchored.** Every stop is a record verified against real code
  while reading (see Step 3). The walk and the landing use the same
  records.
- **Read-only.** Any code change made during a walkthrough goes to the
  real repo, never into the worktree.

## Step 1: Determine mode and anchor

First check that a reader can reply in this conversation. If not,
explain and stop — create nothing, including the worktree.

Then establish whose question this walkthrough answers — the
reader's. Infer mode and depth from their words:

- **Codebase tour** — the default when there is no clear anchor. The
  anchor defaults to the system's primary execution path. A directory
  or module the user names narrows the scope. "Onboard me" is a tour.
- **Topic trace** — follow one real execution path (a request, a
  command, an event) from its entry point through the code it touches.
  "How does login work" is a topic trace.

Depth defaults to standard (9–13 stops); "quick look" or "overview"
means quick, "in depth" or "everything" means deep. Ask clarifying
questions only when the request is genuinely ambiguous.

Ask for the landing location only in this first turn — folded into a
clarifying question or the first stop, never as its own turn. Default
`.codewalk/<topic>.md` under the directory reported by
`git rev-parse --show-toplevel`, with `<topic>` a kebab-case slug.

## Step 2: Recon

Create the pinned worktree (below) and do all reading inside it. The
pin is the repository's `HEAD` at walk start — its full SHA. The
walkthrough describes only the last commit; uncommitted changes appear
only if the user commits and restarts.

Read progressively: structural signals (entry points, manifests,
directory layout) → Grep to locate → read only what is needed.
Vertical slices beat shallow overviews. If the scope is too large to
read directly, dispatch an Explore subagent with a self-contained
prompt (question, scope, what to skip, the worktree path and the pin,
so it reads the pinned tree, not the working tree) and a fixed report format
(symbol, `file:line`, one-line role) — then verify what you cite.

### Pinned worktree via the script

The mechanics belong to the bundled worktree script — never run raw
`git worktree` commands. From the repository (any checkout), resolve
the full `HEAD` SHA with `git rev-parse HEAD`, then:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" ensure --detach <full-sha>
```

The script creates or reuses the read-only pin at
`<worktrees-location>/pin-<short-sha>` (reference default
`.project/worktrees/pin-<short-sha>`), with hooks disabled, LFS smudge
off, no project code executed, the area kept out of version control,
and a probe-read performed before it reports. Read its single stdout
JSON:

- `"ok": true` — record the returned path and pin, read only there.
- `"error": "probe_failure"` or `"not_a_git_repository"` — use the
  fallback below; the result carries `"pin": "unknown"`.
- any other error — report it and use the fallback.

No automatic cleanup. Pins persist for reuse; removal is the user's,
via `git worktree remove <path>`.

### Citation boundaries and fallback

Read and cite only the project's own source — never dependencies,
build output, or vendored code. Apply that as judgment; do not write a
`.gitignore` parser. Never cite gitignored or out-of-repo code. When a
path reaches a dependency, describe the boundary without citing its
code. Submodules are boundaries: describe them, never cite their
content.

Fallback: if there is no git, no repository, no commits, or the
pinned worktree cannot be created or read, read the working tree
directly and pin `unknown`.

## Step 3: Build the route

Order the narrative by understanding, not by file-tree order. Fixed
arc: orientation → high-level map → core path → next steps. End with
next steps, not a recap. The high-level map is part of stop 1, and
"Next steps" is a closing section, not a counted stop.

Stop count by depth: quick 5–8, standard 9–13, deep 14–18. `deeper on
N` sub-stops do not count toward these ranges.

Every stop passes the SMIG check and must teach something the reader
would not get from just opening the file:

- **Situation** — where we are and why we are here.
- **Mechanism** — how the code does it.
- **Implication** — what this means for the rest of the path.
- **Gotcha** — what will surprise or mislead a newcomer.

A stop record is defined once, here: anchor, `file:line`, and a
verbatim code snapshot. While reading, create the anchor (a symbol or
pattern) and verify it — the pattern must identify the stop's line
unambiguously, with enough surrounding context to be unique in the
cited file. Then record `file:line` and copy the snapshot at that
moment, never reconstructing it later. The pin is walk-level: one HEAD
per walk. Stops added by replanning, jumps, or `deeper on N` are
verified and recorded the same way.

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
HTML comments in the template are instructions to you (including
"repeat the per-stop section"); never copy them into the landed file.

Fill the template from the Step 3 stop records. Record only stops
actually presented to the reader, including `deeper on N` sub-stops.
Fence each snapshot with more backticks than its content contains.
Cite only files confirmed to exist. Promise verifiability against the pin, not
permanent correctness. When the pin is `unknown`, the drift notice
must not emit `git show unknown:<path>`; it states that no commit was
recorded and snapshots reflect the working tree at the recorded date.

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
