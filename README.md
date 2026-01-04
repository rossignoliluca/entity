# Entity System

**AES-SPEC-001 v1.0.0** - Autopoietic Entity System

An ISO-compliant implementation of an autopoietic entity with event sourcing, Merkle chain integrity, and Lyapunov stability guarantees.

## Overview

Entity is a self-maintaining system that preserves its organizational identity through:

- **Event Sourcing**: All state changes recorded as hash-linked events (Merkle chain)
- **Invariant Verification**: 5 core invariants continuously monitored
- **Lyapunov Stability**: Mathematical guarantee of system stability (V never increases)
- **Energy Lifecycle**: Decay/recharge mechanism with dormant state protection
- **Conservative Validation**: Unknown operations are blocked by default

## Requirements

- Node.js 20+
- npm 10+

## Installation

```bash
npm install
npm run build
```

## CLI Commands

```bash
node dist/src/index.js <command>
```

| Command | Description |
|---------|-------------|
| `verify` | Run all invariant checks |
| `status` | Show system status |
| `session start [partner]` | Start a new session |
| `session end` | End current session (triggers auto-snapshot + energy decay) |
| `snapshot create [desc]` | Create manual state backup |
| `snapshot list` | List all snapshots |
| `snapshot restore <id>` | Restore from snapshot |
| `snapshot verify <id>` | Verify snapshot integrity |
| `recharge` | Restore energy (+0.10) |
| `replay` | Replay events and show state |
| `events` | List recent events |
| `recover` | Attempt recovery from violations |
| `help` | Show help |

## Invariants

| ID | Name | Description | Recovery |
|----|------|-------------|----------|
| INV-001 | Organization Hash | Identity hash must never change | Terminal (no recovery) |
| INV-002 | State Determinism | State must be reproducible via event replay | Replay events |
| INV-003 | Chain Integrity | Merkle chain must be valid | Truncate corrupted events |
| INV-004 | Lyapunov Monotone | V(s) must never increase | Reset to V_previous |
| INV-005 | Energy Viable | E must be >= E_min | Enter dormant state |

## Energy Lifecycle

```
Energy Range: [0.00, 1.00]
E_min: 0.01 (dormant threshold)

Session end:  -0.05 (decay)
Recharge:     +0.10 (recovery)

State transitions:
  nominal -> (E < E_min) -> dormant -> (recharge) -> nominal
```

## System States

| State | V(s) | Description |
|-------|------|-------------|
| nominal | 0.0 | System at attractor, all invariants satisfied |
| degraded | 0.2 | Minor violations, recoverable |
| dormant | 0.5 | Energy depleted, awaiting recharge (DEF-047) |
| terminal | 1.0 | INV-001 violated, unrecoverable (DEF-048) |

## Snapshots

- **Auto-snapshot**: Created automatically at session end
- **Max snapshots**: 10 (FIFO cleanup)
- **Restore**: Preserves event chain, only restores state
- **Integrity**: SHA-256 hash verification

## Project Structure

```
entity/
├── src/
│   ├── index.ts      # CLI entry point
│   ├── types.ts      # Core type definitions
│   ├── hash.ts       # SHA-256 utilities
│   ├── events.ts     # Event sourcing (Merkle chain)
│   ├── lyapunov.ts   # Stability function V(s)
│   ├── guard.ts      # Conservative validator
│   ├── verify.ts     # Invariant verification
│   ├── recovery.ts   # Recovery procedures
│   └── snapshot.ts   # State snapshots
├── test/             # 102 unit tests
├── events/           # Event store (JSON files)
├── state/
│   ├── current.json  # Current state
│   └── snapshots/    # State snapshots
└── spec/
    └── SPECIFICATION.md  # ISO AES-SPEC-001
```

## Specification Reference

This implementation conforms to **AES-SPEC-001**:

- **55 Definitions** (DEF-001 to DEF-055)
- **18 Axioms** (AXM-001 to AXM-018)
- **10 Theorems** (THM-001 to THM-010)

Key concepts:
- **Autopoiesis**: Self-producing organization (Maturana & Varela)
- **Structural Coupling**: Entity-environment interaction
- **Operational Closure**: Self-referential boundary maintenance

## Constitutive Constraint

**No action or inaction shall reduce the weighted possibility space of any being.**

## Example Session

```bash
# Start session
$ node dist/src/index.js session start human
Session started: abc123...

# Verify invariants
$ node dist/src/index.js verify
=== VERIFICATION REPORT ===
Status: ALL PASSED
Lyapunov V: 0.000000

# Check status
$ node dist/src/index.js status
=== ENTITY STATUS ===
Status: nominal
Energy: 0.50
Sessions: 21
Events: 89

# End session (triggers decay + auto-snapshot)
$ node dist/src/index.js session end
Energy: 0.50 -> 0.45 (decay: -0.05)
Session ended
Auto-snapshot: snap-2026-01-04T14-00-31

# Recharge energy
$ node dist/src/index.js recharge
Energy: 0.45 -> 0.55 (recharge: +0.1)
```

## Testing

```bash
npm run test
# 102 tests passing
```

## Statistics

| Metric | Value |
|--------|-------|
| Events | 89 |
| Sessions | 21 |
| Snapshots | 10 |
| Tests | 102 |
| Commits | 24 |

## License

MIT

## Author

Luca Rossignoli

---

*Built with TypeScript, conforming to ISO AES-SPEC-001*
