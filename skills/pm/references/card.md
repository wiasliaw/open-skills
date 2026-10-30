# Card format

A card has two sections with two owners. Headings default to the names in `../policy.md`; a project charter can rename them.

## Wish section (human-owned)

The human writes it. An agent never edits it. Reason: an agent that rewrites its own target can always pass.

1. Goal: one or two sentences on the outcome wanted. Reason: without a stated outcome the agent optimizes for the wrong thing.
2. Done when: a list. Each item is checkable and states how it is checked ("`npm test` passes", "the page lists all five actions"). An item that cannot be checked is not a Done-when item. Reason: an uncheckable item makes review a matter of opinion.
3. Do not touch: files, systems, and behavior that stay as they are. Reason: an agent cannot know which nearby code is off limits.
4. Permissions: what the agent may do beyond reading, such as push its work branch, open proposal cards, or run a named command. Anything not listed is not allowed. Reason: an implied permission lets an agent act beyond what the human authorized.

A card is pullable only when all four parts are filled.

## Decisions for you section (agent-owned)

The agent writes it, only when it hands the card to In Review. It is absent at every other status.

- Each item is answerable by one action: pick an option, reply yes or no, or run one command.
- Each item states the recommended option, its cost, and the evidence. Evidence is a pointer into the workpad, not a copy.
- A card with nothing to decide has the section with the line "None."

Reason: a decision that needs a discussion to answer sends the human back into the whole task.

## Size

The description fits one phone screen. Evidence, logs, and long reasoning go in the workpad (`workpad.md`). Reason: a long description does not get read, and the human decides from it.

## Drafting a Wish for approval

1. Turn the request into the four parts. Quote the human's words for Goal where possible. Reason: a paraphrase can shift the goal.
2. Mark each part you inferred. Ask about each part you cannot infer. Reason: a guessed Done-when item sets a target the human never chose.
3. Show the draft to the human. Write the card only after approval. Reason: the Wish section is the human's authorization.
4. If the human edits the draft, use the edited text. Reason: the human's wording is the contract.

## Template

```
## Wish
### Goal
<outcome in one or two sentences>
### Done when
- [ ] <checkable item> (checked by: <how>)
### Do not touch
- <file, system, or behavior>
### Permissions
- <allowed action>

## Decisions for you
<present only at In Review>
1. <question answerable by one action>
   - Recommend: <option>
   - Cost: <cost of that option>
   - Evidence: <workpad section or link>
```
