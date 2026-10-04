# open-skills contributor guide

open-skills is a Claude Code plugin built on graph engineering. Specs under `openspec/specs/` are the contract; implementation follows spec text.

## Development and verification

Run all three before committing:

```
claude plugin validate .
node --test "scripts/*.test.mjs"
openspec validate --specs --no-interactive
```

Deterministic work lives in zero-dependency Node.js (>= 20, built-in modules only) scripts under `scripts/`. Each script is self-contained (no shared module), prints exactly one JSON object on stdout, uses stable error codes, documents exit codes in its header comment, and ships a `node --test` suite next to it.

All tracked content is English. Every user-facing skill lands together with a `docs/` page and a row in the README skills table.

## Git strategy

- Work on `milestone/graph-engineering`. Never commit to `main`.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, ...), split into logical chunks.

## Repository structure

External plugin surface (published to consumers; must not depend on internal reference):

- `skills/` - skills (graph-build, graph-run, ticket, wrap, use-worktree, code-review skills)
- `agents/` - worker, reviewer, advisor agents
- `scripts/` - deterministic Node.js scripts and their tests
- `docs/` - one page per user-facing skill
- `.claude-plugin/` - plugin and marketplace manifests

Internal reference (not required at consumer runtime):

- `openspec/` - the spec set (contract) and change proposals
