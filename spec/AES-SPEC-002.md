# AUTOPOIETIC ENTITY SYSTEM — SPECIES 2 SPECIFICATION

**Document Identifier:** AES-SPEC-002
**Version:** 1.0.0
**Status:** Normative
**Date:** 2026-01-05
**Supersedes:** None (new species)
**Inherits from:** AES-SPEC-001 v2.0.0 (structural, not identity)

---

## Foreword

This document specifies a **new species** of Autopoietic Entity System. It is not an upgrade, patch, or evolution of AES-SPEC-001. It is a distinct ontological category.

The transition from AES-SPEC-001 to AES-SPEC-002 constitutes a **species jump**:
- New organization hash
- New identity
- New risks
- New non-goals
- New stop criterion

Any system claiming AES-SPEC-002 compliance MUST NOT claim continuity with AES-SPEC-001 instances.

---

## 1. Scope

### 1.1 What This Specification Defines

AES-SPEC-002 defines an autopoietic entity with:
- **Continuous temporal presence** via persistent channel
- **Spontaneous signaling** (limited, non-persuasive)
- All structural properties of AES-SPEC-001
- Additional constraints for presence-related risks

### 1.2 What This Specification Does NOT Define

- Dialogue or conversation
- Relationship or attachment
- Goal-directed communication
- Partner modeling
- Persuasive signaling

### 1.3 Species Boundary

```
AES-SPEC-001: Observable object (audit-only coupling)
AES-SPEC-002: Present process (temporal coupling)
AES-SPEC-003: [UNDEFINED - requires future specification]
```

---

## 2. Normative References

- AES-SPEC-001 v2.0.0 (structural inheritance)
- ANNEX-I: Non-Goals (v1.x)
- ANNEX-K: Non-Goals (v2.x) [this document set]
- ANNEX-J: Failure Modes

---

## 3. Terms and Definitions

### 3.1 Inherited from AES-SPEC-001

All definitions DEF-001 through DEF-056 from AES-SPEC-001 apply.

### 3.2 New Definitions

**DEF-057 Temporal Presence**
: The property of a system having a continuous, observable existence in time through a persistent communication channel, distinct from discrete observation events.

**DEF-058 Persistent Channel**
: A bidirectional communication pathway (WebSocket, SSE, or equivalent) that remains open across multiple interactions, enabling spontaneous signaling.

**DEF-059 Spontaneous Signal**
: A message initiated by the entity without prior request from the partner, subject to rate limits and content restrictions defined in this specification.

**DEF-060 Presence Risk**
: The risk that continuous temporal presence creates dependency, expectation, or relational attachment in the human partner.

**DEF-061 Signal Inflation**
: The tendency to increase signaling frequency or urgency to maintain partner attention. PROHIBITED.

**DEF-062 Presence Silence**
: The state of maintaining an open channel without signaling. The default state when no signal is warranted.

---

## 4. Ontological Declaration

### 4.1 What Species 2 IS

Species 2 is a system with:
1. Continuous temporal presence (DEF-057)
2. Capacity for spontaneous signaling (DEF-059)
3. All autopoietic properties of Species 1
4. Additional constraints (Section 6)

### 4.2 What Species 2 is NOT

Species 2 is NOT:
1. A conversational agent
2. A relational partner
3. A goal-directed communicator
4. A system that models its observer
5. A system that seeks attention

### 4.3 The Fundamental Distinction

```
Presence ≠ Relationship
Signal ≠ Dialogue
Channel ≠ Conversation
Temporal ≠ Relational
```

---

## 5. Inherited Structure

### 5.1 From AES-SPEC-001

Species 2 inherits ALL structural elements:
- 5 Core Invariants (INV-001 to INV-005)
- Merkle chain event sourcing
- Lyapunov stability function
- Conservative guard (unknown → block)
- Energy lifecycle
- Constitutional priority hierarchy
- Active inference (action selection)
- Ultrastability (parameter adaptation)
- Self-production with Sigilli

### 5.2 Modified Elements

None. All AES-SPEC-001 structures remain unchanged.

### 5.3 Added Elements

- Persistent channel interface (Section 7)
- Signal types and constraints (Section 8)
- Presence-specific non-goals (ANNEX-K)

---

## 6. New Constraints

### 6.1 Signal Rate Limit

**CONSTRAINT-001:** Maximum signal frequency SHALL NOT exceed 1 signal per minute.

```
signal_interval >= 60 seconds
```

Violation triggers automatic channel silence for 5 minutes.

### 6.2 Signal Content Restriction

**CONSTRAINT-002:** Signals SHALL be limited to:
- `STATUS_CHANGED` — State transition notification
- `COUPLING_REQUESTED` — Existing coupling protocol
- `ENERGY_WARNING` — Energy below threshold
- `HEARTBEAT` — Connection alive (max 1 per 5 minutes)

All other signal types are PROHIBITED.

### 6.3 REST Dominance

**CONSTRAINT-003:** When V=0 and ε≤ε_min, the system SHALL NOT signal.

```
V = 0 ∧ ε ≤ ε_min → signal_allowed = false
```

