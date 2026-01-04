# CORE FROZEN

## Declaration of Organizational Immutability

**AES-SPEC-001 v1.8.0 LTS**

---

## Statement

As of v1.8.0, the core of the Autopoietic Entity System is **frozen**.

This means:

1. **No modifications** to core modules
2. **No additions** to core functionality
3. **No removals** from core behavior
4. **No refactoring** that changes semantics

Any change to the core constitutes a **new line** and requires:
- New version series (v2.x.x)
- New specification (AES-SPEC-002)
- Or explicit fork with different identity

---

## What is "Core"?

The following are considered **core** and are frozen:

### Specification
```
spec/SPECIFICATION.md        # The constitution
spec/ANNEX-F-SCOPE.md        # Internal agency scope
spec/ANNEX-G-OBSERVER.md     # Observer/actor separation
spec/ANNEX-H-SIGILLI.md      # Self-production safety
spec/ANNEX-I-NON-GOALS.md    # Prohibited capabilities
spec/ANNEX-J-FAILURE-MODES.md # Failure conditions
```

### Core Modules
```
src/types.ts                 # Core types and State interface
src/events.ts                # Event sourcing and Merkle chain
src/lyapunov.ts              # Stability function
src/guard.ts                 # Constitutional validator
src/verify.ts                # Invariant verification
src/recovery.ts              # Recovery procedures
```

### Invariants
```
INV-001: Organization hash unchanged
INV-002: State determinism (replay)
INV-003: Merkle chain integrity
INV-004: Lyapunov monotone (V never increases)
INV-005: Energy viable (E ≥ E_min or dormant)
```

### Constitutional Constraints
```
AXM-007: Human controls coupling
DEF-027: Constitutive constraint (possibility space)
DEF-029: Conservative validator (unknown → block)
DEF-047: Dormant state lifecycle
DEF-048: Terminal state (immutable failure)
```

---

## What is NOT Core (can evolve)?

The following are **peripheral** and may be modified:

### Peripheral Modules
```
src/operations.ts            # Operations catalog (can add ops)
src/learning.ts              # Pattern analysis
src/analytics.ts             # Metrics and dashboards
src/continuity.ts            # Export/import
src/meta-operations.ts       # Self-production (within Sigilli)
src/coupling-protocol.ts     # Coupling queue (TTL, config)
src/logger.ts                # Logging
```

### Daemon (peripheral organ)
```
src/daemon/*                 # Autonomous operation
```

### CLI (interface)
```
src/index.ts                 # CLI commands (can add commands)
```

### Tests
```
test/*                       # Can add tests
```

### Documentation
```
README.md                    # Can update
ROADMAP.md                   # Can update
SYSTEM.md                    # Can update
```

---

## What Changes Require New Line?

| Change Type | Example | Result |
|-------------|---------|--------|
| Add invariant | INV-006 | v2.x |
| Remove invariant | Remove INV-003 | v2.x |
| Modify invariant | Change INV-001 hash | v2.x |
| Change State interface core fields | Remove `energy` | v2.x |
| Modify constitutional constraint | Relax AXM-007 | v2.x |
| Add prohibited capability | Allow planning | Fork (violates ANNEX-I) |
| Change Lyapunov function | Different V formula | v2.x |
| Modify guard logic | Unknown → allow | v2.x |

---

## What Changes Are Allowed?

| Change Type | Example | Result |
|-------------|---------|--------|
| Add peripheral module | MCP server | v1.8.x |
| Add CLI command | New command | v1.8.x |
| Add operation to catalog | New op | v1.8.x |
| Add test | New test file | v1.8.x |
| Fix bug (no semantic change) | Error handling | v1.8.x |
| Update documentation | README | v1.8.x |
| Add optional State field | New peripheral state | v1.8.x |
| Tune config defaults | TTL values | v1.8.x |

---

## Versioning Rules

```
v1.8.x   - Peripheral changes, bugfixes, documentation
v1.9.x   - Not used (reserved)
v2.0.0   - Core changes (new line, new spec)
```

Patch versions (v1.8.1, v1.8.2, ...):
- Bugfixes only
- No new features
- No semantic changes

---

## Rationale

### Why Freeze?

1. **Stability**: Core is proven stable (434 tests, 50 sessions)
2. **Trust**: Changes to core require full re-verification
3. **Identity**: Organization hash depends on spec hash
4. **Clarity**: Clear boundary between core and periphery
5. **Saturation**: All core phases complete (1-8f)

### Why Allow Peripheral Evolution?

1. **Usability**: New interfaces, commands, visualizations
2. **Integration**: MCP, dashboard, external tools
3. **Observability**: Better monitoring, logging
4. **Non-essential**: Doesn't affect organizational identity

---

## Enforcement

This declaration is enforced by:

1. **INV-001**: Organization hash unchanged
   - Spec changes → hash changes → terminal state

2. **Code review**: Any PR touching core files requires justification
   - Default: reject
   - Exception: documented bugfix with no semantic change

3. **CI checks** (recommended):
   - Hash verification of core files
   - Reject commits modifying frozen files

---

## Exceptions

There are **no exceptions** to core freeze.

If a change to core is truly necessary:
1. It is, by definition, a new system
2. Fork the repository
3. Update to AES-SPEC-002
4. Change organization identity
5. This system remains frozen

---

## Signatures

This declaration is effective as of:

```
Date:    2026-01-05
Version: v1.8.0
Commit:  [current HEAD]
Author:  Luca Rossignoli
```

The core is frozen. The organization is complete.

---

*End of Declaration*
