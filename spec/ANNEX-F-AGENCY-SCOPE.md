# Annex F (Informative): Internal Agency Scope

**AES-SPEC-001 Supplementary Document**

This annex clarifies the operational scope of internal agency (Phase 8) in relation to AXM-006 (Conditioned Operation). It is informative and does not modify the normative specification.

---

## F.1 Scope Definition

```
Internal Operations:
  { o ∈ 𝕆 : OperatesOn(o, S) ∧ ¬OperatesOn(o, E) }

External Operations:
  { o ∈ 𝕆 : OperatesOn(o, E) }

where:
  S = System (internal state, event logs)
  E = Environment (external world, other beings)
```

---

## F.2 Agency Constraint

```
∀ agent ∈ InternalAgency, ∀ o ∈ Operations(agent) :
  OperatesOn(o, E) ⟹ Coupling(S, E, t) = 1
```

**In natural language:** Internal agency may execute only operations scoped to internal state and event logs. Any operation producing effects on the environment requires explicit coupling.

---

## F.3 Classification

| Operation Category | Coupling Required | Examples |
|--------------------|-------------------|----------|
| State observation | No | state.read, state.summary, system.health |
| Internal verification | No | verify, meta.introspect |
| Self-maintenance | No | energy.status, snapshot.create |
| Communication | Yes | memory.add, interaction.* |
| Environment effects | Yes | Any operation affecting external beings |

---

## F.4 Rationale

This constraint follows from:

1. **AXM-006 (Conditioned Operation)**: Without coupling, no operation on environment
2. **Autopoietic closure** (Maturana & Varela): System operates on itself autonomously
3. **Structural coupling**: Interaction with environment requires explicit connection
4. **Responsibility principle** (Jonas): Effects on others require presence/consent

---

## F.5 Implementation

```typescript
// Constitutional check in agent
if (operation.requiresCoupling && !state.coupling.active) {
  return { blocked: true, reason: 'Requires coupling' };
}
```

The `requiresCoupling` property distinguishes internal from external operations.

---

*This document is supplementary to AES-SPEC-001 and does not affect the organization hash.*
