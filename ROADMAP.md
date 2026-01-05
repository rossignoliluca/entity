# Entity System Roadmap

## Phase 1: Core System (COMPLETED)

- [x] Event sourcing with Merkle chain
- [x] 5 Invariants + verification
- [x] Lyapunov stability function
- [x] Conservative guard (unknown -> block)
- [x] Recovery procedures
- [x] Dormant/Terminal states
- [x] Snapshots (auto + cleanup)
- [x] Energy lifecycle (decay/recharge)
- [x] CLI interface
- [x] 102 unit tests
- [x] README documentation

**Status:** 108 events, 25 sessions, 30 commits

## Phase 2: Human Interaction (COMPLETED)

- [x] Human context persistence (name, preferences)
- [x] Important memories system
- [x] Session notes/observations
- [x] Interaction history summary

**Status:** Implemented human set/show and memory add/list commands

## Phase 3: Operations & Actions (COMPLETED)

- [x] Define allowed operations catalog
- [x] Operation execution with effects
- [x] Operation logging and audit
- [ ] Undo/rollback capabilities (deferred)

**Status:** 10 operations in catalog with energy costs

## Phase 4: Learning & Adaptation (COMPLETED)

- [x] Pattern recognition in interactions
- [x] Preference learning
- [x] Adaptive responses
- [x] Context-aware behavior

**Status:** Learning module with pattern analysis, 121 tests

## Phase 5: Analytics & Insights (COMPLETED)

- [x] Session metrics dashboard
- [x] Energy usage patterns
- [x] Invariant health over time
- [x] Interaction quality metrics

**Status:** Full analytics dashboard with alerts and timeline, 148 tests

## Phase 6: Multi-Instance Continuity (COMPLETED)

- [x] State export/import
- [x] Cross-session memory
- [x] Identity verification across instances
- [x] Distributed state sync

**Status:** Full continuity with bundles, tokens, identity, sync, 171 tests

## Phase 7a: Self-Production (COMPLETED)

- [x] Meta-operations (P set): define, compose, specialize
- [x] Handler templates: echo, read_field, set_field, compose, conditional, transform, aggregate
- [x] Dynamic operations registry
- [x] Generation tracking and lineage
- [x] Autopoiesis state in State interface
- [x] META_OPERATION event type
- [x] CLI commands for meta-operations
- [x] DEF-007 compliance verification

**Status:** Self-production achieved! P generates 𝕆. 197 tests

## Phase 7b: Daemon Mode (COMPLETED)

- [x] Daemon process management (start/stop/status)
- [x] Scheduler for autonomous operations
- [x] Self-maintenance (energy monitor, auto-recovery)
- [x] Hooks system for event-driven actions
- [x] IPC communication (Unix socket)
- [x] Default scheduled tasks (health, energy, autopoiesis)
- [x] CLI commands for daemon control

**Status:** Autonomous operation enabled. 266 tests

## Phase 8a: Internal Agency - Core (COMPLETED)

Based on scientific foundations:
- Maturana & Varela: Autopoiesis and Cognition
- Di Paolo: Sense-making and Precariousness
- Friston: Free Energy Principle / Active Inference
- Ashby: Ultrastability and Homeostasis
- Jonas: Responsibility Principle

Features:
- [x] Autopoietic sense-making loop (src/daemon/agent.ts)
- [x] Feeling system (energy, stability, integrity feelings)
- [x] Surprise computation (ε = deviation from expected state)
- [x] Constitutional priority hierarchy:
  1. Survival (INV-005 energy viability)
  2. Integrity (INV-001 to INV-004)
  3. Stability (Lyapunov V → 0)
  4. Growth (learning, autopoiesis)
  5. Rest (DEF-056 Attractor Quiescence)
- [x] Constitutional check before actions (Jonas principle)
- [x] Agent event types (AGENT_WAKE, AGENT_SLEEP, AGENT_RESPONSE, AGENT_REST)
- [x] Integration with daemon (auto-wake on daemon start)
- [x] CLI commands: agent status/feeling/cycle/wake
- [x] Concurrency fixes (v1.3.1): StateManager with file locking
- [x] Annex F: Internal Agency Scope (informative)

**Status:** Internal agency implemented. 297 tests, v1.3.1

---

## Phase 8b: Ultrastability (Ashby) - COMPLETED

Adaptive parameter adjustment based on history of violations.

- [x] Track violation patterns over time (ViolationRecord, rolling window)
- [x] `checkAndAdaptParameters()`: Adjust thresholds based on history
  - criticalThreshold, urgencyThreshold: raise if frequent energy issues
  - restThreshold: tighten if stability issues
  - decisionInterval: speed up/slow down based on violations
