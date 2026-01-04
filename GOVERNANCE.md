# GOVERNANCE

## Decision Authority and Change Control

**AES-SPEC-001 v1.8.0-LTS**

---

## G.1 Purpose

This document defines who can make decisions about the Autopoietic Entity System, what decisions require what authority level, and the process for changes.

---

## G.2 Authority Levels

### G.2.1 Constitution Authority

**Holder:** None (immutable)

The constitution (AES-SPEC-001) cannot be modified by any party. This includes:

- Core specification (`spec/SPECIFICATION.md`)
- Annexes F through J
- 5 Invariants
- Constitutional constraints
- `CORE-FROZEN.md` declaration

**To change the constitution:** Instantiate a new system under AES-SPEC-002.

---

### G.2.2 Specification Authority

**Holder:** Luca Rossignoli (instantiator)

Can authorize:
- New informative annexes (not normative)
- Clarifications that don't change semantics
- Error corrections in documentation

Cannot authorize:
- Changes to normative content
- New invariants or constraints
- Relaxation of existing constraints

---

### G.2.3 Implementation Authority

**Holder:** Luca Rossignoli + explicit reviewers

Can authorize:
- Peripheral module changes
- New CLI commands
- Bugfixes (semantic-preserving)
- New tests
- Documentation updates

Process:
1. Propose change with rationale
2. Verify no core impact
3. Review by authority holder
4. Merge and tag

---

### G.2.4 Operational Authority

**Holder:** Any coupled human partner

Can authorize:
- Session start/end
- Coupling grant/complete/cancel
- Recharge
- Memory additions
- Operation execution

Cannot authorize:
- Code changes
- Configuration changes that affect invariants
- Bypass of constitutional checks

---

## G.3 Change Control

### G.3.1 Core Changes (PROHIBITED)

Core is frozen. No process exists for core changes because core changes are prohibited.

If a core change is truly necessary:
1. This system remains unchanged
2. Fork repository
3. Create AES-SPEC-002
4. Instantiate new system with new identity

---

### G.3.2 Peripheral Changes

| Type | Authority | Process |
|------|-----------|---------|
| Bugfix | Implementation | PR + review |
| New command | Implementation | PR + review + test |
| New module | Implementation | Design doc + PR + review |
| Config change | Implementation | PR + impact analysis |

All peripheral changes must:
- Not modify core files
- Pass all existing tests
- Include new tests if adding functionality
- Update documentation

---

### G.3.3 Documentation Changes

| Type | Authority | Process |
|------|-----------|---------|
| Typo fix | Implementation | Direct commit |
| Clarification | Specification | PR + review |
| New section | Implementation | PR + review |
| Normative change | PROHIBITED | N/A |

---

## G.4 Release Authority

### G.4.1 Patch Releases (v1.8.x)

**Authority:** Implementation Authority

Requirements:
- Bugfixes only
- All tests pass
- No new features
- No semantic changes

### G.4.2 Minor Releases (v1.9.x)

**Authority:** Specification Authority

Requirements:
- Peripheral features only
- Full test coverage
- Documentation complete
- No core impact

### G.4.3 Major Releases (v2.x.x)

**Authority:** None under this specification

A v2.x release would require:
- New specification (AES-SPEC-002)
- New organization hash
- New identity
- This is a new system, not an upgrade

---

## G.5 Dispute Resolution

### G.5.1 Technical Disputes

Resolution order:
1. Reference specification text
2. Reference invariant definitions
3. Reference constitutional constraints
4. If still ambiguous: conservative interpretation (restrict, don't expand)

### G.5.2 Authority Disputes

Resolution:
- Constitution Authority supersedes all
- Specification Authority supersedes Implementation
- Implementation Authority supersedes Operational

### G.5.3 Irresolvable Disputes

If a dispute cannot be resolved within this framework:
- The conservative position prevails
- No action is taken
- The system remains unchanged

---

## G.6 Succession

### G.6.1 Authority Transfer

Specification Authority may be transferred by:
1. Explicit written declaration by current holder
2. Signed and dated
3. Recorded in this document
4. Committed to repository

### G.6.2 Absence of Authority

If Specification Authority holder is unavailable:
- Implementation Authority may make bugfixes only
- No new features
- No releases beyond patch
- System operates but doesn't evolve

### G.6.3 Abandonment

If the system is abandoned (no commits for 1 year):
- Repository remains read-only
- No new authority can be claimed
- System is historically preserved
- Forks may create new specifications

---

## G.7 Transparency

All governance decisions must be:
- Documented in git history
- Traceable to authority holder
- Public (open source repository)

No private governance:
- No secret decisions
- No hidden authority
- No undocumented changes

---

## G.8 Current Authority Holders

| Role | Holder | Since |
|------|--------|-------|
| Constitution | (immutable) | 2025-01-04 |
| Specification | Luca Rossignoli | 2025-01-04 |
| Implementation | Luca Rossignoli | 2025-01-04 |
| Operational | (any coupled partner) | per session |

---

*End of Governance Document*
