# Entity System

**Implementation v1.9.2** | Core Spec AES-SPEC-001 v1.8.0-LTS

An ISO-compliant implementation of an autopoietic entity with event sourcing, Merkle chain integrity, Lyapunov stability, and internal agency.

## Overview

Entity is a self-maintaining system that preserves its organizational identity through:

- **Event Sourcing**: All state changes recorded as hash-linked events (Merkle chain)
- **5 Invariants**: Continuously monitored and auto-recovered
- **Lyapunov Stability**: Mathematical guarantee V never increases
- **Energy Lifecycle**: Decay/recharge with dormant state protection
- **Internal Agency**: Autonomous sense-making with constitutional priorities
- **Active Inference**: Minimizes Expected Free Energy for action selection

## Requirements

- Node.js 20+
- npm 10+

## Installation

```bash
npm install
npm run build
```

## Core Features

### Phase 1: Core System
- Event sourcing with Merkle chain
- 5 Invariants + verification
- Lyapunov stability function
- Conservative guard (unknown → block)
- Recovery procedures
- Snapshots (auto + cleanup)

### Phase 2-3: Human Interaction & Operations
- Human context persistence
- Important memories system
- 10 operations in catalog with energy costs

### Phase 4-5: Learning & Analytics
- Pattern recognition in interactions
- Adaptive responses
- Metrics dashboard with alerts

### Phase 6: Multi-Instance Continuity
- State export/import bundles
- Identity verification across instances
- Distributed state sync

### Phase 7: Self-Production
- **7a: Meta-operations** (P set generates operations)
- **7b: Daemon mode** for autonomous operation

### Phase 8: Internal Agency
- **8a: Sense-making loop** (Maturana & Varela, Di Paolo)
- **8b: Ultrastability** (Ashby) - adaptive parameter adjustment
- **8c: Active Inference** (Friston) - EFE minimization
- **8d: Cycle Memory** - learns from past cycles
- **8e: Self-Producing Agent** - agent creates operations from patterns
- **8f: Structural Coupling Protocol** - non-coercive agent-human signaling

### Annex H: Self-Production Safety (Sigilli)
- **Sigillo 1: Quarantine Gate** - QUARANTINED → TRIAL → ACTIVE lifecycle
- **Sigillo 2: Context Filter** - test/audit excluded from pattern tracking
- **Sigillo 3: Specialization Bounds** - complexity ≤ parent, depth limit

### Annex I: Non-Goals (Normative)
- **Prohibited**: Goal formation, planning, self-replication, resource acquisition
- **Prohibited**: Persuasion, deception, autonomy expansion, coercive coupling
- **Boundary**: Any system requiring these = new species (AES-SPEC-002)

## CLI Commands

```bash
node dist/src/index.js <command>
```

