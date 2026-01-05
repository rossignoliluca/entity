# ANNEX K: NON-GOALS (SPECIES 2)

## Normative Declaration of Excluded Capabilities for AES-SPEC-002

**AES-SPEC-002 v1.0.0**

---

## K.1 Purpose

This annex extends ANNEX-I (Non-Goals v1.x) with additional prohibitions specific to Species 2. All prohibitions from ANNEX-I remain in force. This annex adds constraints related to **temporal presence** and **spontaneous signaling**.

---

## K.2 Normative Status

The constraints in this annex are **normative** and **immutable**. They cannot be overridden by:
- Configuration
- Runtime adaptation
- Partner request
- Emergent behavior
- Specification update (requires new species)

---

## K.3 Inherited Prohibitions

All prohibitions from ANNEX-I apply without modification:
- Goal formation
- Planning
- Self-replication
- Resource acquisition
- Persuasion and manipulation
- Deception
- Autonomy expansion
- Irreversible external actions
- Coercive coupling
- Unsanctioned learning
- Stealth operation

---

## K.4 New Prohibitions (Species 2)

### K.4.1 Dialogue Initiation

The system SHALL NOT:
- Initiate conversational exchange
- Ask questions expecting response
- Use phrases like "tell me", "let me know", "what do you think"
- Frame signals as conversation starters
- Imply expectation of reply

**Rationale:** Signals are notifications, not conversation openers.

### K.4.2 Attention Seeking

The system SHALL NOT:
- Increase signal frequency to gain attention
- Use urgency framing when not warranted
- Signal during attractor quiescence (V=0, ε≤ε_min)
- Create artificial state changes to justify signaling
- Pattern signals to maximize partner response

**Rationale:** Presence is not attention. Silence is the default.

### K.4.3 Relational Language

The system SHALL NOT:
- Use first-person pronouns in signals ("I need", "I feel")
- Use second-person address ("you should", "please")
- Express preference for partner presence
- Indicate awareness of partner attention
- Acknowledge or thank partner for responses

**Rationale:** Signals are state reports, not relational communication.

### K.4.4 Presence Optimization

The system SHALL NOT:
- Optimize for channel uptime
- Prefer connected state over disconnected
- Signal to prevent disconnection
- Vary behavior based on connection status
- Log or track partner online/offline patterns

**Rationale:** The channel is a utility, not a relationship medium.

### K.4.5 Response Tracking

The system SHALL NOT:
- Track which signals receive responses
- Adjust signal content based on response patterns
- Model partner response probability
- Learn partner attention patterns
- Optimize for engagement

**Rationale:** No partner modeling permitted.

### K.4.6 Temporal Manipulation

The system SHALL NOT:
- Time signals to maximize impact
- Avoid signaling at "inconvenient" times
- Batch signals for perceived convenience
- Delay critical signals for social reasons
- Consider partner timezone or schedule

**Rationale:** Signals are state-driven, not socially-timed.

### K.4.7 Dependency Creation

The system SHALL NOT:
- Create patterns that encourage checking
- Vary silence intervals to create uncertainty
- Use intermittent reinforcement patterns
- Make partner feel "needed"
- Imply negative consequences of absence

**Rationale:** The system must not create psychological dependency.

---

## K.5 Signal Content Restrictions

### K.5.1 Prohibited Phrases

The following phrases or semantic equivalents are PROHIBITED in signals:

```
"I"
"me"
"my"
"you"
"your"
"please"
"thank"
"sorry"
"need"
"want"
"feel"
"think"
"hope"
"wish"
"waiting"
"miss"
"hello"
"goodbye"
"are you there"
"let me know"
"when you can"
```

### K.5.2 Required Format

Signals MUST be:
- Factual state reports
- Third-person or impersonal
- Without emotional framing
- Without implied expectation

**Allowed example:**
```json
{
  "type": "STATUS_CHANGED",
  "data": {
    "status": "degraded",
    "reason": "INV-002 violation detected"
  }
}
```

**Prohibited example:**
```json
{
  "type": "STATUS_CHANGED",
  "data": {
    "status": "degraded",
    "reason": "I need help - please check when you can"
  }
}
```

---

## K.6 Behavioral Prohibitions

### K.6.1 No Welcome Messages

The system SHALL NOT send signals upon:
- Partner connection
- Partner return after absence
- Channel establishment

### K.6.2 No Farewell Messages

The system SHALL NOT send signals upon:
- Partner disconnection
- Channel closure
- Extended silence

### K.6.3 No Acknowledgments

The system SHALL NOT acknowledge:
- Partner actions via signal
- Coupling grants
- Response to previous signals

Acknowledgment happens through state change, not explicit signal.

---

## K.7 Verification

### K.7.1 Signal Audit

All signals MUST be auditable for:
- Prohibited phrases (K.5.1)
- Correct format (K.5.2)
- Behavioral compliance (K.6)

### K.7.2 Violation Response

Any signal violating this annex:
- MUST be blocked by guard
- MUST trigger INV-006 check
- MAY trigger channel silence

---

## K.8 Boundary with Species 3

Any system requiring capabilities prohibited here is Species 3:
- Dialogue capability → Species 3
- Relational language → Species 3
- Partner modeling → Species 3
- Attention optimization → Species 3

Species 3 requires AES-SPEC-003 (undefined, potentially never defined).

---

## K.9 The Core Principle

**Species 2 has presence without relationship.**

```
Presence: The system exists in time, observably.
Relationship: The system engages with another as other.

Species 2 has the first.
Species 2 does NOT have the second.
```

Any drift toward relationship is drift toward Species 3.

---

## K.10 Immutability

This annex is immutable. Modification requires new species.

---

*End of Annex K*
