/**
 * Rollback Module Tests
 * AES-SPEC-001 - Category 3: Boundary Interface
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createRollbackStore,
  createRollbackEntry,
  addRollbackEntry,
  getPendingEntries,
  getRollbackEntry,
  executeRollback,
  blockRollback,
  expireOldEntries,
  isReversibleOperation,
  getRollbackSummary,
  DEFAULT_ROLLBACK_CONFIG,
  type RollbackStore,
  type RollbackEntry,
} from '../src/rollback.js';
import type { State } from '../src/types.js';

// Mock state for testing
function createMockState(overrides?: Partial<State>): State {
  return {
    version: '1.0.0',
    specification: 'AES-SPEC-001',
    organization_hash: 'test-hash',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-05T00:00:00.000Z',
    identity: {
      name: 'Test Entity',
      instantiated_by: 'Test',
      instantiated_at: '2026-01-01T00:00:00.000Z',
    },
    coupling: {
      active: false,
      partner: null,
      since: null,
    },
    energy: {
      current: 0.5,
      min: 0.01,
      threshold: 0.1,
    },
    lyapunov: {
      V: 0,
      V_previous: null,
    },
    memory: {
      event_count: 100,
      last_event_hash: 'hash123',
      last_snapshot_at: null,
    },
    session: {
      total_count: 10,
      current_id: null,
    },
    integrity: {
      invariant_violations: 0,
      last_verification: '2026-01-05T00:00:00.000Z',
      status: 'nominal',
    },
    human: {
      name: 'Test User',
      context: '',
    },
    important: ['Memory 1', 'Memory 2'],
    learning: {
      enabled: true,
      lastAnalysis: null,
      patternsHash: null,
    },
    ...overrides,
  };
}

describe('Rollback Module', () => {
  describe('createRollbackStore', () => {
    it('should create store with default config', () => {
      const store = createRollbackStore();
      assert.strictEqual(store.entries.length, 0);
      assert.strictEqual(store.config.enabled, true);
      assert.strictEqual(store.config.ttlMs, 60 * 60 * 1000);
      assert.strictEqual(store.config.maxEntries, 50);
    });

    it('should accept custom config', () => {
      const store = createRollbackStore({ ttlMs: 30 * 60 * 1000 });
      assert.strictEqual(store.config.ttlMs, 30 * 60 * 1000);
    });

    it('should initialize metrics to zero', () => {
      const store = createRollbackStore();
      assert.strictEqual(store.metrics.totalCreated, 0);
      assert.strictEqual(store.metrics.totalExecuted, 0);
      assert.strictEqual(store.metrics.totalExpired, 0);
      assert.strictEqual(store.metrics.totalBlocked, 0);
    });
  });

  describe('isReversibleOperation', () => {
    it('should return true for memory.add', () => {
      assert.strictEqual(isReversibleOperation('memory.add'), true);
    });

    it('should return true for memory.clear', () => {
      assert.strictEqual(isReversibleOperation('memory.clear'), true);
    });

    it('should return false for state.read', () => {
      assert.strictEqual(isReversibleOperation('state.read'), false);
    });

    it('should return false for unknown operation', () => {
      assert.strictEqual(isReversibleOperation('unknown.op'), false);
    });
  });

  describe('createRollbackEntry', () => {
    it('should create entry for reversible operation', () => {
      const before = { important: ['Memory 1'] };
      const after = { important: ['Memory 1', 'Memory 2'] };

      const entry = createRollbackEntry(
        'memory.add',
        'Add Memory',
        100,
        before as Partial<State>,
        after as Partial<State>,
        { memory: 'Memory 2' }
      );

      assert.ok(entry);
      assert.strictEqual(entry.operationId, 'memory.add');
      assert.strictEqual(entry.operationName, 'Add Memory');
      assert.strictEqual(entry.eventSeq, 100);
      assert.strictEqual(entry.status, 'pending');
      assert.ok(entry.id);
      assert.ok(entry.timestamp);
      assert.ok(entry.expiresAt);
    });

    it('should return null for non-reversible operation', () => {
      const entry = createRollbackEntry(
        'state.read',
        'Read State',
        100,
        {},
        {},
        {}
      );

      assert.strictEqual(entry, null);
    });

    it('should set expiration based on TTL', () => {
      const entry = createRollbackEntry(
        'memory.add',
        'Add Memory',
        100,
        { important: [] },
        { important: ['Test'] },
        {}
      );

      assert.ok(entry);
      const created = new Date(entry.timestamp).getTime();
      const expires = new Date(entry.expiresAt).getTime();
      const ttl = expires - created;

      assert.strictEqual(ttl, DEFAULT_ROLLBACK_CONFIG.ttlMs);
    });
  });

  describe('addRollbackEntry', () => {
    let store: RollbackStore;

    beforeEach(() => {
      store = createRollbackStore();
    });

    it('should add entry to store', () => {
      const entry = createRollbackEntry(
        'memory.add',
        'Add Memory',
        100,
        { important: [] },
        { important: ['Test'] },
        {}
      );

      assert.ok(entry);
      addRollbackEntry(store, entry);

      assert.strictEqual(store.entries.length, 1);
      assert.strictEqual(store.metrics.totalCreated, 1);
    });

    it('should enforce max entries limit', () => {
      const smallStore = createRollbackStore({ maxEntries: 3 });

      for (let i = 0; i < 5; i++) {
        const entry = createRollbackEntry(
          'memory.add',
          `Add Memory ${i}`,
          100 + i,
          { important: [] },
          { important: [`Memory ${i}`] },
          {}
        );
        if (entry) addRollbackEntry(smallStore, entry);
      }

      assert.strictEqual(smallStore.entries.length, 3);
    });
  });

  describe('getPendingEntries', () => {
    it('should return only pending entries', () => {
      const store = createRollbackStore();

      const entry1 = createRollbackEntry('memory.add', 'Add 1', 100, { important: [] }, { important: ['1'] }, {});
      const entry2 = createRollbackEntry('memory.add', 'Add 2', 101, { important: ['1'] }, { important: ['1', '2'] }, {});

      if (entry1) addRollbackEntry(store, entry1);
      if (entry2) {
        entry2.status = 'executed';
        addRollbackEntry(store, entry2);
      }

      const pending = getPendingEntries(store);
      assert.strictEqual(pending.length, 1);
      assert.strictEqual(pending[0].operationName, 'Add 1');
    });
  });

  describe('executeRollback', () => {
    let store: RollbackStore;
    let state: State;

    beforeEach(() => {
      store = createRollbackStore();
      state = createMockState({ important: ['Memory 1', 'Memory 2'] });
    });

    it('should execute rollback and return compensation', () => {
      const entry = createRollbackEntry(
        'memory.add',
        'Add Memory',
        100,
        { important: ['Memory 1'] },
        { important: ['Memory 1', 'Memory 2'] },
        { memory: 'Memory 2' }
      );

      assert.ok(entry);
      addRollbackEntry(store, entry);

      const result = executeRollback(store, entry.id, state);

      assert.strictEqual(result.success, true);
      assert.ok(result.compensation);
      assert.deepStrictEqual(result.compensation.important, ['Memory 1']);
      assert.strictEqual(result.entry?.status, 'executed');
    });

    it('should fail for non-existent entry', () => {
      const result = executeRollback(store, 'nonexistent', state);

      assert.strictEqual(result.success, false);
      assert.ok(result.message.includes('not found'));
    });

    it('should fail for already executed entry', () => {
      const entry = createRollbackEntry(
        'memory.add',
        'Add Memory',
        100,
        { important: [] },
        { important: ['Test'] },
        {}
      );

      assert.ok(entry);
      entry.status = 'executed';
      addRollbackEntry(store, entry);

      const result = executeRollback(store, entry.id, state);

      assert.strictEqual(result.success, false);
      assert.ok(result.message.includes('executed'));
    });

    it('should block if state has changed', () => {
      const entry = createRollbackEntry(
        'memory.add',
        'Add Memory',
        100,
        { important: ['Memory 1'] },
        { important: ['Memory 1', 'Memory 2'] },
        {}
      );

      assert.ok(entry);
      addRollbackEntry(store, entry);

      // State now has different memories
      const changedState = createMockState({ important: ['Memory 1', 'Memory 2', 'Memory 3'] });

      const result = executeRollback(store, entry.id, changedState);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.entry?.status, 'blocked');
      assert.ok(result.entry?.blockedReason?.includes('changed'));
    });

    it('should update metrics on execution', () => {
      const entry = createRollbackEntry(
        'memory.add',
        'Add Memory',
        100,
        { important: ['Memory 1'] },
        { important: ['Memory 1', 'Memory 2'] },
        {}
      );

      assert.ok(entry);
      addRollbackEntry(store, entry);

      executeRollback(store, entry.id, state);

      assert.strictEqual(store.metrics.totalExecuted, 1);
    });
  });

  describe('blockRollback', () => {
    it('should block a pending entry', () => {
      const store = createRollbackStore();
      const entry = createRollbackEntry('memory.add', 'Add', 100, { important: [] }, { important: ['1'] }, {});

      assert.ok(entry);
      addRollbackEntry(store, entry);

      const result = blockRollback(store, entry.id, 'Guard blocked');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.entry?.status, 'blocked');
      assert.strictEqual(result.entry?.blockedReason, 'Guard blocked');
      assert.strictEqual(store.metrics.totalBlocked, 1);
    });

    it('should fail for non-pending entry', () => {
      const store = createRollbackStore();
      const entry = createRollbackEntry('memory.add', 'Add', 100, { important: [] }, { important: ['1'] }, {});

      assert.ok(entry);
      entry.status = 'executed';
      addRollbackEntry(store, entry);

      const result = blockRollback(store, entry.id, 'Test');

      assert.strictEqual(result.success, false);
    });
  });

  describe('expireOldEntries', () => {
    it('should expire entries past TTL', () => {
      const store = createRollbackStore({ ttlMs: 100 }); // 100ms TTL

      const entry = createRollbackEntry('memory.add', 'Add', 100, { important: [] }, { important: ['1'] }, {}, store.config);

      assert.ok(entry);
      // Manually set expiration to past
      entry.expiresAt = new Date(Date.now() - 1000).toISOString();
      store.entries.push(entry);

      const expired = expireOldEntries(store);

      assert.strictEqual(expired, 1);
      assert.strictEqual(entry.status, 'expired');
      assert.strictEqual(store.metrics.totalExpired, 1);
    });
  });

  describe('getRollbackSummary', () => {
    it('should return correct summary', () => {
      const store = createRollbackStore();

      const entry1 = createRollbackEntry('memory.add', 'Add 1', 100, { important: [] }, { important: ['1'] }, {});
      const entry2 = createRollbackEntry('memory.add', 'Add 2', 101, { important: [] }, { important: ['2'] }, {});

      if (entry1) addRollbackEntry(store, entry1);
      if (entry2) {
        entry2.status = 'executed';
        addRollbackEntry(store, entry2);
      }

      const summary = getRollbackSummary(store);

      assert.strictEqual(summary.pending, 1);
      assert.strictEqual(summary.executed, 1);
      assert.strictEqual(summary.enabled, true);
      assert.strictEqual(summary.ttlMinutes, 60);
    });
  });
});

describe('Rollback Compensation', () => {
  describe('memory.add compensation', () => {
    it('should restore previous memories array', () => {
      const store = createRollbackStore();
      const state = createMockState({ important: ['Memory 1', 'Memory 2'] });

      const entry = createRollbackEntry(
        'memory.add',
        'Add Memory',
        100,
        { important: ['Memory 1'] },
        { important: ['Memory 1', 'Memory 2'] },
        { memory: 'Memory 2' }
      );

      assert.ok(entry);
      addRollbackEntry(store, entry);

      const result = executeRollback(store, entry.id, state);

      assert.ok(result.compensation);
      assert.deepStrictEqual(result.compensation.important, ['Memory 1']);
    });
  });

  describe('memory.clear compensation', () => {
    it('should restore cleared memories', () => {
      const store = createRollbackStore();
      const state = createMockState({ important: [] });

      const entry = createRollbackEntry(
        'memory.clear',
        'Clear Memories',
        100,
        { important: ['Memory 1', 'Memory 2', 'Memory 3'] },
        { important: [] },
        { confirm: true }
      );

      assert.ok(entry);
      addRollbackEntry(store, entry);

      const result = executeRollback(store, entry.id, state);

      assert.ok(result.compensation);
      assert.deepStrictEqual(result.compensation.important, ['Memory 1', 'Memory 2', 'Memory 3']);
    });
  });
});

describe('Rollback Guard Protection', () => {
  it('should block rollback when state has changed', () => {
    const store = createRollbackStore();

    const entry = createRollbackEntry(
      'memory.add',
      'Add Memory',
      100,
      { important: ['Original'] },
      { important: ['Original', 'Added'] },
      {}
    );

    assert.ok(entry);
    addRollbackEntry(store, entry);

    // State has been modified since operation
    const modifiedState = createMockState({
      important: ['Original', 'Added', 'Another']
    });

    const result = executeRollback(store, entry.id, modifiedState);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.entry?.status, 'blocked');
  });
});

describe('Rollback TTL', () => {
  it('should respect TTL configuration', () => {
    const shortTTL = 1000; // 1 second
    const entry = createRollbackEntry(
      'memory.add',
      'Add',
      100,
      { important: [] },
      { important: ['1'] },
      {},
      { ...DEFAULT_ROLLBACK_CONFIG, ttlMs: shortTTL }
    );

    assert.ok(entry);
    const created = new Date(entry.timestamp).getTime();
    const expires = new Date(entry.expiresAt).getTime();

    assert.strictEqual(expires - created, shortTTL);
  });
});