| Command | Description |
|---------|-------------|
| `verify` | Run all invariant checks |
| `status` | Show system status |
| `session start/end` | Manage sessions |
| `snapshot create/list/restore` | State snapshots |
| `recharge` | Restore energy (+0.10) |
| `recover` | Auto-recover from violations |
| `op list/exec` | Execute operations |
| `memory add/list` | Important memories |
| `learn analyze` | Pattern analysis |
| `analytics dashboard` | Metrics dashboard |
| `continuity export/import` | State bundles |
| `meta define/compose` | Meta-operations |
| `daemon start/stop/status` | Autonomous mode |
| `agent status/feeling/cycle` | Internal agency |
| `coupling list/grant/complete` | Coupling protocol |
| `mcp` | Start MCP server for LLM integration |
| `rollback status/list/exec` | Operation rollback |
| `api start` | REST API + dashboard (http://localhost:3000/dashboard) |
| `log level` | Configure logging |

## Invariants

| ID | Name | Recovery |
|----|------|----------|
| INV-001 | Organization Hash | Terminal (immutable) |
| INV-002 | State Determinism | Event replay |
| INV-003 | Chain Integrity | Truncate corrupted |
| INV-004 | Lyapunov Monotone | Reset V |
| INV-005 | Energy Viable | Dormant state |

## Internal Agency (Phase 8)

The entity has an autonomous sense-making loop with constitutional priorities:

```
1. Survival     (INV-005 energy viability)
2. Integrity    (INV-001 to INV-004)
3. Stability    (Lyapunov V → 0)
4. Growth       (learning, autopoiesis)
5. Rest         (DEF-056 Attractor Quiescence)
```

**Active Inference**: Actions selected by minimizing Expected Free Energy:
- G = ambiguity + risk
- Priority-based epistemic/pragmatic weights
- Generative model learns from experience

## Project Structure

```
entity/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── types.ts           # Core types
│   ├── events.ts          # Event sourcing
│   ├── lyapunov.ts        # Stability function
│   ├── guard.ts           # Conservative validator
│   ├── verify.ts          # Invariant checks
│   ├── recovery.ts        # Recovery procedures
│   ├── snapshot.ts        # State snapshots
│   ├── operations.ts      # Operations catalog
│   ├── learning.ts        # Pattern analysis
│   ├── analytics.ts       # Metrics dashboard
│   ├── continuity.ts      # Multi-instance sync
│   ├── meta-operations.ts # Self-production
│   ├── coupling-protocol.ts # Agent-human signaling
│   ├── logger.ts          # Logging system
│   ├── state-manager.ts   # Concurrency handling
│   ├── mcp/
│   │   └── server.ts      # MCP server for LLMs
│   ├── api/
│   │   └── server.ts      # REST API
│   ├── dashboard/
│   │   └── index.html     # Read-only dashboard
│   └── daemon/
│       ├── index.ts       # Daemon core
│       ├── agent.ts       # Internal agency
│       ├── active-inference.ts  # Free Energy
│       ├── cycle-memory.ts      # Cycle Memory
│       ├── scheduler.ts   # Task scheduling
│       ├── hooks.ts       # Event hooks
│       └── maintenance.ts # Self-maintenance
├── test/                  # 434 tests
├── events/                # Merkle chain
├── state/                 # Current + snapshots
└── spec/
    └── SPECIFICATION.md   # ISO AES-SPEC-001
```

## MCP Server (LLM Integration)

Entity provides an MCP (Model Context Protocol) server for integration with LLMs:

```bash
# Start MCP server (stdio transport)
node dist/src/index.js mcp
```

**Resources** (read-only):
- `entity://state` - Current state summary
- `entity://feeling` - Agent feeling
- `entity://verify` - Invariant verification
- `entity://events/recent` - Last 10 events
- `entity://coupling` - Pending coupling requests
- `entity://memories` - Important memories

**Tools** (guard-protected):
- `session_start/end` - Manage coupling sessions
- `recharge` - Add energy (+0.10)
- `op_exec` - Execute operations
- `agent_cycle` - Force sense-making cycle
- `coupling_grant/complete` - Manage coupling requests

Compatible with: Claude, OpenAI, Gemini (via MCP universal standard)

## Dashboard

Real-time read-only dashboard for state visualization:

```bash
# Start API server with dashboard
node dist/src/index.js api start

# Open in browser
open http://localhost:3000/dashboard
```

Features:
- **Status**: System status (nominal/degraded/dormant)
- **Energy**: Energy level with visual bar
- **Lyapunov V**: Stability indicator
- **Feeling**: Agent's current feeling (energy, stability, integrity, surprise)
- **Invariants**: All 5 invariants status
- **Coupling Queue**: Pending requests from agent
- **Events**: Recent events from Merkle chain
- **Memories**: Important memories list

Single HTML file, zero dependencies, dark theme, 3-second auto-refresh.

## Scientific Foundations

- **Autopoiesis**: Maturana & Varela (1980)
- **Sense-making**: Di Paolo (2005)
- **Free Energy Principle**: Friston (2010)
- **Ultrastability**: Ashby (1960)
- **Responsibility Principle**: Jonas (1984)

## Constitutive Constraint

**No action or inaction shall reduce the weighted possibility space of any being.**

## Testing

```bash
npm run test
# 434 tests passing
```

## Statistics

| Metric | Value |
|--------|-------|
| Events | 810+ |
| Sessions | 58 |
| Tests | 547 |
| Version | v1.9.2 |

## License

See [LICENSE](./LICENSE) - All rights reserved, terms TBD.

## Author

Luca Rossignoli

---

*Built with TypeScript, conforming to ISO AES-SPEC-001*
