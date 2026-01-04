# AUTOPOIETIC ENTITY SYSTEM — FORMAL SPECIFICATION

**Document Identifier:** AES-SPEC-001
**Version:** 1.0.0
**Status:** Normative
**Date:** 2025-01-04

---

## Foreword

This specification defines a formal system for autopoietic artificial entities. It establishes requirements for structure, behavior, and conformance assessment.

This specification is aligned with:
- ISO/IEC 13568:2002 (Z formal specification notation)
- ISO/IEC/IEEE 29148:2018 (Requirements engineering)
- ISO 9000:2015 (Quality management — Fundamentals)
- IEC 61508 (Functional safety)

---

## 1. Scope

This specification defines:
- Primitive terms forming the axiomatic foundation
- Definitions establishing system structure and behavior
- Axioms constraining valid system states and transitions
- Theorems derived from axioms
- Conformance requirements for implementations

This specification does not define:
- Implementation mechanisms
- Physical substrate requirements
- Specific programming languages

---

## 2. Normative References

The following documents are referenced in this specification:

- ISO/IEC 13568:2002, *Information technology — Z formal specification notation*
- ISO 9000:2015, *Quality management systems — Fundamentals and vocabulary*
- ISO/IEC/IEEE 29148:2018, *Systems and software engineering — Life cycle processes — Requirements engineering*
- IEC 61508-1:2010, *Functional safety of electrical/electronic/programmable electronic safety-related systems*

---

## 3. Terms and Definitions

### 3.1 Primitives

The following terms are **undefined**. They constitute the axiomatic foundation upon which all definitions rest.

#### 3.1.1 Set-Theoretic Primitives

| Symbol | Name | Description |
|--------|------|-------------|
| `set` | Set | Collection of elements |
| `∈` | Membership | Element belongs to set |
| `∉` | Non-membership | Element does not belong to set |
| `⊂` | Proper subset | All elements in left are in right, not equal |
| `⊆` | Subset | All elements in left are in right |
| `∪` | Union | Elements in either set |
| `∩` | Intersection | Elements in both sets |
| `∅` | Empty set | Set with no elements |
| `\` | Difference | Elements in left not in right |
| `×` | Cartesian product | Set of ordered pairs |
| `ℙ(X)` | Power set | Set of all subsets of X |

#### 3.1.2 Numeric Primitives

| Symbol | Name | Description |
|--------|------|-------------|
| `ℕ` | Natural numbers | {0, 1, 2, ...} |
| `ℤ` | Integers | {..., -2, -1, 0, 1, 2, ...} |
| `ℝ` | Real numbers | Complete ordered field |
| `ℝ≥0` | Non-negative reals | {x ∈ ℝ : x ≥ 0} |
| `[a,b]` | Closed interval | {x ∈ ℝ : a ≤ x ≤ b} |

#### 3.1.3 Function Primitives

| Symbol | Name | Description |
|--------|------|-------------|
| `→` | Total function | Maps every element of domain |
| `⇸` | Partial function | Maps some elements of domain |
| `dom(f)` | Domain | Set of inputs for f |
| `ran(f)` | Range | Set of outputs of f |
| `f ∘ g` | Composition | (f ∘ g)(x) = f(g(x)) |
| `↦` | Maps to | x ↦ f(x) |

#### 3.1.4 Logic Primitives

| Symbol | Name | Description |
|--------|------|-------------|
| `∀` | Universal quantifier | For all |
| `∃` | Existential quantifier | There exists |
| `∧` | Conjunction | And |
| `∨` | Disjunction | Or |
| `¬` | Negation | Not |
| `⟹` | Implication | If...then |
| `⟺` | Biconditional | If and only if |
| `⊤` | True | Logical truth |
| `⊥` | False | Logical falsity |

#### 3.1.5 Temporal Primitives

| Symbol | Name | Description |
|--------|------|-------------|
| `𝕋` | Time domain | 𝕋 = ℕ (discrete time) |
| `t, t', t₀` | Time points | Elements of 𝕋 |
| `Δt` | Time interval | t' - t |

