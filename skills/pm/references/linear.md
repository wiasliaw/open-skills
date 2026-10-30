# Linear

The only file that names concrete tools. It maps each protocol step to a Linear MCP tool. Linear status types: triage, backlog, unstarted, started, completed, canceled, duplicate.

## Tool per step

| Step | Tool |
|---|---|
| Read a card and its blockers | `get_issue` with `id` and `includeRelations` |
| List a project's cards by status | `list_issues` with `project`, `state`, `label`, `orderBy` |
| Read the workpad and human comments | `list_comments` with `issueId` |
| Create the workpad | `save_comment` with `issueId` and `body` |
| Rewrite the workpad in place | `save_comment` with `id` and `body` |
| Move a card | `save_issue` with `id` and `state` |
| Edit only Decisions for you | `save_issue` with `id` and `patch` |
| Add or remove the `Human` label | `save_issue` with `addLabels` or `removeLabels` |
| Open a proposal card | `save_issue` with `title`, `team`, `project`, `state` set to the Triage status, and a link to the source card |
| Read the project charter | `get_project` with `query` and `includeResources` |
| Comment on a project (Tidy proposal) | `save_comment` with `projectId` and `body` |
| Read project comments | `list_comments` with `projectId` |
| Check status names | `list_issue_statuses` with `team` |
| Check label names | `list_issue_labels` |

## Steps by action

- Wish: `save_issue` to create the card only after approval. Put the Wish section in `description`.
- Pull: `list_issues` for In Review, then In Progress, then Todo in the project (steps 1-4 are reads). For the chosen card, `get_issue` with `includeRelations` to find unfinished blockers. Claim with `save_issue` (`state` In Progress), then `save_comment` for the lease, then `list_comments` to re-read.
- Take over: `get_issue` and `list_comments`; stop on a live lease, a blocked status, or WIP; claim as in Pull; only then rewrite the workpad with `save_comment` and `id`.
- Hand back: `save_comment` with `id` for the evidence; `save_issue` with `patch` for Decisions for you; `save_issue` with `state` In Review; then `save_comment` with `id` to release the lease.
- Tidy: `list_issues` per candidate rule; post the proposal with `save_comment` and `projectId`; apply approved items only as `save_issue` with `state` Backlog or Canceled, or `save_comment` with `id` to release an expired lease. Never set Todo or Done.

## Facts

- `patch` edits part of a description by operation: `replace`, `insert_after`, `append`, `replace_range`. Use it for the Decisions for you section only. Never send a full `description` on an existing card. Reason: a full rewrite can overwrite the human's Wish text.
- `save_comment` with `id` updates a comment in place. That is how the workpad is rewritten. Reason: each call without `id` makes a new comment.
- Blocking relations come from `get_issue` with `includeRelations`. A blocker not in a `completed` status type blocks the card.
- The generated `gitBranchName` contains the card title. Do not use it. Name the branch `<type>/<card-id>`. Reason: a pushed branch exposes the title.
- All writes appear under the human's account. The lease names the agent so a reader can tell agents apart.
- When the GitHub integration is on, merging the linked pull request moves the card to Done. Without it, the human moves the card.
- The MCP tools cannot create teams or edit statuses. The human sets up the board first (see `docs/pm.md` for the steps).
- Pass `project` when you open a card. A card with no project is never pullable.

## Waiting-on-me view

The human creates one custom view: status In Review or Triage, all teams, ordered by oldest first. Agents do not create views. Reason: the tools do not manage views, and one queue shows the human everything that waits on them.
