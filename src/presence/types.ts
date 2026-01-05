/**
 * Species 2 Presence Types
 * AES-SPEC-002 - SSE Channel Specification
 */

/**
 * Signal types (codifiche rigide, niente testo libero)
 */
export type SignalType =
  | 'STATUS_CHANGED'
  | 'ENERGY_WARNING'
  | 'COUPLING_REQUESTED'
  | 'HEARTBEAT';

/**
 * Signal payload (rigido) per SSE
 */
export interface SignalPayload {
  type: SignalType;
  ts: string;                    // ISO-8601
  seq: number;                   // Sequence number
  org_hash: string;              // Organization hash (Species 2)
  state: {
    energy: number;              // 0.0-1.0
    V: number;                   // Lyapunov value
    integrity: string;           // "5/5" format
  };
  coupling: {
    pending: number;             // Pending requests count
    urgent: number;              // Urgent requests count
  };
}

/**
 * Presence channel state
 */
export interface PresenceState {
  connected: number;             // Connected clients count
  lastSignal: string | null;     // ISO timestamp of last signal
  lastHeartbeat: string | null;  // ISO timestamp of last heartbeat
  signalSeq: number;             // Signal sequence number
  silencedUntil: string | null;  // ISO timestamp if silenced (INV-006 recovery)
}

/**
 * State snapshot for diff detection
 */
export interface StateSnapshot {
  energy: number;
  V: number;
  invariantsSatisfied: number;
  status: string;
  pendingCouplings: number;
}

/**
 * Rate limits (CONSTRAINT-001)
 */
export const RATE_LIMITS = {
  MIN_SIGNAL_INTERVAL_MS: 60_000,     // 1 signal per minute
  HEARTBEAT_INTERVAL_MS: 300_000,     // 1 heartbeat per 5 minutes
  SILENCE_DURATION_MS: 600_000,       // 10 min silence on INV-006 violation
} as const;

/**
 * Species 2 organization hash
 */
export const ORG_HASH_V2 = 'bd5b24db8bad97efb7749eea83d4ad12744f0521214dd8d04b0a8318f6521e0a';

/**
 * Epsilon minimum for REST dominance
 */
export const EPSILON_MIN = 0.001;