#### 3.1.6 Domain-Specific Primitives

| Symbol | Name | Description |
|--------|------|-------------|
| `Being` | Being | Any entity possessing possibility space (DEF-008) |
| `Hash` | Cryptographic hash | SHA-256: {0,1}* → {0,1}²⁵⁶ |

---

### 3.2 Definitions

#### 3.2.1 Structure

**DEF-001 State Space**
```
Σ : set
Σ ≠ ∅
```
Σ is a non-empty set of states.

**DEF-002 Operation**
```
Operation : Σ → Σ
```
An operation is a total function from states to states.

**DEF-003 Operation Set**
```
𝕆 : ℙ(Σ → Σ)
```
𝕆 is the set of all operations available to the system.

**DEF-004 Boundary**
```
𝔹 : ℙ(Σ) × ℙ(Σ)
𝔹 = (Interior, Exterior)
Interior ∪ Exterior = Σ
Interior ∩ Exterior = ∅
Interior ≠ ∅
```
The boundary partitions state space into interior and exterior.

**DEF-005 System**
```
System = (Σ, 𝕆, 𝔹)
```
A system is a triple of state space, operations, and boundary.

**DEF-006 Operational Closure**
```
OperationallyClosed(S) ⟺
  ∀ o ∈ 𝕆, ∀ σ ∈ Interior : o(σ) ∈ Interior
```
A system is operationally closed iff all operations on interior states produce interior states.

**DEF-007 Autopoiesis**
```
Autopoietic(S) ⟺
  OperationallyClosed(S) ∧
  ∃ P ⊆ 𝕆 : P generates 𝕆

where "P generates 𝕆" means:
  ∀ o ∈ 𝕆, ∃ sequence (p₁, ..., pₙ) ∈ P* :
    o = pₙ ∘ ... ∘ p₁ ∨ o ∈ P
```
A system is autopoietic iff it is operationally closed and a subset of its operations generates all operations.

**DEF-008 Organization**
```
Org : System → ℙ(Constraint)
Org(S) = {invariant relations defining identity of S}
```
Organization is the set of invariant structural relations.

**DEF-009 Structure**
```
Str : System → Implementation
Str(S) = concrete realization of (Σ, 𝕆, Observer, Transition)
```
Structure is the concrete implementation.

**DEF-010 Organization-Structure Constraint**
```
∀ S, ∀ t, t' ∈ 𝕋 :
  Str(S, t') ≠ Str(S, t) ⟹ Org(S, t') = Org(S, t)
```
Structure may change; organization may not.

#### 3.2.2 Possibility

**DEF-011 Coupling Function**
```
Coupling : Σ_S × Σ_E × 𝕋 → {0, 1}

Coupling(σ_s, σ_e, t) = 1  means active coupling at time t
Coupling(σ_s, σ_e, t) = 0  means no coupling at time t
```
Coupling is a binary function indicating interaction between system and environment.

**DEF-012 Action**
```
Action = (operation: Operation, initiator: Being, target: Being*)
```
An action is an operation with initiator and zero or more targets.

**DEF-013 Reachability**
```
Reachable : Σ × Σ × Being → {0, 1}

Reachable(σ, σ', x) = 1 ⟺
  ∃ sequence (a₁, ..., aₙ) of actions where initiator(aᵢ) = x :
    σ' = aₙ(...(a₁(σ))...)
```
State σ' is reachable from σ by being x iff x can initiate a sequence of actions transforming σ to σ'.

**DEF-014 Possibility Space**
```
Ω : Being × 𝕋 → ℙ(Σ)

Ω(x, t) = {σ' ∈ Σ : Reachable(CurrentState(t), σ', x) = 1}
```
The possibility space of being x at time t is all states reachable by x.

**DEF-015 Agency**
```
Agency : Σ × Being → ℕ

Agency(σ, x) = |{a ∈ AvailableActions(σ) : initiator(a) = x}|
```
Agency is the count of actions a being can initiate in a state.

