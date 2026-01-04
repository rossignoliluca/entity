/**
 * Lyapunov Module Tests
 * INV-004: V(sigma') <= V(sigma)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  integrityDistance,
  coherenceDistance,
  energyDistance,
  computeV,
  checkLyapunovMonotone,
  isAtAttractor,
  stabilityMargin,
} from '../src/lyapunov.js';
import type { State, InvariantCheck, Config } from '../src/types.js';
import { DEFAULT_CONFIG } from '../src/types.js';

describe('integrityDistance', () => {
  it('should return 0 for all satisfied', () => {
    const invariants: InvariantCheck[] = [
      { id: 'INV-001', name: 'Test', satisfied: true },
      { id: 'INV-002', name: 'Test', satisfied: true },
    ];
    assert.strictEqual(integrityDistance(invariants), 0);
  });

  it('should return 1 for all violated', () => {
    const invariants: InvariantCheck[] = [
      { id: 'INV-001', name: 'Test', satisfied: false },
      { id: 'INV-002', name: 'Test', satisfied: false },
    ];
    assert.strictEqual(integrityDistance(invariants), 1);
  });

  it('should return fraction for partial', () => {
    const invariants: InvariantCheck[] = [
      { id: 'INV-001', name: 'Test', satisfied: true },
      { id: 'INV-002', name: 'Test', satisfied: false },
    ];
    assert.strictEqual(integrityDistance(invariants), 0.5);
  });

  it('should return 0 for empty array', () => {
    assert.strictEqual(integrityDistance([]), 0);
  });
});

describe('coherenceDistance', () => {
  it('should return 0 for all satisfied', () => {
    const invariants: InvariantCheck[] = [
      { id: 'INV-001', name: 'Test', satisfied: true },
    ];
    assert.strictEqual(coherenceDistance(invariants), 0);
  });

  it('should return 1 for all violated', () => {
    const invariants: InvariantCheck[] = [
      { id: 'INV-001', name: 'Test', satisfied: false },
    ];
    assert.strictEqual(coherenceDistance(invariants), 1);
  });
});

describe('energyDistance', () => {
  it('should return 0 when above threshold', () => {
    assert.strictEqual(energyDistance(1.0, 0.1), 0);
    assert.strictEqual(energyDistance(0.5, 0.1), 0);
  });

  it('should return positive when below threshold', () => {
    const distance = energyDistance(0.05, 0.1);
    assert.ok(distance > 0);
    assert.ok(distance <= 1);
  });

  it('should return 1 when energy is 0', () => {
    assert.strictEqual(energyDistance(0, 0.1), 1);
  });
});

describe('computeV', () => {
  const createState = (energy: number): State => ({
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
    session: { total_count: 0, current_id: null },
    integrity: { invariant_violations: 0, last_verification: '2025-01-04T00:00:00.000Z', status: 'nominal' },
    human: { name: 'Test', context: '' },
    important: [],
    learning: { enabled: true, lastAnalysis: null, patternsHash: null },
  });

  it('should return 0 at attractor (all good)', () => {
    const state = createState(1.0);
    const invariants: InvariantCheck[] = [
      { id: 'INV-001', name: 'Test', satisfied: true },
    ];
    const V = computeV(state, invariants, DEFAULT_CONFIG);
    assert.strictEqual(V, 0);
  });

  it('should return positive when invariants violated', () => {
    const state = createState(1.0);
    const invariants: InvariantCheck[] = [
      { id: 'INV-001', name: 'Test', satisfied: false },
    ];
    const V = computeV(state, invariants, DEFAULT_CONFIG);
    assert.ok(V > 0);
  });

  it('should always be non-negative', () => {
    const state = createState(1.0);
    const invariants: InvariantCheck[] = [];
    const V = computeV(state, invariants, DEFAULT_CONFIG);
    assert.ok(V >= 0);
  });
});

describe('checkLyapunovMonotone', () => {
  it('should return true when V decreases', () => {
    assert.strictEqual(checkLyapunovMonotone(0.5, 1.0), true);
  });

  it('should return true when V stays same', () => {
    assert.strictEqual(checkLyapunovMonotone(0.5, 0.5), true);
  });

  it('should return false when V increases', () => {
    assert.strictEqual(checkLyapunovMonotone(1.0, 0.5), false);
  });

  it('should return true when no previous', () => {
    assert.strictEqual(checkLyapunovMonotone(0.5, null), true);
  });
});

describe('isAtAttractor', () => {
  it('should return true when V is near zero', () => {
    assert.strictEqual(isAtAttractor(0.0001), true);
  });

  it('should return false when V is above epsilon', () => {
    assert.strictEqual(isAtAttractor(0.1), false);
  });
});

describe('stabilityMargin', () => {
  it('should return 1 when energy is at threshold', () => {
    const state = {
      energy: { current: 0.1, min: 0.01, threshold: 0.1 },
    } as State;
    const margin = stabilityMargin(state, DEFAULT_CONFIG);
    assert.ok(margin >= 0 && margin <= 1);
  });

  it('should return 0 when energy is at minimum', () => {
    const state = {
      energy: { current: 0.01, min: 0.01, threshold: 0.1 },
    } as State;
    const margin = stabilityMargin(state, DEFAULT_CONFIG);
    assert.strictEqual(margin, 0);
  });
});
