/**
 * Species 2 Signal Guard
 * AES-SPEC-002 - Hard Rules Enforcement
 *
 * - Default: PRESENCE_SILENCE (nessun evento se non cambia niente)
 * - Rate limit: max 1 segnale/min
 * - Heartbeat: max 1/5 min, disabilitato quando V=0 e ε=0 (REST dominance)
 * - INV-006: Signal integrity
 */

import {
  SignalType,
  PresenceState,
  StateSnapshot,
  RATE_LIMITS,
  EPSILON_MIN,
} from './types.js';

export interface GuardResult {
  allowed: boolean;
  reason: string;
  violation?: 'RATE_LIMIT' | 'REST_DOMINANCE' | 'NO_CHANGE' | 'SILENCED';
}

/**
 * Check if channel is silenced (INV-006 recovery)
 */
function checkSilence(state: PresenceState): GuardResult | null {
  if (state.silencedUntil) {
    const now = Date.now();
    const silenceEnd = new Date(state.silencedUntil).getTime();
    if (now < silenceEnd) {
      return {
        allowed: false,
        reason: `Channel silenced until ${state.silencedUntil}`,
        violation: 'SILENCED',
      };
    }
  }
  return null;
}

/**
 * Check rate limit (CONSTRAINT-001)
 */
function checkRateLimit(state: PresenceState, type: SignalType): GuardResult | null {
  const now = Date.now();

  if (type === 'HEARTBEAT') {
    // Heartbeat has separate interval
    if (state.lastHeartbeat) {
      const lastTime = new Date(state.lastHeartbeat).getTime();
      if (now - lastTime < RATE_LIMITS.HEARTBEAT_INTERVAL_MS) {
        return {
          allowed: false,
          reason: `Heartbeat rate limit: min ${RATE_LIMITS.HEARTBEAT_INTERVAL_MS / 1000}s`,
          violation: 'RATE_LIMIT',
        };
      }
    }
  } else {
    // Regular signals: 1 per minute
    if (state.lastSignal) {
      const lastTime = new Date(state.lastSignal).getTime();
      if (now - lastTime < RATE_LIMITS.MIN_SIGNAL_INTERVAL_MS) {
        return {
          allowed: false,
          reason: `Rate limit: min ${RATE_LIMITS.MIN_SIGNAL_INTERVAL_MS / 1000}s between signals`,
          violation: 'RATE_LIMIT',
        };
      }
    }
  }

  return null;
}

/**
 * Check REST dominance (CONSTRAINT-003)
 * V=0 ∧ ε≤ε_min → signal_allowed = false
 */
function checkRestDominance(V: number, epsilon: number, type: SignalType): GuardResult | null {
  // REST dominance applies to heartbeat especially
  if (V === 0 && epsilon <= EPSILON_MIN) {
    if (type === 'HEARTBEAT') {
      return {
        allowed: false,
        reason: `REST dominance: V=0, ε≤${EPSILON_MIN}. Heartbeat disabled at attractor.`,
        violation: 'REST_DOMINANCE',
      };
    }
    // Other signals still blocked at perfect rest
    // (but STATUS_CHANGED wouldn't fire anyway since nothing changed)
  }
  return null;
}

/**
 * Check if state actually changed (PRESENCE_SILENCE default)
 */
function checkStateChange(
  current: StateSnapshot,
  previous: StateSnapshot | null,
  type: SignalType
): GuardResult | null {
  // Heartbeat doesn't require state change
  if (type === 'HEARTBEAT') return null;

  // COUPLING_REQUESTED always allowed if there are pending requests
  if (type === 'COUPLING_REQUESTED') return null;

  // First snapshot - allow
  if (!previous) return null;

  // Check for actual changes
  const changed =
    current.energy !== previous.energy ||
    current.V !== previous.V ||
    current.invariantsSatisfied !== previous.invariantsSatisfied ||
    current.status !== previous.status ||
    current.pendingCouplings !== previous.pendingCouplings;

  if (!changed) {
    return {
      allowed: false,
      reason: 'PRESENCE_SILENCE: No state change detected',
      violation: 'NO_CHANGE',
    };
  }

  return null;
}

/**
 * Main guard function
 */
export function guardSignal(
  type: SignalType,
  presenceState: PresenceState,
  currentSnapshot: StateSnapshot,
  previousSnapshot: StateSnapshot | null,
  epsilon: number = 0
): GuardResult {
  // 1. Check silence
  const silenceResult = checkSilence(presenceState);
  if (silenceResult) return silenceResult;

  // 2. Check rate limit
  const rateResult = checkRateLimit(presenceState, type);
  if (rateResult) return rateResult;

  // 3. Check REST dominance
  const restResult = checkRestDominance(currentSnapshot.V, epsilon, type);
  if (restResult) return restResult;

  // 4. Check state change (PRESENCE_SILENCE)
  const changeResult = checkStateChange(currentSnapshot, previousSnapshot, type);
  if (changeResult) return changeResult;

  return { allowed: true, reason: 'Signal approved' };
}

/**
 * Create initial presence state
 */
export function createPresenceState(): PresenceState {
  return {
    connected: 0,
    lastSignal: null,
    lastHeartbeat: null,
    signalSeq: 0,
    silencedUntil: null,
  };
}

/**
 * Silence channel (INV-006 violation recovery)
 */
export function silenceChannel(state: PresenceState): PresenceState {
  return {
    ...state,
    silencedUntil: new Date(Date.now() + RATE_LIMITS.SILENCE_DURATION_MS).toISOString(),
  };
}
