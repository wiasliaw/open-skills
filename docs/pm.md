# pm

Run work through a kanban board where you wish and decide, and agents pull cards, work them, and hand them back for review.

## What it does

- Gives agents one protocol for a shared board: who moves a card where, how work is claimed, and how a card is handed back.
- Splits the protocol (`skills/pm/SKILL.md`) from workspace policy (`skills/pm/policy.md`). A project charter in your tracker overrides any policy default.
- Has five actions:
  1. Wish: the agent drafts a card for you to approve.
  2. Pull: the agent picks the next pullable card in a project.
  3. Take over: the agent resumes a card from its workpad.
  4. Hand back: the agent moves a finished card to In Review with the decisions it needs from you.
  5. Tidy: weekly, the agent proposes stale cards to clean up. It changes only what you approve.
- Keeps you in control. You write the Wish section, you move cards out of Triage, you merge, and you move cards to Done or Canceled.

## When to use it

- You run agents against a board and need one rule set for claiming, leasing, and handing back cards.
- You want at most one card per project waiting on you at a time.
- You want any agent to be able to resume a card another agent left.

## How it is invoked

Ask Claude to pull the next card or to draft a card, or run `/open-skills:pm`. `SKILL.md` is at most 100 lines and works when pasted alone into a prompt, so agents without plugin support can use it too. v1 ships markdown only and targets agents with tool access, such as Claude Code and Cursor.

## Board setup

The tracker tools cannot create teams or edit statuses, so you set up the board first. The reference tracker is Linear, through its MCP server.

1. Create statuses: Triage, Backlog, Todo, In Progress, In Review, Done, Canceled.
2. Create labels: type labels Feature, Documentation, Chore, Research, Design, and the agent label `Human` (the loop skips cards that carry it).
3. Put every card you want pulled in a project. A card with no project is never pulled.
4. Write a project charter on each project: repo and base branch, verification, executing agent, trigger and lease, internal context, push grant, and any policy overrides. See `skills/pm/references/project.md` for a template.
5. Create a custom view for waiting on you: status In Review or Triage, all teams, oldest first.
6. Optional: enable the GitHub integration so merging a pull request moves its card to Done.

## Supported agents

Agents with tool access to the board, such as Claude Code and Cursor. Every write appears under your account, so each agent names itself in the card's lease.

## Files

- `skills/pm/SKILL.md`: the protocol.
- `skills/pm/policy.md`: default policy.
- `skills/pm/references/`: `card.md`, `workpad.md`, `done.md`, `project.md`, `linear.md`.
