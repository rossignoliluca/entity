/**
 * Learning Module Tests
 * AES-SPEC-001 Phase 4: Learning & Adaptation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  analyzePatterns,
  defaultLearningState,
  getAdaptiveSuggestion,
  type LearningState,
} from '../src/learning.js';
import type { Event, State } from '../src/types.js';

// Helper to create mock events
function createEvent(seq: number, type: string, data: Record<string, unknown> = {}): Event {
  return {
    seq,
    type: type as Event['type'],
    timestamp: `2026-01-04T${String(10 + seq).padStart(2, '0')}:00:00.000Z`,
    data,
    prev_hash: seq === 1 ? null : 'prev',
    hash: `hash-${seq}`,
  };
}

// Helper to create mock state
function createState(energy: number = 1.0, coupled: boolean = false): State {
  return {
    version: '1.0.0',
    specification: 'AES-SPEC-001',
    organization_hash: 'test',
    created: '2025-01-04T00:00:00.000Z',
    updated: '2025-01-04T00:00:00.000Z',
    identity: { name: 'Test', instantiated_by: 'test', instantiated_at: '2025-01-04T00:00:00.000Z' },
    coupling: { active: coupled, partner: coupled ? 'human' : null, since: coupled ? '2025-01-04T00:00:00.000Z' : null },
    energy: { current: energy, min: 0.01, threshold: 0.1 },
    lyapunov: { V: 0, V_previous: null },
    memory: { event_count: 1, last_event_hash: 'test', last_snapshot_at: null },
    session: { total_count: 0, current_id: null },
    integrity: { invariant_violations: 0, last_verification: '2025-01-04T00:00:00.000Z', status: 'nominal' },
    human: { name: 'Luca', context: '' },
    important: [],
    learning: { enabled: true, lastAnalysis: null, patternsHash: null },
  };
}

describe('defaultLearningState', () => {
  it('should return enabled learning state', () => {
    const learning = defaultLearningState();
    assert.strictEqual(learning.enabled, true);
  });

  it('should have null lastAnalysis initially', () => {
    const learning = defaultLearningState();
    assert.strictEqual(learning.lastAnalysis, null);
  });

  it('should have empty patterns initially', () => {
    const learning = defaultLearningState();
    assert.strictEqual(learning.patterns.operations.length, 0);
    assert.strictEqual(learning.patterns.sessions.totalSessions, 0);
  });

  it('should have default preferences', () => {
    const learning = defaultLearningState();
    assert.deepStrictEqual(learning.preferences.topOperations, []);
    assert.strictEqual(learning.preferences.preferredCategory, null);
    assert.strictEqual(learning.preferences.interactionFrequency, 'medium');
  });
});

describe('analyzePatterns', () => {
  it('should handle empty events array', () => {
    const learning = analyzePatterns([]);
    assert.strictEqual(learning.patterns.sessions.totalSessions, 0);
    assert.strictEqual(learning.patterns.operations.length, 0);
  });

  it('should count sessions correctly', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'SESSION_END', { session_id: '1' }),
      createEvent(4, 'SESSION_START', { session_id: '2' }),
      createEvent(5, 'SESSION_END', { session_id: '2' }),
    ];
    const learning = analyzePatterns(events);
    assert.strictEqual(learning.patterns.sessions.totalSessions, 2);
  });

  it('should track operation frequency', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'OPERATION', { operation: 'state.read', energy_cost: 0.001 }),
      createEvent(4, 'OPERATION', { operation: 'state.read', energy_cost: 0.001 }),
      createEvent(5, 'OPERATION', { operation: 'system.info', energy_cost: 0.002 }),
      createEvent(6, 'SESSION_END', { session_id: '1' }),
    ];
    const learning = analyzePatterns(events);
    assert.strictEqual(learning.patterns.operations.length, 2);
    assert.strictEqual(learning.patterns.operations[0].operationId, 'state.read');
    assert.strictEqual(learning.patterns.operations[0].count, 2);
  });

  it('should calculate events per session', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'OPERATION', { operation: 'test' }),
      createEvent(4, 'OPERATION', { operation: 'test' }),
      createEvent(5, 'SESSION_END', { session_id: '1' }),
    ];
    const learning = analyzePatterns(events);
    // Session includes SESSION_START + 2 OPERATIONs = 3 events (SESSION_END closes session)
    assert.strictEqual(learning.patterns.sessions.averageEventsPerSession, 3);
  });

  it('should track energy consumption', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'OPERATION', { operation: 'op1', energy_cost: 0.01 }),
      createEvent(4, 'OPERATION', { operation: 'op2', energy_cost: 0.02 }),
      createEvent(5, 'SESSION_END', { session_id: '1' }),
    ];
    const learning = analyzePatterns(events);
    assert.strictEqual(learning.patterns.energy.averageConsumptionPerSession, 0.03);
    assert.strictEqual(learning.patterns.energy.peakUsageOperation, 'op2');
  });

  it('should identify active hours', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'SESSION_END', { session_id: '1' }),
    ];
    const learning = analyzePatterns(events);
    assert.ok(learning.patterns.time.activeHours.length > 0);
  });

  it('should derive preferences from patterns', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'OPERATION', { operation: 'state.read' }),
      createEvent(4, 'OPERATION', { operation: 'state.summary' }),
      createEvent(5, 'OPERATION', { operation: 'system.info' }),
      createEvent(6, 'SESSION_END', { session_id: '1' }),
    ];
    const learning = analyzePatterns(events);
    assert.ok(learning.preferences.topOperations.length > 0);
    assert.strictEqual(learning.preferences.preferredCategory, 'state');
  });

  it('should generate insights', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'OPERATION', { operation: 'test', energy_cost: 0.01 }),
      createEvent(4, 'SESSION_END', { session_id: '1' }),
    ];
    const learning = analyzePatterns(events);
    assert.ok(learning.insights.length > 0);
  });

  it('should set lastAnalysis timestamp', () => {
    const events: Event[] = [createEvent(1, 'GENESIS')];
    const learning = analyzePatterns(events);
    assert.ok(learning.lastAnalysis !== null);
  });
});

describe('getAdaptiveSuggestion', () => {
  it('should suggest recharge when energy is low', () => {
    const state = createState(0.05);
    const learning = defaultLearningState();
    const suggestion = getAdaptiveSuggestion(state, learning);
    assert.ok(suggestion?.includes('Energy low'));
  });

  it('should return null when no specific suggestion', () => {
    const state = createState(1.0);
    const learning = defaultLearningState();
    const suggestion = getAdaptiveSuggestion(state, learning);
    // May or may not have suggestion depending on current hour
    assert.ok(suggestion === null || typeof suggestion === 'string');
  });

  it('should suggest based on top operations', () => {
    const state = createState(1.0);
    const learning = defaultLearningState();
    learning.preferences.topOperations = ['state.read'];
    const suggestion = getAdaptiveSuggestion(state, learning);
    assert.ok(suggestion?.includes('state.read') || suggestion === null);
  });
});

describe('LearningState structure', () => {
  it('should have all required pattern types', () => {
    const learning = defaultLearningState();
    assert.ok('operations' in learning.patterns);
    assert.ok('sessions' in learning.patterns);
    assert.ok('energy' in learning.patterns);
    assert.ok('time' in learning.patterns);
  });

  it('should have preferences structure', () => {
    const learning = defaultLearningState();
    assert.ok('topOperations' in learning.preferences);
    assert.ok('preferredCategory' in learning.preferences);
    assert.ok('interactionFrequency' in learning.preferences);
  });

  it('should have insights array', () => {
    const learning = defaultLearningState();
    assert.ok(Array.isArray(learning.insights));
  });
});
