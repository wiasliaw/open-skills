# codewalk

Get walked through code you need to understand — a whole codebase, or
one question such as "how does auth work end to end" — one stop at a
time, at your pace. When you are done, the route is saved as a
markdown walkthrough pinned to the commit it describes, with every
stop anchored to code content so it can be checked against the source
later.

## Usage

```
/open-skills:codewalk
/open-skills:codewalk how does auth work end to end
/open-skills:codewalk quick tour of src/billing
```

Plain words work too: "walk me through the request pipeline", "give me
a tour of this codebase", "onboard me".

The skill is interactive only: it needs you replying in the
conversation. Where nobody can reply — inside a subagent or a headless
run, for example — it neither walks nor saves anything: it answers the
question directly, or says the walk needs an interactive session.

With no arguments you get a codebase tour that follows the system's
primary path, starting from its main entry point; naming a directory
or module scopes the tour to it. A question or a named feature gets a
topic trace: one real execution path followed from its entry point to
the answer. Depth — quick, standard, or deep — is inferred from your
words and defaults to standard. In the first turn only, you are asked
at most one clarifying question and where to save the walkthrough
(default suggestion: `docs/walkthroughs/<topic>.md`); with no answer,
the default is used.

## What happens

1. **Recon.** The code is read progressively — manifests and entry
   points first, then search to locate, then only the files the route
   needs. One vertical slice is traced end to end instead of skimming
   every module. Large scopes are split across parallel exploration
   subagents, and every file they report is re-read before it is
   cited.
2. **Route.** The route is ordered for understanding, not by file
   tree: an orientation stop anchored to a real file, a short map, the
   core-path stops in execution order, and a closing "what you can do
   next". The orientation stop is stop 1 and core-path stops continue
   from 2. The map and the closing are framing, not stops, so they do
   not count toward the depth. The closing names a file or test only if
   it was read during the walk, and calls a test one that exercises the
   path only if that test references code on the route; anything else
   is described without a path.

   | Depth | Stops (orientation + core path) |
   | -- | -- |
   | quick | 5–8 |
   | standard | 9–13 |
   | deep | 14–18 |

   Each stop covers Situation, Mechanism, Implication, and Gotcha
   (SMIG), and must teach something you could not get by reading the
   file alone. Each stop's content anchor is matched literally against
   the code when the stop is prepared, must occur exactly once, and
   gives the stop its `file:line` — including stops added later when
   the route is re-planned or you skip to a new topic.
3. **Walk.** One stop per turn, each shown with its number; the map
   comes with stop 1. Reply `next`, `deeper on N` (N is the stop
   number), `skip to X`, or `land` — you can end the walk and save the
   file at any time. Skipping to a topic outside the route inserts a
   new stop right after the current one; stops you have not seen yet
   are renumbered after it, stops you have seen keep their numbers, and
   the inserted stop counts toward the depth. Side questions are
   answered in place. After the last stop, the closing follows and the
   walkthrough is saved in the same turn; you do not need to type
   `land` (you are asked first only if the save path already exists).
4. **Land.** If a file already exists at the save path, you are asked
   whether to overwrite it or pick a new name before anything is
   written. Every snapshot is re-checked against its file first; a stop
   whose code changed during the walk is re-captured, or dropped with a
   note to you. The walkthrough records the topic, mode, depth, commit,
   and date. Each stop has its number, a title, a `file:line`
   reference, a content anchor (a symbol or unique text pattern that
   survives line drift), a short verbatim code snapshot, and the
   narrative; the map and the closing are plain prose sections.
   `deeper on N` expansions are included only if you ask. The file
   says which commit it describes and that it may drift afterward. If
   any cited file is not in that commit — it has uncommitted changes,
   is untracked or gitignored, or lies outside the repository — the
   commit is recorded as `<sha> + uncommitted changes in <files>`,
   listing every such file, and the walkthrough notes that its
   snapshots come from the working tree.

The saved walkthrough is a reading record of your walk, not a project
deliverable, so it is written directly even in projects that route
changes through an orchestrator. The skill never modifies source code
and never cites a file it has not read; anything it cannot find is
reported as missing, not guessed. It does not judge the code — for
findings and verdicts, use [request-code-review](./request-code-review.md).

## Requirements

None beyond Claude Code. `git` is optional: it is used only to record
the commit in the landed file and to detect cited files that commit
does not contain (modified, untracked, or gitignored; files outside the
repository always count as not contained). Without it — outside a
repository, or in one with no commits yet — the commit is recorded as
`unknown` and the walkthrough is otherwise the same. If the status
check itself fails, every cited file is listed as uncommitted.
