# Workpad

The workpad is the single progress comment on a card. It is the hand-off note: an agent that never saw the card can continue from it. Reason: two comments per card drift apart and a reader cannot tell which is current.

## Identity

- One comment per card. Identify it by the first line, `## Workpad`.
- Find it before writing. If it exists, rewrite it in place. If it does not, create it. Never append a second one.

## Sections

1. Reading: your understanding of the Wish, in your own words, and any assumption. Reason: a wrong reading is cheapest to catch before work starts.
2. Plan: ordered steps, each marked open or done. Rewrite as the plan changes. Reason: the next run resumes from it and must not redo or skip steps.
3. Decision log: each decision, the option chosen, and why. Includes the human's answers on a returned card. Reason: an unlogged decision gets reversed by the next run.
4. Evidence: one entry per Done-when item, with the command output or link that shows it met. Reason: the human checks claims against evidence, not memory.
5. Lease: `agent`, `run id`, `expires`, and `state` (held or released). Reason: without it a second run cannot tell a live card from an abandoned one.

## Lease

- `agent`: the agent's name. Reason: all writes appear under the human's account, so the name is the only way to tell agents apart.
- `run id`: unique per run.
- `expires`: start time plus the lease length from `../policy.md` or the charter.
- Expired: `expires` is in the past. The lease is free. Released: `state` is released. The lease is free.
- Renew `expires` while working. Release by setting `state` to released when you stop. Reason: a lease that is never renewed expires under a live run, and one never released blocks the card until expiry.

## Claim then re-read

1. Move the card to In Progress.
2. Write the lease with your run id.
3. Read the workpad again.
4. If the run id is yours, proceed. If it is another, stop and touch nothing. Reason: two runs that claim at once both believe they hold the card.

## Hand-back states

Order matters: move the card first, then release the lease. Reason: a card that is In Progress with a released lease looks free, and a concurrent Pull would take a finished card.

- Finished: all Done-when items have evidence. Card moved to In Review, then lease released.
- Time up: Plan current, Reading updated, lease released. Card stays in In Progress for the next run.
- Blocked: the blocking question is in Decisions for you. Card moved to In Review, then lease released.

## Cold-start test

Before you release a lease, ask: could an agent that never saw this card continue from the workpad alone? If it needs your memory, add that to the workpad.

## Returned card

A returned card is a Todo card that already has a workpad. The human's reason or answers are the comments newer than the workpad's last hand-back. It must still pass the pullable check. On take-up:

1. Read the card and workpad.
2. Stop if the lease is live, the status is In Review, Done, or Canceled, or the move to In Progress breaks the WIP limit.
3. Claim the lease and re-read (see "Claim then re-read").
4. Copy the human's comments into the Decision log, and remove the Decisions for you section from the card.
5. Continue from the Plan.

Reason for the order: a write before the claim can overwrite a live run's work.

## Template

```
## Workpad
### Reading
<understanding, assumptions>
### Plan
- [x] <done step>
- [ ] <open step>
### Decision log
- <date> <decision>: <option chosen>, because <reason>
### Evidence
- <Done-when item>: <output or link>
### Lease
- agent: <name>
- run id: <id>
- expires: <timestamp>
- state: held
```
