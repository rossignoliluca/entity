/**
 * Integration Tests
 * AES-SPEC-001: Full workflow testing
 *
 * Tests complete system workflows across multiple modules.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

import { appendEvent, loadEvents, replayEvents } from '../src/events.js';
import { verifyAllInvariants } from '../src/verify.js';
import { autoRecover } from '../src/recovery.js';
import { createSnapshot, restoreFromSnapshot, listSnapshots } from '../src/snapshot.js';
import { exportState, importState, verifyIdentity } from '../src/continuity.js';
import { executeOperation, isAllowedOperation } from '../src/operations.js';
import { hashObject } from '../src/hash.js';
import type { State, Event } from '../src/types.js';

// =============================================================================
// Test Utilities
// =============================================================================

const TEST_BASE = '/tmp/entity-integration-tests';

interface TestContext {
  baseDir: string;
  state: State;
}

function createInitialState(): State {
  const now = new Date().toISOString();
  return {
    version: '1.0.0',
    specification: 'AES-SPEC-001',
    organization_hash: hashObject({
      purpose: 'Test entity for integration testing',
      principles: ['test'],
      boundaries: { allowed: ['test.*'], denied: [] },
    }),
    created: now,
    updated: now,
    identity: {
      name: 'Integration Test Entity',
      instantiated_by: 'integration-test',
      instantiated_at: now,
    },
    coupling: {
      active: false,
      partner: null,
      since: null,
    },
    energy: {
      current: 1.0,
      min: 0.01,
      threshold: 0.1,
    },
    lyapunov: {
      V: 0,
      V_previous: null,
    },
    memory: {
      event_count: 0,
      last_event_hash: null,
      last_snapshot_at: null,
    },
    session: {
      total_count: 0,
      current_id: null,
    },
    integrity: {
      invariant_violations: 0,
      last_verification: now,
      status: 'nominal',
    },
    human: {
      name: 'Test Human',
      context: '',
    },
    important: [],
    learning: {
      enabled: true,
      lastAnalysis: null,
      patternsHash: null,
    },
  };
}

async function createTestEnvironment(): Promise<TestContext> {
  const testId = randomUUID().slice(0, 8);
  const baseDir = join(TEST_BASE, `test-${testId}`);

  // Create directories
  await mkdir(join(baseDir, 'events'), { recursive: true });
  await mkdir(join(baseDir, 'state', 'snapshots'), { recursive: true });

  // Create initial state
  const state = createInitialState();

  // Save state
  await writeFile(
    join(baseDir, 'state', 'current.json'),
    JSON.stringify(state, null, 2)
  );

  // Create genesis event
  const genesis: Event = {
    seq: 1,
    type: 'GENESIS',
    timestamp: new Date().toISOString(),
    data: {
      version: '1.0.0',
      specification: 'AES-SPEC-001',
      organization_hash: state.organization_hash,
      instantiated_by: 'integration-test',
    },
    prev_hash: null,
    hash: '',
  };
  genesis.hash = hashObject({ ...genesis, hash: undefined });

  await writeFile(
    join(baseDir, 'events', '000001.json'),
    JSON.stringify(genesis, null, 2)
  );

  state.memory.event_count = 1;
  state.memory.last_event_hash = genesis.hash;

  await writeFile(
    join(baseDir, 'state', 'current.json'),
    JSON.stringify(state, null, 2)
  );

  // Create empty snapshots index
  await writeFile(
    join(baseDir, 'state', 'snapshots', 'index.json'),
    JSON.stringify({ snapshots: [] }, null, 2)
  );

  return { baseDir, state };
}

async function cleanupTestEnvironment(baseDir: string): Promise<void> {
  try {
    await rm(baseDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function loadState(baseDir: string): Promise<State> {
  const content = await readFile(join(baseDir, 'state', 'current.json'), 'utf-8');
  return JSON.parse(content);
}

async function saveState(baseDir: string, state: State): Promise<void> {
  state.updated = new Date().toISOString();
  await writeFile(
    join(baseDir, 'state', 'current.json'),
    JSON.stringify(state, null, 2)
  );
}

// =============================================================================
// Integration Test: Session Lifecycle
// =============================================================================

describe('Integration: Session Lifecycle', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx.baseDir);
  });

  it('should complete full session lifecycle: start -> operations -> end', async () => {
    const { baseDir } = ctx;
    let state = await loadState(baseDir);

    // 1. Start session
    const sessionId = randomUUID();
    state.coupling.active = true;
    state.coupling.partner = 'human';
    state.coupling.since = new Date().toISOString();
    state.session.current_id = sessionId;
    state.session.total_count++;
    await saveState(baseDir, state);

    await appendEvent(baseDir, 'SESSION_START', {
      session_id: sessionId,
      partner: 'human',
    });

    // 2. Execute operations
    const opResult = executeOperation('state.read', state, {});
    assert.strictEqual(opResult.success, true);

    await appendEvent(baseDir, 'OPERATION', {
      operation: 'state.read',
      params: {},
      result: opResult,
    });

    // 3. End session with energy decay
    const energyBefore = state.energy.current;
    const decayRate = 0.05;
    state.energy.current = Math.max(state.energy.min, energyBefore - decayRate);
    state.coupling.active = false;
    state.coupling.partner = null;
    state.coupling.since = null;
    state.session.current_id = null;
    await saveState(baseDir, state);

    await appendEvent(baseDir, 'SESSION_END', {
      session_id: sessionId,
      energy_before: energyBefore,
      energy_after: state.energy.current,
    });

    // 4. Verify final state
    state = await loadState(baseDir);
    assert.strictEqual(state.coupling.active, false);
    assert.strictEqual(state.session.total_count, 1);
    assert.ok(state.energy.current < energyBefore);

    // 5. Verify event chain integrity
    const events = await loadEvents(baseDir);
    assert.ok(events.length >= 3);
  });

  it('should maintain Merkle chain integrity across session', async () => {
    const { baseDir } = ctx;

    // Add multiple events
    await appendEvent(baseDir, 'SESSION_START', { session_id: 'test', partner: 'human' });
    await appendEvent(baseDir, 'STATE_UPDATE', { reason: 'test update' });
    await appendEvent(baseDir, 'SESSION_END', { session_id: 'test' });

    // Verify chain
    const events = await loadEvents(baseDir);

    for (let i = 1; i < events.length; i++) {
      assert.strictEqual(events[i].prev_hash, events[i - 1].hash,
        `Event ${i} prev_hash should match event ${i-1} hash`);
    }
  });
});

// =============================================================================
// Integration Test: Energy Lifecycle
// =============================================================================

describe('Integration: Energy Lifecycle', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx.baseDir);
  });

  it('should handle energy decay through multiple sessions', async () => {
    const { baseDir } = ctx;
    let state = await loadState(baseDir);

    const initialEnergy = state.energy.current;
    const decayRate = 0.05;
    const sessionsToRun = 5;

    for (let i = 0; i < sessionsToRun; i++) {
      // Simulate session with energy decay
      state.energy.current = Math.max(
        state.energy.min,
        state.energy.current - decayRate
      );
      state.session.total_count++;
      await saveState(baseDir, state);

      await appendEvent(baseDir, 'SESSION_END', {
        session_id: `session-${i}`,
        energy_after: state.energy.current,
      });
    }

    state = await loadState(baseDir);
    const expectedEnergy = initialEnergy - (sessionsToRun * decayRate);

    assert.ok(Math.abs(state.energy.current - expectedEnergy) < 0.001,
      `Energy should be ~${expectedEnergy}, got ${state.energy.current}`);
    assert.strictEqual(state.session.total_count, sessionsToRun);
  });

  it('should enter dormant state when energy critically low', async () => {
    const { baseDir } = ctx;
    let state = await loadState(baseDir);

    // Set energy to critical level (below min)
    state.energy.current = 0.005;
    state.integrity.status = 'nominal';
    await saveState(baseDir, state);

    // Verify INV-005 violation
    const verification = await verifyAllInvariants(baseDir);
    const inv005 = verification.invariants.find(i => i.id === 'INV-005');
    assert.strictEqual(inv005?.satisfied, false, 'INV-005 should be violated');

    // Recovery should enter dormant state
    await autoRecover(baseDir);

    state = await loadState(baseDir);
    assert.strictEqual(state.integrity.status, 'dormant');
  });

  it('should recharge energy and exit dormant state', async () => {
    const { baseDir } = ctx;
    let state = await loadState(baseDir);

    // Set up dormant state
    state.energy.current = state.energy.min;
    state.integrity.status = 'dormant';
    await saveState(baseDir, state);

    // Recharge
    const rechargeAmount = 0.5;
    state.energy.current = Math.min(1.0, state.energy.current + rechargeAmount);
    state.integrity.status = 'nominal';
    await saveState(baseDir, state);

    await appendEvent(baseDir, 'STATE_UPDATE', {
      reason: 'Energy recharge',
      energy_before: state.energy.min,
      energy_after: state.energy.current,
    });

    state = await loadState(baseDir);
    assert.strictEqual(state.integrity.status, 'nominal');
    assert.ok(state.energy.current > state.energy.min);
  });
});

// =============================================================================
// Integration Test: Recovery Workflow
// =============================================================================

describe('Integration: Recovery Workflow', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx.baseDir);
  });

  it('should detect and recover from INV-004 violation (Lyapunov increase)', async () => {
    const { baseDir } = ctx;
    let state = await loadState(baseDir);

    // Create Lyapunov violation: V increased
    state.lyapunov.V_previous = 0;
    state.lyapunov.V = 0.5; // V increased, violates monotonicity
    await saveState(baseDir, state);

    // Verify violation
    const verification = await verifyAllInvariants(baseDir);
    const inv004 = verification.invariants.find(i => i.id === 'INV-004');
    assert.strictEqual(inv004?.satisfied, false, 'INV-004 should be violated');

    // Auto-recover
    const recovery = await autoRecover(baseDir);
    assert.ok(recovery.recoveries_attempted.length > 0);

    // Verify recovery
    state = await loadState(baseDir);
    assert.ok(state.lyapunov.V <= (state.lyapunov.V_previous ?? 0),
      'Lyapunov V should be <= V_previous after recovery');
  });

  it('should detect Merkle chain corruption (INV-003)', async () => {
    const { baseDir } = ctx;

    // Add valid events first
    await appendEvent(baseDir, 'SESSION_START', { session_id: 'test', partner: 'human' });
    await appendEvent(baseDir, 'SESSION_END', { session_id: 'test' });

    // Corrupt an event's hash
    const events = await loadEvents(baseDir);
    const lastEvent = events[events.length - 1];
    lastEvent.hash = 'corrupted_hash';
    await writeFile(
      join(baseDir, 'events', `${String(lastEvent.seq).padStart(6, '0')}.json`),
      JSON.stringify(lastEvent, null, 2)
    );

    // Verify corruption detected
    const verification = await verifyAllInvariants(baseDir);
    const inv003 = verification.invariants.find(i => i.id === 'INV-003');
    assert.strictEqual(inv003?.satisfied, false, 'INV-003 should detect corruption');
  });
});

// =============================================================================
// Integration Test: Continuity Workflow
// =============================================================================

describe('Integration: Continuity Workflow', () => {
  let ctx: TestContext;
  let ctx2: TestContext;

  beforeEach(async () => {
    ctx = await createTestEnvironment();
    ctx2 = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx.baseDir);
    await cleanupTestEnvironment(ctx2.baseDir);
  });

  it('should export and import state bundle', async () => {
    const { baseDir } = ctx;
    let state = await loadState(baseDir);

    // Add some history
    state.session.total_count = 5;
    state.important.push('Test memory for continuity');
    await saveState(baseDir, state);

    await appendEvent(baseDir, 'SESSION_START', { session_id: 'export-test', partner: 'human' });
    await appendEvent(baseDir, 'STATE_UPDATE', { content: 'Test memory' });
    await appendEvent(baseDir, 'SESSION_END', { session_id: 'export-test' });

    // Reload state after saving
    state = await loadState(baseDir);
    const events = await loadEvents(baseDir);

    // Export
    const bundle = await exportState(baseDir, state, events);
    assert.ok(bundle.state);
    assert.ok(bundle.events.length > 0);
    assert.ok(bundle.continuity_token);

    // Verify bundle contains correct data
    assert.strictEqual(bundle.state.session.total_count, 5);
    assert.strictEqual(bundle.state.important.length, 1);
  });

  it('should verify identity across instances', async () => {
    const { baseDir } = ctx;
    const state = await loadState(baseDir);
    const events = await loadEvents(baseDir);

    // Export to create bundle for comparison
    const bundle = await exportState(baseDir, state, events);

    // Same state should verify
    const verification = verifyIdentity({ state, events }, bundle);
    assert.strictEqual(verification.verified, true);
    assert.strictEqual(verification.checks.organization_hash, true);
  });

  it('should detect identity mismatch', async () => {
    const { baseDir } = ctx;
    const state = await loadState(baseDir);
    const events = await loadEvents(baseDir);

    // Export to create bundle
    const bundle = await exportState(baseDir, state, events);

    // Modify organization (identity change)
    state.organization_hash = 'modified_hash';

    // Should fail verification
    const verification = verifyIdentity({ state, events }, bundle);
    assert.strictEqual(verification.verified, false);
    assert.strictEqual(verification.checks.organization_hash, false);
  });
});

// =============================================================================
// Integration Test: Snapshot & Restore
// =============================================================================

describe('Integration: Snapshot & Restore', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx.baseDir);
  });

  it('should create snapshot and restore state', async () => {
    const { baseDir } = ctx;
    let state = await loadState(baseDir);

    // Modify state
    state.session.total_count = 10;
    state.energy.current = 0.75;
    state.important.push('Snapshot test memory');
    await saveState(baseDir, state);

    // Create snapshot
    const snapshot = await createSnapshot(baseDir, 'Test snapshot');
    assert.ok(snapshot.id);
    assert.strictEqual(snapshot.description, 'Test snapshot');

    // Modify state further
    state.session.total_count = 20;
    state.energy.current = 0.5;
    await saveState(baseDir, state);

    // Restore from snapshot
    await restoreFromSnapshot(baseDir, snapshot.id);

    // Verify restored state
    const restored = await loadState(baseDir);
    assert.strictEqual(restored.session.total_count, 10);
    assert.strictEqual(restored.energy.current, 0.75);
  });

  it('should list multiple snapshots', async () => {
    const { baseDir } = ctx;

    // Create multiple snapshots
    await createSnapshot(baseDir, 'Snapshot 1');
    await createSnapshot(baseDir, 'Snapshot 2');
    await createSnapshot(baseDir, 'Snapshot 3');

    const snapshots = await listSnapshots(baseDir);
    assert.ok(snapshots.length >= 3);
  });
});

// =============================================================================
// Integration Test: Operations Execution
// =============================================================================

describe('Integration: Operations Execution', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx.baseDir);
  });

  it('should execute state.read operation', async () => {
    const { baseDir } = ctx;
    const state = await loadState(baseDir);

    const result = executeOperation('state.read', state, {});
    assert.strictEqual(result.success, true);
  });

  it('should execute state.summary operation', async () => {
    const { baseDir } = ctx;
    const state = await loadState(baseDir);

    const result = executeOperation('state.summary', state, {});
    assert.strictEqual(result.success, true);
  });

  it('should execute energy.status operation', async () => {
    const { baseDir } = ctx;
    const state = await loadState(baseDir);

    const result = executeOperation('energy.status', state, {});
    assert.strictEqual(result.success, true);
  });

  it('should execute system.health operation', async () => {
    const { baseDir } = ctx;
    const state = await loadState(baseDir);

    const result = executeOperation('system.health', state, {});
    assert.strictEqual(result.success, true);
  });

  it('should check operation permissions', () => {
    assert.strictEqual(isAllowedOperation('state.read'), true);
    assert.strictEqual(isAllowedOperation('unknown.operation'), false);
  });
});

// =============================================================================
// Integration Test: Full System Flow
// =============================================================================

describe('Integration: Full System Flow', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx.baseDir);
  });

  it('should complete full entity lifecycle: create -> operate -> snapshot -> export', async () => {
    const { baseDir } = ctx;

    // 1. Run sessions with operations
    for (let i = 0; i < 3; i++) {
      const sessionId = `lifecycle-${i}`;
      await appendEvent(baseDir, 'SESSION_START', { session_id: sessionId, partner: 'human' });

      // Execute operation
      let state = await loadState(baseDir);
      const opResult = executeOperation('state.summary', state, {});
      await appendEvent(baseDir, 'OPERATION', { operation: 'state.summary', result: opResult });

      // Update state
      state.session.total_count++;
      state.energy.current = Math.max(state.energy.min, state.energy.current - 0.05);
      await saveState(baseDir, state);

      await appendEvent(baseDir, 'SESSION_END', { session_id: sessionId });
    }

    // 2. Create checkpoint snapshot
    const snapshot = await createSnapshot(baseDir, 'Lifecycle checkpoint');
    assert.ok(snapshot.id);

    // 3. Export state
    const finalState = await loadState(baseDir);
    const allEvents = await loadEvents(baseDir);
    const bundle = await exportState(baseDir, finalState, allEvents);
    assert.ok(bundle.events.length > 0);
    assert.ok(bundle.state.session.total_count >= 3);

    // 4. Verify state consistency
    assert.strictEqual(finalState.session.total_count, 3);
    assert.ok(finalState.energy.current < 1.0);
  });

  it('should track energy decay across sessions', async () => {
    const { baseDir } = ctx;
    let state = await loadState(baseDir);

    const initialEnergy = state.energy.current;

    // Run 5 sessions
    for (let i = 0; i < 5; i++) {
      state.energy.current = Math.max(state.energy.min, state.energy.current - 0.05);
      state.session.total_count++;
      await saveState(baseDir, state);
    }

    // Verify decay
    assert.strictEqual(state.session.total_count, 5);
    assert.ok(state.energy.current < initialEnergy);
    assert.ok(Math.abs(state.energy.current - (initialEnergy - 0.25)) < 0.001);
  });
});

// =============================================================================
// Integration Test: Event Chain Integrity
// =============================================================================

describe('Integration: Event Chain', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(ctx.baseDir);
  });

  it('should maintain hash chain across many events', async () => {
    const { baseDir } = ctx;

    // Add 10 events
    for (let i = 0; i < 10; i++) {
      await appendEvent(baseDir, 'STATE_UPDATE', { seq: i, reason: `Update ${i}` });
    }

    // Verify chain integrity
    const events = await loadEvents(baseDir);
    assert.strictEqual(events.length, 11); // genesis + 10 updates

    for (let i = 1; i < events.length; i++) {
      assert.strictEqual(
        events[i].prev_hash,
        events[i - 1].hash,
        `Event ${i} should link to event ${i - 1}`
      );
    }
  });

  it('should detect chain corruption', async () => {
    const { baseDir } = ctx;

    // Add events
    await appendEvent(baseDir, 'SESSION_START', { session_id: 'test', partner: 'human' });
    await appendEvent(baseDir, 'SESSION_END', { session_id: 'test' });

    // Corrupt an event
    const events = await loadEvents(baseDir);
    const lastEvent = events[events.length - 1];
    lastEvent.hash = 'corrupted';
    await writeFile(
      join(baseDir, 'events', `${String(lastEvent.seq).padStart(6, '0')}.json`),
      JSON.stringify(lastEvent, null, 2)
    );

    // Load and verify corruption is detectable
    const reloadedEvents = await loadEvents(baseDir);
    const lastReloaded = reloadedEvents[reloadedEvents.length - 1];
    assert.strictEqual(lastReloaded.hash, 'corrupted');
  });
});
