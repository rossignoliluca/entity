/**
 * Guard Module Tests
 * AXM-011: Conservative Protection
 * DEF-029, DEF-030: Validator
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validate, guard, checkRepeatedBlocks, type Operation } from '../src/guard.js';
import type { State, Config } from '../src/types.js';
import { DEFAULT_CONFIG } from '../src/types.js';

const createState = (coupled: boolean = true, energy: number = 1.0): State => ({
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
  human: { name: 'Test', context: '' },
  important: [],
});

describe('validate', () => {
  describe('AXM-006: Conditioned Operation', () => {
    it('should block external operations when not coupled', () => {
      const state = createState(false);
      const operation: Operation = { type: 'read' };
      const result = validate(operation, state, DEFAULT_CONFIG);
      assert.strictEqual(result.status, 'block');
      if (result.status === 'block') {
        assert.strictEqual(result.axiom, 'AXM-006');
      }
    });

    it('should allow internal operations when not coupled', () => {
      const state = createState(false);
      const operation: Operation = { type: 'internal' };
      const result = validate(operation, state, DEFAULT_CONFIG);
      assert.strictEqual(result.status, 'allow');
    });

    it('should allow operations when coupled', () => {
      const state = createState(true);
      const operation: Operation = { type: 'read' };
      const result = validate(operation, state, DEFAULT_CONFIG);
      assert.strictEqual(result.status, 'allow');
    });
  });

  describe('AXM-008: Operational Boundedness', () => {
    it('should block operations exceeding complexity bound', () => {
      const state = createState(true);
      const operation: Operation = { type: 'read', complexity: 2000 };
      const result = validate(operation, state, DEFAULT_CONFIG);
      assert.strictEqual(result.status, 'block');
      if (result.status === 'block') {
        assert.strictEqual(result.axiom, 'AXM-008');
      }
    });

    it('should allow operations within complexity bound', () => {
      const state = createState(true);
      const operation: Operation = { type: 'read', complexity: 100 };
      const result = validate(operation, state, DEFAULT_CONFIG);
      assert.strictEqual(result.status, 'allow');
    });
  });

  describe('AXM-009: Possibility Preservation', () => {
    it('should block harmful patterns', () => {
      const state = createState(true);
      const harmfulOps = [
        'delete_without_backup',
        'force_overwrite',
        'remove_permissions',
        'block_access',
        'reduce_options',
      ];

      for (const type of harmfulOps) {
        const operation: Operation = { type };
        const result = validate(operation, state, DEFAULT_CONFIG);
        assert.strictEqual(result.status, 'block', `Should block ${type}`);
        if (result.status === 'block') {
          assert.strictEqual(result.axiom, 'AXM-009');
        }
      }
    });

    it('should return unknown for unclassifiable operations', () => {
      const state = createState(true);
      const operation: Operation = { type: 'unknown' };
      const result = validate(operation, state, DEFAULT_CONFIG);
      assert.strictEqual(result.status, 'unknown');
    });
  });

  describe('AXM-015: Viability', () => {
    it('should block operations that would deplete energy', () => {
      const state = createState(true, 0.02); // Low energy
      const operation: Operation = { type: 'execute', complexity: 500 };
      const result = validate(operation, state, DEFAULT_CONFIG);
      assert.strictEqual(result.status, 'block');
      if (result.status === 'block') {
        assert.strictEqual(result.axiom, 'AXM-015');
      }
    });

    it('should allow operations when energy is sufficient', () => {
      const state = createState(true, 1.0);
      const operation: Operation = { type: 'read' };
      const result = validate(operation, state, DEFAULT_CONFIG);
      assert.strictEqual(result.status, 'allow');
    });
  });
});

describe('guard (conservative validator)', () => {
  it('should convert unknown to block (AXM-011)', () => {
    const state = createState(true);
    const operation: Operation = { type: 'unknown' };
    const { allowed, result } = guard(operation, state, DEFAULT_CONFIG);
    assert.strictEqual(allowed, false);
    assert.strictEqual(result.status, 'unknown');
  });

  it('should allow valid operations', () => {
    const state = createState(true);
    const operation: Operation = { type: 'read' };
    const { allowed, result } = guard(operation, state, DEFAULT_CONFIG);
    assert.strictEqual(allowed, true);
    assert.strictEqual(result.status, 'allow');
  });

  it('should block invalid operations', () => {
    const state = createState(true);
    const operation: Operation = { type: 'delete_without_backup' };
    const { allowed, result } = guard(operation, state, DEFAULT_CONFIG);
    assert.strictEqual(allowed, false);
    assert.strictEqual(result.status, 'block');
  });
});

describe('checkRepeatedBlocks', () => {
  it('should not trigger below threshold', () => {
    const result = checkRepeatedBlocks(DEFAULT_CONFIG);
    assert.strictEqual(result.triggered, false);
  });
});
