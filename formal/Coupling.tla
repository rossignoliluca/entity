------------------------------- MODULE Coupling -------------------------------
(****************************************************************************)
(* TLA+ Specification for Structural Coupling Protocol                      *)
(* AES-SPEC-001 Phase 8f                                                    *)
(*                                                                          *)
(* Key constraint (AXM-007): Human controls coupling                        *)
(*   - Agent can REQUEST coupling                                           *)
(*   - Agent CANNOT GRANT coupling                                          *)
(*   - Only human can grant/complete/cancel                                 *)
(*                                                                          *)
(* Request FSM: pending -> granted -> completed                             *)
(*                    \-> expired                                           *)
(*                    \-> canceled                                          *)
(****************************************************************************)

EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    MaxRequests,        \* Maximum pending requests (5)
    TTL_Urgent,         \* TTL for urgent requests (ticks)
    TTL_Normal,         \* TTL for normal requests (ticks)
    TTL_Low,            \* TTL for low requests (ticks)
    CooldownDuration    \* Cooldown after grant (ticks)

VARIABLES
    requests,           \* Sequence of request records
    coupled,            \* Is entity coupled?
    currentTime,        \* Logical clock
    cooldownUntil,      \* Cooldown expiry time
    humanPresent        \* Is human available? (external input)

vars == <<requests, coupled, currentTime, cooldownUntil, humanPresent>>

-----------------------------------------------------------------------------
(* Types *)
-----------------------------------------------------------------------------

Priority == {"urgent", "normal", "low"}
RequestStatus == {"pending", "granted", "expired", "completed", "canceled"}

\* Request record
RequestRecord == [
    id: STRING,
    priority: Priority,
    status: RequestStatus,
    requestedAt: Nat,
    expiresAt: Nat
]

-----------------------------------------------------------------------------
(* Type Invariant *)
-----------------------------------------------------------------------------

TypeInvariant ==
    /\ coupled \in BOOLEAN
    /\ currentTime \in Nat
    /\ cooldownUntil \in Nat
    /\ humanPresent \in BOOLEAN
    /\ Len(requests) <= MaxRequests + 10  \* Some buffer for history

-----------------------------------------------------------------------------
(* Core Constraint: AXM-007 *)
(* Human controls coupling - agent can only request, not grant *)
-----------------------------------------------------------------------------

AXM_007_HumanControlsCoupling ==
    \* Granting requires human presence (modeled)
    \A i \in 1..Len(requests):
        requests[i].status = "granted" => humanPresent

-----------------------------------------------------------------------------
(* Anti-spam constraints *)
-----------------------------------------------------------------------------

(* Maximum pending requests *)
MaxPendingRespected ==
    Cardinality({i \in 1..Len(requests): requests[i].status = "pending"}) <= MaxRequests

(* Cooldown respected *)
CooldownRespected ==
    currentTime < cooldownUntil =>
        ~\E i \in 1..Len(requests):
            /\ requests[i].status = "pending"
            /\ requests[i].priority \in {"normal", "low"}
            /\ requests[i].requestedAt >= cooldownUntil - CooldownDuration

-----------------------------------------------------------------------------
(* Request lifecycle invariants *)
-----------------------------------------------------------------------------

