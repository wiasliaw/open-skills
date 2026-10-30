# Project charter

A charter is one document per project. It tells an agent how to run that project and overrides `../policy.md`. Reason: the same defaults do not fit every repo, and an agent must not guess the differences.

## Where it lives

In the tracker, on the project itself (the project description or a project document that the description links). Not in the repo, because it can hold internal context. The agent reads it before the first action in a project.

## Fields

1. Repo and base branch: the repo the project's code lives in, and the branch work starts from. Reason: a wrong base branch yields a change that does not merge.
2. Verification: the commands or checks that prove a code or writing card is done. Reason: without them the agent invents its own pass criterion.
3. Executing agent: which agent runs this project's loop. Reason: two agents on one project collide on the same card.
4. Trigger and lease: how often the loop runs, and the lease length. Reason: a lease shorter than a run expires under it, and a longer one delays recovery.
5. Internal context: where internal context lives, such as a linked document. Reason: the agent must know where internal reasons go so they stay out of the repo.
6. Push grant: yes or no. Yes lets the agent push its own work branch. Default no. Reason: a push is visible outside the board and needs explicit consent.
7. Policy overrides: values that differ from `../policy.md`. Reason: an unlisted difference is applied wrongly or not at all.

## Policy-override block

Lists only the values that differ. Any value in `../policy.md` can appear: status names, WIP limit, lease length, label names, branch types, section headings (for a board in another language), and Tidy thresholds. A value not listed keeps the default.

## Template

```
## Charter
- Repo and base branch: <repo URL>, <branch>
- Verification: <command or check>
- Executing agent: <name>
- Trigger and lease: every <interval>, lease <length>
- Internal context: <location>
- Push grant: no

### Policy overrides
- <policy value>: <new value>
```
