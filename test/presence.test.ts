/**
 * Presence Module Tests
 * AES-SPEC-002: Species 2 SSE Channel
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  SignalType,
  SignalPayload,
  PresenceState,
  StateSnapshot,
  RATE_LIMITS,
  ORG_HASH_V2,
  EPSILON_MIN,
} from '../src/presence/types.js';
import {
  guardSignal,
  createPresenceState,
  silenceChannel,
  GuardResult,
} from '../src/presence/guard.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createSnapshot = (overrides: Partial<StateSnapshot> = {}): StateSnapshot => ({
  energy: 0.5,
  V: 0,
  invariantsSatisfied: 5,
  status: 'nominal',
  pendingCouplings: 0,
  ...overrides,
});

const createPresence = (overrides: Partial<PresenceState> = {}): PresenceState => ({
  ...createPresenceState(),
  ...overrides,
});

// =============================================================================
// Types Tests
// =============================================================================

describe('Presence Types', () => {
  describe('RATE_LIMITS', () => {
    it('should have correct signal interval (1 min)', () => {
      assert.strictEqual(RATE_LIMITS.MIN_SIGNAL_INTERVAL_MS, 60_000);
    });

    it('should have correct heartbeat interval (5 min)', () => {
      assert.strictEqual(RATE_LIMITS.HEARTBEAT_INTERVAL_MS, 300_000);
    });

    it('should have correct silence duration (10 min)', () => {
      assert.strictEqual(RATE_LIMITS.SILENCE_DURATION_MS, 600_000);
    });
  });

  describe('ORG_HASH_V2', () => {
    it('should be 64 character hex string', () => {
      assert.strictEqual(ORG_HASH_V2.length, 64);
      assert.match(ORG_HASH_V2, /^[a-f0-9]+$/);
    });

    it('should match Species 2 organization hash', () => {
      assert.strictEqual(
        ORG_HASH_V2,
        'bd5b24db8bad97efb7749eea83d4ad12744f0521214dd8d04b0a8318f6521e0a'
      );
    });
  });

  describe('EPSILON_MIN', () => {
    it('should be 0.001', () => {
      assert.strictEqual(EPSILON_MIN, 0.001);
    });
  });
});

// =============================================================================
// Guard Tests
// =============================================================================

describe('Signal Guard', () => {
  describe('createPresenceState', () => {
    it('should create initial state with zero connections', () => {
      const state = createPresenceState();
      assert.strictEqual(state.connected, 0);
      assert.strictEqual(state.lastSignal, null);
      assert.strictEqual(state.lastHeartbeat, null);
      assert.strictEqual(state.signalSeq, 0);
      assert.strictEqual(state.silencedUntil, null);
    });
  });

  describe('CONSTRAINT-001: Rate Limit', () => {
    it('should allow signal when no previous signal', () => {
      const presence = createPresence();
      const snapshot = createSnapshot();
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, null);
      assert.strictEqual(result.allowed, true);
    });

    it('should block signal within 1 minute of previous signal', () => {
      const now = new Date();
      const presence = createPresence({
        lastSignal: new Date(now.getTime() - 30_000).toISOString(), // 30 sec ago
      });
      const snapshot = createSnapshot({ energy: 0.6 }); // Changed
      const prevSnapshot = createSnapshot({ energy: 0.5 });
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.violation, 'RATE_LIMIT');
    });

    it('should allow signal after 1 minute', () => {
      const now = new Date();
      const presence = createPresence({
        lastSignal: new Date(now.getTime() - 61_000).toISOString(), // 61 sec ago
      });
      const snapshot = createSnapshot({ energy: 0.6 }); // Changed
      const prevSnapshot = createSnapshot({ energy: 0.5 });
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, true);
    });

    it('should have separate rate limit for heartbeat (5 min)', () => {
      const now = new Date();
      const presence = createPresence({
        lastHeartbeat: new Date(now.getTime() - 120_000).toISOString(), // 2 min ago
      });
      const snapshot = createSnapshot();
      const result = guardSignal('HEARTBEAT', presence, snapshot, null);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.violation, 'RATE_LIMIT');
    });

    it('should allow heartbeat after 5 minutes', () => {
      const now = new Date();
      const presence = createPresence({
        lastHeartbeat: new Date(now.getTime() - 301_000).toISOString(), // 5+ min ago
      });
      const snapshot = createSnapshot({ V: 0.1 }); // Not at attractor
      const result = guardSignal('HEARTBEAT', presence, snapshot, null, 0.1);
      assert.strictEqual(result.allowed, true);
    });
  });

  describe('CONSTRAINT-003: REST Dominance', () => {
    it('should block heartbeat at attractor quiescence (V=0, ε≤ε_min)', () => {
      const presence = createPresence();
      const snapshot = createSnapshot({ V: 0 });
      const result = guardSignal('HEARTBEAT', presence, snapshot, null, 0); // ε=0
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.violation, 'REST_DOMINANCE');
    });

    it('should block heartbeat when ε=ε_min', () => {
      const presence = createPresence();
      const snapshot = createSnapshot({ V: 0 });
      const result = guardSignal('HEARTBEAT', presence, snapshot, null, EPSILON_MIN);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.violation, 'REST_DOMINANCE');
    });

    it('should allow heartbeat when V>0', () => {
      const presence = createPresence();
      const snapshot = createSnapshot({ V: 0.1 });
      const result = guardSignal('HEARTBEAT', presence, snapshot, null, 0);
      assert.strictEqual(result.allowed, true);
    });

    it('should allow heartbeat when ε>ε_min', () => {
      const presence = createPresence();
      const snapshot = createSnapshot({ V: 0 });
      const result = guardSignal('HEARTBEAT', presence, snapshot, null, 0.01);
      assert.strictEqual(result.allowed, true);
    });
  });

  describe('CONSTRAINT-005: PRESENCE_SILENCE Default', () => {
    it('should block STATUS_CHANGED when nothing changed', () => {
      const presence = createPresence({
        lastSignal: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
      });
      const snapshot = createSnapshot();
      const prevSnapshot = createSnapshot(); // Same values
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.violation, 'NO_CHANGE');
    });

    it('should allow STATUS_CHANGED when energy changed', () => {
      const presence = createPresence({
        lastSignal: new Date(Date.now() - 120_000).toISOString(),
      });
      const snapshot = createSnapshot({ energy: 0.6 });
      const prevSnapshot = createSnapshot({ energy: 0.5 });
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, true);
    });

    it('should allow STATUS_CHANGED when V changed', () => {
      const presence = createPresence({
        lastSignal: new Date(Date.now() - 120_000).toISOString(),
      });
      const snapshot = createSnapshot({ V: 0.1 });
      const prevSnapshot = createSnapshot({ V: 0 });
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, true);
    });

    it('should allow STATUS_CHANGED when status changed', () => {
      const presence = createPresence({
        lastSignal: new Date(Date.now() - 120_000).toISOString(),
      });
      const snapshot = createSnapshot({ status: 'degraded' });
      const prevSnapshot = createSnapshot({ status: 'nominal' });
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, true);
    });

    it('should allow STATUS_CHANGED when invariants changed', () => {
      const presence = createPresence({
        lastSignal: new Date(Date.now() - 120_000).toISOString(),
      });
      const snapshot = createSnapshot({ invariantsSatisfied: 4 });
      const prevSnapshot = createSnapshot({ invariantsSatisfied: 5 });
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, true);
    });

    it('should allow COUPLING_REQUESTED without state change', () => {
      const presence = createPresence({
        lastSignal: new Date(Date.now() - 120_000).toISOString(),
      });
      const snapshot = createSnapshot();
      const prevSnapshot = createSnapshot();
      const result = guardSignal('COUPLING_REQUESTED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, true);
    });

    it('should allow first signal (no previous snapshot)', () => {
      const presence = createPresence();
      const snapshot = createSnapshot();
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, null);
      assert.strictEqual(result.allowed, true);
    });
  });

  describe('INV-006: Channel Silence', () => {
    it('should block all signals when channel is silenced', () => {
      const presence = createPresence({
        silencedUntil: new Date(Date.now() + 300_000).toISOString(), // 5 min from now
      });
      const snapshot = createSnapshot({ energy: 0.6 });
      const prevSnapshot = createSnapshot({ energy: 0.5 });
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.violation, 'SILENCED');
    });

    it('should allow signals after silence period expires', () => {
      const presence = createPresence({
        silencedUntil: new Date(Date.now() - 1000).toISOString(), // Expired
      });
      const snapshot = createSnapshot({ energy: 0.6 });
      const prevSnapshot = createSnapshot({ energy: 0.5 });
      const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
      assert.strictEqual(result.allowed, true);
    });
  });

  describe('silenceChannel', () => {
    it('should set silencedUntil 10 minutes in future', () => {
      const presence = createPresence();
      const silenced = silenceChannel(presence);
      const silenceEnd = new Date(silenced.silencedUntil!).getTime();
      const expected = Date.now() + RATE_LIMITS.SILENCE_DURATION_MS;
      // Allow 1 second tolerance
      assert.ok(Math.abs(silenceEnd - expected) < 1000);
    });
  });
});

// =============================================================================
// Signal Type Tests
// =============================================================================

describe('Signal Types', () => {
  const validTypes: SignalType[] = [
    'STATUS_CHANGED',
    'ENERGY_WARNING',
    'COUPLING_REQUESTED',
    'HEARTBEAT',
  ];

  it('should have exactly 4 valid signal types', () => {
    assert.strictEqual(validTypes.length, 4);
  });

  for (const type of validTypes) {
    it(`should allow ${type} signal type`, () => {
      const presence = createPresence();
      const snapshot = createSnapshot({ energy: 0.6 });
      const prevSnapshot = createSnapshot({ energy: 0.5 });
      // Just verify the guard accepts these types
      const result = guardSignal(type, presence, snapshot, prevSnapshot);
      // Result may be blocked for other reasons, but type should be valid
      assert.notStrictEqual(result.violation, 'INVALID_TYPE');
    });
  }
});

// =============================================================================
// Payload Structure Tests
// =============================================================================

describe('SignalPayload Structure', () => {
  it('should have all required fields', () => {
    const payload: SignalPayload = {
      type: 'STATUS_CHANGED',
      ts: new Date().toISOString(),
      seq: 1,
      org_hash: ORG_HASH_V2,
      state: {
        energy: 0.5,
        V: 0,
        integrity: '5/5',
      },
      coupling: {
        pending: 0,
        urgent: 0,
      },
    };

    assert.strictEqual(typeof payload.type, 'string');
    assert.strictEqual(typeof payload.ts, 'string');
    assert.strictEqual(typeof payload.seq, 'number');
    assert.strictEqual(typeof payload.org_hash, 'string');
    assert.strictEqual(typeof payload.state.energy, 'number');
    assert.strictEqual(typeof payload.state.V, 'number');
    assert.strictEqual(typeof payload.state.integrity, 'string');
    assert.strictEqual(typeof payload.coupling.pending, 'number');
    assert.strictEqual(typeof payload.coupling.urgent, 'number');
  });

  it('should have valid ISO timestamp', () => {
    const ts = new Date().toISOString();
    const parsed = new Date(ts);
    assert.ok(!isNaN(parsed.getTime()));
  });

  it('should have integrity in "N/5" format', () => {
    const integrity = '5/5';
    assert.match(integrity, /^\d\/5$/);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle zero energy', () => {
    const presence = createPresence();
    const snapshot = createSnapshot({ energy: 0 });
    const result = guardSignal('STATUS_CHANGED', presence, snapshot, null);
    assert.strictEqual(result.allowed, true);
  });

  it('should handle negative V (shouldn\'t happen but defensive)', () => {
    const presence = createPresence();
    const snapshot = createSnapshot({ V: -0.001 });
    const result = guardSignal('HEARTBEAT', presence, snapshot, null, 0.01);
    // Should allow because V !== 0
    assert.strictEqual(result.allowed, true);
  });

  it('should handle concurrent state changes', () => {
    const presence = createPresence({
      lastSignal: new Date(Date.now() - 120_000).toISOString(),
    });
    const snapshot = createSnapshot({
      energy: 0.3,
      V: 0.1,
      status: 'degraded',
      invariantsSatisfied: 4,
    });
    const prevSnapshot = createSnapshot();
    const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
    assert.strictEqual(result.allowed, true);
  });

  it('should prioritize SILENCED over other violations', () => {
    const presence = createPresence({
      silencedUntil: new Date(Date.now() + 300_000).toISOString(),
      lastSignal: new Date(Date.now() - 10_000).toISOString(), // Also rate limited
    });
    const snapshot = createSnapshot();
    const prevSnapshot = createSnapshot(); // Also no change
    const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
    // Should report SILENCED, not RATE_LIMIT or NO_CHANGE
    assert.strictEqual(result.violation, 'SILENCED');
  });
});

// =============================================================================
// Guard Priority Order Tests
// =============================================================================

describe('Guard Priority Order', () => {
  it('should check silence before rate limit', () => {
    const presence = createPresence({
      silencedUntil: new Date(Date.now() + 300_000).toISOString(),
      lastSignal: new Date().toISOString(), // Would be rate limited
    });
    const snapshot = createSnapshot({ energy: 0.6 });
    const prevSnapshot = createSnapshot({ energy: 0.5 });
    const result = guardSignal('STATUS_CHANGED', presence, snapshot, prevSnapshot);
    assert.strictEqual(result.violation, 'SILENCED');
  });

  it('should check rate limit before REST dominance', () => {
    const presence = createPresence({
      lastHeartbeat: new Date().toISOString(), // Rate limited
    });
    const snapshot = createSnapshot({ V: 0 }); // At attractor
    const result = guardSignal('HEARTBEAT', presence, snapshot, null, 0);
    assert.strictEqual(result.violation, 'RATE_LIMIT');
  });

  it('should check REST dominance before NO_CHANGE', () => {
    const now = new Date();
    const presence = createPresence({
      lastHeartbeat: new Date(now.getTime() - 400_000).toISOString(), // Not rate limited
    });
    const snapshot = createSnapshot({ V: 0 });
    const result = guardSignal('HEARTBEAT', presence, snapshot, null, 0);
    assert.strictEqual(result.violation, 'REST_DOMINANCE');
  });
});
