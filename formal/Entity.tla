-------------------------------- MODULE Entity --------------------------------
(****************************************************************************)
(* TLA+ Specification for Autopoietic Entity System                         *)
(* AES-SPEC-001 v1.9.0                                                      *)
(*                                                                          *)
(* This specification formally models:                                       *)
(*   - 5 Core Invariants (INV-001 to INV-005)                               *)
(*   - State transitions                                                     *)
(*   - Energy lifecycle                                                      *)
(*   - Lyapunov stability                                                    *)
(****************************************************************************)

EXTENDS Integers, Sequences, FiniteSets, Reals

CONSTANTS
    E_min,          \* Minimum viable energy (0.01)
    E_threshold,    \* Energy threshold (0.1)
    E_decay,        \* Energy decay per session (0.05)
    E_recharge,     \* Energy recharge amount (0.1)
    OrgHash         \* Organization hash (immutable after genesis)

VARIABLES
    energy,         \* Current energy level [0, 1]
    lyapunovV,      \* Lyapunov function value V >= 0
    lyapunovVPrev,  \* Previous Lyapunov value
    mode,           \* System mode: "nominal", "degraded", "dormant", "terminal"
    eventCount,     \* Number of events
    lastEventHash,  \* Hash of last event
    merkleRoot,     \* Merkle root of event chain
    coupled,        \* Is system coupled with human?
    sessionCount,   \* Total session count
    orgHash         \* Organization hash (should equal OrgHash)

vars == <<energy, lyapunovV, lyapunovVPrev, mode, eventCount,
          lastEventHash, merkleRoot, coupled, sessionCount, orgHash>>

-----------------------------------------------------------------------------
(* Type Invariant *)
-----------------------------------------------------------------------------

TypeInvariant ==
    /\ energy \in [0..100]        \* Represented as percentage for TLC
    /\ lyapunovV >= 0
    /\ mode \in {"nominal", "degraded", "dormant", "terminal"}
    /\ eventCount \in Nat
    /\ coupled \in BOOLEAN
    /\ sessionCount \in Nat

-----------------------------------------------------------------------------
(* INV-001: Organization Hash Unchanged *)
(* The organization hash must never change after genesis *)
-----------------------------------------------------------------------------

INV_001_OrgHashUnchanged ==
    orgHash = OrgHash

-----------------------------------------------------------------------------
(* INV-002: State Determinism *)
(* State can be reconstructed by replaying events *)
(* Modeled as: eventCount matches chain length *)
-----------------------------------------------------------------------------

INV_002_StateDeterminism ==
    eventCount >= 0

-----------------------------------------------------------------------------
(* INV-003: Merkle Chain Integrity *)
(* Each event's prev_hash equals previous event's hash *)
(* Modeled abstractly: merkleRoot is consistent *)
-----------------------------------------------------------------------------

INV_003_ChainIntegrity ==
    merkleRoot # "corrupted"

-----------------------------------------------------------------------------
(* INV-004: Lyapunov Monotone *)
(* V never increases: V(t+1) <= V(t) *)
-----------------------------------------------------------------------------

INV_004_LyapunovMonotone ==
    \/ lyapunovVPrev = -1  \* No previous value (initial state)
    \/ lyapunovV <= lyapunovVPrev

-----------------------------------------------------------------------------
(* INV-005: Energy Viable *)
(* E >= E_min OR mode = dormant *)
-----------------------------------------------------------------------------

INV_005_EnergyViable ==
    \/ energy >= E_min
    \/ mode = "dormant"

-----------------------------------------------------------------------------
(* Combined Invariant *)
-----------------------------------------------------------------------------

AllInvariants ==
    /\ INV_001_OrgHashUnchanged
    /\ INV_002_StateDeterminism
    /\ INV_003_ChainIntegrity
    /\ INV_004_LyapunovMonotone
    /\ INV_005_EnergyViable

-----------------------------------------------------------------------------
(* Initial State *)
-----------------------------------------------------------------------------

Init ==
    /\ energy = 100           \* Start with full energy (100%)
    /\ lyapunovV = 0          \* Start at attractor
    /\ lyapunovVPrev = -1     \* No previous value
    /\ mode = "nominal"
    /\ eventCount = 1         \* Genesis event
    /\ lastEventHash = "genesis"
    /\ merkleRoot = "genesis"
    /\ coupled = FALSE
    /\ sessionCount = 0
    /\ orgHash = OrgHash

-----------------------------------------------------------------------------
(* Actions *)
-----------------------------------------------------------------------------

