# Review 3: T-2 (demo/README.md)

> Orchestrator note (deviation): installed v0.1.0 reviewer lacks the Write
> tool; report returned in-reply and persisted verbatim by the orchestrator.

**Verdict: pass**

Correctness: README matches the verified behavior (hyphens never stripped,
runs collapse to one separator, idempotence incl. custom separators,
separator charset -_.~ / empty allowed / else TypeError, run command
present, provenance chain accurate and not overstated). Minor non-defect:
non-string separator TypeError not mentioned (not required by the ticket).

Contract compliance: only demo/README.md changed; worktree status exactly
`?? demo/` with exactly three files; no exclusions touched.

Verification (in order): T-2 six-grep chain exit 0; README read against
spec: no false claims; demo suite 17/17; Build-wide gates: scripts suite
92/92, status clean, HEAD bf849d7.
