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

With no arguments you get a codebase tour. A question or a named
feature gets a topic trace: one real execution path followed from its
entry point to the answer. Depth — quick, standard, or deep — is
inferred from your words and defaults to standard. You are asked at
most one clarifying question, and where to save the walkthrough
(default suggestion: `docs/walkthroughs/<topic>.md`).

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
   next". The map and the closing are framing, not stops, so they do
   not count toward the depth.

   | Depth | Stops (orientation + core path) |
   | -- | -- |
   | quick | 5–8 |
   | standard | 9–13 |
   | deep | 14–18 |

   Each stop covers Situation, Mechanism, Implication, and Gotcha
   (SMIG), and must teach something you could not get by reading the
   file alone. Every anchor is verified against the code before the
   first stop is shown.
3. **Walk.** One stop per turn; the map comes with the orientation
   stop, and the closing follows the last stop. Reply `next`,
   `deeper on N`, `skip to X`, or `land` — you can end the walk and
   land the file at any time. Side questions are answered in place.
4. **Land.** The walkthrough file records the topic, mode, depth,
   commit SHA, and date. Each stop has a title, a `file:line`
   reference, a content anchor (a symbol or unique text pattern that
   survives line drift), a short verbatim code snapshot, and the
   narrative; the map and the closing are plain prose sections. The
   file says which commit it describes and that it may drift
   afterward.

The skill never modifies source code and never cites a file it has not
read; anything it cannot find is reported as missing, not guessed. It
does not judge the code — for findings and verdicts, use
[request-code-review](./request-code-review.md).

## Requirements

None beyond Claude Code. `git` is optional: it is used only to record
the commit SHA in the landed file. Without it, the SHA is recorded as
`unknown` and the walkthrough is otherwise the same.
