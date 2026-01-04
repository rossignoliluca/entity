/**
 * Hooks Module
 * AES-SPEC-001 Phase 7b: Event Hooks System
 *
 * Allows registering handlers for daemon events.
 */

import { EventEmitter } from 'events';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// =============================================================================
// Types
// =============================================================================

export type HookEvent =
  | 'onDaemonStart'
  | 'onDaemonStop'
  | 'onHeartbeat'
  | 'onTaskExecuted'
  | 'onTaskError'
  | 'onEnergyLow'
  | 'onEnergyCritical'
  | 'onInvariantViolation'
  | 'onRecoveryAttempted'
  | 'onCouplingRequest'
  | 'onCouplingAccepted'
  | 'onCouplingRejected'
  | 'onSessionStart'
  | 'onSessionEnd'
  | 'onSnapshotCreated'
  | 'onStateChange';

export type HookHandler = (data: unknown) => void | Promise<void>;

export interface HookDefinition {
  id: string;
  event: HookEvent;
  description: string;
  enabled: boolean;
  action: 'log' | 'notify' | 'execute' | 'custom';
  config: Record<string, unknown>;
}

interface HooksState {
  hooks: HookDefinition[];
  lastSave: string;
}

// =============================================================================
// HooksManager Class
// =============================================================================

export class HooksManager extends EventEmitter {
  private baseDir: string;
  private hooks: Map<string, HookDefinition> = new Map();
  private handlers: Map<HookEvent, HookHandler[]> = new Map();
  private stateFile: string;

  constructor(baseDir: string) {
    super();
    this.baseDir = baseDir;
    this.stateFile = join(baseDir, 'state', 'hooks.json');

    // Initialize handler maps for all events
    const events: HookEvent[] = [
      'onDaemonStart', 'onDaemonStop', 'onHeartbeat',
      'onTaskExecuted', 'onTaskError',
      'onEnergyLow', 'onEnergyCritical',
      'onInvariantViolation', 'onRecoveryAttempted',
      'onCouplingRequest', 'onCouplingAccepted', 'onCouplingRejected',
      'onSessionStart', 'onSessionEnd',
      'onSnapshotCreated', 'onStateChange',
    ];

    for (const event of events) {
      this.handlers.set(event, []);
    }

    // Load saved hooks
    this.loadState().catch(() => {});
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

  register(event: HookEvent, handler: HookHandler): string {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);

    const hookId = `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return hookId;
  }

  unregister(event: HookEvent, handler: HookHandler): boolean {
    const handlers = this.handlers.get(event);
    if (!handlers) return false;

    const index = handlers.indexOf(handler);
    if (index === -1) return false;

    handlers.splice(index, 1);
    return true;
  }

  addHook(hook: HookDefinition): { success: boolean; message: string } {
    if (this.hooks.has(hook.id)) {
      return { success: false, message: `Hook ${hook.id} already exists` };
    }

    this.hooks.set(hook.id, hook);
    this.saveState().catch(() => {});

    return { success: true, message: `Hook ${hook.id} added` };
  }

  removeHook(hookId: string): { success: boolean; message: string } {
    if (!this.hooks.has(hookId)) {
      return { success: false, message: `Hook ${hookId} not found` };
    }

    this.hooks.delete(hookId);
    this.saveState().catch(() => {});

    return { success: true, message: `Hook ${hookId} removed` };
  }

  enableHook(hookId: string): { success: boolean; message: string } {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      return { success: false, message: `Hook ${hookId} not found` };
    }

    hook.enabled = true;
    this.saveState().catch(() => {});

    return { success: true, message: `Hook ${hookId} enabled` };
  }

  disableHook(hookId: string): { success: boolean; message: string } {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      return { success: false, message: `Hook ${hookId} not found` };
    }

    hook.enabled = false;
    this.saveState().catch(() => {});

    return { success: true, message: `Hook ${hookId} disabled` };
  }

  // ===========================================================================
  // Triggering
  // ===========================================================================

  async trigger(event: HookEvent, data: unknown): Promise<void> {
    // Call registered handlers
    const handlers = this.handlers.get(event) || [];
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (error) {
        this.emit('hookError', { event, error });
      }
    }

    // Process defined hooks
    for (const hook of this.hooks.values()) {
      if (hook.event !== event || !hook.enabled) continue;

      try {
        await this.executeHook(hook, data);
      } catch (error) {
        this.emit('hookError', { hookId: hook.id, event, error });
      }
    }

    // Emit event for external listeners
    this.emit(event, data);
  }

  private async executeHook(hook: HookDefinition, data: unknown): Promise<void> {
    switch (hook.action) {
      case 'log':
        console.log(`[HOOK:${hook.id}] ${hook.event}:`, data);
        break;

      case 'notify':
        // Could integrate with notification system
        this.emit('notification', {
          hookId: hook.id,
          event: hook.event,
          data,
          config: hook.config,
        });
        break;

      case 'execute':
        // Execute a command or operation
        if (hook.config.operation) {
          const params = hook.config.params as Record<string, unknown> || {};
          this.emit('executeOperation', {
            operation: hook.config.operation,
            params: { ...params, hookData: data },
          });
        }
        break;

      case 'custom':
        // Custom handlers would be registered separately
        break;
    }
  }

  // ===========================================================================
  // Queries
  // ===========================================================================

  listHooks(): HookDefinition[] {
    return Array.from(this.hooks.values());
  }

  getHook(hookId: string): HookDefinition | undefined {
    return this.hooks.get(hookId);
  }

  getHookCount(): number {
    return this.hooks.size;
  }

  getHandlerCount(event: HookEvent): number {
    return (this.handlers.get(event) || []).length;
  }

  listEvents(): HookEvent[] {
    return Array.from(this.handlers.keys());
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private async loadState(): Promise<void> {
    try {
      const content = await readFile(this.stateFile, 'utf-8');
      const state: HooksState = JSON.parse(content);

      this.hooks.clear();
      for (const hook of state.hooks) {
        this.hooks.set(hook.id, hook);
      }
    } catch {
      // No saved state, start fresh
    }
  }

  private async saveState(): Promise<void> {
    const state: HooksState = {
      hooks: Array.from(this.hooks.values()),
      lastSave: new Date().toISOString(),
    };

    await writeFile(this.stateFile, JSON.stringify(state, null, 2));
  }
}

// =============================================================================
// Predefined Hooks
// =============================================================================

export const PREDEFINED_HOOKS: HookDefinition[] = [
  {
    id: 'log-energy-low',
    event: 'onEnergyLow',
    description: 'Log when energy is low',
    enabled: true,
    action: 'log',
    config: {},
  },
  {
    id: 'log-invariant-violation',
    event: 'onInvariantViolation',
    description: 'Log invariant violations',
    enabled: true,
    action: 'log',
    config: {},
  },
  {
    id: 'notify-critical-energy',
    event: 'onEnergyCritical',
    description: 'Notify on critical energy',
    enabled: true,
    action: 'notify',
    config: { priority: 'high' },
  },
];
