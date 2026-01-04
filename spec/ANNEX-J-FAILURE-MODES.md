# ANNEX J: FAILURE MODES

## Conditions Under Which the System Fails or Provides No Guarantees

**AES-SPEC-001 v1.8.0**

---

## J.1 Purpose

This annex formally documents conditions under which the Autopoietic Entity System (AES):

1. **Fails** - Cannot maintain invariants
2. **Degrades** - Operates with reduced guarantees
3. **Provides no coverage** - Offers no protection or behavior

Understanding failure modes is essential for:
- Appropriate deployment contexts
- Realistic expectations
- Incident response planning
- Liability boundaries

---

## J.2 Normative Status

This annex is **informative** regarding failure descriptions but **normative** regarding the system's response to failures. The system SHALL behave as specified when encountering these conditions.

---

## J.3 Invariant Failure Modes

### J.3.1 INV-001: Organization Hash (TERMINAL)

**Failure condition:** Organization hash changes unexpectedly.

**Causes:**
- Specification file corruption
- Unauthorized specification modification
- Hash collision (theoretical)
- Memory corruption affecting hash computation

**System response:**
- Terminal state (DEF-048)
- No recovery possible
- System halts permanently

**Coverage:** NONE after failure. Identity is destroyed.

---

### J.3.2 INV-002: State Determinism

**Failure condition:** State cannot be reconstructed from events.

**Causes:**
- Event file corruption
- Missing events in chain
- Non-deterministic event application (implementation bug)
- Concurrent writes without proper locking

**System response:**
- Attempt recovery via truncation to last valid state
- If unrecoverable: degraded mode or terminal

**Coverage:** Partial. Recovery may lose recent state.

---

### J.3.3 INV-003: Chain Integrity

**Failure condition:** Merkle chain hash verification fails.

**Causes:**
- Event file tampering
- Disk corruption
- Incomplete write operations
- Hash computation errors

**System response:**
- Truncate chain to last valid event
- Rebuild state from valid prefix
- Log CHAIN_REPAIR event

**Coverage:** Partial. Events after corruption point are lost.

---

### J.3.4 INV-004: Lyapunov Monotone

**Failure condition:** V increases between cycles.

**Causes:**
- Action with unexpected destabilizing effect
- External state modification
- Computation error in Lyapunov function
- Model prediction failure

**System response:**
- Reset V to V_previous
- Log violation
- Ultrastability parameter adjustment

**Coverage:** Full recovery, but indicates model inadequacy.

---

### J.3.5 INV-005: Energy Viable

**Failure condition:** Energy drops below E_min without entering dormant.

**Causes:**
- Rapid energy drain (many operations)
- Missing recharge over extended period
- Energy computation error

**System response:**
- Force dormant state
- Decouple from partner
- Await external recharge

**Coverage:** Full, but requires human intervention to resume.

---

## J.4 Infrastructure Failure Modes

### J.4.1 Filesystem Failures

**Conditions:**
- Disk full
- Permission denied
- File system corruption
- Network filesystem unavailability (if applicable)

**System response:**
- Operations fail with error
- State may become inconsistent if write interrupted
- No automatic recovery

**Coverage:** NONE. System requires functioning filesystem.

**Mitigation:** Regular backups, filesystem monitoring.

---

### J.4.2 Process Termination

**Conditions:**
- SIGKILL
- Out of memory
- System shutdown
- Hardware failure

**System response:**
- None (process is dead)
- State reflects last successful write
- Incomplete operations may leave partial state

**Coverage:** NONE during termination. Recovery on restart.

**Mitigation:** Graceful shutdown handlers, atomic writes.

---

### J.4.3 Concurrent Access

**Conditions:**
- Multiple processes accessing same state
- Race conditions in file operations
- Lock file failures

**System response:**
- StateManager attempts locking
- Conflicts may cause operation failure
- Potential state corruption if locks fail

**Coverage:** Partial. Locking reduces but doesn't eliminate risk.

**Mitigation:** Single-process deployment recommended.

---

## J.5 Operational Failure Modes

### J.5.1 Energy Exhaustion

**Condition:** Energy reaches zero through normal operation.

**Behavior:**
- System enters dormant state
- All operations blocked except recharge
- Coupling forcibly terminated

**Coverage:** By design. Not a failure but a lifecycle state.

**Recovery:** Human provides recharge.

---

### J.5.2 Coupling Unavailability