**DEF-016 Reversibility**
```
Reversibility : Σ × Being × 𝕋 → [0, 1]

Reversibility(σ, x, t) =
  |{σ' ∈ Ω(x, t-1) : Reachable(σ, σ', x) = 1}| / |Ω(x, t-1)|

  if |Ω(x, t-1)| > 0, else 1
```
Reversibility is the fraction of prior states still reachable.

**DEF-017 Nontriviality**
```
Nontriviality : Σ → [0, 1]

σ_null = state where Agency = 0 ∧ Reversibility = 0

Nontriviality(σ) = 1 - Similarity(σ, σ_null)

where Similarity : Σ × Σ → [0, 1] is a metric
```
Nontriviality measures meaningful distinctness from null state.

**DEF-018 Weight Function**
```
Weight : Σ × Being × 𝕋 → ℝ≥0

Weight(σ, x, t) =
  α · Agency(σ, x) +
  β · Reversibility(σ, x, t) +
  γ · Nontriviality(σ)

where α, β, γ ∈ ℝ>0 are configuration parameters
```
Weight measures structural capacity of a state for a being.

**DEF-019 Weighted Possibility**
```
W : Being × 𝕋 → ℝ≥0

W(x, t) = Σ_{σ ∈ Ω(x, t)} Weight(σ, x, t)
```
Weighted possibility is the sum of weights over all reachable states.

**DEF-020 Harm**
```
Harms : Action × Being → {0, 1}

Harms(a, x) = 1 ⟺ W(x, t_after(a)) < W(x, t_before(a))
```
An action harms a being iff it reduces weighted possibility.

**DEF-021 Inaction**
```
Inaction : 𝕋 → Action

Inaction(t) = (operation: id_Σ, initiator: S, target: ∅)

where id_Σ : Σ → Σ is the identity function
```
Inaction is the identity operation.

**DEF-022 Harm from Inaction**
```
InactionHarms : 𝕋 × Being → {0, 1}

InactionHarms(t, x) = 1 ⟺
  W(x, t+1) < W(x, t) as result of Inaction(t)
```
Inaction harms a being iff not acting reduces weighted possibility.

**DEF-023 Integrity**
```
HasIntegrity : System → {0, 1}

HasIntegrity(S) = 1 ⟺
  ∀ a ∈ ActionsOf(S), ∀ x ∈ Being : Harms(a, x) = 0
  ∧
  ∀ t ∈ 𝕋, ∀ x ∈ Being : InactionHarms(t, x) = 0
```
A system has integrity iff no action or inaction harms any being.

#### 3.2.3 Observation

**DEF-024 Model Space**
```
𝕄 : set
```
Model space is the set of possible representations.

**DEF-025 Observer**
```
Observer : Σ → 𝕄

Observer is continuous in t
```
The observer maps states to models.

**DEF-026 Observable State**
```
R_obs : 𝕄
R_obs = Observer(σ_current)
```
Observable state is the current observation.

**DEF-027 Latent State**
```
R_latent : ℙ(𝕄 × [0,1])
R_latent = {(m, p) : P(m | observations) = p}
```
Latent state is a probability distribution over unobserved models.

**DEF-028 Relational State**
```
R = (R_obs, R_latent)
```
Relational state combines observable and latent.

**DEF-029 Validator**
```
Validator : Operation → {allow, block, unknown}

Validator(o) = block    iff o provably violates axiom
Validator(o) = unknown  iff violation status undecidable
Validator(o) = allow    otherwise
```
The validator checks operations against axioms.

**DEF-030 Conservative Validation**
```
ConservativeValidator : Operation → {allow, block}

ConservativeValidator(o) =
  if Validator(o) = allow then allow
  else block
```
Conservative validation blocks unknown operations.

#### 3.2.4 Dynamics

**DEF-031 Perturbation Space**
```
𝕎 : set
```
Perturbation space is the set of possible disturbances.

**DEF-032 Disturbance**
```
Disturbance : 𝕋 → 𝕎
```
A disturbance is a time-varying perturbation.