(* Expired requests cannot be granted *)
ExpiredCannotBeGranted ==
    \A i \in 1..Len(requests):
        (requests[i].status = "expired") =>
            \A j \in 1..Len(requests'):
                (requests'[j].id = requests[i].id) =>
                    requests'[j].status # "granted"

(* Completed/Canceled are terminal *)
TerminalStates ==
    \A i \in 1..Len(requests):
        requests[i].status \in {"completed", "canceled", "expired"} =>
            requests'[i].status = requests[i].status

-----------------------------------------------------------------------------
(* Combined Invariants *)
-----------------------------------------------------------------------------

CouplingInvariants ==
    /\ AXM_007_HumanControlsCoupling
    /\ MaxPendingRespected
    /\ CooldownRespected

-----------------------------------------------------------------------------
(* Helper Functions *)
-----------------------------------------------------------------------------

TTLFor(priority) ==
    CASE priority = "urgent" -> TTL_Urgent
      [] priority = "normal" -> TTL_Normal
      [] priority = "low" -> TTL_Low
      [] OTHER -> TTL_Normal

PendingCount ==
    Cardinality({i \in 1..Len(requests): requests[i].status = "pending"})

HasPendingWithPriority(p) ==
    \E i \in 1..Len(requests):
        /\ requests[i].status = "pending"
        /\ requests[i].priority = p

-----------------------------------------------------------------------------
(* Initial State *)
-----------------------------------------------------------------------------

Init ==
    /\ requests = <<>>
    /\ coupled = FALSE
    /\ currentTime = 0
    /\ cooldownUntil = 0
    /\ humanPresent = FALSE

-----------------------------------------------------------------------------
(* Actions *)
-----------------------------------------------------------------------------

(* Agent requests coupling - this is what agent CAN do *)
AgentRequestCoupling(priority, reason) ==
    /\ ~coupled
    /\ PendingCount < MaxRequests
    /\ \/ priority = "urgent"  \* Urgent always allowed
       \/ currentTime >= cooldownUntil  \* Others only after cooldown
    /\ ~HasPendingWithPriority(priority)  \* No duplicate priority
    /\ LET newRequest == [
           id |-> "req" \o ToString(Len(requests) + 1),
           priority |-> priority,
           status |-> "pending",
           requestedAt |-> currentTime,
           expiresAt |-> currentTime + TTLFor(priority)
       ]
       IN requests' = Append(requests, newRequest)
    /\ UNCHANGED <<coupled, currentTime, cooldownUntil, humanPresent>>

(* Human grants request - only human can do this *)
HumanGrantRequest(reqIndex) ==
    /\ humanPresent
    /\ reqIndex \in 1..Len(requests)
    /\ requests[reqIndex].status = "pending"
    /\ requests[reqIndex].expiresAt > currentTime
    /\ requests' = [requests EXCEPT ![reqIndex].status = "granted"]
    /\ coupled' = TRUE
    /\ cooldownUntil' = currentTime + CooldownDuration
    /\ UNCHANGED <<currentTime, humanPresent>>

(* Human completes request *)
HumanCompleteRequest(reqIndex) ==
    /\ humanPresent
    /\ reqIndex \in 1..Len(requests)
    /\ requests[reqIndex].status = "granted"
    /\ requests' = [requests EXCEPT ![reqIndex].status = "completed"]
    /\ coupled' = FALSE
    /\ UNCHANGED <<currentTime, cooldownUntil, humanPresent>>

(* Human cancels request *)
HumanCancelRequest(reqIndex) ==
    /\ humanPresent
    /\ reqIndex \in 1..Len(requests)
    /\ requests[reqIndex].status = "pending"
    /\ requests' = [requests EXCEPT ![reqIndex].status = "canceled"]
    /\ UNCHANGED <<coupled, currentTime, cooldownUntil, humanPresent>>

(* Time advances and requests expire *)
TimeAdvance ==
    /\ currentTime' = currentTime + 1
    /\ requests' = [i \in 1..Len(requests) |->
        IF requests[i].status = "pending" /\ requests[i].expiresAt <= currentTime'
        THEN [requests[i] EXCEPT !.status = "expired"]
        ELSE requests[i]
    ]
    /\ UNCHANGED <<coupled, cooldownUntil, humanPresent>>

(* Human arrives/leaves (environmental) *)
HumanArrives ==
    /\ ~humanPresent
    /\ humanPresent' = TRUE
    /\ UNCHANGED <<requests, coupled, currentTime, cooldownUntil>>

HumanLeaves ==
    /\ humanPresent
    /\ humanPresent' = FALSE
    /\ UNCHANGED <<requests, coupled, currentTime, cooldownUntil>>

-----------------------------------------------------------------------------
(* Forbidden Actions - what agent CANNOT do *)
-----------------------------------------------------------------------------

(* These actions should NEVER be enabled for agent *)
(* They're included to verify they're blocked *)

AgentGrantRequest(reqIndex) ==
    FALSE  \* Agent cannot grant - always disabled

AgentCompleteRequest(reqIndex) ==
    FALSE  \* Agent cannot complete - always disabled

AgentCancelRequest(reqIndex) ==
    FALSE  \* Agent cannot cancel - always disabled

-----------------------------------------------------------------------------
(* Next State Relation *)
-----------------------------------------------------------------------------

Next ==
    \/ \E p \in Priority, r \in {"reason"}: AgentRequestCoupling(p, r)
    \/ \E i \in 1..MaxRequests + 10:
        \/ HumanGrantRequest(i)
        \/ HumanCompleteRequest(i)
        \/ HumanCancelRequest(i)
    \/ TimeAdvance
    \/ HumanArrives
    \/ HumanLeaves

-----------------------------------------------------------------------------
(* Fairness *)
-----------------------------------------------------------------------------

Fairness ==
    /\ WF_vars(TimeAdvance)
    /\ SF_vars(HumanArrives)

-----------------------------------------------------------------------------
(* Specification *)
-----------------------------------------------------------------------------

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Properties *)
-----------------------------------------------------------------------------

(* Safety: AXM-007 always holds *)
Safety == []AXM_007_HumanControlsCoupling

(* Liveness: Pending requests eventually resolve *)
RequestsEventuallyResolve ==
    \A i \in 1..Len(requests):
        requests[i].status = "pending" =>
            <>(requests[i].status \in {"granted", "expired", "canceled"})

(* Agent never grants *)
AgentNeverGrants ==
    []\A i \in 1..Len(requests):
        requests[i].status = "granted" => humanPresent

(* Coupling requires grant *)
CouplingRequiresGrant ==
    [](coupled => \E i \in 1..Len(requests): requests[i].status = "granted")

=============================================================================