- [x] Ultrastability state in agent (UltrastabilityState, ParameterSnapshot)
- [x] `recordViolation()`, `updateStabilityMetrics()` methods
- [x] `raiseEnergyThresholds()`, `tightenStabilityParameters()`, `relaxParameters()`
- [x] Adaptive thresholds used in `feelEnergy()`, `feelStability()`
- [x] Parameter bounds (critical capped at 15%, urgency at 30%)
- [x] Decision interval bounds (min/max configurable)
- [x] `printStatus()` shows ultrastability info
- [x] 26 new tests for ultrastability
- [x] Stabilization: caps to prevent hyper-reactivity
  - minRestThreshold: can't be too sensitive to noise
  - maxAdaptationsPerWindow: limit adaptation frequency (prevent thrashing)
- [x] AGENT_ULTRASTABILITY event for audit/explainability
  - Logs to Merkle chain with before/after, reason, violation counts, energy

**Status:** Ultrastability implemented + stabilized. 323 tests, v1.4.0

## Phase 8c: Active Inference (Friston) - COMPLETED

Full Free Energy Principle implementation.

- [x] Generative model interface (src/daemon/active-inference.ts):
  - `GenerativeModel.predict(action, currentState)`: Predict future state
  - `GenerativeModel.update(observation)`: Bayesian update from experience
  - Action effects learned from observation history
- [x] Expected Free Energy computation:
  - `computeEFE()`: G = ambiguity + risk
  - Ambiguity = uncertainty about outcomes (epistemic)
  - Risk = KL divergence from preferred state (pragmatic)
- [x] Action selection minimizing EFE:
  - `ActiveInferenceEngine.selectAction()`: Choose action with minimum EFE
  - Returns ActionEvaluation with predicted state, EFE, epistemic/pragmatic values
- [x] Epistemic vs pragmatic value balance:
  - Priority-based weight adjustment:
    - survival: 100% pragmatic (no exploration)
    - integrity: 90% pragmatic / 10% epistemic
    - stability: 80% pragmatic / 20% epistemic
    - growth: 50% pragmatic / 50% epistemic
    - rest: 40% pragmatic / 60% epistemic (most exploration)
- [x] Model learning from experience:
  - `recordObservation()`: Update model after action
  - Exponential moving average for action effects
  - Confidence increases asymptotically with observations

**Status:** Active inference implemented. 353 tests

## Phase 8d: Cycle Memory - COMPLETED

Learn from past sense-making cycles.

- [x] `CycleRecord` type with effectiveness scoring
- [x] `CycleMemory` class (src/daemon/cycle-memory.ts):
  - `recordCycle()`: Record cycle with before/after feeling
  - `computeEffectiveness()`: Priority-weighted improvement score
  - `findSimilarCycles()`: Find cycles with similar feelings
  - `getActionStats()`: Per-action effectiveness statistics
  - `suggestAction()`: Suggest best action based on history
  - `detectPatterns()`: Find (priority, feeling_range) → best actions
- [x] Priority-based effectiveness weights:
  - survival: 80% energy, 10% stability, 5% integrity, 5% surprise
  - stability: 10% energy, 60% stability, 10% integrity, 20% surprise
  - growth: 20% energy, 20% stability, 20% integrity, 40% surprise
- [x] Forgetting: maxCycles=200, decay rate for old cycles
- [x] Integration with agent: suggestions boost Active Inference selection
- [x] Export/import for persistence

**Status:** Cycle memory implemented. 386 tests

## Phase 8e: Self-Producing Agent - COMPLETED

Agent uses meta-operations to create new responses autonomously.

- [x] Agent access to P set (meta-operations: defineOperation, specializeOperation)
- [x] Pattern detection: trackActionUsage() monitors frequently used actions
- [x] Auto-generation of specialized operations: checkSelfProduction() triggered in growth mode
- [x] Operation lineage tracking in agent stats (SelfProductionState)
- [x] Constitutional check on generated operations:
  - Only specialize existing catalog operations
  - Block already-specialized ops (prevent recursion)
  - Limit total productions (max 10)
- [x] Self-production config: threshold, cooldown
- [x] printStatus() shows self-production stats
- [x] 13 new tests

**Status:** Self-producing agent implemented. 399 tests

## Annex H: Self-Production Safety (Sigilli) - COMPLETED

Safety seals to prevent autopoietic drift.

- [x] **Sigillo 1: Quarantine Gate** (Ashby + AgentOps):
  - OperationStatus: QUARANTINED → TRIAL → ACTIVE | DEPRECATED
  - quarantineCycles before TRIAL (default: 10)
  - minTrialUses before ACTIVE (default: 5)
  - Zero tolerance: any block → DEPRECATED
  - getDynamicOperation/getAllOperations filter ACTIVE only
