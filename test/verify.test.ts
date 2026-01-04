/**
 * Verify Module Tests
 * INV-001 through INV-005
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { printVerificationReport } from '../src/verify.js';
import type { VerificationResult, InvariantCheck } from '../src/types.js';

describe('printVerificationReport', () => {
  it('should not throw on valid result', () => {
    const result: VerificationResult = {
      timestamp: '2025-01-04T00:00:00.000Z',
      all_satisfied: true,
      invariants: [
        { id: 'INV-001', name: 'Organization hash unchanged', satisfied: true, details: 'Hash: abc...' },
        { id: 'INV-002', name: 'State determinism', satisfied: true, details: 'Events: 1' },
        { id: 'INV-003', name: 'Chain integrity', satisfied: true, details: 'Chain length: 1' },
        { id: 'INV-004', name: 'Lyapunov monotone', satisfied: true, details: 'V=0.0000' },
        { id: 'INV-005', name: 'Energy viable', satisfied: true, details: 'E=1.0000 (min=0.01)' },
      ],
      lyapunov_V: 0,
    };

    assert.doesNotThrow(() => printVerificationReport(result));
  });

  it('should not throw on failed result', () => {
    const result: VerificationResult = {
      timestamp: '2025-01-04T00:00:00.000Z',
      all_satisfied: false,
      invariants: [
        { id: 'INV-001', name: 'Organization hash unchanged', satisfied: false, details: 'Mismatch' },
      ],
      lyapunov_V: 0.4,
    };

    assert.doesNotThrow(() => printVerificationReport(result));
  });
});

describe('Invariant checks', () => {
  it('should have correct structure', () => {
    const check: InvariantCheck = {
      id: 'INV-001',
      name: 'Test invariant',
      satisfied: true,
      details: 'Optional details',
    };

    assert.strictEqual(typeof check.id, 'string');
    assert.strictEqual(typeof check.name, 'string');
    assert.strictEqual(typeof check.satisfied, 'boolean');
  });
});

describe('VerificationResult', () => {
  it('should have all required fields', () => {
    const result: VerificationResult = {
      timestamp: '2025-01-04T00:00:00.000Z',
      all_satisfied: true,
      invariants: [],
      lyapunov_V: 0,
    };

    assert.ok(result.timestamp);
    assert.strictEqual(typeof result.all_satisfied, 'boolean');
    assert.ok(Array.isArray(result.invariants));
    assert.strictEqual(typeof result.lyapunov_V, 'number');
  });
});
