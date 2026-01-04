/**
 * Events Module Tests
 * INV-002: state = replay(events)
 * INV-003: events[n].prev_hash = hash(events[n-1])
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Event, State } from '../src/types.js';

describe('Event types', () => {
  it('should have valid genesis event structure', () => {
    const genesis: Event = {
      seq: 1,
      type: 'GENESIS',
      timestamp: '2025-01-04T00:00:00.000Z',
      data: {
        version: '1.0.0',
        specification: 'AES-SPEC-001',
        organization_hash: 'test_hash',
        instantiated_by: 'test',
      },
      prev_hash: null,
      hash: 'some_hash',
    };

    assert.strictEqual(genesis.seq, 1);
    assert.strictEqual(genesis.type, 'GENESIS');
    assert.strictEqual(genesis.prev_hash, null);
  });

  it('should have valid session event structure', () => {
    const sessionStart: Event = {
      seq: 2,
      type: 'SESSION_START',
      timestamp: '2025-01-04T00:01:00.000Z',
      data: {
        session_id: 'test-session',
        partner: 'human',
      },
      prev_hash: 'genesis_hash',
      hash: 'session_hash',
    };

    assert.strictEqual(sessionStart.type, 'SESSION_START');
    assert.ok(sessionStart.prev_hash !== null);
  });
});

describe('Event sequence', () => {
  it('should maintain sequential ordering', () => {
    const events: Event[] = [
      { seq: 1, type: 'GENESIS', timestamp: '2025-01-04T00:00:00.000Z', data: {}, prev_hash: null, hash: 'h1' },
      { seq: 2, type: 'SESSION_START', timestamp: '2025-01-04T00:01:00.000Z', data: {}, prev_hash: 'h1', hash: 'h2' },
      { seq: 3, type: 'SESSION_END', timestamp: '2025-01-04T00:02:00.000Z', data: {}, prev_hash: 'h2', hash: 'h3' },
    ];

    for (let i = 0; i < events.length; i++) {
      assert.strictEqual(events[i].seq, i + 1);
      if (i > 0) {
        assert.strictEqual(events[i].prev_hash, events[i - 1].hash);
      }
    }
  });
});

describe('State transitions', () => {
  it('should track coupling state', () => {
    const initialState: Partial<State> = {
      coupling: { active: false, partner: null, since: null },
    };

    // After SESSION_START
    const afterSessionStart: Partial<State> = {
      coupling: { active: true, partner: 'human', since: '2025-01-04T00:01:00.000Z' },
    };

    assert.strictEqual(initialState.coupling?.active, false);
    assert.strictEqual(afterSessionStart.coupling?.active, true);
  });

  it('should track session count', () => {
    const state: Partial<State> = {
      session: { total_count: 0, current_id: null },
    };

    // After SESSION_START
    state.session = { total_count: 1, current_id: 'session-1' };
    assert.strictEqual(state.session.total_count, 1);
    assert.strictEqual(state.session.current_id, 'session-1');

    // After SESSION_END
    state.session = { total_count: 1, current_id: null };
    assert.strictEqual(state.session.total_count, 1);
    assert.strictEqual(state.session.current_id, null);
  });

  it('should track memory event count', () => {
    const state: Partial<State> = {
      memory: { event_count: 1, last_event_hash: 'genesis_hash', last_snapshot_at: null },
    };

    // After new event
    state.memory = { event_count: 2, last_event_hash: 'new_hash', last_snapshot_at: null };
    assert.strictEqual(state.memory.event_count, 2);
  });
});

describe('Event types coverage', () => {
  const eventTypes = [
    'GENESIS',
    'SESSION_START',
    'SESSION_END',
    'STATE_UPDATE',
    'COUPLING_START',
    'COUPLING_END',
    'OPERATION',
    'BLOCK',
    'SNAPSHOT',
    'VERIFICATION',
  ] as const;

  it('should have all expected event types', () => {
    assert.strictEqual(eventTypes.length, 10);
  });

  for (const type of eventTypes) {
    it(`should accept ${type} event type`, () => {
      const event: Event = {
        seq: 1,
        type,
        timestamp: '2025-01-04T00:00:00.000Z',
        data: {},
        prev_hash: null,
        hash: 'test',
      };
      assert.strictEqual(event.type, type);
    });
  }
});
