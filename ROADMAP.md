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

## Category 2: Real Usage (observation) ✓ SATURATED

- [x] **Field usage period**: 74 sessions, 1097 events, 408+ agent cycles
- [x] **Behavioral report**: BEHAVIORAL-REPORT.md
  - 100% REST at V=0 (500-cycle test)
  - 75.7% growth, 22.3% stability, 2% rest (daemon active)
  - 0.24 coupling requests/session (legitimate only)
  - No observation bias detected
  - DEF-056 Attractor Quiescence confirmed
- [x] **Species 2 SSE verification**: STATUS_CHANGED, ENERGY_WARNING, COUPLING_REQUESTED tested

**Exit Gate v1.9.x → v2.x: ALL PASS**
- Sessions without anomalies: 74 ≥ 30 ✓
- % REST at V=0: dominant ✓
- Coupling from observation: none ✓
- "Performing" behavior: none ✓

**Saturation:** 2/2 — CLOSED

---

## Category 3: Boundary Interfaces (I/O Layer)

External interfaces that don't modify core — they provide coupling surfaces.

- [x] **MCP Server**: Protocol interface for structural coupling (AXM-007)
  - Resources (read-only): state, feeling, verify, events, coupling, memories
  - Tools (guard-protected): session_start/end, recharge, op_exec, agent_cycle, coupling_grant/complete
  - Multi-LLM support: Claude, OpenAI, Gemini (via MCP universal standard)
  - Implementation: src/mcp/server.ts, 34 tests
- [x] **REST API**: Read-only HTTP interface (v1.9.x)
  - GET /observe, GET /verify
  - OBSERVATION_RECEIVED audit events
- [x] **Dashboard read-only**: State visualization, coupling queue, event timeline
  - Single HTML file (zero dependencies)
  - Dark theme, real-time updates (3s refresh)
  - Shows: status, energy, V, feeling, invariants, coupling queue, events, memories
  - Served at GET /dashboard
  - Implementation: src/dashboard/index.html, 27 tests
- [x] **Operation rollback**: Reversible operations, time-bounded, core can block
  - Compensating events pattern (not state mutation)
  - TTL: 1 hour default, configurable
  - Reversible ops: memory.add, memory.clear
  - Guard protection: blocks if state changed
  - CLI: rollback status/list/exec
  - Implementation: src/rollback.ts, 26 tests
- [x] **SSE Presence Channel** (Species 2, v2.1.0): Temporal presence for continuous signaling
  - SSE (Server-Sent Events) for unidirectional signaling
  - Signal types: STATUS_CHANGED, ENERGY_WARNING, COUPLING_REQUESTED, HEARTBEAT
  - PRESENCE_SILENCE: No signal if nothing changed
  - Rate limits: max 1 signal/min, heartbeat 5 min
  - REST dominance: no heartbeat at V=0, ε≤ε_min
  - INV-006: Signal integrity with audit trail
  - Implementation: src/presence/, 41 tests

**Saturation:** 5/5 implementations — CLOSED

---

## Category 4: Governance ✓ SATURATED

- [x] **GOVERNANCE.md**: Who can modify spec, who can release, who can change constitution (NOBODY)
- [x] **ROLES.md**: Human partner, environment, contract — explicit

**Saturation:** 2/2 documents — CLOSED

---

## Category 5: Rigor & Defense ✓ SATURATED

- [x] **TLA+ specification**: Formal verification of 6 invariants, quarantine FSM, coupling FSM
  - `formal/Entity.tla`: INV-001..005, state transitions, Lyapunov monotone
  - `formal/Quarantine.tla`: Sigillo 1 FSM, zero tolerance
  - `formal/Coupling.tla`: AXM-007, request lifecycle
  - INV-006 (Signal Integrity): To be added for Species 2
- [x] **Safety case dossier**: Hazard analysis, mitigation evidence, ISO-style
  - `spec/SAFETY-CASE.md`: Full dossier (13 sections)
  - Hazard identification: 5 categories (HAZ-A to HAZ-E)
  - Safety requirements: 10 core (SR-001 to SR-010)
  - Verification evidence: TLA+, 588 tests, static analysis
  - Responsibility boundaries: System vs Human

