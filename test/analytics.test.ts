/**
 * Analytics Module Tests
 * AES-SPEC-001 Phase 5: Analytics & Insights
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeSessionMetrics,
  computeEnergyMetrics,
  computeInvariantMetrics,
  computeInteractionMetrics,
  generateTimeline,
  generateAlerts,
  generateDashboard,
  getQuickSummary,
  exportMetrics,
} from '../src/analytics.js';
import type { Event, State } from '../src/types.js';

// Helper to create mock events
function createEvent(seq: number, type: string, data: Record<string, unknown> = {}): Event {
  return {
    seq,
    type: type as Event['type'],
    timestamp: `2026-01-04T${String(10 + Math.floor(seq / 10)).padStart(2, '0')}:${String((seq % 10) * 5).padStart(2, '0')}:00.000Z`,
    data,
    prev_hash: seq === 1 ? null : 'prev',
    hash: `hash-${seq}`,
  };
}

// Helper to create mock state
function createState(energy: number = 0.5): State {
  return {
    version: '1.0.0',
    specification: 'AES-SPEC-001',
    organization_hash: 'test',
    created: '2025-01-04T00:00:00.000Z',
    updated: '2025-01-04T00:00:00.000Z',
    identity: { name: 'Test', instantiated_by: 'test', instantiated_at: '2025-01-04T00:00:00.000Z' },
    coupling: { active: false, partner: null, since: null },
    energy: { current: energy, min: 0.01, threshold: 0.1 },
    lyapunov: { V: 0, V_previous: null },
    memory: { event_count: 1, last_event_hash: 'test', last_snapshot_at: null },
    session: { total_count: 5, current_id: null },
    integrity: { invariant_violations: 0, last_verification: '2025-01-04T00:00:00.000Z', status: 'nominal' },
    human: { name: 'Test', context: '' },
    important: [],
    learning: { enabled: true, lastAnalysis: null, patternsHash: null },
  };
}

describe('computeSessionMetrics', () => {
  it('should handle empty events', () => {
    const metrics = computeSessionMetrics([]);
    assert.strictEqual(metrics.total, 0);
    assert.strictEqual(metrics.avgEventsPerSession, 0);
  });

  it('should count sessions correctly', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'SESSION_END', { session_id: '1' }),
      createEvent(4, 'SESSION_START', { session_id: '2' }),
      createEvent(5, 'SESSION_END', { session_id: '2' }),
    ];
    const metrics = computeSessionMetrics(events);
    assert.strictEqual(metrics.total, 2);
  });

  it('should calculate average events per session', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'OPERATION', { operation: 'test' }),
      createEvent(4, 'OPERATION', { operation: 'test' }),
      createEvent(5, 'SESSION_END', { session_id: '1' }),
    ];
    const metrics = computeSessionMetrics(events);
    assert.strictEqual(metrics.avgEventsPerSession, 3); // START + 2 OPS
  });

  it('should find longest and shortest sessions', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'SESSION_END', { session_id: '1' }),
      createEvent(4, 'SESSION_START', { session_id: '2' }),
      createEvent(5, 'OPERATION', {}),
      createEvent(6, 'OPERATION', {}),
      createEvent(7, 'SESSION_END', { session_id: '2' }),
    ];
    const metrics = computeSessionMetrics(events);
    assert.strictEqual(metrics.longestSessionEvents, 3);
    assert.strictEqual(metrics.shortestSessionEvents, 1);
  });

  it('should detect trend', () => {
    const events: Event[] = [
      createEvent(1, 'GENESIS'),
      createEvent(2, 'SESSION_START', { session_id: '1' }),
      createEvent(3, 'SESSION_END', { session_id: '1' }),
    ];
    const metrics = computeSessionMetrics(events);
    assert.ok(['increasing', 'stable', 'decreasing'].includes(metrics.trend));
  });
});

describe('computeEnergyMetrics', () => {
  it('should report current energy', () => {
    const state = createState(0.75);
    const metrics = computeEnergyMetrics([], state);
    assert.strictEqual(metrics.current, 0.75);
  });

  it('should calculate total consumption', () => {
    const events: Event[] = [
      createEvent(1, 'SESSION_START', {}),
      createEvent(2, 'OPERATION', { operation: 'test', energy_cost: 0.01 }),
      createEvent(3, 'OPERATION', { operation: 'test', energy_cost: 0.02 }),
      createEvent(4, 'SESSION_END', {}),
    ];
    const state = createState();
    const metrics = computeEnergyMetrics(events, state);
    assert.strictEqual(metrics.totalConsumed, 0.03);
  });

  it('should count recharges', () => {
    const events: Event[] = [
      createEvent(1, 'STATE_UPDATE', { recharge_amount: 0.1 }),
      createEvent(2, 'STATE_UPDATE', { recharge_amount: 0.1 }),
    ];
    const state = createState();
    const metrics = computeEnergyMetrics(events, state);
    assert.strictEqual(metrics.rechargeCount, 2);
    assert.strictEqual(metrics.totalRecharged, 0.2);
  });

  it('should determine health status', () => {
    const healthyState = createState(0.5);
    const warningState = createState(0.08);
    const criticalState = createState(0.015);

    assert.strictEqual(computeEnergyMetrics([], healthyState).healthStatus, 'healthy');
    assert.strictEqual(computeEnergyMetrics([], warningState).healthStatus, 'warning');
    assert.strictEqual(computeEnergyMetrics([], criticalState).healthStatus, 'critical');
  });
});

describe('computeInvariantMetrics', () => {
  it('should count verifications', () => {
    const events: Event[] = [
      createEvent(1, 'VERIFICATION', { all_satisfied: true }),
      createEvent(2, 'VERIFICATION', { all_satisfied: true }),
      createEvent(3, 'VERIFICATION', { all_satisfied: false }),
    ];
    const metrics = computeInvariantMetrics(events);
    assert.strictEqual(metrics.totalVerifications, 3);
  });

  it('should calculate success rate', () => {
    const events: Event[] = [
      createEvent(1, 'VERIFICATION', { all_satisfied: true }),
      createEvent(2, 'VERIFICATION', { all_satisfied: true }),
      createEvent(3, 'VERIFICATION', { all_satisfied: false }),
    ];
    const metrics = computeInvariantMetrics(events);
    assert.ok(Math.abs(metrics.successRate - 2/3) < 0.01);
  });

  it('should track violation history', () => {
    const events: Event[] = [
      createEvent(1, 'VERIFICATION', { all_satisfied: false }),
    ];
    const metrics = computeInvariantMetrics(events);
    assert.strictEqual(metrics.violationHistory.length, 1);
  });

  it('should calculate health score', () => {
    const events: Event[] = [
      createEvent(1, 'VERIFICATION', { all_satisfied: true }),
    ];
    const metrics = computeInvariantMetrics(events);
    assert.strictEqual(metrics.healthScore, 100);
  });
});

describe('computeInteractionMetrics', () => {
  it('should count operations', () => {
    const events: Event[] = [
      createEvent(1, 'OPERATION', { operation: 'test1' }),
      createEvent(2, 'OPERATION', { operation: 'test2' }),
    ];
    const metrics = computeInteractionMetrics(events);
    assert.strictEqual(metrics.totalOperations, 2);
  });

  it('should count blocked operations', () => {
    const events: Event[] = [
      createEvent(1, 'OPERATION', { operation: 'test' }),
      createEvent(2, 'BLOCK', { reason: 'test' }),
      createEvent(3, 'BLOCK', { reason: 'test' }),
    ];
    const metrics = computeInteractionMetrics(events);
    assert.strictEqual(metrics.blockedOperations, 2);
  });

  it('should group by category', () => {
    const events: Event[] = [
      createEvent(1, 'OPERATION', { operation: 'state.read' }),
      createEvent(2, 'OPERATION', { operation: 'state.summary' }),
      createEvent(3, 'OPERATION', { operation: 'system.info' }),
    ];
    const metrics = computeInteractionMetrics(events);
    assert.strictEqual(metrics.operationsByCategory['state'], 2);
    assert.strictEqual(metrics.operationsByCategory['system'], 1);
  });

  it('should rank top operations', () => {
    const events: Event[] = [
      createEvent(1, 'OPERATION', { operation: 'state.read' }),
      createEvent(2, 'OPERATION', { operation: 'state.read' }),
      createEvent(3, 'OPERATION', { operation: 'system.info' }),
    ];
    const metrics = computeInteractionMetrics(events);
    assert.strictEqual(metrics.topOperations[0].id, 'state.read');
    assert.strictEqual(metrics.topOperations[0].count, 2);
  });
});

describe('generateTimeline', () => {
  it('should include milestones', () => {
    const events: Event[] = [
      createEvent(1, 'SESSION_START', { session_id: '1' }),
    ];
    const timeline = generateTimeline(events);
    assert.ok(timeline.some((e) => e.type === 'milestone'));
  });

  it('should include recharges', () => {
    const events: Event[] = [
      createEvent(1, 'STATE_UPDATE', { recharge_amount: 0.1 }),
    ];
    const timeline = generateTimeline(events);
    assert.ok(timeline.some((e) => e.type === 'recharge'));
  });

  it('should include violations', () => {
    const events: Event[] = [
      createEvent(1, 'VERIFICATION', { all_satisfied: false }),
    ];
    const timeline = generateTimeline(events);
    assert.ok(timeline.some((e) => e.type === 'violation'));
  });
});

describe('generateAlerts', () => {
  it('should alert on critical energy', () => {
    const state = createState(0.015);
    const alerts = generateAlerts([], state);
    assert.ok(alerts.some((a) => a.level === 'critical' && a.message.includes('Energy')));
  });

  it('should alert on warning energy', () => {
    const state = createState(0.08);
    const alerts = generateAlerts([], state);
    assert.ok(alerts.some((a) => a.level === 'warning' && a.message.includes('Energy')));
  });

  it('should alert on degraded status', () => {
    const state = createState();
    state.integrity.status = 'degraded';
    const alerts = generateAlerts([], state);
    assert.ok(alerts.some((a) => a.message.includes('degraded')));
  });

  it('should alert on dormant status', () => {
    const state = createState();
    state.integrity.status = 'dormant';
    const alerts = generateAlerts([], state);
    assert.ok(alerts.some((a) => a.level === 'critical' && a.message.includes('dormant')));
  });
});

describe('generateDashboard', () => {
  it('should include all sections', () => {
    const events: Event[] = [createEvent(1, 'GENESIS')];
    const state = createState();
    const dashboard = generateDashboard(events, state);

    assert.ok('session' in dashboard);
    assert.ok('energy' in dashboard);
    assert.ok('invariants' in dashboard);
    assert.ok('interactions' in dashboard);
    assert.ok('timeline' in dashboard);
    assert.ok('alerts' in dashboard);
    assert.ok('generated' in dashboard);
  });
});

describe('getQuickSummary', () => {
  it('should return summary string', () => {
    const events: Event[] = [createEvent(1, 'GENESIS')];
    const state = createState();
    const dashboard = generateDashboard(events, state);
    const summary = getQuickSummary(dashboard);

    assert.ok(typeof summary === 'string');
    assert.ok(summary.includes('Sessions'));
    assert.ok(summary.includes('Energy'));
  });
});

describe('exportMetrics', () => {
  it('should return valid JSON', () => {
    const events: Event[] = [createEvent(1, 'GENESIS')];
    const state = createState();
    const dashboard = generateDashboard(events, state);
    const json = exportMetrics(dashboard);

    const parsed = JSON.parse(json);
    assert.ok(typeof parsed === 'object');
    assert.ok('session' in parsed);
  });
});
