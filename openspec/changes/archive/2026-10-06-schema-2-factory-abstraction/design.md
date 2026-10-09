# Design: schema-2-factory-abstraction

## Context

The 1.x graph definition grew five node-level mechanisms with five syntaxes (`pre_steps`, `instructions`+`mounts`, `verification`, `post_steps`, `human_approval`) plus a second routing vocabulary (`phase.path` beside edge guards). The first end-to-end demo run (E2E-RETRO) showed the cost: prose MUSTs skipped without trace, external skills only integrable by editing node prose, advisor/human gates with no standard artifact. This change replaces the node internals with one closed abstraction, worked out and recorded in SCHEMA-2.md (the design record this change supersedes) and validated by rebuilding the full v1 coding-factory in a layered-library demo (19 tasks, 11 nodes, 21 edges) before writing this spec.

Naming (docs and interviews): graph = 廠區, node = 工站, task = 製程, skills/commands/mcp = 設備 (equipment), edge = 產品路徑. Code and schema use the English terms.

## Goals / Non-Goals

**Goals:**

- One abstraction: task = executor + equipment + machine-checkable exit; node = ordered pipeline of task references + routable outcomes; routing = edges + guards, nothing else.
- Wrapping an external skill/MCP/tool = authoring one TaskDef; no node prose edits.
- Every prose MUST of 1.x becomes a declaration the validator can check (goto for retry/send-back, human tasks with forced decision artifacts, exit artifacts).
- Type definitions live in exactly one kind of place (type catalogs); TaskDef carries zero type information.
- Templates become a layered library that graph-build composes at interview time and flattens into one self-contained project `graph.json`.

**Non-Goals:**