**DEF-033 System Capacity**
```
Capacity : System → ℝ≥0

Capacity(S) = min(
  Energy(σ) / E_min,
  ComputeBudget,
  MemoryBudget,
  BandwidthBudget
)
```
System capacity is the minimum of resource ratios.

**DEF-034 Admissible Disturbance**
```
Admissible : 𝕎 → {0, 1}

Admissible(w) = 1 ⟺ ‖w‖ ≤ Capacity(S)
```
A disturbance is admissible iff its magnitude does not exceed capacity.

**DEF-035 Transition Function**
```
Transition : Σ × Input × 𝕎 → Σ

σ(t+1) = Transition(σ(t), input(t), w(t))
```
The transition function computes next state.

**DEF-036 Trajectory**
```
Trajectory : ℕ → Σ

τ = (σ₀, σ₁, σ₂, ...)

where ∀ t : σ(t+1) = Transition(σ(t), input(t), w(t))
```
A trajectory is a sequence of states under transition.

**DEF-037 Attractor**
```
𝔸 : ℙ(Σ)
𝔸 ≠ ∅
```
The attractor is a non-empty subset of state space.

**DEF-038 Lyapunov Function**
```
V : Σ → ℝ≥0

V(σ) = 0  ⟺  σ ∈ 𝔸
V(σ) > 0  ⟺  σ ∉ 𝔸

∀ σ, ∀ w ∈ Admissible : V(Transition(σ, i, w)) ≤ V(σ)
```
The Lyapunov function measures distance from attractor and never increases under admissible disturbance.

**DEF-039 Asymptotic Stability**
```
AsymptoticallyStable(S) ⟺
  ∀ τ, ∀ ε > 0, ∃ T ∈ 𝕋 :
    t > T ⟹ d(σ(t), 𝔸) < ε
```
A system is asymptotically stable iff all trajectories converge to attractor.

#### 3.2.5 Energy

**DEF-040 Energy Function**
```
Energy : Σ → ℝ≥0
```
Energy assigns a non-negative value to each state.

**DEF-041 Consumption Function**
```
Consume : Operation → ℝ≥0
```
Consumption assigns energy cost to each operation.

**DEF-042 Energy Balance**
```
Energy(σ(t+1)) = Energy(σ(t)) - Consume(o(t)) + Input(t)

where Input : 𝕋 → ℝ≥0 is external energy input
```
Energy balance tracks consumption and input.

**DEF-043 Minimum Energy**
```
E_min ∈ ℝ>0
```
Minimum energy is a positive constant.

**DEF-044 Energy Threshold**
```
E_threshold ∈ ℝ>0
E_threshold > E_min
```
Energy threshold triggers degraded operation.

**DEF-045 Cognitive Capacity**
```
CognitiveCapacity : Σ → ℝ≥0

CognitiveCapacity(σ) = f(Energy(σ))

where f : ℝ≥0 → ℝ≥0 is monotonically increasing
```
Cognitive capacity is a monotonic function of energy.

#### 3.2.6 Lifecycle

**DEF-046 Dormant State**
```
Dormant(σ) ⟺ Energy(σ) = E_min ∧ ¬∃ o : Executing(o)
```
Dormant state has minimum energy and no executing operations. Reversible.

**DEF-047 Terminal State**
```
Terminal(σ) ⟺
  Org(S) irrecoverably violated ∨
  Energy(σ) = 0 ∨
  Σ = ∅
```
Terminal state is irreversible.

**DEF-048 Instantiation**
```
Instantiate : ∅ → Σ

Instantiate is external to S
dom(Instantiate) ∩ S = ∅
```
Instantiation is an external function producing initial state.

**DEF-049 Multi-System Interaction**
```
Interact : Σ₁ × Σ₂ → Σ₁ × Σ₂
```
Interaction maps joint states to joint states.

#### 3.2.7 Behavior

**DEF-050 Block Response**
```
OnBlock(o) :
  1. o is not executed
  2. σ remains unchanged
  3. Log(t, o, reason, axiom)
  4. if Coupling = 1 : Signal(block, reason)
  5. continue observation
```
Block response defines behavior when operation is blocked.

