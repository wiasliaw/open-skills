# Work Unit: 2026-10-01-wor-37-worktree-script-spec

- **Work-unit identifier**: 2026-10-01-wor-37-worktree-script-spec
- **Created**: 2026-10-01
- **Work-unit tool reference**: `openspec/changes/use-worktree-skill/` (revision of the existing change)

## Contract

### Scope

Revise the OpenSpec change `use-worktree-skill` (specs only — no implementation in this work unit) to supersede its scripts-free premise with a script-owned-mechanics design:

1. **New capability `worktree-script`** (own spec file): the contract of a zero-dependency Node.js script `skills/use-worktree/scripts/worktree.mjs` that owns the dangerous worktree mechanics for two consumers. Must specify:
   - Subcommand `ensure --branch wu/<id>` (Build): create-or-reuse a worktree on branch `wu/<id>`; a deterministic path rule stating which root the worktree path resolves against (fix the current `../wu/<id>` sibling-dir ambiguity: no cross-project collision, no accidental nesting); main-checkout resolution via `git rev-parse --git-common-dir` (not `--show-toplevel`, which returns the linked worktree itself); stale-registration recovery ONLY when the registered directory no longer exists on disk (stat check first) — an existing directory is a collision, never `--force`-removed; CI-red reopen on an existing `wu/<id>` branch.
   - Subcommand `ensure --detach <sha>` (codewalk): path `<toplevel>/.codewalk/worktree/codewalk-<short-sha>` with `--show-toplevel` resolution (intentional, differs from branch mode); hooks disabled, LFS smudge off, reuse-by-SHA with HEAD equality check, probe-read, `info/exclude` append (newline handling), pin output with `unknown` fallback. Behavior must preserve the current codewalk SKILL.md Step 2 prose as the oracle.
   - Subcommand `setup --worktree <path>` (Build, separate from ensure): executes `.harness/worktree-setup.json` — ordered `setup` commands, `copy` entries with copy-on-write preference and plain-copy fallback, symlink only for `"readonly": true`; config validation: reject unknown keys, absolute or `..`-containing copy paths (path traversal), missing copy sources fail. Detach mode structurally never runs setup (preserves codewalk's "never execute project code").
   - Cross-cutting contract: zero third-party dependencies, Node >= 20 with a startup version check, invocation as `node "<path>/worktree.mjs"` (no reliance on shebang/exec bit), cwd is the consumer project (never the plugin cache; never writes to the plugin cache), `GIT_TERMINAL_PROMPT=0` (non-interactive), idempotent (same result when run twice), machine-readable stdout JSON + distinct exit codes for: collision, stale-but-directory-present, probe failure, not-a-git-repo, Node version mismatch, setup/copy failure; human diagnostics on stderr. NO `remove` subcommand — cleanup is Wrap's, and the spec states this omission is deliberate. No global `git worktree prune`, ever. Platform: macOS/Linux supported; Windows explicitly unverified.
2. **Revise capability `skill-use-worktree`**: the page delegates mechanics to the script and keeps policy (naming, cadence, Build record `build/worktree.md`, Wrap-owned cleanup, scope boundary). Remove/replace the "Self-contained ... without needing supporting scripts" requirement and the "MUST NOT require any particular agent runtime" phrasing (Node >= 20 becomes an explicit prerequisite). Add: script resolution (`${CLAUDE_PLUGIN_ROOT}`-anchored path when available, orchestrator-passed absolute path as the agent-agnostic fallback — the script directory path `skills/use-worktree/scripts/` is a stable contract); on script failure or unavailability the Build actor reports blocked and MUST NOT improvise raw `git worktree` commands; clarify which actor runs the script given the implementor/Build "performs no VCS operations" rule (resolve the conflict explicitly in the spec — either define worktree creation as outside that rule's meaning or assign the invocation to the orchestrator pre-dispatch; pick one and state it).
3. **Update `proposal.md` and `design.md`** coherently: drop "Specs only ... no supporting scripts" phrasing where it contradicts the above, record the superseding decision (script owns dangerous mechanics; pages own policy) with rejected alternatives (pure prose, bash, bundled package, third-party deps), note the committed `node --test` test strategy as the implementation change's verification approach, and keep tasks.md consistent (implementation tasks belong to later work units — mark them as such, do not implement).
4. Codewalk-side SKILL.md changes are OUT of this change — the spec here only defines the script's detach-mode contract codewalk will consume; the codewalk rewrite gets its own change and work unit later.

### Verification Standards

In order:

1. `openspec validate use-worktree-skill --strict --no-interactive` — passes.
2. `claude plugin validate .` — passes.
3. `grep -ri "without needing supporting scripts" openspec/changes/use-worktree-skill/` — no matches (premise reversal complete).
4. `grep -rl "worktree.mjs" openspec/changes/use-worktree-skill/specs/` — at least one spec file names the script (capability present).
5. Reviewer confirms by reading: branch-mode stale recovery is conditioned on the directory being absent; no `remove` subcommand exists and the omission is stated as deliberate; detach-mode spec preserves every behavior in `skills/codewalk/SKILL.md` Step 2 (hooks off, LFS skip, reuse-by-SHA, exact-path-only recovery, never prune, info/exclude newline handling, probe-read, pin `unknown` fallback); exit-code/stdout contract is defined; main-checkout resolution rules are per-mode; the actor conflict (implementor no-VCS vs. who runs ensure) is explicitly resolved.

### Exclusions

- No implementation: no `worktree.mjs`, no `skills/use-worktree/SKILL.md`, no tests.
- No edits to `skills/codewalk/`, `docs/`, `README.md` (C-002 not triggered — no shipped skill's existence or behavior changes in this work unit).
- No edits to the other OpenSpec changes (`graph-engineering-node-specs`, `graph-plugin-architecture`).
- No `.harness/` writes (orchestrator-only, at the merge moment).
- No VCS operations by the implementor.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | OpenSpec change `use-worktree-skill` specifies script-owned worktree mechanics (worktree-script capability + revised skill page + coherent proposal/design) | `openspec validate use-worktree-skill --strict --no-interactive && claude plugin validate .` | passed (F-017) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-10-01 — feature 1, round 1: fail — coherence defect: `worktree-script/spec.md:148` documented-key set omits `version`, which `graph-init-bootstrap/spec.md:60` specifies init writes, so the script-as-specified rejects every real config; fix = add `version` to the key set, define unsupported-version behavior, update the "Unknown key rejected" scenario (lines 160-162). Dimensions 1-4, 6 pass; oracle fidelity confirmed with minor non-blocking drifts (suggested: assign an error class to generic non-stale `worktree add` failure).
- 2026-10-01 — feature 1, round 2: pass — version key added to the documented set (integer 1 accepted, others config-error, nothing executed), scenario examples de-conflicted, generic detach creation failure mapped to probe-failure/pin-unknown; reviewer re-ran both validations and both greps, confirmed exact match with the `graph-init-bootstrap` producer schema (spec.md:59-72) and no new contradictions; diff confined to the change + state file.

## Notes

- 2026-10-01 — Work unit created from the owner-approved direction (script what agents misexecute destructively/silently; Node zero-dep runtime) plus advisor review (verdict: proceed with changes — split spec/implementation/codewalk into three work units; branch-mode stale recovery only when directory absent; failure contract and actor conflict resolved at spec time). Advisor consulted via local general-purpose agent (Paseo unavailable this session).
- 2026-10-01 — Merge-moment candidates when this unit passes: supersede F-015 (its "plain git worktree, self-contained page" description is reversed); re-examine F-016 (setup execution moves into the script's `setup` subcommand — supersede if its verified wording no longer holds); new decision entry (script-vs-prose criterion, mechanics/policy split, rejected alternatives, supersedes the design.md self-contained decision); candidate constraint C-003 (skill scripts MUST be zero-dep Node under the owning skill's `scripts/`, never a shared package).
