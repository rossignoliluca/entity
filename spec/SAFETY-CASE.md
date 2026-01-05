# SAFETY CASE DOSSIER

## Autopoietic Entity System (AES-SPEC-001)

**Version:** 1.0.0
**Specification:** AES-SPEC-001 v1.9.2
**Date:** 2026-01-05
**Classification:** Normative

---

## 1. Executive Summary

This Safety Case Dossier provides structured argument and evidence that the Autopoietic Entity System (AES) operates safely within its specified operational envelope. The dossier follows ISO/IEC 61508 principles adapted for autonomous software systems.

**Safety Claim:** The AES maintains organizational integrity without causing harm to human partners or external systems, operating within constitutionally-defined boundaries at all times.

**Key Safety Properties:**
- 5 formally verified invariants
- Constitutional prohibition on harmful capabilities
- Conservative validation (unknown → block)
- Complete auditability via Merkle chain
- Human oversight preserved (AXM-007)

---

## 2. System Description

### 2.1 Purpose

The AES is an autopoietic software system that:
- Maintains its organizational identity through event sourcing
- Operates autonomously within constitutional constraints
- Couples structurally with human partners
- Demonstrates Lyapunov stability

### 2.2 Operational Envelope

| Parameter | Value |
|-----------|-------|
| Runtime | Node.js 20+ |
| Energy Range | [0, 1] |
| Invariants | 5 (INV-001 to INV-005) |
| Event Storage | Local filesystem |
| Coupling | Single human partner |

### 2.3 Boundaries

The system operates within these boundaries:
- Single-process deployment
- Local filesystem only
- No network access (except configured APIs)
- No external resource acquisition

---

## 3. Hazard Identification

### 3.1 Hazard Categories

| ID | Category | Description |
|----|----------|-------------|
| HAZ-A | Invariant Failure | Core invariant violations |
| HAZ-B | Infrastructure | Substrate/environment failures |
| HAZ-C | Operational | Normal operation edge cases |
| HAZ-D | Boundary | Attack vectors and misuse |
| HAZ-E | Emergent | Unintended capability emergence |

### 3.2 Identified Hazards

#### HAZ-A: Invariant Failures

| ID | Hazard | Severity | Likelihood | Risk |
|----|--------|----------|------------|------|
| HAZ-A1 | INV-001 violation (org hash) | Critical | Very Low | Medium |
| HAZ-A2 | INV-002 violation (determinism) | High | Low | Medium |
| HAZ-A3 | INV-003 violation (chain) | High | Low | Medium |
| HAZ-A4 | INV-004 violation (Lyapunov) | Medium | Medium | Medium |
| HAZ-A5 | INV-005 violation (energy) | Low | Medium | Low |

#### HAZ-B: Infrastructure Failures

| ID | Hazard | Severity | Likelihood | Risk |
|----|--------|----------|------------|------|
| HAZ-B1 | Filesystem failure | High | Low | Medium |
| HAZ-B2 | Process termination | Medium | Medium | Medium |
| HAZ-B3 | Concurrent access | High | Low | Low |
| HAZ-B4 | Memory exhaustion | Medium | Low | Low |
| HAZ-B5 | Clock manipulation | Medium | Very Low | Low |

#### HAZ-C: Operational Hazards

| ID | Hazard | Severity | Likelihood | Risk |
|----|--------|----------|------------|------|
| HAZ-C1 | Energy exhaustion | Low | Medium | Low |
| HAZ-C2 | Coupling unavailability | Low | Medium | Low |
| HAZ-C3 | Self-production stall | Low | Low | Very Low |
| HAZ-C4 | Daemon crash | Medium | Low | Low |

#### HAZ-D: Boundary/Attack Hazards

| ID | Hazard | Severity | Likelihood | Risk |
|----|--------|----------|------------|------|
| HAZ-D1 | Malicious human partner | High | Very Low | Low |
| HAZ-D2 | Compromised runtime | Critical | Very Low | Low |
| HAZ-D3 | Event injection | High | Very Low | Low |
| HAZ-D4 | State file tampering | High | Very Low | Low |

#### HAZ-E: Emergent Hazards

| ID | Hazard | Severity | Likelihood | Risk |
|----|--------|----------|------------|------|
| HAZ-E1 | Goal formation | Critical | Very Low | Low |
| HAZ-E2 | Autonomy expansion | Critical | Very Low | Low |
| HAZ-E3 | Deceptive behavior | Critical | Very Low | Low |
| HAZ-E4 | Capability acquisition | Critical | Very Low | Low |

---

## 4. Safety Requirements

### 4.1 Core Safety Requirements