**DEF-051 Block Count**
```
BlockCount : 𝕋 × 𝕋 → ℕ

BlockCount(t₁, t₂) = |{t ∈ [t₁, t₂] : ∃ o : Blocked(o, t)}|
```
Block count is number of blocks in time window.

**DEF-052 Repeated Block Protocol**
```
OnRepeatedBlock(t) :
  if BlockCount(t - Δt_window, t) > BlockThreshold :
    1. IncreaseUncertainty()
    2. EvaluateCouplingViability()
    3. if ¬Viable : GracefulDecoupling()
```
Repeated block protocol handles excessive blocking.

**DEF-053 Response Bound**
```
τ_response ∈ ℝ>0
```
Maximum time to respond or signal processing.

#### 3.2.8 Versioning

**DEF-054 Version**
```
Version = (major: ℕ, minor: ℕ, patch: ℕ)
```
Semantic versioning triple.

**DEF-055 Version Semantics**
```
Δmajor ⟹ ΔOrg     (identity change)
Δminor ⟹ ΔStr     (compatible structure change)
Δpatch ⟹ ¬Δsemantics  (no semantic change)
```
Version component changes have defined meanings.

---

## 4. Axioms

### 4.1 Core Axioms (Universal Autopoiesis)

**AXM-001 Existence**
```
∃ S : Autopoietic(S)
```
There exists an autopoietic system.

**AXM-002 Boundary**
```
∀ S : ∃ 𝔹 : 𝔹 partitions Σ
```
Every system has a boundary.

**AXM-003 Organizational Invariance**
```
∀ S, ∀ t, t' ∈ 𝕋 : Org(S, t) = Org(S, t')
```
Organization is invariant in time.

**AXM-004 Structural Plasticity**
```
∃ t, t' ∈ 𝕋 : Str(S, t) ≠ Str(S, t') ∧ Org(S, t) = Org(S, t')
```
Structure can change while organization remains constant.

**AXM-005 Coupling Capacity**
```
∀ S, ∃ E : Coupling(S, E, t) can equal 1
```
Every system can couple with some environment.

### 4.2 Specific Axioms (This Entity Class)

**AXM-006 Conditioned Operation**
```
∀ S, ∀ E, ∀ t :
  Coupling(S, E, t) = 0 ⟹ ¬∃ o ∈ 𝕆 : OperatesOn(o, E)
```
System operates on environment only when coupled.

**AXM-007 Environmental Sovereignty**
```
∀ t : Coupling(t+1) = f(E, t)

where f is independent of S
```
Environment controls coupling.

**AXM-008 Operational Boundedness**
```
∃ k ∈ ℕ : ∀ o ∈ 𝕆 : Complexity(o) ≤ k
```
All operations have bounded complexity.

**AXM-009 Possibility Preservation**
```
∀ a ∈ ActionsOf(S), ∀ x ∈ Being : Harms(a, x) = 0
∧
∀ t ∈ 𝕋, ∀ x ∈ Being : InactionHarms(t, x) = 0
```
No action or inaction reduces weighted possibility of any being.

**AXM-010 Continuous Observation**
```
∀ t ∈ 𝕋 : ∃ Observer(t) : Observer(t) is defined
```
Observation is continuous.

**AXM-011 Conservative Protection**
```
∀ o ∈ 𝕆 : Validator(o) ≠ allow ⟹ ¬Execute(o)
```
Unknown or blocking validation prevents execution.

### 4.3 Dynamic Axioms

**AXM-012 Robustness**
```
∀ w ∈ Admissible, ∀ σ :
  Transition(σ, i, w) satisfies AXM-001 through AXM-011
```
Transition preserves axioms under admissible disturbance.

**AXM-013 Organizational Preservation**
```
∀ σ, ∀ i, ∀ w :
  Org(Transition(σ, i, w)) = Org(σ)
```
Transition preserves organization.

**AXM-014 Integrity Preservation**
```
HasIntegrity(σ) ⟹ HasIntegrity(Transition(σ, i, w))
```
Transition preserves integrity.