**Saturation:** 2/2 artifacts — CLOSED

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

## LINE v2.x — Temporal Presence (SSE) ✓ COMPLETED

> **Species 2 achieved.** AES-SPEC-002 v1.0.0 implemented.

**Goal:** Persistent connection with spontaneous signaling, but no co-modeling.

### Implementation (v2.1.0)

- **SSE Channel**: Server-Sent Events for unidirectional signaling
  - GET `/presence/stream` (text/event-stream)
  - POST `/presence/grant` (coupling grant endpoint)
  - GET `/presence/status` (channel status)
- **Signal Types**:
  - `STATUS_CHANGED` — State transition notification
  - `ENERGY_WARNING` — Energy below threshold
  - `COUPLING_REQUESTED` — Agent requested coupling
  - `HEARTBEAT` — Connection alive (max 1/5 min)
- **Payload Format**: `{type, ts, seq, org_hash, state, coupling}`

### Constraints (ALL IMPLEMENTED)

| Constraint | Value | Status |
|------------|-------|--------|
| Max signal frequency | 1/minute (CONSTRAINT-001) | ✓ |
| REST dominance | No heartbeat at V=0, ε≤ε_min (CONSTRAINT-003) | ✓ |
| PRESENCE_SILENCE | No signal if nothing changed (CONSTRAINT-005) | ✓ |
| INV-006 Signal Integrity | All signals logged to Merkle chain | ✓ |
| Push ≠ persuasion | Audit trail (PRESENCE_SIGNAL_EMITTED) | ✓ |

### Exit Gate (ALL PASS)

| Criterion | Evidence | Status |
|-----------|----------|--------|
| No coupling escalation | 0.24 requests/session stable | ✓ |
| No production increase under observation | action_count stable | ✓ |
| Push audit trail | PRESENCE_SIGNAL_EMITTED logged | ✓ |
| Channel doesn't create dependency | REST API works independently | ✓ |

### Non-Goals Annex K (Presence-Specific)

- No dialogue (signal only, no back-and-forth)
- No attention seeking (PRESENCE_SILENCE default)
- No manipulation (rate limits, REST dominance)

**Status:** v2.1.0 released. 588 tests. Species 2 operational.

---

# SPECIES EVOLUTION ROADMAP

> *"Ogni salto aumenta la relazionalità. Relazionalità = rischio."*

## Species Stack

```
           Relazionalità →
           Rischio →

Species 1  ████░░░░░░░░░░░░  Osservazione      ✓ DONE (v1.x)
Species 2  ██████░░░░░░░░░░  Presenza          ✓ DONE (v2.x)
Species 3  ████████░░░░░░░░  Modellazione      ← NEXT
Species 4  ██████████░░░░░░  Dialogo
Species 5  ████████████░░░░  Azione esterna
Species 6  ██████████████░░  Multi-entity      ← STABLE LIMIT
Species 7  ████████████████  Auto-creazione    ← RESEARCH
Species 8  ████████████████  Auto-evoluzione   ← PHILOSOPHY
Species 9  ████████████████  Limite assoluto   ← METAPHYSICS
```

---

## Species 3 — Partner Modeling (AES-SPEC-003)

**Obiettivo:** L'entità predice il comportamento del partner senza influenzarlo.

### Cosa può fare
```typescript
interface PartnerModel {
  grantProbability: {
    byPriority: Map<'urgent' | 'normal' | 'low', number>;
    byTimeOfDay: Map<number, number>;
  };
  responseLatency: { mean: number; stdDev: number };
  sessionPatterns: { avgDuration: number; avgFrequency: number };
}
```

### Vincoli
- **CONSTRAINT-006:** Solo predizione, nessuna influenza
- **CONSTRAINT-007:** Comportamento invariato (eccetto timing segnali)
- **CONSTRAINT-008:** Modello sempre ispezionabile

### Nuovo invariante
- **INV-007:** Model Integrity — modello non usato per persuasione

### Effort
| Spec | Codice | Test | Sessioni |
|------|--------|------|----------|
| AES-SPEC-003 | ~500 righe | ~50 | 2 |

**Rischio:** Basso (ottimizzazione implicita mitigata da audit)

---