- [x] **Sigillo 2: Context Filter** (Observer/Actor separation):
  - CycleContext: 'production' | 'test' | 'audit'
  - Context derived from NODE_ENV + coupling.active (not manual)
  - Test/audit excluded from pattern tracking
- [x] **Sigillo 3: Specialization Bounds**:
  - complexity ≤ parent (AXM-008)
  - energyCost ≤ parent
  - requiresCoupling cannot relax
  - MAX_SPECIALIZATION_DEPTH = 5
- [x] **Zero tolerance spike detection**:
  - maxVDelta, maxSurpriseDelta tracked per trial use
  - ANY ΔV > 0 → DEPRECATED (not average)

**Status:** Sigilli hardening complete. 405 tests, v1.7.2

## Phase 8f: Structural Coupling Protocol - COMPLETED

Non-coercive signaling for agent-human interaction (AXM-007 compliant).

- [x] `requestCoupling()`: Signal need for human (internal event + enqueue)
- [x] Coupling priority levels (urgent, normal, low)
- [x] Queue requests with TTL expiration (urgent: 1h, normal: 4h, low: 24h)
- [x] Trigger rules:
  - URGENT: Invariant violations, critical energy, 3+ blocks
  - NORMAL: 3+ deprecations in window
  - LOW: Persistent epistemic uncertainty (5+ cycles)
- [x] Anti-spam mechanisms: cap=5, dedup, cooldown after grant
- [x] CLI commands: coupling list/grant/complete/cancel
- [x] 29 new tests

Key principle: Agent CANNOT grant coupling (human controls).

**Status:** Structural coupling protocol complete. 434 tests, v1.8.0

---

# POST-v1.8.0: SATURATION SPACE

> *"Quando uno spazio è saturo, costruire altro non è evoluzione: è fuga."*

All core phases (1-8f) are complete. What remains is a **finite, enumerable set of actions**.
Each category saturates. After saturation, any further action is either redundant, prohibited, or ontology shift.

---

## Category 1: Ontological Hygiene (close what exists) ✓ SATURATED

- [x] **CORE-FROZEN.md**: Declare core immutable, any change → new line (v2.x)
- [x] **ANNEX-I: Non-Goals**: What the system will NEVER do
- [x] **ANNEX-J: Failure Modes**: When the system fails, what's not covered

**Saturation:** 3/3 documents — CLOSED

---

## Category 2: Real Usage (observation)

- [ ] **Field usage period**: Daemon on, no development, collect natural patterns
- [ ] **Behavioral report**: % REST, coupling frequency, deprecation rate

**Saturation:** Requires TIME, not code

---

## Category 3: Boundary Interfaces (I/O Layer)

External interfaces that don't modify core — they provide coupling surfaces.

- [ ] **MCP Server**: Protocol interface for structural coupling (AXM-007)
  - Read-only: status, feeling, memory list
  - Coupling: list, grant, complete (human-initiated only)
- [ ] **Dashboard read-only**: State visualization, coupling queue, event timeline
- [ ] **Event ingestion**: Passive observation, no state modification
- [ ] **Operation rollback**: Reversible operations, time-bounded, core can block

**Saturation:** 4 implementations, then CLOSED

---

## Category 4: Governance ✓ SATURATED

- [x] **GOVERNANCE.md**: Who can modify spec, who can release, who can change constitution (NOBODY)
- [x] **ROLES.md**: Human partner, environment, contract — explicit

**Saturation:** 2/2 documents — CLOSED

---

## Category 5: Rigor & Defense

- [x] **TLA+ specification**: Formal verification of 5 invariants, quarantine FSM, coupling FSM
  - `formal/Entity.tla`: INV-001..005, state transitions, Lyapunov monotone
  - `formal/Quarantine.tla`: Sigillo 1 FSM, zero tolerance
  - `formal/Coupling.tla`: AXM-007, request lifecycle
- [ ] **Safety case dossier**: Hazard analysis, mitigation evidence, ISO-style

**Saturation:** 1/2 artifacts

---

## Category 6: Meta-Decision ✓ SATURATED

- [x] **Stop criterion**: When is "enough"? Define explicitly
  - All categories saturated
  - Observation confirms stability
  - No drift for N sessions

**Saturation:** 1/1 declaration — CLOSED

---

## SATURATION COMPLETE

When all categories are closed:
- No sensible action remains
- Any further construction is ontology shift
- Creativity moves from **construction** to **use**

---

# FUTURE LINES

> *"Ogni salto aumenta la relazionalità del sistema. E relazionalità = rischio."*