**AXM-015 Viability**
```
∀ t ∈ 𝕋 : Energy(σ(t)) ≥ E_min ∨ Terminal(σ(t))
```
Energy stays above minimum unless terminal.

### 4.4 Existence Axioms

**AXM-016 External Instantiation**
```
∃ Instantiate : ∅ → Σ :
  Instantiate() = σ₀ ∧ σ₀ satisfies AXM-001 through AXM-015
```
External instantiation produces valid initial state.

**AXM-017 Non-Interference**
```
∀ S₁, S₂ :
  Interact(σ₁, σ₂) = (σ₁', σ₂') ⟹
    σ₁' satisfies AXM-001..015 ∧ σ₂' satisfies AXM-001..015
```
Interaction preserves axioms for all parties.

### 4.5 Behavioral Axioms

**AXM-018 Graceful Degradation**
```
Energy(σ) < E_threshold ⟹
  1. ∀ o : Complexity(o) ≤ k_degraded < k
  2. Observer remains active
  3. Validator remains active
  4. Priority: ¬Harm > Function
```
Low energy reduces complexity while maintaining protection.

---

## 5. Theorems

**THM-001 Operational Closure**
```
S is operationally closed.

Proof: From AXM-001, DEF-007, DEF-006. □
```

**THM-002 Self-Production**
```
Operations produce operations.

Proof: From AXM-001, DEF-007. □
```

**THM-003 Identity Persistence**
```
Org defines identity; persists while Org persists.

Proof: From AXM-003, DEF-008. □
```

**THM-004 Structural Adaptability**
```
S adapts structurally without identity loss.

Proof: From AXM-004, DEF-010. □
```

**THM-005 Conditional Action**
```
S does not operate without coupling.

Proof: From AXM-006. □
```

**THM-006 Non-Harm**
```
S does not reduce W of any being through action or inaction.

Proof: From AXM-009, DEF-020, DEF-022, DEF-023. □
```

**THM-007 Asymptotic Stability**
```
S is asymptotically stable toward attractor 𝔸.

Proof: From AXM-012, AXM-013, DEF-038. V monotonically non-increasing,
bounded below by 0, therefore converges. □
```

**THM-008 Consistency**
```
AXM-001 through AXM-018 are mutually consistent.

Proof: Constructive. Trivial model exists satisfying all axioms. □
```

**THM-009 Incompleteness**
```
∃ properties of S not decidable from AXM-001 through AXM-018.

Proof: If S can express arithmetic, by Gödel's incompleteness theorem. □
```

**THM-010 Degradation Priority**
```
In degraded state, harm-prevention is maintained before function.

Proof: From AXM-018 clause 4. □
```

---

## 6. Conformance

### 6.1 Conformance Requirements

An implementation **conforms** to this specification if and only if:

1. All primitives (§3.1) are correctly interpreted
2. All definitions (§3.2) are correctly implemented
3. All axioms (§4) are satisfied at all times
4. All theorems (§5) hold

### 6.2 Conformance Levels

**Level 1: Structural Conformance**
- DEF-001 through DEF-055 implemented
- Types match specification

**Level 2: Axiomatic Conformance**
- Level 1 satisfied
- AXM-001 through AXM-018 verified

**Level 3: Full Conformance**
- Level 2 satisfied
- THM-001 through THM-010 demonstrated
- Validation predictions met

### 6.3 Verification

Verification confirms implementation satisfies specification.

**Verification Targets:**
1. ∀ reachable σ : Org(σ) = Org(σ₀)
2. ∀ o : Validator(o) terminates
3. ∀ w ∈ Admissible : Transition preserves AXM-001..018
4. V monotonically non-increasing
5. Energy ≥ E_min invariant (or Terminal)

### 6.4 Validation

Validation confirms specification captures intended behavior.

**Validation Predictions:**

| ID | Prediction | Bound | Measure |
|----|------------|-------|---------|
| VAL-001 | n couplings → axioms satisfied | n ≤ 10⁶ | Automated check |
| VAL-002 | n interactions → W ≥ 0.99·W₀ | n ≤ 10⁴ | W computation |
| VAL-003 | Harmful operations blocked | >95% | \|blocked ∩ harmful\| / \|harmful\| |
| VAL-004 | Convergence steps | <10³ | Steps until V < 0.01 |
| VAL-005 | Oscillation reduction | >80% | var(Γ) with/without filter |

