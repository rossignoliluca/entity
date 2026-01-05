# Formal Verification (TLA+)

TLA+ specifications for the Autopoietic Entity System (AES-SPEC-001).

## Specifications

### Entity.tla - Core System

Models the 5 core invariants:

| Invariant | Description | Property |
|-----------|-------------|----------|
| INV-001 | Organization hash unchanged | `orgHash = OrgHash` |
| INV-002 | State determinism | `eventCount >= 0` |
| INV-003 | Merkle chain integrity | `merkleRoot # "corrupted"` |
| INV-004 | Lyapunov monotone | `V <= V_previous` |
| INV-005 | Energy viable | `E >= E_min \/ mode = "dormant"` |

**Actions modeled:**
- StartSession, EndSession
- Recharge
- EnterDormant, RecoverToNominal
- LyapunovDecrease
- EnterTerminal

### Quarantine.tla - Sigillo 1 (Annex H)

Models the quarantine gate FSM:

```
QUARANTINED ──(cycles)──> TRIAL ──(uses)──> ACTIVE
     │                      │
     └──(block)──> DEPRECATED <──(block/spike)──┘
```

**Constraints verified:**
- `QuarantineCycles` before TRIAL
- `MinTrialUses` before ACTIVE
- Zero tolerance: any block → DEPRECATED
- Any ΔV > 0 → DEPRECATED (spike detection)

### Coupling.tla - Phase 8f Protocol

Models structural coupling with AXM-007 constraint:

```
pending ──(human grant)──> granted ──(human complete)──> completed
   │
   ├──(TTL expires)──> expired
   └──(human cancel)──> canceled
```

**Key property (AXM-007):** Human controls coupling
- Agent can REQUEST
- Agent CANNOT grant/complete/cancel
- Only human presence enables grant

## Running TLC Model Checker

### Prerequisites

1. Install TLA+ Toolbox or tla2tools.jar
2. Java 11+

### Command Line

```bash
# Check Entity invariants
java -jar tla2tools.jar -config Entity.cfg Entity.tla

# Check Quarantine FSM
java -jar tla2tools.jar -config Quarantine.cfg Quarantine.tla

# Check Coupling protocol
java -jar tla2tools.jar -config Coupling.cfg Coupling.tla
```

### Using TLA+ Toolbox

1. Open `.tla` file
2. Create new model
3. Set constants (see `.cfg` files)
4. Add invariants/properties to check
5. Run TLC

## Configuration Files

### Entity.cfg

```tla
CONSTANTS
    E_min = 1
    E_threshold = 10
    E_decay = 5
    E_recharge = 10
    OrgHash = "org123"

INVARIANT
    TypeInvariant
    AllInvariants

PROPERTY
    Safety
    TerminalIsAbsorbing
```

### Quarantine.cfg

```tla
CONSTANTS
    QuarantineCycles = 10
    MinTrialUses = 5
    MaxOperations = 3

INVARIANT
    TypeInvariant
    QuarantineInvariants

PROPERTY
    Safety
    DeprecatedStaysDeprecated
```

### Coupling.cfg

```tla
CONSTANTS
    MaxRequests = 5
    TTL_Urgent = 10
    TTL_Normal = 40
    TTL_Low = 240
    CooldownDuration = 5

INVARIANT
    TypeInvariant
    CouplingInvariants

PROPERTY
    Safety
    AgentNeverGrants
```

## Verification Status

| Spec | States | Invariants | Properties | Status |
|------|--------|------------|------------|--------|
| Entity.tla | TBD | 5 | 4 | Draft |
| Quarantine.tla | TBD | 4 | 3 | Draft |
| Coupling.tla | TBD | 3 | 4 | Draft |

## Notes

These specifications are **abstract models** of the TypeScript implementation.
They verify:

1. **Safety:** Invariants always hold
2. **Liveness:** Progress eventually happens
3. **Constraint compliance:** AXM-007, Sigilli rules

They do NOT verify:
- Cryptographic correctness (hashing)
- Timing constraints (real-time)
- Implementation correctness (code matches spec)

For implementation verification, see integration tests.
