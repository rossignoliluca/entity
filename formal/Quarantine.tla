------------------------------ MODULE Quarantine ------------------------------
(****************************************************************************)
(* TLA+ Specification for Quarantine Gate (Sigillo 1)                       *)
(* AES-SPEC-001 Annex H                                                     *)
(*                                                                          *)
(* FSM: QUARANTINED -> TRIAL -> ACTIVE | DEPRECATED                         *)
(*                                                                          *)
(* Constraints:                                                              *)
(*   - quarantineCycles before TRIAL (default: 10)                          *)
(*   - minTrialUses before ACTIVE (default: 5)                              *)
(*   - Zero tolerance: any block -> DEPRECATED                              *)
(*   - ANY deltaV > 0 -> DEPRECATED (spike detection)                       *)
(****************************************************************************)

EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    QuarantineCycles,   \* Cycles before trial (10)
    MinTrialUses,       \* Uses before active (5)
    MaxOperations       \* Maximum operations to model

VARIABLES
    operations,         \* Set of operation records
    globalCycle        \* Current global cycle count

vars == <<operations, globalCycle>>

-----------------------------------------------------------------------------
(* Operation Record *)
(* Each operation has: id, status, quarantineStart, trialUses, blocks, maxVDelta *)
-----------------------------------------------------------------------------

OperationStatus == {"QUARANTINED", "TRIAL", "ACTIVE", "DEPRECATED"}

\* We model operations as a function from OpId to record
OpIds == 1..MaxOperations

-----------------------------------------------------------------------------
(* Type Invariant *)
-----------------------------------------------------------------------------

TypeInvariant ==
    /\ globalCycle \in Nat
    /\ \A op \in DOMAIN operations:
        /\ operations[op].status \in OperationStatus
        /\ operations[op].quarantineStart \in Nat
        /\ operations[op].trialUses \in Nat
        /\ operations[op].blocks \in Nat
        /\ operations[op].maxVDelta \in Int

-----------------------------------------------------------------------------
(* FSM Invariants *)
-----------------------------------------------------------------------------

(* Quarantine must have enough cycles before TRIAL *)
QuarantineDurationRespected ==
    \A op \in DOMAIN operations:
        operations[op].status = "TRIAL" =>
            (globalCycle - operations[op].quarantineStart) >= QuarantineCycles

(* Trial must have enough uses before ACTIVE *)
TrialUsesRespected ==
    \A op \in DOMAIN operations:
        operations[op].status = "ACTIVE" =>
            operations[op].trialUses >= MinTrialUses

(* Any block leads to DEPRECATED (zero tolerance) *)
ZeroToleranceBlocks ==
    \A op \in DOMAIN operations:
        operations[op].blocks > 0 =>
            operations[op].status = "DEPRECATED"

(* Any positive V spike leads to DEPRECATED *)
ZeroToleranceVSpike ==
    \A op \in DOMAIN operations:
        operations[op].maxVDelta > 0 =>
            operations[op].status = "DEPRECATED"

(* DEPRECATED is absorbing *)
DeprecatedIsAbsorbing ==
    \A op \in DOMAIN operations:
        operations[op].status = "DEPRECATED" =>
            operations[op].status' = "DEPRECATED"

(* Valid transitions only *)
ValidTransitions ==
    \A op \in DOMAIN operations:
        LET s == operations[op].status IN
        /\ s = "QUARANTINED" => s' \in {"QUARANTINED", "TRIAL", "DEPRECATED"}
        /\ s = "TRIAL" => s' \in {"TRIAL", "ACTIVE", "DEPRECATED"}
        /\ s = "ACTIVE" => s' \in {"ACTIVE", "DEPRECATED"}
        /\ s = "DEPRECATED" => s' = "DEPRECATED"

-----------------------------------------------------------------------------
(* Combined Invariant *)
-----------------------------------------------------------------------------

QuarantineInvariants ==
    /\ QuarantineDurationRespected
    /\ TrialUsesRespected
    /\ ZeroToleranceBlocks
    /\ ZeroToleranceVSpike

-----------------------------------------------------------------------------
(* Initial State *)
-----------------------------------------------------------------------------

EmptyOperation == [
    status |-> "QUARANTINED",
    quarantineStart |-> 0,
    trialUses |-> 0,
    blocks |-> 0,
    maxVDelta |-> 0
]