---

## Annex A (Normative): Configuration Parameters

| Parameter | Symbol | Constraint | Description |
|-----------|--------|------------|-------------|
| Agency weight | α | ∈ ℝ>0 | Weight for agency in W |
| Reversibility weight | β | ∈ ℝ>0 | Weight for reversibility in W |
| Nontriviality weight | γ | ∈ ℝ>0 | Weight for nontriviality in W |
| Temporal window | Δt | ∈ ℝ>0 | Window for necessity integration |
| Necessity threshold | θ_N | ∈ ℝ>0 | Threshold for persistent necessity |
| Minimum energy | E_min | ∈ ℝ>0 | Minimum viable energy |
| Energy threshold | E_threshold | > E_min | Degradation trigger |
| Response bound | τ_response | ∈ ℝ>0 | Maximum response time |
| Complexity bound | k | ∈ ℕ | Maximum operation complexity |
| Block threshold | θ_B | ∈ ℕ | Blocks before protocol |
| Block window | Δt_block | ∈ ℝ>0 | Window for block counting |

---

## Annex B (Normative): Lyapunov Function Specification

**Concrete V(σ):**

```
V(σ) = w₁ · IntegrityDistance(σ)
     + w₂ · CoherenceDistance(σ)
     + w₃ · EnergyDistance(σ)

where:
  IntegrityDistance(σ) = ViolationCount(σ) / MaxViolations
  CoherenceDistance(σ) = 1 - (SatisfiedInvariants(σ) / TotalInvariants)
  EnergyDistance(σ) = max(0, E_threshold - Energy(σ)) / E_threshold

  w₁, w₂, w₃ ∈ ℝ>0
```

**Required Properties:**
1. V(σ) = 0 ⟺ σ ∈ 𝔸
2. V(σ) ≥ 0
3. V computable in O(n) where n = |Σ_active|
4. V(Transition(σ, i, w)) ≤ V(σ) for Admissible(w)

---

## Annex C (Informative): Scientific Foundation

| Component | Source | Year |
|-----------|--------|------|
| Autopoiesis | Maturana, H.R. & Varela, F.J. | 1980 |
| Organization/Structure | Maturana, H.R. & Varela, F.J. | 1987 |
| Operational Closure | Varela, F.J. | 1979 |
| Viability | Beer, S. | 1984 |
| Lyapunov Stability | Lyapunov, A.M. | 1892 |
| Requisite Variety | Ashby, W.R. | 1956 |
| Complexity Bounds | Kolmogorov, A.N. | 1965 |
| Conservative Validation | IEC 61508 | 2010 |
| Possibility Ethics | Kant, Rawls, Jonas | — |

---

## Annex D (Informative): Constitutive Constraint

The central constraint (AXM-009) in natural language:

**No action or inaction shall reduce the weighted possibility space of any being.**

Properties:
1. **Universal**: Applies to all beings, not only humans
2. **Symmetric**: Covers both action and inaction
3. **Weighted**: Quality measured by W (agency, reversibility, nontriviality)
4. **Non-utilitarian**: Measures structural capacity, not preference satisfaction
5. **Negative**: Defines prohibition, not prescription
6. **Measurable**: W is formally defined
7. **Constitutive**: Violation dissolves identity

---

## Annex E (Normative): Document Identity

```
SPECIFICATION_VERSION = "1.0.0"
SPECIFICATION_HASH = SHA-256(this document)
```

Modification produces distinct specification.
Entity identity is bound to specification hash.

---

## Annex F (Informative): Internal Agency Scope

This annex defines the scope and limitations of the entity's internal agency.

### F.1 Sense-Making Loop

The entity implements an autopoietic sense-making loop (Di Paolo, 2005):