- E2E-RETRO fixes (#1–#7): land after this change, on the new schema. Only their schema prerequisites are considered here.
- Migration tooling for 1.x project definitions (none exist in the wild beyond the demo; re-assembly is the migration).
- Changing the memory/ledger model, escalation caps semantics, or the work-unit folder layout.
- Multi-graph projects, parallel pipelines inside a node.

## Decisions

### D1. Four executors replace five node mechanisms

`script | llm | validator | human`. `pre_steps`/`post_steps`/terminal steps → script tasks; `instructions`+`mounts` → llm task; `verification` → validator task (with `runner: reviewer|orchestrator` kept as a structural field); `human_approval: true` → human task. Uniform text surface: `purpose` (one line, for humans at build time) + `instructions` (handed verbatim to whoever executes); `criteria` and `prompt` do not exist. Alternative considered: keeping verification as a special node section — rejected because it keeps the one mechanism the abstraction was built to absorb.

### D2. Closed in-node control flow (`on` map)

Each pipeline entry maps every exit outcome of its task to exactly one action: `next`, `goto:<earlier task in the same pipeline>` (counted by fail counters, capped), a surfaced node outcome (routed by edges), or `escalate` (hand to the orchestrator's fallback chain — for failures with no earlier task to return to, e.g. the first provisioning script). Conditions never appear inside a node: state-dependent branching surfaces as a node outcome and is decided by edge guards. Alternative (guards inside `on`) rejected to keep conditions in exactly one layer.

### D3. `phase.path` deleted; phase is a state field; walks are examples

Routing has one vocabulary: edges + guards. `phase` is written once by the mandatory phase-approval human task and is immutable. Canonical walks move to a non-normative `examples.md` the validator never reads. 1.x `restriction_overrides` die with the phase section: flows needing different restrictions (maintenance) are separate nodes referencing different tasks, selected by guards. Consequence accepted: the 1.x per-outcome guard exhaustiveness/path-realizability checks are replaced by reachability checks (every node reachable from entry; success terminal reachable).

### D4. Abandonment is edge-reachable (deliberate 1.x deviation)

1.x reached the abandonment terminal only through dispositions. 2.0 lets a human task's `not-needed` outcome surface and route to `end` by a declared edge, keeping the routing vocabulary single. Ruling dispositions (retry / move back / end) remain orchestrator overrides outside edges.

### D5. Type catalogs: two tiers, zero types in TaskDef, registry never on disk

Types (pure schema: `type/values/nullable/default/items/fields`; primitives include `command`, `evidence-ref`, `pointer`, promoted from 1.x value markers) live only in plugin `templates/types.json` and project `.harness/types.json`, keyed by state field name. `produces: ["state:<field>"]` on a task is both write authorization and type reference — the field name is the catalog key; a miss is a dangling reference. Catalogs merge in memory at load (`graph.mjs`, `work-unit.mjs`); name collisions are rejected, except the one legal override: a slot-parameterized plugin type (e.g. `phase` with `{{phase_values}}`) is unusable until graph-build instantiates it, values filled, into the project catalog. The materialized registry is never written to disk — a written registry is a second definition that drifts. Mechanism semantics are relocated out of types: `executes` → consuming task's equipment entry `{source: "state:<path>", family: "<base>"}` (task-local check); `scope_kind` → implied per-item fail scope of `re_entry` (`<node>.<task>:<item-id>`). Trade-off accepted (user decision): runtime reads the plugin catalog directly, so a plugin update can change type truth for in-flight runs; this is carried by plugin versioning, not by snapshotting.

### D6. Layered template library + `assemble`

`templates/` = `types.json` + `tasks/` (one TaskDef per file) + `nodes/` (one per 1.x stage, plus `build-direct` and `maintain` replacing build's prose branches and `restriction_overrides`) + `graphs/` (assembly: slots, caps, node references, edges) + `examples.md`. The interview is assembly: Tier 2 walks the nodes (one line each: pipeline, executors, outcomes), Tier 3 swaps nodes/tasks from the library. `graph.mjs assemble` flattens references into the project's self-contained `.harness/graph.json` (task catalog inlined — kept as a catalog, not inlined per pipeline entry, so a shared task has one edit point; slots filled; no `state_fields`). Runtime and validator read only the flattened file; assemble is its only writer (hand-editing is a violation, same stance as `config.json`).

### D7. Red-check becomes real script surface

The 1.x prose orchestrator duties for a ticketed build (land declared tests, commit red, expect-red run) become script tasks in the build pipeline, requiring `land-tests` / `expect-red` subcommands on `work-unit.mjs` (or a dedicated script). Test-integrity and full-suite checks stay in the orchestrator-run validator task. Because the spec requires an already-green ticket to surface `ticket-invalid` deterministically, a script `run` line MAY be `{command, codes}`, mapping specific exit statuses of that one command to declared outcomes (exit 0 is always `ok`; 126/127 are never mappable; unmapped non-zero is `failed`). `expect-red` exits 11 (`already_green`) when the ticket's test passes, and the red-check line maps 11 to `ticket-invalid`. The mapping is per line, so `land-tests` or `git` returning the same status cannot be misread. Alternative (already-green escalates through `failed`) rejected: it spends an advisor consultation and a human ruling on a deterministic fact.

### D8. Decisions settled before the graph.mjs rewrite

Resolved with an advisor review and the user before task group 2:

- **`blocked` is universal and never declared.** No task exit, node outcome, or edge may name it; any blocked report enters the fallback chain directly. The reference `author-contract` no longer declares it.
- **`done` closes a terminal pipeline.** It is the terminal-only completion action (`next` stays illegal on a last entry) and a reserved word that is never a node outcome.
- **The entry edge carries no outcome.** The entry node has exactly one outgoing edge, unconditional and outcome-less.
- **A task appears at most once per pipeline**, so `goto` targets and `<node>.<task>` failure scopes are unambiguous.
- **Phase domain per node.** Guard exclusivity and exhaustiveness over `phase` consider only the phase values whose phase-restricted route (edges whose guards are satisfiable with `phase` fixed to that value, other fields unconstrained) reaches the node. This over-approximates real reachability, so exhaustiveness proven on it rules out a run-time zero-match.
- **Every phase value must reach success.** For each instantiated phase value, `maintenance` included, the success terminal must be reachable on its phase-restricted route. This settles the Open Question on `maintenance` and recovers part of the 1.x path-realizability check: it catches a phase trapped in a cycle whose only exits belong to other phases.
- **Close-out dominates success.** The node referencing the close-out task must lie on every route from the entry node to the success terminal. This replaces the 1.x `PATH_NO_CLOSE_OUT`.
- **Loops without paths.** At run time a returning edge is one whose target is already in the walked history, so every cycle traversal is counted. Static checks are therefore: a loop has an exit, any cycle requires the edge-revisit cap, and any `goto` requires the failure cap. The 1.x "every cycle contains a returning edge" check is dropped, and the validator reports cycle edges as `returning_edges`.
- **Field applicability.** A guard field is applicable at a node when some node whose pipeline references a producing task reaches it. `reads` entries get the dangling check only.
- **State-sourced equipment mounts its own family.** `{source, family}` declares the family for invocations read from that field. The validator checks that `source` resolves to a `command`-typed entry, and the family base goes through the tool gate.
- **Params vs slots.** `{{x}}` inside a TaskDef is legal only for that task's declared `params`, bound by each pipeline entry's `with`, which must bind exactly those params. Any other placeholder is an unfilled slot.
- **Assemble owns type instantiation.** `assemble` fills parameterized plugin types (the `phase_values` slot) through the shared catalog writer and validates the composition in memory before writing anything (types file, then graph file). Confirmed type extensions for wrapped skills are written beforehand through the same writer (`types.mjs write`).
- **The skill-state-needs map is deleted.** A skill's state needs are expressed by the TaskDef that mounts it (`reads`/`produces`), not by hardcoded skill knowledge in the validator.

### D9. Decisions settled before the work-unit rewrite

Resolved with the user before task group 4:

- **`re_entry` gains `items_field`.** Shape: `{list_field, order, progress_field, items_field}`; the reference uses `items_field: "tickets"`. The validator requires it to be a list of objects carrying an `id` field, applicable at the node. It is the single source for:
  - per-item scope existence: `<node>.<task>:<item-id>` names a record of it;
  - the re-entry bookkeeping exemption;
  - `expect-red`'s ticket command: the item's single `command`-typed field.
- **Write authorization.** A changed graph-declared field (or `phase`) needs the task in flight to produce it; the task in flight is the stored pipeline position before the write. The exemption is re-entry bookkeeping:
  - a selection step: the progress field takes an element of the list field, which loses it — the first element under `declared`;
  - updates to existing `items_field` records: none added, removed, or reordered; `id` and command-typed fields unchanged.

  Making `verify-build` produce `state:tickets` was rejected: `build-direct` also references it, so chore units would materialize tickets.
- **Test-file layout.** The decomposition stage holds each ticket's tests under `tests/<ticket-id>/`, mirroring repo-relative target paths. `land-tests` copies that tree into the worktree. Alternative rejected: a per-ticket manifest (one more format to validate).
- **`red-check` declares what it runs.** It mounts `{source: "state:tickets.verification_command", family: "{{test_command}}"}`, because `expect-red` executes the ticket command. `land-tests` and `expect-red` take `--graph` to find the re-entry node (stage directory) and its items field.
- **Where per-item scopes apply.** A `re_entry` rule refines to `<node>.<task>:<item-id>` the scope of every task that reads its progress field (`state:current_ticket`) while an item is selected, wherever that task runs. The literal "the declaring node's scope" would refine only `ticket.decompose-tickets`, which is not per item. Tickets fail and retry in `build`, as `scope_kind` did in 1.x (D5).
- **Pipeline position.** It is a new core state field `current_task` (a task of the current node's pipeline, or null), and the state schema version becomes 2.0.0.

### D10. Decisions settled while writing the run-time prose

Resolved with the user during task group 5:

- **A failed whole-change review routes to `build-direct`.**
  - The edge is `review -[fail]-> build-direct` for `phase in [feat, fix, chore]`; `maintenance` still routes to `maintain`. The library goes from 21 edges to 20.
  - Why: the 2.0 `build` pipeline always runs `red-check`. Re-entering `build` after the last ticket passed makes `expect-red` exit 11 on an already-implemented ticket. That surfaces `ticket-invalid` and sends the unit back to decomposition, never to implementation. 1.x avoided this only with the prose rule "skip land/red/commit on re-entry".
  - `build-direct` is the whole-change fix node: `implement-change` already addresses review findings against the whole change, and `verify-build` still runs the full suite.
  - Rejected: making `red-check` skip when the ticket's status shows it was already red. That would couple the script to template field names and values.
- **Agent definitions follow the per-task dispatch.** `agents/worker.md`, `agents/reviewer.md` and `agents/advisor.md` speak of the dispatched task:
  - task identity, `instructions`, `exit.outcomes` and `exit.artifact`, and equipment;
  - review dimensions named by the validator task's `instructions`;
  - an alternative outcome surfaces with its evidence artifact rather than through a reviewer;
  - a standalone validator's `fail` is its node outcome.

  In 1.x they described node-level payloads.
- **Run-time conventions of the graph-run prose** (orchestrator conventions, not script codes):
  - a counted non-verdict `goto` (for example a human send-back) uses the failure signature `goto:<outcome>@<node>.<task>`;
  - orchestrator reason codes are `exit-outcome-undeclared`, `exit-artifact-missing`, `skill-unavailable`, and `guard-defect:zero-match|ambiguous`.

## Risks / Trade-offs

- [Plugin update changes types under in-flight runs (D5)] → plugin versioning discipline; release notes flag type changes; no snapshot by explicit user decision.
- [Reachability checks are weaker than 1.x path-realizability] → validator keeps per-outcome guard mutual-exclusion/exhaustiveness over per-node phase domains, requires a phase-restricted route to success for every phase value, and requires close-out to dominate success (D8); examples.md drift is caught by interview walkthrough, not the validator.
- [Flattened graph.json grows large] → acceptable; it is generated, reviewed as a diff, and owned by the project.
- [`escalate` widens the action vocabulary] → confined to failures with no `goto` target; the fallback chain itself is unchanged.
- [Rewrite size of graph.mjs] → committed test suite ports invariant-by-invariant; demo factory is the fixture.
- [State-sourced commands can carry shell operators — **deferred to the next round** by user decision] → family coverage is a token-prefix check, so a ticket `verification_command` such as `npm test && <anything>` is "covered", and `expect-red` runs it through the shell. `expect-red` is the first path where that check is the only control: in 1.x such commands ran only through an actor's or the orchestrator's host tool permissions. The ticket command is LLM-authored, so hallucination or prompt injection can reach an unrestricted shell with the user's environment. Candidate fix for the next round:
  - reject unquoted shell metacharacters in `command` values at the write gate;
  - run `expect-red` on the tokenized argv without a shell, re-checking coverage before execution.

## Migration Plan

1. Implement type catalogs + loader (shared by `graph.mjs` and `work-unit.mjs`).
2. Rewrite `graph.mjs`: 2.0 structural invariants, tool gate over task equipment, `assemble`.
3. Restructure `skills/graph-build/templates/` into the layered library (the validated reference factory is preserved at this change's `reference/` directory).
4. Update `skills/graph-build/SKILL.md` + references (interview-as-assembly), `skills/graph-run/references/` (per-task dispatch, `on` routing, `escalate`, red-check scripts), `work-unit.mjs` (type resolution, `node.task` fail scopes, `land-tests`/`expect-red`).
5. Update `docs/` (file-formats, graph-build, graph-run).
6. Re-run the todo-backend demo end to end on the new schema before archiving.

No rollback path beyond git; 1.x definitions are simply rejected by the 2.0 validator with a schema-version error.

## Open Questions

Resolved before task group 2 (see D8):

- Inline one-off tasks: catalog-only (`use` references); project-authored tasks enter through the assembly's `tasks` object and are flattened into the catalog. Revisit if the catalog gets noisy with single-use script tasks.
- `maintenance` reserved semantics: the instantiated `phase` type's values must contain `maintenance` (catalog writer and validator), and — like every phase value — it must have a phase-restricted route to the success terminal.
- `runner` (validator) and `run` (script) stay executor-specific structural fields.