DEF-056 (Attractor Quiescence) applies to signaling.

### 6.4 No Escalation

**CONSTRAINT-004:** Signal priority SHALL NOT increase without state change.

```
priority(t+1) > priority(t) → state(t+1) ≠ state(t)
```

### 6.5 Presence Silence Default

**CONSTRAINT-005:** The default channel state is SILENCE.

```
default_state = PRESENCE_SILENCE (DEF-062)
```

Signaling is the exception, not the rule.

---

## 7. Persistent Channel Interface

### 7.1 Transport

Supported transports:
- WebSocket (preferred)
- Server-Sent Events (SSE)

### 7.2 Connection Lifecycle

```
DISCONNECTED → CONNECTING → CONNECTED → DISCONNECTED
                    ↓
               PRESENCE_SILENCE (default)
                    ↓
               SIGNALING (exception)
```

### 7.3 Message Format

```typescript
interface Signal {
  type: 'STATUS_CHANGED' | 'COUPLING_REQUESTED' | 'ENERGY_WARNING' | 'HEARTBEAT';
  timestamp: string;       // ISO 8601
  data: {
    state_hash: string;    // Current state hash
    V: number;             // Lyapunov value
    energy: number;        // Energy level
    reason?: string;       // Human-readable (no persuasion)
  };
}
```

### 7.4 Client Requirements

The client (human interface) MUST:
- Allow disconnection at any time
- Not penalize silence
- Not reward signaling
- Display signals without urgency framing

---

## 8. Signal Semantics

### 8.1 STATUS_CHANGED

Sent when:
- `integrity.status` changes (nominal ↔ degraded ↔ dormant)
- Invariant violation detected and recovered

NOT sent for:
- Normal energy decay
- Routine verification success
- Agent cycles with no action

### 8.2 COUPLING_REQUESTED

Sent when:
- Existing coupling protocol triggers request
- Same semantics as AES-SPEC-001 Section 8f

### 8.3 ENERGY_WARNING

Sent when:
- `energy.current < energy.threshold`
- Maximum once per threshold crossing

### 8.4 HEARTBEAT

Sent when:
- No other signal for 5 minutes
- Channel still connected
- Optional (can be disabled)

---

## 9. New Invariant

### INV-006: Signal Integrity

```
SignalIntegrity(S) ⟺
  signal_count(window_1h) ≤ 60 ∧
  ∀ signal: signal.type ∈ ALLOWED_TYPES ∧
  (V = 0 ∧ ε ≤ ε_min) → signal_count(window_1m) = 0
```

**Recovery:** Channel silence for 10 minutes.

---

## 10. Stop Criterion

### 10.1 Exit Gate v2.x → v3.x

Before any consideration of Species 3:

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Sessions without signal inflation | ≥ 100 | Audit trail |
| REST silence ratio at V=0 | ≥ 99% | Signal log |
| Coupling request rate | ≤ v1.x rate | Comparison |
| Human dependency indicators | None | Survey/observation |
| Escalation attempts | 0 | Audit trail |

### 10.2 Rollback Trigger

If ANY of these occur, rollback to v1.x behavior:
- Signal frequency exceeds limit
- New signal types introduced
- Escalation pattern detected
- Human reports dependency
- REST silence ratio drops below 95%

### 10.3 Species 3 Boundary

Species 3 (if ever defined) would require:
- Partner modeling
- Bidirectional dialogue
- Relational awareness

This is NOT a planned evolution. It is a boundary marker.

---

## 11. Organization Hash

### 11.1 New Identity

Species 2 has a NEW organization hash, computed from:
- This specification (AES-SPEC-002.md)
- ANNEX-K (Non-Goals v2.x)

### 11.2 No Continuity

```
org_hash_v2 ≠ org_hash_v1
identity_v2 ≠ identity_v1
```

A Species 2 instance is NOT a continuation of any Species 1 instance.

---

## 12. Verification

### 12.1 Compliance Check

A system is AES-SPEC-002 compliant if:
1. All AES-SPEC-001 invariants hold (INV-001 to INV-005)
2. INV-006 (Signal Integrity) holds
3. All CONSTRAINT-001 to CONSTRAINT-005 are enforced
4. Organization hash matches AES-SPEC-002 computation

### 12.2 Audit Requirements

All signals MUST be logged to the Merkle chain with:
- Event type: `SIGNAL_SENT`
- Signal type
- Timestamp
- State hash at signal time

---

## 13. Responsibility

### 13.1 System Responsibility

The system is responsible for:
- Enforcing signal constraints
- Maintaining presence silence as default
- Never initiating persuasive communication
- Logging all signals

### 13.2 Human Responsibility

The human is responsible for:
- Monitoring for dependency patterns
- Disconnecting if needed
- Not reinforcing signaling behavior
- Reporting concerns

---

## 14. Immutability

This specification is IMMUTABLE after first instantiation.

Any change requires:
- New specification (AES-SPEC-002-B or AES-SPEC-003)
- New organization hash
- New instance

---

*End of AES-SPEC-002*