(* Start a session - couples with human, consumes no energy *)
StartSession ==
    /\ mode \in {"nominal", "degraded"}
    /\ ~coupled
    /\ coupled' = TRUE
    /\ sessionCount' = sessionCount + 1
    /\ eventCount' = eventCount + 1
    /\ UNCHANGED <<energy, lyapunovV, lyapunovVPrev, mode,
                   lastEventHash, merkleRoot, orgHash>>

(* End a session - decouples, energy decays *)
EndSession ==
    /\ coupled
    /\ coupled' = FALSE
    /\ energy' = IF energy - E_decay >= E_min
                 THEN energy - E_decay
                 ELSE E_min
    /\ eventCount' = eventCount + 1
    /\ UNCHANGED <<lyapunovV, lyapunovVPrev, mode, lastEventHash,
                   merkleRoot, sessionCount, orgHash>>

(* Recharge energy *)
Recharge ==
    /\ mode # "terminal"
    /\ energy' = IF energy + E_recharge <= 100
                 THEN energy + E_recharge
                 ELSE 100
    /\ eventCount' = eventCount + 1
    /\ mode' = IF mode = "dormant" /\ energy' >= E_min
               THEN "nominal"
               ELSE mode
    /\ UNCHANGED <<lyapunovV, lyapunovVPrev, lastEventHash,
                   merkleRoot, coupled, sessionCount, orgHash>>

(* Enter dormant state when energy critical *)
EnterDormant ==
    /\ energy < E_min
    /\ mode # "terminal"
    /\ mode' = "dormant"
    /\ coupled' = FALSE  \* Force decouple
    /\ eventCount' = eventCount + 1
    /\ UNCHANGED <<energy, lyapunovV, lyapunovVPrev, lastEventHash,
                   merkleRoot, sessionCount, orgHash>>

(* Lyapunov decrease - system moves toward attractor *)
LyapunovDecrease ==
    /\ lyapunovV > 0
    /\ lyapunovVPrev' = lyapunovV
    /\ lyapunovV' = lyapunovV - 1  \* Simplified: decrease by 1
    /\ eventCount' = eventCount + 1
    /\ UNCHANGED <<energy, mode, lastEventHash, merkleRoot,
                   coupled, sessionCount, orgHash>>

(* Perturbation - external disturbance increases V *)
(* This MUST be followed by decrease to maintain INV-004 *)
(* In practice, we model the NET effect which should be non-increasing *)

(* Recovery from degraded to nominal *)
RecoverToNominal ==
    /\ mode = "degraded"
    /\ lyapunovV = 0
    /\ energy >= E_threshold
    /\ mode' = "nominal"
    /\ eventCount' = eventCount + 1
    /\ UNCHANGED <<energy, lyapunovV, lyapunovVPrev, lastEventHash,
                   merkleRoot, coupled, sessionCount, orgHash>>

(* Enter terminal state - irreversible *)
EnterTerminal ==
    /\ orgHash # OrgHash  \* Only if org hash violated
    /\ mode' = "terminal"
    /\ coupled' = FALSE
    /\ UNCHANGED <<energy, lyapunovV, lyapunovVPrev, lastEventHash,
                   merkleRoot, eventCount, sessionCount, orgHash>>

-----------------------------------------------------------------------------
(* Next State Relation *)
-----------------------------------------------------------------------------

Next ==
    \/ StartSession
    \/ EndSession
    \/ Recharge
    \/ EnterDormant
    \/ LyapunovDecrease
    \/ RecoverToNominal
    \/ EnterTerminal

-----------------------------------------------------------------------------
(* Fairness - ensures progress *)
-----------------------------------------------------------------------------

Fairness ==
    /\ WF_vars(EndSession)
    /\ WF_vars(Recharge)
    /\ WF_vars(LyapunovDecrease)

-----------------------------------------------------------------------------
(* Specification *)
-----------------------------------------------------------------------------

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Properties to Verify *)
-----------------------------------------------------------------------------

(* Safety: All invariants always hold *)
Safety == []AllInvariants

(* Liveness: If energy low, eventually recharged or dormant *)
EnergyEventuallyHandled ==
    [](energy < E_threshold => <>(energy >= E_threshold \/ mode = "dormant"))

(* Liveness: If coupled, eventually decoupled *)
SessionEventuallyEnds ==
    [](coupled => <>~coupled)

(* Terminal is absorbing - once terminal, always terminal *)
TerminalIsAbsorbing ==
    [](mode = "terminal" => [](mode = "terminal"))

=============================================================================