Init ==
    /\ operations = [op \in {} |-> EmptyOperation]
    /\ globalCycle = 0

-----------------------------------------------------------------------------
(* Actions *)
-----------------------------------------------------------------------------

(* Create a new operation (enters quarantine) *)
CreateOperation(opId) ==
    /\ opId \notin DOMAIN operations
    /\ Cardinality(DOMAIN operations) < MaxOperations
    /\ operations' = operations @@ (opId :> [
        status |-> "QUARANTINED",
        quarantineStart |-> globalCycle,
        trialUses |-> 0,
        blocks |-> 0,
        maxVDelta |-> 0
    ])
    /\ UNCHANGED globalCycle

(* Advance global cycle *)
AdvanceCycle ==
    /\ globalCycle' = globalCycle + 1
    /\ UNCHANGED operations

(* Promote from QUARANTINED to TRIAL *)
PromoteToTrial(opId) ==
    /\ opId \in DOMAIN operations
    /\ operations[opId].status = "QUARANTINED"
    /\ (globalCycle - operations[opId].quarantineStart) >= QuarantineCycles
    /\ operations[opId].blocks = 0
    /\ operations' = [operations EXCEPT ![opId].status = "TRIAL"]
    /\ UNCHANGED globalCycle

(* Use operation during TRIAL (successful) *)
TrialUseSuccess(opId) ==
    /\ opId \in DOMAIN operations
    /\ operations[opId].status = "TRIAL"
    /\ operations' = [operations EXCEPT ![opId].trialUses = @ + 1]
    /\ UNCHANGED globalCycle

(* Use operation during TRIAL with V spike -> DEPRECATED *)
TrialUseVSpike(opId) ==
    /\ opId \in DOMAIN operations
    /\ operations[opId].status = "TRIAL"
    /\ operations' = [operations EXCEPT
        ![opId].maxVDelta = 1,
        ![opId].status = "DEPRECATED"
    ]
    /\ UNCHANGED globalCycle

(* Block during TRIAL -> DEPRECATED *)
TrialBlocked(opId) ==
    /\ opId \in DOMAIN operations
    /\ operations[opId].status = "TRIAL"
    /\ operations' = [operations EXCEPT
        ![opId].blocks = @ + 1,
        ![opId].status = "DEPRECATED"
    ]
    /\ UNCHANGED globalCycle

(* Promote from TRIAL to ACTIVE *)
PromoteToActive(opId) ==
    /\ opId \in DOMAIN operations
    /\ operations[opId].status = "TRIAL"
    /\ operations[opId].trialUses >= MinTrialUses
    /\ operations[opId].blocks = 0
    /\ operations[opId].maxVDelta <= 0
    /\ operations' = [operations EXCEPT ![opId].status = "ACTIVE"]
    /\ UNCHANGED globalCycle

(* Block during QUARANTINE -> DEPRECATED *)
QuarantineBlocked(opId) ==
    /\ opId \in DOMAIN operations
    /\ operations[opId].status = "QUARANTINED"
    /\ operations' = [operations EXCEPT
        ![opId].blocks = @ + 1,
        ![opId].status = "DEPRECATED"
    ]
    /\ UNCHANGED globalCycle

-----------------------------------------------------------------------------
(* Next State Relation *)
-----------------------------------------------------------------------------

Next ==
    \/ AdvanceCycle
    \/ \E op \in OpIds:
        \/ CreateOperation(op)
        \/ PromoteToTrial(op)
        \/ TrialUseSuccess(op)
        \/ TrialUseVSpike(op)
        \/ TrialBlocked(op)
        \/ PromoteToActive(op)
        \/ QuarantineBlocked(op)

-----------------------------------------------------------------------------
(* Specification *)
-----------------------------------------------------------------------------

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties *)
-----------------------------------------------------------------------------

(* Safety: Quarantine invariants always hold *)
Safety == []QuarantineInvariants

(* No direct QUARANTINED -> ACTIVE transition *)
NoQuarantineToActiveDirectly ==
    []\A op \in DOMAIN operations:
        (operations[op].status = "QUARANTINED" /\ operations'[op].status = "ACTIVE") => FALSE

(* DEPRECATED never transitions to other states *)
DeprecatedStaysDeprecated ==
    []\A op \in DOMAIN operations:
        operations[op].status = "DEPRECATED" => []operations[op].status = "DEPRECATED"

=============================================================================
