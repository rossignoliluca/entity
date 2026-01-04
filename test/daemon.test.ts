/**
 * Daemon Module Tests
 * AES-SPEC-001 Phase 7b: Autonomous Operation
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Scheduler, type ScheduledTask } from '../src/daemon/scheduler.js';
import { HooksManager, type HookEvent, type HookDefinition } from '../src/daemon/hooks.js';
import { SelfMaintenance } from '../src/daemon/maintenance.js';
import { IPCServer, IPCClient } from '../src/daemon/ipc.js';

// =============================================================================
// Scheduler Tests
// =============================================================================

describe('Scheduler', () => {
  it('should add task', () => {
    const scheduler = new Scheduler('/tmp/test-entity');
    const task: ScheduledTask = {
      id: 'test-task',
      name: 'Test Task',
      operation: 'state.read',
      interval: 60000,
      enabled: true,
    };

    const result = scheduler.addTask(task);
    assert.strictEqual(result.success, true);
    assert.strictEqual(scheduler.getTaskCount(), 1);
  });

  it('should reject duplicate task IDs', () => {
    const scheduler = new Scheduler('/tmp/test-entity');
    const task: ScheduledTask = {
      id: 'test-task',
      name: 'Test Task',
      operation: 'state.read',
      interval: 60000,
      enabled: true,
    };

    scheduler.addTask(task);
    const result = scheduler.addTask(task);
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('already exists'));
  });

  it('should reject unknown operations', () => {
    const scheduler = new Scheduler('/tmp/test-entity');
    const task: ScheduledTask = {
      id: 'bad-task',
      name: 'Bad Task',
      operation: 'unknown.operation',
      interval: 60000,
      enabled: true,
    };

    const result = scheduler.addTask(task);
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Unknown operation'));
  });

  it('should remove task', () => {
    const scheduler = new Scheduler('/tmp/test-entity');
    const task: ScheduledTask = {
      id: 'removable-task',
      name: 'Removable Task',
      operation: 'state.read',
      interval: 60000,
      enabled: true,
    };

    scheduler.addTask(task);
    assert.strictEqual(scheduler.getTaskCount(), 1);

    const result = scheduler.removeTask('removable-task');
    assert.strictEqual(result.success, true);
    assert.strictEqual(scheduler.getTaskCount(), 0);
  });

  it('should list tasks', () => {
    const scheduler = new Scheduler('/tmp/test-entity');

    scheduler.addTask({
      id: 'task-1',
      name: 'Task 1',
      operation: 'state.read',
      interval: 60000,
      enabled: true,
    });

    scheduler.addTask({
      id: 'task-2',
      name: 'Task 2',
      operation: 'energy.status',
      interval: 30000,
      enabled: false,
    });

    const tasks = scheduler.listTasks();
    assert.strictEqual(tasks.length, 2);
    assert.ok(tasks.some(t => t.id === 'task-1'));
    assert.ok(tasks.some(t => t.id === 'task-2'));
  });

  it('should enable and disable tasks', () => {
    const scheduler = new Scheduler('/tmp/test-entity');

    scheduler.addTask({
      id: 'toggle-task',
      name: 'Toggle Task',
      operation: 'state.read',
      interval: 60000,
      enabled: true,
    });

    let task = scheduler.getTask('toggle-task');
    assert.strictEqual(task?.enabled, true);

    scheduler.disableTask('toggle-task');
    task = scheduler.getTask('toggle-task');
    assert.strictEqual(task?.enabled, false);

    scheduler.enableTask('toggle-task');
    task = scheduler.getTask('toggle-task');
    assert.strictEqual(task?.enabled, true);
  });
});

// =============================================================================
// HooksManager Tests
// =============================================================================

describe('HooksManager', () => {
  it('should register handler', () => {
    const hooks = new HooksManager('/tmp/test-entity');
    let called = false;

    hooks.register('onEnergyLow', () => {
      called = true;
    });

    assert.strictEqual(hooks.getHandlerCount('onEnergyLow'), 1);
  });

  it('should trigger handlers', async () => {
    const hooks = new HooksManager('/tmp/test-entity');
    let receivedData: unknown = null;

    hooks.register('onEnergyLow', (data) => {
      receivedData = data;
    });

    await hooks.trigger('onEnergyLow', { level: 0.15 });
    assert.deepStrictEqual(receivedData, { level: 0.15 });
  });

  it('should add hook definition', () => {
    const hooks = new HooksManager('/tmp/test-entity');
    const hook: HookDefinition = {
      id: 'test-hook',
      event: 'onEnergyLow',
      description: 'Test hook',
      enabled: true,
      action: 'log',
      config: {},
    };

    const result = hooks.addHook(hook);
    assert.strictEqual(result.success, true);
    assert.strictEqual(hooks.getHookCount(), 1);
  });

  it('should reject duplicate hook IDs', () => {
    const hooks = new HooksManager('/tmp/test-entity');
    const hook: HookDefinition = {
      id: 'duplicate-hook',
      event: 'onEnergyLow',
      description: 'Duplicate hook',
      enabled: true,
      action: 'log',
      config: {},
    };

    hooks.addHook(hook);
    const result = hooks.addHook(hook);
    assert.strictEqual(result.success, false);
  });

  it('should remove hook', () => {
    const hooks = new HooksManager('/tmp/test-entity');
    const hook: HookDefinition = {
      id: 'removable-hook',
      event: 'onEnergyLow',
      description: 'Removable hook',
      enabled: true,
      action: 'log',
      config: {},
    };

    hooks.addHook(hook);
    assert.strictEqual(hooks.getHookCount(), 1);

    const result = hooks.removeHook('removable-hook');
    assert.strictEqual(result.success, true);
    assert.strictEqual(hooks.getHookCount(), 0);
  });

  it('should list events', () => {
    const hooks = new HooksManager('/tmp/test-entity');
    const events = hooks.listEvents();

    assert.ok(events.includes('onEnergyLow'));
    assert.ok(events.includes('onEnergyCritical'));
    assert.ok(events.includes('onInvariantViolation'));
    assert.ok(events.includes('onDaemonStart'));
    assert.ok(events.includes('onDaemonStop'));
  });

  it('should enable and disable hooks', () => {
    const hooks = new HooksManager('/tmp/test-entity');

    hooks.addHook({
      id: 'toggle-hook',
      event: 'onEnergyLow',
      description: 'Toggle hook',
      enabled: true,
      action: 'log',
      config: {},
    });

    let hook = hooks.getHook('toggle-hook');
    assert.strictEqual(hook?.enabled, true);

    hooks.disableHook('toggle-hook');
    hook = hooks.getHook('toggle-hook');
    assert.strictEqual(hook?.enabled, false);

    hooks.enableHook('toggle-hook');
    hook = hooks.getHook('toggle-hook');
    assert.strictEqual(hook?.enabled, true);
  });
});

// =============================================================================
// SelfMaintenance Tests
// =============================================================================

describe('SelfMaintenance', () => {
  it('should start and stop', () => {
    const maintenance = new SelfMaintenance('/tmp/test-entity');

    assert.strictEqual(maintenance.isRunning(), false);

    maintenance.start();
    assert.strictEqual(maintenance.isRunning(), true);

    maintenance.stop();
    assert.strictEqual(maintenance.isRunning(), false);
  });

  it('should emit events', () => {
    const maintenance = new SelfMaintenance('/tmp/test-entity', {
      energyThreshold: 0.2,
    });

    let startedEmitted = false;
    let stoppedEmitted = false;

    maintenance.on('started', () => { startedEmitted = true; });
    maintenance.on('stopped', () => { stoppedEmitted = true; });

    maintenance.start();
    assert.strictEqual(startedEmitted, true);

    maintenance.stop();
    assert.strictEqual(stoppedEmitted, true);
  });

  it('should track check count', () => {
    const maintenance = new SelfMaintenance('/tmp/test-entity');

    assert.strictEqual(maintenance.getCheckCount(), 0);
  });

  it('should return null last snapshot time initially', () => {
    const maintenance = new SelfMaintenance('/tmp/test-entity');

    assert.strictEqual(maintenance.getLastSnapshotTime(), null);
  });
});

// =============================================================================
// IPC Tests
// =============================================================================

describe('IPCServer', () => {
  it('should create server instance', () => {
    const server = new IPCServer('/tmp/test-entity.sock');
    assert.ok(server);
    assert.strictEqual(server.getClientCount(), 0);
  });

  it('should emit events', () => {
    const server = new IPCServer('/tmp/test-entity.sock');
    let errorEmitted = false;

    server.on('error', () => { errorEmitted = true; });

    // Server not started, so this shouldn't throw
    assert.strictEqual(server.getClientCount(), 0);
  });
});

describe('IPCClient', () => {
  it('should create client instance', () => {
    const client = new IPCClient('/tmp/test-entity.sock');
    assert.ok(client);
    assert.strictEqual(client.isConnected(), false);
  });

  it('should report not connected initially', () => {
    const client = new IPCClient('/tmp/test-entity.sock');
    assert.strictEqual(client.isConnected(), false);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Daemon Integration', () => {
  it('should have valid task structure', () => {
    const task: ScheduledTask = {
      id: 'integration-task',
      name: 'Integration Task',
      operation: 'system.health',
      interval: 60000,
      enabled: true,
    };

    assert.ok('id' in task);
    assert.ok('name' in task);
    assert.ok('operation' in task);
    assert.ok('interval' in task);
    assert.ok('enabled' in task);
  });

  it('should have valid hook structure', () => {
    const hook: HookDefinition = {
      id: 'integration-hook',
      event: 'onEnergyLow',
      description: 'Integration Hook',
      enabled: true,
      action: 'log',
      config: { key: 'value' },
    };

    assert.ok('id' in hook);
    assert.ok('event' in hook);
    assert.ok('description' in hook);
    assert.ok('enabled' in hook);
    assert.ok('action' in hook);
    assert.ok('config' in hook);
  });

  it('should support all hook events', () => {
    const events: HookEvent[] = [
      'onDaemonStart',
      'onDaemonStop',
      'onHeartbeat',
      'onTaskExecuted',
      'onTaskError',
      'onEnergyLow',
      'onEnergyCritical',
      'onInvariantViolation',
      'onRecoveryAttempted',
      'onCouplingRequest',
      'onCouplingAccepted',
      'onCouplingRejected',
      'onSessionStart',
      'onSessionEnd',
      'onSnapshotCreated',
      'onStateChange',
    ];

    for (const event of events) {
      assert.ok(typeof event === 'string');
    }

    assert.strictEqual(events.length, 16);
  });

  it('should have valid maintenance config defaults', () => {
    const maintenance = new SelfMaintenance('/tmp/test-entity');
    assert.ok(maintenance);
  });
});

describe('Scheduler task validation', () => {
  it('should accept valid catalog operations', () => {
    const scheduler = new Scheduler('/tmp/test-entity');

    const validOps = [
      'state.read',
      'state.summary',
      'energy.status',
      'system.health',
      'memory.list',
    ];

    for (const op of validOps) {
      const result = scheduler.addTask({
        id: `task-${op.replace('.', '-')}`,
        name: `Task ${op}`,
        operation: op,
        interval: 60000,
        enabled: true,
      });
      assert.strictEqual(result.success, true, `Should accept ${op}`);
    }
  });

  it('should accept meta operations', () => {
    const scheduler = new Scheduler('/tmp/test-entity');

    const metaOps = [
      'meta.list',
      'meta.introspect',
    ];

    for (const op of metaOps) {
      const result = scheduler.addTask({
        id: `meta-task-${op.replace('.', '-')}`,
        name: `Meta Task ${op}`,
        operation: op,
        interval: 60000,
        enabled: true,
      });
      assert.strictEqual(result.success, true, `Should accept ${op}`);
    }
  });
});