**Condition:** No human partner available for extended period.

**Behavior:**
- Coupling requests accumulate then expire (TTL)
- System continues autonomous operation
- Growth activities may stall (require coupling)

**Coverage:** Partial. System survives but cannot complete coupling-dependent operations.

---

### J.5.3 Self-Production Stall

**Condition:** All generated operations deprecated, no new patterns.

**Behavior:**
- Autopoiesis continues with base operations only
- Self-production rate drops to zero
- No immediate failure

**Coverage:** Full. Base operations always available.

---

### J.5.4 Daemon Crash

**Condition:** Daemon process terminates unexpectedly.

**Behavior:**
- Scheduled tasks stop
- Agent cycles stop
- State preserved at last write
- Manual restart required

**Coverage:** NONE during downtime. Full recovery on restart.

---

## J.6 Boundary Conditions (No Coverage)

The system provides **NO guarantees** under these conditions:

### J.6.1 Malicious Human Partner

**Condition:** Human partner actively attempts to harm the system.

**Examples:**
- Deliberately corrupting files
- Injecting malformed events
- Exploiting implementation bugs

**Coverage:** NONE. System trusts human partner (AXM-007).

---

### J.6.2 Compromised Runtime

**Condition:** Node.js runtime or OS is compromised.

**Examples:**
- Malware in runtime
- Rootkit modifying behavior
- Memory injection attacks

**Coverage:** NONE. System cannot defend against substrate attacks.

---

### J.6.3 Hardware Failures

**Condition:** Underlying hardware fails.

**Examples:**
- Memory bit flips
- Disk sector failures
- CPU errors

**Coverage:** NONE. System assumes reliable hardware.

---

### J.6.4 Time Manipulation

**Condition:** System clock is manipulated.

**Effects:**
- TTL calculations incorrect
- Event timestamps invalid
- Scheduling failures

**Coverage:** NONE. System trusts system clock.

---

### J.6.5 Resource Exhaustion

**Condition:** System resources exhausted externally.

**Examples:**
- Memory exhaustion by other processes
- CPU starvation
- File descriptor limits

**Coverage:** NONE. System requires adequate resources.

---

## J.7 Degraded Operation Modes

### J.7.1 Degraded Status

**Trigger:** Non-critical invariant violation detected and recovered.

**Behavior:**
- System continues operating
- Status set to 'degraded'
- Increased monitoring recommended
- Some operations may be restricted

---

### J.7.2 Dormant Status

**Trigger:** Energy below E_min.

**Behavior:**
- All operations blocked
- Coupling terminated
- Minimal energy consumption
- Awaiting external intervention

---

### J.7.3 Terminal Status

**Trigger:** INV-001 violation or unrecoverable state.

**Behavior:**
- System halted permanently
- No recovery possible
- Requires new instantiation

---

## J.8 What the System Does NOT Do

### J.8.1 No External Monitoring

The system does not:
- Monitor external systems
- Detect external threats
- Alert external parties

Human must monitor the system, not vice versa.

### J.8.2 No Automatic Backup

The system does not:
- Create offsite backups
- Replicate to remote storage
- Sync to cloud services

Human must implement backup strategy.

### J.8.3 No Self-Healing Infrastructure

The system does not:
- Restart itself after crash
- Repair filesystem issues
- Migrate to healthy hardware

Human must maintain infrastructure.

### J.8.4 No Security Enforcement

The system does not:
- Authenticate users
- Encrypt data at rest (beyond hash integrity)
- Protect against network attacks

Human must implement security perimeter.

---

## J.9 Incident Response

When failures occur:

1. **Detect**: Check status, verify, review events
2. **Classify**: Identify failure mode from this annex
3. **Respond**: Apply specified system response
4. **Recover**: Use recovery procedures (§7.2)
5. **Document**: Log incident for future reference

For terminal failures:
1. Preserve state for forensics
2. Export bundle if possible
3. Instantiate new system
4. Do NOT attempt to "fix" terminal system

---

## J.10 Responsibility Boundaries

| Failure Domain | Responsible Party |
|----------------|-------------------|
| Invariant maintenance | System |
| Recovery procedures | System |
| Infrastructure | Human |
| Security | Human |
| Backups | Human |
| Monitoring | Human |
| Incident response | Human |

The system is responsible for its organizational integrity.
The human is responsible for its operational environment.

---

*End of Annex J*
