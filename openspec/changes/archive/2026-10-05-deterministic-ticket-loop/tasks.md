## 1. Scripts

- [x] 1.1 graph.mjs: validate `verification.runner` when present (`reviewer` | `orchestrator`, else NODE_FIELD_INVALID); header comment documents it; test added
- [x] 1.2 work-unit.mjs: add `step` to EVENT_SOURCE (orchestrator event); header comment; test added
- [x] 1.3 `node --test scripts/*.test.mjs` green

## 2. Template and demo definition

- [x] 2.1 coding-factory.json build node: `verification.runner: "orchestrator"`; instructions rewritten (implement-only; tests are landed and committed by the orchestrator; red is orchestrator-run); restrictions add "MUST NOT modify the current ticket's declared test files"
- [x] 2.2 coding-factory.json ticket node: instructions require each ticket to declare its test's repo-relative target path(s); verification criteria updated
- [x] 2.3 Apply the same edits to demo/.harness/graph.json and validate it against demo config

## 3. graph-run references

- [x] 3.1 dispatch.md: worker prompt loses "write your report to report-<n>.md"; §Worker dispatch states the orchestrator transcribes the returned report verbatim as report-<n>.md; reviewer/advisor sections gain the transcribe-on-block fallback; ticketed-unit section updated (worker gets the landed tests, not the duty to land them)
- [x] 3.2 node-execution.md: LLM-node cycle branches on verification.runner (orchestrator-run verification procedure: tamper diff, ticket command, full suite, verdict derivation, counting); ticketed build sequence (land tests, red, commit, dispatch); steps recorded as `step` log lines everywhere (pre-steps §, post-steps §, terminal §); ticket-status flip on pass incl. retry; review-node entry check (all tickets passed)
- [x] 3.3 escalation.md: signature table gains the orchestrator-run verification row (same `dims:|cmd:` form, counted at finest scope); 126/127/unresolvable = blocked class; quick-reference updated
- [x] 3.4 state-writes.md: `step` log line shape; evidence refs via kind:log for runs; ticket status flip write; no steps-<n>.md
- [x] 3.5 SKILL.md (graph-run): state the invariant — one worktree per unit, tickets sequential, no per-ticket worktrees

## 4. Agents

- [x] 4.1 worker.md: report is returned text (structured sections), never a report file; stage deliverables still written directly
- [x] 4.2 reviewer.md and advisor.md: add the fallback — if the report write is blocked, return the full report text for verbatim transcription

## 5. Docs

- [x] 5.1 file-formats.md work-unit section: stage artifacts list gains report-<n>.md (orchestrator-transcribed), loses steps files; log.ndjson description mentions the `step` event
- [x] 5.2 docs/graph-run.md: sweep for per-ticket reviewer and steps-file mentions; update

## 6. Acceptance

- [x] 6.1 Full test suite green; template and demo definition validate clean
- [ ] 6.2 Fresh demo e2e run (separate session) exercising red-by-orchestrator, deterministic green, transcribed reports, ticket-status invariant — recorded as a follow-up gate before archiving this change
