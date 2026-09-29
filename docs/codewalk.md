# codewalk

Get walked through code you don't know yet. You ask a question or ask
for a tour, and the agent guides you one stop at a time, each stop
anchored to a verified `file:line` at a pinned commit. At the end you
get a reading record you can check later.

## Usage

```
/open-skills:codewalk
/open-skills:codewalk how does login work end to end
```

Or ask in plain words: "walk me through the request pipeline", "how
does X work end to end", "give me a tour of this codebase", "onboard
me". Two modes are inferred from what you say:

- **Codebase tour** — when there is no clear anchor. It follows the
  system's primary execution path; naming a directory or module
  narrows the scope.
- **Topic trace** — follows one real execution path.

codewalk is interactive only: it needs you to reply in the
conversation, and it will not run under an orchestrator. For a
single-fact question just ask it directly; to find defects use
request-code-review.

## What happens

1. **Determine mode and anchor.** The agent infers mode and depth from
   your words and asks at most one clarifying question. The landing
   location is asked once, in this first turn; the default is
   `.codewalk/<topic>.md`.
2. **Recon.** The agent creates a worktree of `HEAD` at
   `.codewalk/worktree/codewalk-<short-sha>` and reads only there. That
   commit is the pin. If a worktree for the same commit exists, it is
   reused. `.codewalk/worktree/` is added to `.git/info/exclude`, so no
   tracked file changes; hooks and LFS smudge are off and no project
   code is executed.
3. **Build route.** Orientation, high-level map, core path, next steps,
   in 5–8, 9–13, or 14–18 stops depending on depth. Every stop must
   teach something beyond opening the file.
4. **Walk.** One stop at a time, at your pace: `next`, `deeper on N`,
   `skip to X`. You can skip to landing at any time.
5. **Land.** The walkthrough is written to your repo (never the
   worktree) with, per stop, an anchor, `file:line`, the pinned SHA,
   and a verbatim code snapshot. If the file already existed before
   the walk, you are asked before it is overwritten.

Only the last commit is described; commit your changes and restart to
include them. The record promises verifiability against the pin, not
permanent correctness — snapshots may drift from the current code.

Without git, without commits, or if the worktree cannot be created or
read, the agent reads the working tree directly and pins `unknown`.
Dependencies, build output, and vendored code are never cited, and
submodules are described as boundaries.

### Worktree cleanup

Worktrees persist for reuse by design; nothing is removed
automatically. Remove one yourself when you no longer need it:

```
git worktree remove .codewalk/worktree/codewalk-<sha>
```

## Requirements

`git`, for pinning to a commit. Without it the walk still works in a
degraded mode that reads the working tree and records the pin as
`unknown`.