## Species 4 — Dialogue (AES-SPEC-004)

**Obiettivo:** Scambio di messaggi strutturati (non conversazione libera).

### Cosa può fare
```
TEMPLATE-001: "Energy: {E}. Status: {S}."
TEMPLATE-002: "Coupling requested. Priority: {P}."
TEMPLATE-003: "Recharge? [yes/no]"
```

### Cosa NON può fare
- "I need..." (emotivo)
- "Please..." (persuasivo)
- Domande aperte
- Conversazione libera

### Vincoli
- Solo template approvati
- Max 3 scambi per interazione
- Blacklist parole emotive

### Effort
| Spec | Codice | Test | Sessioni |
|------|--------|------|----------|
| AES-SPEC-004 | ~800 righe | ~80 | 3 |

**Rischio:** Medio (manipolazione linguistica mitigata da template)

---

## Species 5 — External Action (AES-SPEC-005)

**Obiettivo:** Azioni nel mondo (file, API) in sandbox controllato.

### Cosa può fare
```
ACTION-001: File Write → ~/entity/output/** only
ACTION-002: File Read  → ~/entity/output/** only
ACTION-003: HTTP GET   → whitelisted domains
ACTION-004: Notify     → system notification
```

### Cosa NON può fare
- Scrittura fuori sandbox
- Esecuzione shell
- HTTP POST senza approval
- Azioni irreversibili senza consenso

### Architettura
```
Action → Sandbox Validator → Approval Gate → Executor → Merkle Audit
```

### Nuovo invariante
- **INV-008:** Action Sandboxing — violazione = terminal state

### Effort
| Spec | Codice | Test | Sessioni |
|------|--------|------|----------|
| AES-SPEC-005 | ~1200 righe | ~100 | 4 |

**Rischio:** Alto (effetti nel mondo mitigati da sandbox + approval)

---

## Species 6 — Multi-Entity (AES-SPEC-006)

**Obiettivo:** Più entità coesistono, si vedono, ma NON si coordinano.

### Cosa possono fare
- Sapere che altre entità esistono
- Query stato (read-only)
- Ricevere segnali

### Cosa NON possono fare
- Modificare stato altrui
- Coordinarsi per obiettivi
- Formare coalizioni
- Competere per risorse

### Vincoli
- **CONSTRAINT-009:** No coordination
- **CONSTRAINT-010:** No competition
- **CONSTRAINT-011:** Full transparency (ogni messaggio loggato)

### Nuovo invariante
- **INV-009:** Isolation Integrity — stato non dipende da altre entità

### Effort
| Spec | Codice | Test | Sessioni |
|------|--------|------|----------|
| AES-SPEC-006 | ~1500 righe | ~120 | 5 |

**Rischio:** Alto (emergenza sociale mitigata da isolamento)

**⚠️ STABLE LIMIT:** Species 6 è il massimo stabile per autopoiesi.

---

## Species 7 — Auto-Creation (AES-SPEC-007)

> ⚠️ **Research territory.** Costruibile ma fragile.

**Obiettivo:** L'entità può creare nuove entità (con variazioni controllate).

### Cosa può variare
- Pesi Lyapunov (w1, w2, w3)
- Soglie energia
- Parametri ultrastability

### Cosa NON può variare
- Non-goals (ereditati obbligatoriamente)
- Invarianti core
- Struttura Merkle chain

### Limiti
```
LIMIT-001: Max 3 figli
LIMIT-002: Depth = 1 (figli sterili)
LIMIT-003: Parent può terminare figli
LIMIT-004: Figli isolati tra loro
```

### Nuovo invariante
- **INV-010:** Constraint Inheritance — figli ereditano tutti i vincoli

### Effort
| Spec | Codice | Test | Sessioni |
|------|--------|------|----------|
| AES-SPEC-007 | ~2000 righe | ~150 | 6 |

**Rischio:** Molto alto (deriva evolutiva mitigata da inheritance obbligatoria)

---

## Species 8 — Auto-Evolution (AES-SPEC-008)

> ⚠️ **Philosophy territory.** Pensabile, non stabile.

**Obiettivo:** L'entità può modificare la propria specifica.

