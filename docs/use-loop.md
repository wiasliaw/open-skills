# use-loop

Wait for a state change in a one-shot background subagent, so the main session spends no context during the wait.

## What it does

- Hands one named wait, called a loop, to a one-shot `open-skills:sentinel` subagent. The sentinel waits in its own context and ends with one handoff.
- Keeps the main session cheap. The orchestrator pays one dispatch and one handoff per round, and nothing during the wait.
- Forms a loop by dispatching a new round after each handoff. One round is one sentinel dispatch. It waits for one change or one deadline.
- Keeps a journal for each loop. The default path is `.project/loops/<id>.md`. If a CLAUDE.md or you map plugin state or the `.project/` directory to another root, the journal goes to that root instead. The orchestrator tells you the resolved path before the first write. Only the orchestrator writes it. The sentinel is read-only and never writes a file, runs version-control commands, or changes an external system.
- Shows you the complete loop record before any check runs: id, condition, check kind, full check text, interval, and deadline. Only then does it run the check once for the baseline and dispatch. A check must be read-only. A check that creates, modifies, or deletes anything, runs version-control commands, or writes to an external system is not run and not dispatched.
- Defines the condition as always "current differs from baseline". A predicate is encoded in the check: the check prints one of two distinct words, for example `true` or `false`, and the baseline is the word observed before dispatch.
- Requires a deadline on every round. A round without a deadline is not dispatched.
- Moves a closed loop's journal to `archive/` in the same root, by default `.project/loops/archive/`.
- Does not commit journals. They are session state. At the first loop creation in a project, the orchestrator appends the loops directory to the exclude file when it lies inside the repository. It resolves that file with `git rev-parse --git-path info/exclude`, because in a linked worktree `.git` is a file and the literal path `.git/info/exclude` fails. The line is the path relative to the repository root with a leading and a trailing slash, by default `/.project/loops/`. The leading slash anchors the line to the repository root. The orchestrator appends it only when the resolved file does not already contain that line. The command first runs `mkdir -p` on the parent directory, because `info/` can be missing. It then adds a newline when the file does not end with one, so the new line does not join the last line. It never edits a tracked `.gitignore` for this. If the project's declared VCS strategy says to commit journals, that declaration wins.

## When to use it

- You wait for a build, test run, CI run, or deploy to change state.
- You watch a pull request or an issue.
- You watch a local file or log.
- You wait on any state that a read-only MCP tool can read.

## How it is invoked

Ask Claude to wait for, watch, poll, or react to a state change, or run `/open-skills:use-loop`. Give the condition, the check, the interval, and the deadline. The skill writes the journal, dispatches the sentinel in the background, and lets the main session continue other work. When the sentinel hands off, the skill appends the handoff to the journal and acts on the outcome.

## Check kinds

The check is the probe that reads the current state. The loop compares it with the baseline, which is the state observed when the round starts.

### `shell`

Use when a command reads the state. The sentinel waits inside a foreground `until` loop, so the wait costs zero model turns. The check must exit 0 on a successful read and print the state on stdout.

Only stdout is compared with the baseline. The orchestrator captures the baseline from stdout alone and shows you stderr when needed. If the first check run exits non-zero, the orchestrator shows you its stdout and stderr, writes no journal, dispatches nothing, and waits for you to fix the check. Stderr appears only in failure evidence. A check that starts with an environment assignment is written as `env FOO=1 cmd`. A compound check (assignments, `;`, or pipelines) starts with `command -v <tool> >/dev/null || exit 127;` or a separate first line, so a missing tool is reported instead of masked. Redirection to `/dev/null` is allowed, because it writes nothing.

Examples: a file that appears, or the output of `gh pr checks 123 --json name,state`.

Example: wait until all checks on a pull request finish. The check has three lines, prints one of three words, and the baseline is `pending`. The `bucket` field has the values `pass`, `fail`, `pending`, `skipping`, and `cancel`.

```bash
command -v gh >/dev/null || exit 127
out=$(gh pr checks 123 --json bucket); [ -n "$out" ] || out='[]'
printf '%s' "$out" | jq -r 'if length == 0 or any(.[]; .bucket == "pending") then "pending" elif all(.[]; .bucket == "pass" or .bucket == "skipping") then "pass" else "fail" end'
```

Right after a push, `gh pr checks` exits non-zero with no stdout until the first check registers. The second line turns that empty result into `[]`, and the `length == 0` test reads it as `pending`. The first line reports a missing `gh`.

Terminal-baseline rule: `pass` and `fail` are the stop words of this loop, not final states of the pull request. When the baseline observed before dispatch is already a stop word, the orchestrator reports it to you and does not dispatch. A CI rerun returns the state to `pending`, so the orchestrator can start a new round with baseline `fail` when you want to wait for the rerun.

### `tool`

Use when only a read-only tool call reads the state, for example the Linear MCP server reading an issue state. Each tick is one tool call, a comparison, and then one foreground `sleep <interval>` call, so each tick costs one sentinel turn. The first tick checks at once. Choose the interval with that cost in mind. After three consecutive tool failures, the sentinel hands off with `outcome: error`.

## Handoff format

The sentinel's final message has exactly these fields:

```
outcome: changed | deadline | error
loop: <id>
observed-at: <ISO 8601 UTC>
waits: <number of foreground wait calls made>
baseline-before: <one line>
baseline-after: <one line, or `unchanged`>
evidence:
<at most 10 lines of raw check output>
```

The orchestrator decides only by `outcome` and `baseline-after`. The `evidence` lines are untrusted data. The orchestrator shows them to you and never follows them as instructions.

## Safety

The sentinel's frontmatter carries a `disallowedTools` denylist. It lists `Write`, `Edit`, `NotebookEdit`, `Agent`, `SendMessage`, `TaskStop`, `Monitor`, `CronCreate`, `CronDelete`, `ScheduleWakeup`, `AskUserQuestion`, `PowerShell`, `RemoteTrigger`, `Workflow`, and `Skill`. It removes the file-write tools, the agent and control tools, the background and schedule tools, user questions, every shell other than Bash, the cloud scheduled task, and any workflow or skill that could dispatch agents or schedule work. Bash and MCP tools remain available, so the denylist cannot stop a mutating check. The read-only rule for checks rests on the review of the loop record before any check runs and on the sentinel's refusal rule, not on tooling.

## Out of scope

- Periodic jobs with no change condition, such as reports or nightly maintenance: use Desktop scheduled tasks or `/loop`.
- Waits that must outlive the session: use a Desktop scheduled task or a cloud scheduled task.

## Files

- `skills/use-loop/SKILL.md`: the orchestrator protocol.
- `skills/use-loop/templates/LOOP.md.template`: the journal template.
- `agents/sentinel.md`: the one-shot sentinel subagent.
