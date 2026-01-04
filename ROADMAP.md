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
  5. Rest (Wu Wei - do nothing at attractor)
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

**Status:** Ultrastability implemented. 323 tests, v1.4.0

## Phase 8c: Active Inference (Friston)

Full Free Energy Principle implementation.

- [ ] Generative model interface:
  ```typescript
  interface GenerativeModel {
    predict(action: Action): ExpectedState;
    update(actual: State): void; // Bayesian update
  }
  ```
- [ ] Expected free energy computation
- [ ] Action selection minimizing EFE
- [ ] Epistemic vs pragmatic value balance
- [ ] Model learning from experience

**Goal:** Agent that actively minimizes surprise through prediction.

## Phase 8d: Cycle Memory

Learn from past sense-making cycles.

- [ ] `cycleHistory: CycleRecord[]` - recent cycle outcomes
- [ ] Pattern recognition: which actions helped which feelings
- [ ] Correlation tracking: action → outcome
- [ ] Adaptive response selection based on history
- [ ] Forgetting old/irrelevant cycles

**Goal:** Agent that learns what works.

## Phase 8e: Self-Producing Agent

Agent uses meta-operations to create new responses.

- [ ] Agent access to P set (meta-operations)
- [ ] Pattern detection: "I keep doing X, could compose Y"
- [ ] Auto-generation of specialized operations
- [ ] Operation lineage tracking in agent stats
- [ ] Constitutional check on generated operations

**Goal:** Agent that produces its own operations (full autopoiesis).

## Phase 8f: Structural Coupling Protocol

Formalize agent-human interaction.

- [ ] `requestCoupling()`: Signal need for human
- [ ] Coupling priority levels (urgent, normal, low)
- [ ] Queue requests when human unavailable
- [ ] Handoff protocol (agent → human → agent)
- [ ] Coupling metrics and quality assessment

**Goal:** Clean protocol for agent asking for help.

---

## Technical Debt

- [x] Add integration tests (21 tests covering full workflows)
- [ ] Improve error handling in daemon
- [x] Add logging levels (DEBUG/INFO/WARN/ERROR/SILENT)
- [ ] Performance optimization for large event chains
- [x] Concurrency handling (StateManager, file locking)
- [ ] Atomic agent cycles (single transaction per cycle)