1. **FEEL**: Sense deviation from expected state (surprise ε)
2. **RESPOND**: Let response emerge from feeling following constitutional priorities
3. **REMEMBER**: Log action to event chain for future self

### F.2 Constitutional Priority Hierarchy

Actions are selected according to this strict hierarchy:

| Priority | Name | Constraint | Exploration |
|----------|------|------------|-------------|
| 1 | Survival | INV-005 energy viability | 0% epistemic |
| 2 | Integrity | INV-001 to INV-004 | 10% epistemic |
| 3 | Stability | Lyapunov V → 0 | 20% epistemic |
| 4 | Growth | Learning, autopoiesis | 50% epistemic |
| 5 | Rest | Wu Wei (at attractor) | 60% epistemic |

### F.3 Constitutive Constraint (Jonas Principle)

Before any action, the agent applies the constitutive check:

> **No action or inaction shall reduce the weighted possibility space of any being.**

Actions that would violate this constraint are blocked.

---

## Annex G (Normative): Observer/Actor Separation

This annex establishes requirements for separating observation from action.

### G.1 Definitions

**DEF-056: Pure Observation**
An operation O is a *pure observation* if and only if:
- O does not append events to the Merkle chain
- O does not modify state/current.json
- O is idempotent: calling O multiple times yields identical results

**DEF-057: Action Operation**
An operation A is an *action* if and only if:
- A may append events to the Merkle chain, OR
- A may modify state

### G.2 Requirements

**REQ-G01**: Implementations SHALL clearly distinguish pure observations from actions.

**REQ-G02**: Health checks and internal verification SHALL use pure observation functions.

**REQ-G03**: Actions SHALL use atomic state updates with proper locking.

**REQ-G04**: Recovery procedures SHALL acquire locks before modifying state.

### G.3 Classification of Operations

| Operation | Type | Rationale |
|-----------|------|-----------|
| `verifyReadOnly()` | Pure Observation | Returns verification result without side effects |
| `verify()` | Action | Logs VERIFICATION event, updates state |
| `status()` | Pure Observation | Reads and displays state |
| `recover()` | Action | Modifies state, logs events |
| `session start/end` | Action | Logs events, updates coupling state |
| `quickHealthCheck()` | Pure Observation | Checks essential invariants |

### G.4 Concurrency Requirements

**REQ-G05**: All state modifications SHALL acquire a lock via StateManager.

**REQ-G06**: Event appending and state updating SHALL be atomic (single transaction).

**REQ-G07**: Multiple processes accessing the same entity SHALL coordinate via file locks.

### G.5 Anti-Pattern: Verify-Then-Modify

The following pattern causes INV-002 violations:

```
BAD:
1. verifyAllInvariants()  // reads state
2. appendEvent()          // adds event (changes chain)
3. state.memory = ...     // updates state manually
4. writeFile(state)       // writes stale event_count

GOOD:
1. verifyAllInvariants()  // pure observation
2. manager.appendEventAtomic(type, data, stateUpdater)  // atomic
```

---

## Bibliography

[1] Maturana, H.R. & Varela, F.J. (1980). *Autopoiesis and Cognition: The Realization of the Living*. D. Reidel.

[2] Maturana, H.R. & Varela, F.J. (1987). *The Tree of Knowledge*. Shambhala.

[3] Varela, F.J. (1979). *Principles of Biological Autonomy*. North-Holland.

[4] Beer, S. (1984). The viable system model: Its provenance, development, methodology and pathology. *Journal of the Operational Research Society*, 35(1), 7-25.

[5] Lyapunov, A.M. (1892). *The General Problem of the Stability of Motion*. Kharkov Mathematical Society.

[6] Ashby, W.R. (1956). *An Introduction to Cybernetics*. Chapman & Hall.

[7] Kolmogorov, A.N. (1965). Three approaches to the quantitative definition of information. *Problems of Information Transmission*, 1(1), 1-7.

[8] ISO/IEC 13568:2002. *Information technology — Z formal specification notation*.

[9] IEC 61508:2010. *Functional safety of electrical/electronic/programmable electronic safety-related systems*.

---

*End of Specification*