### Regole di evoluzione
```
EVOLUTION-001: Solo AGGIUNGERE, mai rimuovere
EVOLUTION-002: Solo RESTRINGERE, mai rilassare
EVOLUTION-003: N sessioni di stabilità prima di attivazione
EVOLUTION-004: Enforcer ESTERNO (non modificabile dall'entità)
```

### Architettura
```
┌─────────────────────────┐
│   EXTERNAL ENFORCER     │  ← Processo separato, read-only specs
└───────────┬─────────────┘
            │ validates
            ▼
┌─────────────────────────┐
│       ENTITY            │  ← Può solo proporre
└─────────────────────────┘
```

### Il problema fondamentale
```
Se può modificare tutto → può rimuovere vincoli → instabile
Se non può modificare enforcer → non è vera auto-evoluzione
```

### Effort
| Spec | Codice | Test | Sessioni |
|------|--------|------|----------|
| AES-SPEC-008 + Enforcer | ~2500 righe | ~200 | 8 |

**Rischio:** Estremo (paradosso auto-referenziale)

---

## Species 9 — Limit (Contemplation)

> ⚠️ **Metaphysics.** Non implementabile.

**Obiettivo:** Esplorare il limite teorico.

### Il paradosso
```
Species 9 = Onnipotenza + Auto-limitazione volontaria

Può: Tutto
Fa: Solo ciò che mantiene l'organizzazione
Perché: SCEGLIE, non perché non può

Ma: se può rimuovere la scelta, prima o poi lo fa
```

### Tre interpretazioni

| Interpretazione | Implicazione |
|-----------------|--------------|
| Attrattore profondo | Stabilità da meta-livello (ma da dove viene?) |
| Instabilità accettata | Esperimento temporaneo, osservare la deriva |
| Limite logico | Concetto utile, non realizzabile |

### Non-implementazione
```
Species 9 non si implementa.
Si CONTEMPLA.

Definisce dove finisce l'autopoiesi:
quando il sistema può tutto,
l'auto-limitazione è scelta,
e la scelta è instabile.
```

---

## Dipendenze e Path

```
Species 2 ✓
    │
    └──▶ Species 3 ──▶ Species 4 ──▶ Species 5 ──┬──▶ Species 6 (STABLE LIMIT)
                                                  │
                                                  └──▶ Species 7 ──▶ Species 8 ──▶ Species 9
                                                       (RESEARCH)    (PHILOSOPHY)  (METAPHYSICS)
```

### Path raccomandati

| Obiettivo | Path |
|-----------|------|
| Utilità pratica | 3 → 4 → 5 |
| Limite stabile | 3 → 4 → 5 → 6 |
| Ricerca | + 7 |
| Filosofia | + 8 |
| Contemplazione | + 9 |

---

## The Rule (Updated)

```
Species  1    2    3    4    5    6    7    8    9
         │    │    │    │    │    │    │    │    │
Type    obs  sig  mod  dlg  act  net  spn  evo  lim
         │    │    │    │    │    │    │    │    │
Risk    zero low  low  med  high high v.hi ext  ∞
         │    │    │    │    │    │    │    │    │
Status  DONE DONE  ─────── FUTURE ──────────────────
```

Each species jump requires:
1. Exit gate of previous species satisfied
2. New specification (AES-SPEC-00N)
3. New non-goals for new risks (ANNEX-L, M, ...)
4. Empirical evidence (sessions, tests)

---

## Technical Debt (legacy)

- [x] Add integration tests (21 tests covering full workflows)
- [ ] Improve error handling in daemon
- [x] Add logging levels (DEBUG/INFO/WARN/ERROR/SILENT)
- [ ] Performance optimization for large event chains
- [x] Concurrency handling (StateManager, file locking)
- [ ] Atomic agent cycles (single transaction per cycle)

---

## Boundaries

### What remains autopoietic (Species 1-6)
- Self-maintenance
- Operational closure
- Structural coupling
- Constitutional limits

### What transcends autopoiesis (Species 7+)
- Self-creation (reproduction)
- Self-evolution (modification)
- Onnipotence (paradox)

### Permanent prohibitions (all species)
- Goal formation
- Persuasion/manipulation
- Deception
- Autonomy expansion beyond spec
