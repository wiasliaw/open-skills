## MODIFIED Requirements

### Requirement: Tiered escalation

Escalation SHALL happen in place — it is a fallback chain inside the current node, not routing. "The same error" SHALL be judged by failure signature: for reviewed stages, the set of failing dimensions plus the failing verification command from the reviewer's verdict; for deterministic and tool-call nodes, the failing command plus its exit status; for a blocked report, the blocked reason code plus the node (a script failure contributes its stable error code). A failing verdict increments exactly one counter: the finest applicable scope (a graph-declared scope such as `ticket:<id>` when its concept applies, otherwise `node:<id>`). Supersession happens only while a problem is already open: a failure with a different signature then closes it as superseded by a new problem that inherits its consultation count and stays inside the escalation chain — the orchestrator remains in place and continues with the advisor or the human per the inherited count, never dropping back to the plain worker-retry loop; the per-signature counter restarts at one for bookkeeping only. A problem opened by the total failure cap SHALL NOT be superseded at all, and the signature-independent total failure cap keeps counting across signatures, so alternating signatures can evade neither escalation nor the human tier. Routable-outcome loops are capped by progress, not signature: each traversal of a declared edge returning to an earlier path node increments an `edge:<from>-<to>` counter (a core scope kind) that resets only on recorded progress — a closed definition: a scope item transitioning to passed, or a graph-declared monotonic progress field advancing, nothing else — and engages this chain at the graph's declared edge-revisit cap; the deterministic selection-only re-entry of a decomposition stage follows recorded progress by definition and therefore never accumulates. A problem opened by an edge-revisit cap takes a shortened advisor tier: the advisor is consulted at most once — a single diagnostic consultation on why the loop does not converge — and the orchestrator then stops in place for the human ruling; advice cannot permit a traversal of the capped edge, only the human ruling's retry disposition can. A problem opens when a stage is blocked or its counter reaches the graph's declared cap with the signature recurring, and closes when the stage passes (resolved) or a human ruling disposes of it (escalated or abandoned); a later failure on the same scope opens a new problem. When a problem opens or persists, the orchestrator stays at that node, records it, and dispatches the advisor — an analysis-only LLM actor that diagnoses root cause and writes concrete retry guidance into the stage directory as its only write. Advisor consultations on the same problem SHALL be capped at the graph's declared consultation cap; when it is exhausted the orchestrator SHALL stop in place for the human ruling: retry here with the guidance, move back to a named earlier node of the path, or end the work. Because every node carries this fallback chain, no advisor, blocked, or escalation edge SHALL exist in a graph definition. Both caps are declared at graph-build; the plugin's reference default is two for each. Advice does not reset failure counters; a pass or a human ruling resets the node- and concept-scoped ones, while edge revisit counters reset only on recorded progress, which resets every `edge:<from>-<to>` counter of the unit in the same write that records it — a retry ruling leaves them unchanged.

#### Scenario: Failure cap reached
- **WHEN** the same stage or ticket fails up to its declared cap with the same failure signature
- **THEN** the orchestrator SHALL stay at the node, record the problem, and consult the advisor, not dispatch the worker again until advice is issued

#### Scenario: Supersession inherits the chain
- **WHEN** a different failure signature closes an open problem as superseded
- **THEN** the new problem SHALL carry the inherited consultation count and the orchestrator SHALL continue at the advisor or human tier accordingly, not restart the worker-retry loop

#### Scenario: Total cap cannot be superseded
- **WHEN** a problem opened by the signature-independent total failure cap sees a new failure signature
- **THEN** the problem SHALL remain open and un-superseded, and the chain SHALL proceed to its next tier

#### Scenario: Failure after advice
- **WHEN** the worker fails again after advice while the counter is at or above its cap
- **THEN** the orchestrator SHALL take the next tier — a further consultation while the consultation cap allows, otherwise the human ruling — and SHALL NOT loop the worker

#### Scenario: Advisor cap reached
- **WHEN** the advisor has been consulted up to the declared consultation cap on the same problem and the stage still fails
- **THEN** the orchestrator SHALL wait at the node for the human ruling and SHALL NOT consult the advisor again

#### Scenario: Edge-revisit problem reaches the human after one consultation
- **WHEN** a problem opened by an edge revisit counter persists after one advisor consultation
- **THEN** the orchestrator SHALL stop in place for the human ruling, SHALL NOT consult the advisor again on that problem, and SHALL NOT take the capped route on advice alone

#### Scenario: Progress resets every edge counter
- **WHEN** recorded progress occurs — a scope item transitions to passed, or a graph-declared monotonic progress field advances
- **THEN** the write that records the progress SHALL reset every `edge:<from>-<to>` counter of the unit, and no other event SHALL reset any of them

#### Scenario: Human ruling
- **WHEN** the human rules on an exhausted escalation
- **THEN** the orchestrator SHALL record the disposition — retry with guidance, move back, or end — and only then act on it

#### Scenario: Ruling on an edge-revisit cap
- **WHEN** the human rules on a problem opened by an edge revisit counter
- **THEN** retry means permitting one more traversal of that edge, and the other dispositions remain move back or end — the counter itself stays until recorded progress resets it

#### Scenario: Ruling jumps are bounded overrides
- **WHEN** a ruling or an approval answer moves the unit somewhere other than a declared edge's target
- **THEN** the move SHALL be a recorded orchestrator override whose target is a node already walked on the unit's path or the abandonment terminal, and nothing else
