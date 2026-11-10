# use-loop

Wait for a state change in a one-shot background subagent, so the main session spends no context during the wait.

## What it does

- Hands one named wait, called a loop, to a one-shot `open-skills:sentinel` subagent. The sentinel waits in its own context and ends with one handoff.
- Keeps the main session cheap. The orchestrator pays one dispatch and one handoff per round, and nothing during the wait.
- Forms a loop by dispatching a new round after each handoff. One round is one sentinel dispatch. It waits for one change or one deadline.
- Keeps a journal for each loop. The default path is `.project/loops/<id>.md`. If a CLAUDE.md or you map plugin state or the `.project/` directory to another root, the journal goes to that root instead. The orchestrator tells you the resolved path before the first write. Only the orchestrator writes it. The sentinel is read-only and never writes a file, runs version-control commands, or changes an external system.
- Requires a deadline on every round. A round without a deadline is not dispatched.
- Moves a closed loop's journal to `archive/` in the same root, by default `.project/loops/archive/`.

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

Examples: a file that appears, or the output of `gh pr checks 123 --json name,state`.

### `tool`

Use when only a read-only tool call reads the state, for example the Linear MCP server reading an issue state. Each tick is one foreground `sleep <interval>` call and one tool call, so each tick costs one sentinel turn. Choose the interval with that cost in mind. After three consecutive tool failures, the sentinel hands off with `outcome: error`.

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

## Out of scope

- Periodic jobs with no change condition, such as reports or nightly maintenance: use Desktop scheduled tasks or `/loop`.
- Waits that must outlive the session: use a Desktop scheduled task or a cloud scheduled task.

## Files

- `skills/use-loop/SKILL.md`: the orchestrator protocol.
- `skills/use-loop/templates/LOOP.md.template`: the journal template.
- `agents/sentinel.md`: the one-shot sentinel subagent.
