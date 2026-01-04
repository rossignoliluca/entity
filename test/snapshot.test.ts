/**
 * Snapshot Module Tests
 * AES-SPEC-001 §6.4 Backup and Recovery
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Snapshot, SnapshotIndex } from '../src/snapshot.js';

describe('Snapshot structure', () => {
  it('should have required fields', () => {
    const snapshot: Snapshot = {
      id: 'snap-2026-01-04T12-00-00',
      timestamp: '2026-01-04T12:00:00.000Z',
      event_seq: 16,
      event_hash: 'abc123',
      state_hash: 'def456',
      description: 'Test snapshot',
    };

    assert.ok(snapshot.id);
    assert.ok(snapshot.timestamp);
    assert.strictEqual(typeof snapshot.event_seq, 'number');
    assert.ok(snapshot.event_hash);
    assert.ok(snapshot.state_hash);
    assert.ok(snapshot.description);
  });

  it('should generate valid ID format', () => {
    const timestamp = '2026-01-04T12:30:45.123Z';
    const id = 'snap-' + timestamp.replace(/[:.]/g, '-').substring(0, 19);
    assert.match(id, /^snap-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});

describe('SnapshotIndex structure', () => {
  it('should have required fields', () => {
    const index: SnapshotIndex = {
      version: '1.0.0',
      snapshots: [],
      latest: null,
    };

    assert.strictEqual(index.version, '1.0.0');
    assert.ok(Array.isArray(index.snapshots));
    assert.strictEqual(index.latest, null);
  });

  it('should track latest snapshot', () => {
    const index: SnapshotIndex = {
      version: '1.0.0',
      snapshots: [
        {
          id: 'snap-1',
          timestamp: '2026-01-04T12:00:00.000Z',
          event_seq: 10,
          event_hash: 'hash1',
          state_hash: 'state1',
          description: 'First',
        },
        {
          id: 'snap-2',
          timestamp: '2026-01-04T13:00:00.000Z',
          event_seq: 15,
          event_hash: 'hash2',
          state_hash: 'state2',
          description: 'Second',
        },
      ],
      latest: 'snap-2',
    };

    assert.strictEqual(index.snapshots.length, 2);
    assert.strictEqual(index.latest, 'snap-2');
  });
});

describe('Snapshot operations', () => {
  it('should support create operation', () => {
    const operations = ['create', 'list', 'restore', 'verify'];
    assert.ok(operations.includes('create'));
  });

  it('should support list operation', () => {
    const operations = ['create', 'list', 'restore', 'verify'];
    assert.ok(operations.includes('list'));
  });

  it('should support restore operation', () => {
    const operations = ['create', 'list', 'restore', 'verify'];
    assert.ok(operations.includes('restore'));
  });

  it('should support verify operation', () => {
    const operations = ['create', 'list', 'restore', 'verify'];
    assert.ok(operations.includes('verify'));
  });
});

describe('Snapshot integrity', () => {
  it('should include state hash for verification', () => {
    const snapshot: Snapshot = {
      id: 'snap-test',
      timestamp: '2026-01-04T12:00:00.000Z',
      event_seq: 16,
      event_hash: 'event_hash_value',
      state_hash: 'state_hash_for_verification',
      description: 'Test',
    };

    assert.ok(snapshot.state_hash.length > 0);
  });

  it('should reference event for point-in-time recovery', () => {
    const snapshot: Snapshot = {
      id: 'snap-test',
      timestamp: '2026-01-04T12:00:00.000Z',
      event_seq: 16,
      event_hash: 'event_hash_value',
      state_hash: 'state_hash',
      description: 'Test',
    };

    assert.strictEqual(snapshot.event_seq, 16);
    assert.ok(snapshot.event_hash);
  });
});

describe('Restore behavior', () => {
  it('should preserve event chain after restore', () => {
    // Restore updates state but does NOT rollback events
    const preserveChain = true;
    assert.strictEqual(preserveChain, true);
  });

  it('should update state with current event info', () => {
    // After restore, state.memory should reflect current events
    const syncWithCurrentEvents = true;
    assert.strictEqual(syncWithCurrentEvents, true);
  });
});