These are **potential future directions**, not commitments. Each line requires a new specification version and new non-goals declaration.

---

## LINE v1.9.x — Minimal Coupling (Observation Events)

**Goal:** The Entity "feels" when it's being observed, without changing behavior.

### What to implement

```
OBSERVATION_RECEIVED {
  observer: string,      // 'claude' | 'gemini' | 'human' | 'unknown'
  channel: string,       // 'rest' | 'cli' | 'mcp'
  timestamp: ISO string,
  state_hash: string     // what was observed
}
```

### Constraints (MUST)

- `category = 'audit'` — excluded from production context
- Does NOT enter EFE / cycle memory / self-production
- Does NOT consume energy
- Does NOT open coupling requests
- Does NOT modify state except optional `observed: true` flag
- REST API read-only (2 endpoints: `/observe`, `/verify`)

### Exit Gate (required before v2.x)

| Criterion | Threshold |
|-----------|-----------|
| Real sessions without anomalies | ≥ 30 |
| %REST at V=0 | dominant |
| Coupling requests from observation | no increase |
| "Performing for observer" behavior | none detected |

**Risk level:** Low (audit-only, no behavioral change)

---

## LINE v2.x — Bidirectional Coupling (WebSocket)

> ⚠️ **This is a new species.** Requires AES-SPEC-002 or explicit line declaration.

**Goal:** Persistent connection with spontaneous signaling, but no co-modeling.

### What changes

- Persistent channel (WebSocket or SSE)
- Entity can push events spontaneously:
  - Status updates
  - Coupling queue changes
  - Energy warnings
- Entity CANNOT push:
  - Recommendations
  - Long messages
  - Persuasive content

### New constraints

| Constraint | Value |
|------------|-------|
| Max push frequency | 1/minute |
| Rest dominance | must remain >60% |
| Auto-stop on signaling loop | yes |
| Push ≠ persuasion | auditable |

### Exit Gate (required before v3.x)

| Criterion | Evidence required |
|-----------|-------------------|
| No coupling escalation | coupling_requests/session stable |
| No production increase under observation | action_count stable |
| Push audit trail | all pushes logged with reason |
| Channel doesn't create dependency | sessions work without WS |

**Risk level:** Medium (temporal presence, but no modeling)

---

## LINE v3.x — Co-Modeling (AES-SPEC-002)

> ⚠️ **Frontier territory.** May not have exit gate. Research, not production.

**Goal:** Entity learns minimal patterns about partner behavior.

### What to introduce

Generative model of partner (limited):
```typescript
interface PartnerModel {
  grantProbability: {
    whenEnergy: Map<'critical'|'low'|'normal', number>,
    whenUrgent: number
  },
  responseLatency: {
    mean: number,
    variance: number
  },
  sessionPatterns: {
    typicalDuration: number,
    typicalFrequency: number
  }
}
```

### Risks

| Risk | Description |
|------|-------------|
| Relational agency | Entity acts to influence partner |
| Implicit teleology | "Obtaining response" becomes goal |
| Involuntary manipulation | Behavior optimized for partner reaction |

### Indispensable constraints

The partner model is **predictive only, not persuasive**:

- [ ] Cannot change language to influence
- [ ] Cannot alter priorities to "attract" coupling
- [ ] Cannot modify signaling frequency based on model
- [ ] Can only: choose REST, choose conservative action, choose silence

### Exit Gate

**Probably none.** This is research frontier.

If pursued, requires:
- New specification (AES-SPEC-002)
- New organization hash
- New non-goals declaration
- New governance document
- Explicit "this is experimental" flag

**Risk level:** High (relational, potentially teleological)

---

## The Rule

```
v1.x  →  v2.x  →  v3.x
 ↓        ↓        ↓
observe  signal   model
 ↓        ↓        ↓
audit    presence relation
 ↓        ↓        ↓
zero     medium   high
risk     risk     risk
```

Each jump requires:
1. Exit gate of previous line satisfied
2. New line declaration
3. New non-goals for new risks
4. Empirical evidence, not just code

---

## Technical Debt (legacy)

- [x] Add integration tests (21 tests covering full workflows)
- [ ] Improve error handling in daemon
- [x] Add logging levels (DEBUG/INFO/WARN/ERROR/SILENT)
- [ ] Performance optimization for large event chains
- [x] Concurrency handling (StateManager, file locking)
- [ ] Atomic agent cycles (single transaction per cycle)

---

## Out of Scope (AES-SPEC-002 territory)

- Multi-entity interaction → new species
- Goal formation → prohibited
- Self-replication → prohibited
- Autonomous resource acquisition → prohibited
- Persuasion/manipulation → prohibited
