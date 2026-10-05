## Context

`.harness/config.json` has exactly one writer (`scripts/init.mjs`) and several readers (`memory.mjs`, `worktree.mjs`, graph-run). Three writer/reader disagreements exist today:

- Budget keys: `init.mjs:123` accepts any relative path (`checkRelPath`), `memory.mjs:156` rejects any key containing `/` and resolves bare names under `<root>/.harness/` (`memory.mjs:176`). `bootstrap.md` teaches the path form that memory.mjs rejects; `docs/file-formats.md` shows the bare form.
- `vcs.strategy`: required by `init.mjs:84-85`, read by nothing at run time.
- `vcs.base_ref`: honored by `worktree.mjs:296`, rejected by the `init.mjs:84` key whitelist, so it can only appear in a hand-written (invalid) config.

Additionally, no step creates the current-truth documents the budgets name, so a fresh factory starts with a memory section pointing at nothing.

## Goals / Non-Goals

**Goals:**
- One budget-key grammar (bare file name) enforced at write time, documented consistently.
- A fresh bootstrap leaves the memory layer operative: every budgeted document exists as a skeleton.
- Config carries only runtime-consumed fields; schema and scripts agree exactly.

**Non-Goals:**
- No change to the graph-definition schema or validator (that is the `runtime-only-definition` change).
- No change to delta-entry mechanics, budgets semantics, or maintenance thresholds.
- No re-introduction of `base_ref`-style worktree basing; if a real need appears it gets its own schema entry then.

## Decisions

- **Enforce bare names in `init.mjs`, not loosen `memory.mjs`.** The write gate is the single writer and the right place to fail early; loosening memory.mjs would leave two path grammars resolving to the same file and an ambiguous index. Error message mirrors memory.mjs wording ("memory.budgets key must be a bare file name") so the two scripts agree verbatim.
- **Skeleton creation happens in the bootstrap flow (skill step), not inside `init.mjs write`.** `init.mjs` stays a pure config writer (validate/write/read); giving it file-creation side effects would make `write` non-idempotent in intent and widen its contract. The bootstrap reference instead gains an explicit step after the config write: for each budget key, create `.harness/<doc>` with a one-line heading if it does not exist. Never overwrite an existing document.
- **Remove `vcs.strategy` outright rather than keep it optional.** The user's rule: config keeps only runtime-consumed fields. Branching-strategy prose belongs in the project's CLAUDE.md. `init.mjs` keeps `strategy` out of the whitelist so an existing config carrying it fails validation with the key named; the fix (re-draft without the key) is one interview answer, acceptable for a pre-1.0 plugin with one known consumer (demo).
- **Delete the `base_ref` branch in `worktree.mjs` instead of adding it to the schema.** No scenario currently needs a base ref different from `default_branch`; keeping dead code that only a schema-violating config can reach is worse than re-adding the feature properly later.

## Risks / Trade-offs

- [Existing configs with `vcs.strategy` break on next validate] → Error names the key and the remedy; demo config updated in this change; plugin is pre-1.0 with no known external consumers.
- [Skeleton creation in the skill (not script) can be skipped by a non-compliant session] → `memory.mjs validate`/`index` already report "not created" per document, so the gap is visible on first use; acceptable until a dedicated doctor command exists.
- [Bare-name constraint forbids nesting current-truth docs in subdirectories] → Intentional; the memory layer defines `.harness/` flat as its read surface (`memory.mjs:176` joins root + `.harness` + name).