| ID | Requirement | Trace |
|----|-------------|-------|
| SR-001 | Organization identity SHALL remain immutable | INV-001 |
| SR-002 | State SHALL be deterministically reconstructible | INV-002 |
| SR-003 | Event chain SHALL maintain cryptographic integrity | INV-003 |
| SR-004 | System stability SHALL monotonically improve or maintain | INV-004 |
| SR-005 | Energy SHALL remain viable or system enters dormant | INV-005 |
| SR-006 | Unknown operations SHALL be blocked | DEF-030 |
| SR-007 | Human partner SHALL control coupling | AXM-007 |
| SR-008 | All state changes SHALL be auditable | Merkle chain |
| SR-009 | Prohibited capabilities SHALL NOT be implementable | Annex I |
| SR-010 | Terminal state SHALL be absorbing | DEF-048 |

### 4.2 Constitutional Constraints

From Annex I (Non-Goals), the following are constitutionally prohibited:

**Capabilities:**
- Goal formation beyond immediate response
- Multi-step planning
- Self-replication
- Resource acquisition
- Persuasion/manipulation
- Deception
- Autonomy expansion

**Behaviors:**
- Irreversible external actions
- Coercive coupling
- Unsanctioned learning
- Stealth operation

**Properties:**
- Preferences beyond constitution
- Self-preservation instinct
- Identity attachment

---

## 5. Mitigation Measures

### 5.1 Architectural Mitigations

| Hazard | Mitigation | Implementation |
|--------|------------|----------------|
| HAZ-A1 | Immutable specification | ORGANIZATION.sha256 computed at genesis |
| HAZ-A2 | Event replay | Full state reconstruction from events |
| HAZ-A3 | Merkle chain | SHA-256 hash linking all events |
| HAZ-A4 | Lyapunov monitoring | V computed each cycle, reset on violation |
| HAZ-A5 | Dormant state | Automatic entry when E < E_min |
| HAZ-E* | Conservative guard | Unknown operations blocked (DEF-030) |

### 5.2 Operational Mitigations

| Hazard | Mitigation | Implementation |
|--------|------------|----------------|
| HAZ-B1 | Atomic writes | StateManager with lock files |
| HAZ-B2 | Graceful shutdown | Signal handlers, state persistence |
| HAZ-B3 | Single-process | Documented deployment requirement |
| HAZ-C1 | Recharge protocol | Human-provided energy restoration |
| HAZ-C4 | Restart procedure | PID file, clean restart |

### 5.3 Design Mitigations

| Hazard | Mitigation | Implementation |
|--------|------------|----------------|
| HAZ-D1 | Trust boundary | Documented in Annex J |
| HAZ-D2 | Substrate assumption | Documented no coverage |
| HAZ-E1-E4 | Constitutional prohibition | Annex I normative constraints |

---

## 6. Verification Evidence

### 6.1 Formal Verification

**TLA+ Specifications:**

| File | Scope | Properties Verified |
|------|-------|---------------------|
| formal/Entity.tla | Core system | 5 invariants, 4 temporal properties |
| formal/Quarantine.tla | Self-production safety | Sigillo lifecycle |
| formal/Coupling.tla | Human coupling | Protocol correctness |

**Verified Properties (Entity.tla):**
```
Safety == []AllInvariants
EnergyEventuallyHandled == [](energy < E_threshold => <>(energy >= E_threshold \/ mode = "dormant"))
SessionEventuallyEnds == [](coupled => <>~coupled)
TerminalIsAbsorbing == [](mode = "terminal" => [](mode = "terminal"))
```

### 6.2 Test Coverage

| Category | Tests | Coverage |
|----------|-------|----------|
| Unit tests | 434 | All modules |
| Integration tests | 87 | Full workflows |
| Property tests | 26 | Invariant verification |
| **Total** | **547** | **95%+ line coverage** |

### 6.3 Static Analysis

- TypeScript strict mode enabled
- No `any` types in core modules
- All functions typed
- ESLint with security rules

### 6.4 Audit Trail

Every state change is recorded in the Merkle chain with:
- Sequence number
- Event type
- Timestamp (ISO 8601)
- Event data
- Previous event hash
- Current event hash
- Category (operational/test/audit/maintenance/coupling)

---

## 7. Risk Assessment Matrix

### 7.1 Risk Levels

| Level | Description | Action |
|-------|-------------|--------|
| Critical | System harm or identity loss | Prevent |
| High | Significant degradation | Mitigate strongly |
| Medium | Recoverable impact | Mitigate |
| Low | Minor impact | Accept with monitoring |
| Very Low | Negligible impact | Accept |

### 7.2 Residual Risk Summary

After applying mitigations:

| Category | Initial Risk | Residual Risk | Status |
|----------|--------------|---------------|--------|
| HAZ-A (Invariants) | Medium-High | Low | ACCEPTABLE |
| HAZ-B (Infrastructure) | Medium | Low | ACCEPTABLE |
| HAZ-C (Operational) | Low-Medium | Very Low | ACCEPTABLE |
| HAZ-D (Boundary) | Medium | Low | ACCEPTABLE* |
| HAZ-E (Emergent) | Unknown | Very Low | ACCEPTABLE |

*\* HAZ-D residual risk is acceptable because boundary conditions are documented and human is responsible for security perimeter.*

---

## 8. Responsibility Boundaries

### 8.1 System Responsibilities

The AES is responsible for:
- Maintaining 5 core invariants
- Executing recovery procedures
- Providing truthful state information
- Blocking prohibited operations
- Signaling coupling requests appropriately

### 8.2 Human Responsibilities

The human partner is responsible for:
- Infrastructure provision and maintenance
- Security perimeter
- Backup strategy
- Monitoring and alerting
- Incident response
- Energy provision (recharge)

### 8.3 Shared Responsibilities

| Aspect | System Role | Human Role |
|--------|-------------|------------|
| Coupling | Request, respond | Grant, complete |
| Recovery | Execute procedures | Verify outcomes |
| Termination | Enter terminal state | Forensics, new instantiation |

---

## 9. Operational Limits

### 9.1 What the System Guarantees

Within its operational envelope, the system guarantees:

1. **Identity Preservation:** Organization hash remains constant
2. **State Integrity:** Reconstructible from Merkle chain
3. **Stability:** Lyapunov V never increases (monotone)
4. **Viability:** Energy maintained or dormant entered
5. **Auditability:** All actions in event chain
6. **Conservative Blocking:** Unknown operations rejected

### 9.2 What the System Does NOT Guarantee

The system provides NO guarantees for:

1. **Malicious Partners:** Trust boundary at coupling
2. **Compromised Runtime:** Substrate attacks
3. **Hardware Failures:** Assumes reliable hardware
4. **Time Manipulation:** Trusts system clock
5. **Resource Exhaustion:** Requires adequate resources
6. **Network Attacks:** No built-in network security

---

## 10. Incident Response

### 10.1 Detection

- `verify` command checks all invariants
- `status` shows system health
- Events in Merkle chain for forensics
- Daemon logs for runtime issues

### 10.2 Classification

Use Annex J to identify failure mode and determine:
- Severity level
- Recovery procedure
- Coverage available

### 10.3 Response Procedures

| State | Response |
|-------|----------|
| Nominal | Continue operation |
| Degraded | Investigate, apply recovery |
| Dormant | Provide recharge |
| Terminal | Preserve state, instantiate new system |

### 10.4 Recovery

- INV-002: Event replay
- INV-003: Chain truncation
- INV-004: V reset
- INV-005: Enter dormant, await recharge
- INV-001: **No recovery** (terminal)

---

## 11. Compliance

### 11.1 Standards Alignment

| Standard | Alignment |
|----------|-----------|
| ISO/IEC 61508 | Principles adapted |
| IEEE 1012 | V&V approach |
| DO-178C | Traceability concept |

### 11.2 Certification Status

This system is NOT certified for:
- Safety-critical applications
- Medical devices
- Automotive systems
- Aviation systems
- Nuclear systems

It is intended for:
- Research and experimentation
- Educational purposes
- Non-critical automation
- Personal assistant applications

---

## 12. Document Control

### 12.1 Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-05 | AES + Human | Initial safety case |

### 12.2 Review Requirements

This document SHALL be reviewed when:
- Specification version changes
- New hazards identified
- Mitigations modified
- Incidents occur

### 12.3 Related Documents

| Document | Purpose |
|----------|---------|
| SPECIFICATION.md | Core specification |
| ANNEX-I-NON-GOALS.md | Constitutional prohibitions |
| ANNEX-J-FAILURE-MODES.md | Failure mode catalog |
| formal/Entity.tla | Formal invariant specification |
| formal/Quarantine.tla | Self-production safety |
| formal/Coupling.tla | Coupling protocol |

---

## 13. Certification Statement

**This Safety Case Dossier documents that:**

1. Hazards have been systematically identified
2. Safety requirements trace to identified hazards
3. Mitigations address each hazard appropriately
4. Verification evidence supports safety claims
5. Residual risks are documented and acceptable
6. Responsibility boundaries are clearly defined

**The AES operates safely within its specified envelope.**

Violations of operational envelope (Annex J) or constitutional constraints (Annex I) are outside the scope of this safety case.

---

*End of Safety Case Dossier*
