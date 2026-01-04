/**
 * Core Types
 * AES-SPEC-001 v1.0.0 Conformant
 */

// =============================================================================
// §3.1.5 Temporal Primitives
// =============================================================================

export type Timestamp = string; // ISO 8601

// =============================================================================
// §3.2.8 Versioning (DEF-054, DEF-055)
// =============================================================================

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

// =============================================================================
// Hash (§3.1.6)
// =============================================================================

export type Hash = string; // SHA-256 hex, 64 characters

// =============================================================================
// §3.2.6 Lifecycle (DEF-046, DEF-047)
// =============================================================================

export type SystemStatus = 'nominal' | 'degraded' | 'dormant' | 'terminal';

// =============================================================================
// State (derived from DEF-001 through DEF-055)
// =============================================================================

export interface State {
  version: string;
  specification: string;
  organization_hash: Hash;

  created: Timestamp;
  updated: Timestamp;

  identity: {
    name: string;
    instantiated_by: string;
    instantiated_at: Timestamp;
  };

  coupling: {
    active: boolean;
    partner: string | null;
    since: Timestamp | null;
  };

  energy: {
    current: number; // E ∈ [0, 1]
    min: number;     // E_min
    threshold: number; // E_threshold
  };

  lyapunov: {
    V: number;
    V_previous: number | null;
  };

  memory: {
    event_count: number;
    last_event_hash: Hash | null;
    last_snapshot_at: Timestamp | null;
  };

  session: {
    total_count: number;
    current_id: string | null;
  };

  integrity: {
    invariant_violations: number;
    last_verification: Timestamp;
    status: SystemStatus;
  };

  human: {
    name: string;
    context: string;
  };

  important: string[];

  learning: {
    enabled: boolean;
    lastAnalysis: Timestamp | null;
    patternsHash: Hash | null;
  };

  autopoiesis?: {
    enabled: boolean;
    generatedOperations: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      complexity: number;
      energyCost: number;
      requiresCoupling: boolean;
      template: string;
      templateParams: Record<string, unknown>;
      generatedBy: string;
      generatedAt: string;
      parentOperations?: string[];
      generation: number;
    }>;
    generationCount: number;
    lastGeneration: Timestamp | null;
    selfProductionHash: Hash | null;
  };

  // Phase 8: Internal Agency state
  agent?: {
    enabled: boolean;
    awake: boolean;
    lastCycle: Timestamp | null;
    cycleCount: number;
    responsesByPriority: {
      survival: number;
      integrity: number;
      stability: number;
      growth: number;
      rest: number;
    };
    totalEnergyConsumed: number;
  };
}

// =============================================================================
// Events (DEF-050 through DEF-052)
// =============================================================================

export type EventType =
  | 'GENESIS'
  | 'SESSION_START'
  | 'SESSION_END'
  | 'STATE_UPDATE'
  | 'COUPLING_START'
  | 'COUPLING_END'
  | 'OPERATION'
  | 'BLOCK'
  | 'SNAPSHOT'
  | 'VERIFICATION'
  | 'LEARNING'
  | 'META_OPERATION'
  // Phase 8: Internal Agency events
  | 'AGENT_WAKE'           // Agent sense-making loop started
  | 'AGENT_SLEEP'          // Agent sense-making loop paused
  | 'AGENT_RESPONSE'       // Agent responded to feeling
  | 'AGENT_REST'           // Agent resting (Wu Wei)
  // Phase 8b: Ultrastability events
  | 'AGENT_ULTRASTABILITY'; // Ultrastability parameter adjustment

export interface Event {
  seq: number;
  type: EventType;
  timestamp: Timestamp;
  data: Record<string, unknown>;
  prev_hash: Hash | null;
  hash: Hash;
}

// =============================================================================
// Validator (DEF-029, DEF-030)
// =============================================================================

export type ValidatorResult =
  | { status: 'allow' }
  | { status: 'block'; reason: string; axiom: string }
  | { status: 'unknown'; reason: string };

// =============================================================================
// Invariants
// =============================================================================

export interface InvariantCheck {
  id: string;
  name: string;
  satisfied: boolean;
  details?: string;
}

export interface VerificationResult {
  timestamp: Timestamp;
  all_satisfied: boolean;
  invariants: InvariantCheck[];
  lyapunov_V: number;
}

// =============================================================================
// Configuration (Annex A)
// =============================================================================

export interface Config {
  // Weight coefficients (DEF-018)
  alpha: number; // Agency weight
  beta: number;  // Reversibility weight
  gamma: number; // Nontriviality weight

  // Energy (DEF-043, DEF-044)
  E_min: number;
  E_threshold: number;

  // Lyapunov weights (Annex B)
  w1: number; // Integrity weight
  w2: number; // Coherence weight
  w3: number; // Energy weight

  // Behavioral (DEF-051, DEF-053)
  block_threshold: number;
  block_window_ms: number;
  response_bound_ms: number;

  // Complexity (AXM-008)
  complexity_bound: number;
}

export const DEFAULT_CONFIG: Config = {
  alpha: 1.0,
  beta: 1.0,
  gamma: 1.0,
  E_min: 0.01,
  E_threshold: 0.1,
  w1: 0.4,
  w2: 0.4,
  w3: 0.2,
  block_threshold: 5,
  block_window_ms: 60000,
  response_bound_ms: 30000,
  complexity_bound: 1000,
};
