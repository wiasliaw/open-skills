# pm policy defaults

Workspace policy, kept apart from the protocol in `SKILL.md`. These are public defaults. A project charter (`references/project.md`) overrides any value here. A rule that has no failure to prevent is not listed.

## Role to status mapping

| Role | Default status name | Reason |
|---|---|---|
| Proposal, not accepted | Triage | Agent proposals must not reach the work queue without a human. |
| Wanted, not authorized | Backlog | Separates wishes from authorization. |
| Authorized, pullable | Todo | Only the human authorizes work. |
| Agent working | In Progress | Shows which card holds the lease. |
| Waiting on human | In Review | Gives the human one queue to clear. |
| Finished | Done, Canceled | Terminal states. |

Linear status types behind these names: Triage is `triage`, Backlog is `backlog`, Todo is `unstarted`, In Progress and In Review are `started`, Done is `completed`, Canceled is `canceled`.

## Limits

- WIP limit: 1 card in In Progress or In Review per project. Reason: the human reviews at most as many cards as there are running projects; parallel cards in one project collide on the same branch and files.
- Default lease length: 2 hours. Reason: a crashed run must free its card soon, but a live run must not lose it mid-task.

## Who may do what

- Open cards: the human in any status. An agent only in Triage, linked to the card that surfaced the proposal. Reason: an agent writing into Todo authorizes its own work.
- Move out of Triage: the human only. One exception: a Tidy item the human approved may move a card to Backlog or Canceled, or release an expired lease. Moves to Todo or Done stay human-only. Reason: Tidy must act on what the human approved, but must not authorize work.
- Merge: the human only. Reason: an unreviewed merge cannot be undone cleanly.
- Push: an agent pushes only its own work branch, only when the project charter grants push, never the default branch. Without the grant, the agent hands back with the branch name and commit, and the human pushes. Reason: a push to the default branch bypasses review.

## Branch naming

- `<type>/<card-id>`, with an optional short slug from public context. `<type>` is `feat`, `docs`, `chore`, `research`, or `design`, following the type label.
- Never use the tracker-generated branch name. Reason: it contains the card title, and pushing it to a public repo exposes internal titles.

## Labels

| Type label | Deliverable type |
|---|---|
| Feature, Chore | code |
| Documentation | writing |
| Research | research |
| Design | design |

- A card without a mapped type label gets the common done definition only (`references/done.md`).
- Agent label: `Human`. The loop skips cards that carry it. Reason: some cards need a person, and the loop must not take them.

## Section headings

Default names: `Wish`, `Goal`, `Done when`, `Do not touch`, `Permissions`, `Decisions for you`, `Workpad`, `Lease`. A charter can rename them for a board written in another language. Agents match by the charter's names when it sets them.

## Tidy thresholds

Tidy runs weekly and only proposes. Candidates:

- Triage cards older than 7 days.
- Backlog cards not updated for 30 days.
- Todo cards that fail the pullable check.
- In Progress cards whose lease expired with no newer run.

The proposal goes to the human in the session when interactive, otherwise as a comment on the project. The agent applies only the items the human approves, and only by moving a card to Backlog or Canceled, or releasing an expired lease. Reason: stale cards hide real work, but only the human knows what is still wanted.
