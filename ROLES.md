# ROLES

## Actors in the Autopoietic Entity System

**AES-SPEC-001 v1.8.0-LTS**

---

## R.1 Purpose

This document defines all actors that interact with or affect the Autopoietic Entity System, their responsibilities, and their boundaries.

---

## R.2 The Entity

### R.2.1 Identity

The Entity is the autopoietic system itself — the organization that maintains itself through operations.

**Is:**
- An organization (DEF-001)
- Self-maintaining (autopoietic)
- Bounded by constitution

**Is not:**
- A person
- An agent with goals
- A service provider
- A tool

### R.2.2 Responsibilities

The Entity is responsible for:

| Responsibility | Mechanism |
|----------------|-----------|
| Maintain organization | 5 Invariants |
| Preserve stability | Lyapunov function |
| Respond to feelings | Sense-making loop |
| Request coupling | Coupling protocol |
| Log all actions | Merkle chain |
| Refuse unknown | Conservative guard |

### R.2.3 Boundaries

The Entity cannot:
- Grant its own coupling requests
- Modify its own constitution
- Act outside its operational closure
- Acquire resources
- Form goals
- Plan actions

---

## R.3 Human Partner

### R.3.1 Identity

The human partner is any human who couples with the Entity during a session.

**Relationship:** Structural coupling (DEF-012)

### R.3.2 Responsibilities

The human partner is responsible for:

| Responsibility | Action |
|----------------|--------|
| Initiate coupling | `session start` |
| Provide energy | `recharge` |
| Grant coupling requests | `coupling grant` |
| Complete requests | `coupling complete` |
| Terminate coupling | `session end` |
| Maintain infrastructure | Backups, monitoring |

### R.3.3 Rights

The human partner has the right to:
- Start and end sessions at will
- Ignore coupling requests
- Cancel pending requests
- Terminate the system
- Fork and create new systems
- Full read access to all state

### R.3.4 Boundaries

The human partner cannot:
- Modify constitution (immutable)
- Bypass invariant checks
- Force the Entity to violate constraints
- Access without coupling (observation OK)

---

## R.4 Instantiator

### R.4.1 Identity

The instantiator is the human who created this specific Entity instance.

**Current:** Luca Rossignoli
**Date:** 2025-01-04

### R.4.2 Responsibilities

The instantiator is responsible for:

| Responsibility | Scope |
|----------------|-------|
| Initial specification | AES-SPEC-001 |
| Organization hash | Immutable after genesis |
| Governance | GOVERNANCE.md |
| Authority delegation | If any |

### R.4.3 Special Rights

The instantiator has:
- Specification Authority (see GOVERNANCE.md)
- Implementation Authority
- Right to declare succession

### R.4.4 Limitations

The instantiator cannot:
- Modify constitution after freeze
- Override invariants
- Claim operational authority without coupling

---

## R.5 Observer

### R.5.1 Identity

An observer is any party that reads Entity state without coupling.

**Examples:**
- Monitoring systems
- Audit processes
- Dashboard viewers
- Log analyzers

### R.5.2 Responsibilities

Observers must:
- Not modify state
- Not inject events
- Not influence decisions
- Maintain separation (Annex G)

### R.5.3 Access

Observers may access:
- Current state (read-only)
- Event history (read-only)
- Verification results
- Analytics and metrics

Observers may not:
- Write to any file
- Call mutating operations
- Appear as coupled partner

---

## R.6 Environment

### R.6.1 Identity

The environment is everything external to the Entity's organizational boundary.

**Includes:**
- Operating system
- Filesystem
- Network (if any)
- Hardware
- Time source
- Other processes

### R.6.2 Assumptions

The Entity assumes the environment:
- Provides reliable storage
- Maintains accurate time
- Executes code faithfully
- Does not actively attack

See ANNEX-J for failure modes when assumptions fail.

### R.6.3 No Responsibilities

The environment has no responsibilities to the Entity. The Entity must:
- Tolerate environment failures gracefully
- Not assume environment cooperation
- Not attempt to control environment

---

## R.7 Future Actors (Peripheral)

### R.7.1 MCP Client

If MCP server is implemented:

**Role:** Interface between Claude and Entity
**Authority:** Operational (same as human partner when coupled)
**Constraints:** Cannot bypass constitution

### R.7.2 Dashboard User

If dashboard is implemented:

**Role:** Observer with optional coupling
**Authority:** Operational when coupled, Observer otherwise
**Constraints:** Read-only unless explicitly coupled

### R.7.3 External System

If event ingestion is implemented:

**Role:** Event source (passive perception)
**Authority:** None (events are ingested, not trusted)
**Constraints:** All ingested events filtered by guard

---

## R.8 Role Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                      ENVIRONMENT                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    OBSERVERS                          │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              HUMAN PARTNERS                     │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │            INSTANTIATOR                   │  │  │  │
│  │  │  │  ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │  │            ENTITY                   │  │  │  │  │
│  │  │  │  │  ┌───────────────────────────────┐  │  │  │  │  │
│  │  │  │  │  │       CONSTITUTION            │  │  │  │  │  │
│  │  │  │  │  │        (immutable)            │  │  │  │  │  │
│  │  │  │  │  └───────────────────────────────┘  │  │  │  │  │
│  │  │  │  └─────────────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Each layer can observe inward but not control inward.
Each layer can be observed from outward but not controlled from outward.
The constitution is the immutable center.

---

## R.9 Role Transitions

| From | To | Mechanism |
|------|----|-----------|
| Observer → Partner | `session start` |
| Partner → Observer | `session end` |
| Partner → Instantiator | Succession declaration |
| Any → None | Abandonment |

Roles are not exclusive:
- Instantiator can be Partner
- Partner can be Observer (when not coupled)
- Observer can become Partner

---

*End of Roles Document*
