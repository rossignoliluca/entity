/**
 * Scheduler Module
 * AES-SPEC-001 Phase 7b: Autonomous Task Scheduling
 *
 * Manages scheduled tasks for autonomous operation.
 */

import { EventEmitter } from 'events';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { executeOperation, isAllowedOperation, OPERATIONS_CATALOG } from '../operations.js';
import { getCombinedCatalog, META_OPERATIONS_CATALOG } from '../meta-operations.js';
import type { State } from '../types.js';
import { getStateManager } from '../state-manager.js';

// =============================================================================
// Types
// =============================================================================

export interface ScheduledTask {
  id: string;
  name: string;
  operation: string;
  params?: Record<string, unknown>;
  interval: number;           // ms between executions
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  runCount?: number;
  failCount?: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  message: string;
  timestamp: string;
  duration: number;
  effects?: Record<string, unknown>;
}

interface SchedulerState {
  tasks: ScheduledTask[];
  lastSave: string;
}

// =============================================================================
// Scheduler Class
// =============================================================================

export class Scheduler extends EventEmitter {
  private baseDir: string;
  private tasks: Map<string, ScheduledTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private running: boolean = false;
  private stateFile: string;

  constructor(baseDir: string) {
    super();
    this.baseDir = baseDir;
    this.stateFile = join(baseDir, 'state', 'scheduler.json');
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  async start(): Promise<void> {
    if (this.running) return;

    // Load persisted state
    await this.loadState();

    // Start all enabled tasks
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }

    this.running = true;
    this.emit('started');
  }

  stop(): void {
    if (!this.running) return;

    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    this.running = false;
    this.emit('stopped');
  }

  // ===========================================================================
  // Task Management
  // ===========================================================================

  addTask(task: ScheduledTask): { success: boolean; message: string } {
    if (this.tasks.has(task.id)) {
      return { success: false, message: `Task ${task.id} already exists` };
    }

    // Validate operation exists
    const allOps = { ...OPERATIONS_CATALOG, ...META_OPERATIONS_CATALOG };
    if (!allOps[task.operation]) {
      return { success: false, message: `Unknown operation: ${task.operation}` };
    }

    // Initialize task state
    task.runCount = task.runCount || 0;
    task.failCount = task.failCount || 0;
    task.nextRun = new Date(Date.now() + task.interval).toISOString();

    this.tasks.set(task.id, task);

    // Schedule if enabled and running
    if (task.enabled && this.running) {
      this.scheduleTask(task);
    }

    // Persist state
    this.saveState().catch(() => {});

    this.emit('taskAdded', task);
    return { success: true, message: `Task ${task.id} added` };
  }

  removeTask(taskId: string): { success: boolean; message: string } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, message: `Task ${taskId} not found` };
    }

    // Clear timer
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }

    this.tasks.delete(taskId);

    // Persist state
    this.saveState().catch(() => {});

    this.emit('taskRemoved', taskId);
    return { success: true, message: `Task ${taskId} removed` };
  }

  enableTask(taskId: string): { success: boolean; message: string } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, message: `Task ${taskId} not found` };
    }

    task.enabled = true;
    task.nextRun = new Date(Date.now() + task.interval).toISOString();

    if (this.running) {
      this.scheduleTask(task);
    }

    this.saveState().catch(() => {});
    return { success: true, message: `Task ${taskId} enabled` };
  }

  disableTask(taskId: string): { success: boolean; message: string } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, message: `Task ${taskId} not found` };
    }

    task.enabled = false;

    // Clear timer
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }

    this.saveState().catch(() => {});
    return { success: true, message: `Task ${taskId} disabled` };
  }

  listTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  getTaskCount(): number {
    return this.tasks.size;
  }

  // ===========================================================================
  // Execution
  // ===========================================================================

  private scheduleTask(task: ScheduledTask): void {
    // Clear existing timer if any
    const existingTimer = this.timers.get(task.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate delay until next run
    let delay = task.interval;
    if (task.nextRun) {
      const nextRunTime = new Date(task.nextRun).getTime();
      delay = Math.max(0, nextRunTime - Date.now());
    }

    // Schedule execution
    const timer = setTimeout(() => this.executeTask(task.id), delay);
    this.timers.set(task.id, timer);
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || !task.enabled) return;

    const startTime = Date.now();

    try {
      // Load current state
      const state = await this.loadEntityState();

      // Execute operation
      const allOps = { ...OPERATIONS_CATALOG, ...META_OPERATIONS_CATALOG };
      const op = allOps[task.operation];

      if (!op) {
        throw new Error(`Operation not found: ${task.operation}`);
      }

      const result = op.handler(state, task.params || {});

      const taskResult: TaskResult = {
        taskId,
        success: result.success,
        message: result.message,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        effects: result.effects,
      };

      // Update task stats
      task.lastRun = taskResult.timestamp;
      task.runCount = (task.runCount || 0) + 1;
      if (!result.success) {
        task.failCount = (task.failCount || 0) + 1;
      }

      this.emit('taskExecuted', task, taskResult);
    } catch (error) {
      task.failCount = (task.failCount || 0) + 1;
      task.lastRun = new Date().toISOString();

      this.emit('taskError', task, error);
    }

    // Schedule next run
    task.nextRun = new Date(Date.now() + task.interval).toISOString();
    this.scheduleTask(task);

    // Persist state
    this.saveState().catch(() => {});
  }

  async tick(): Promise<void> {
    // Manual tick for tasks that should run now
    const now = Date.now();

    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;

      if (task.nextRun) {
        const nextRunTime = new Date(task.nextRun).getTime();
        if (nextRunTime <= now) {
          await this.executeTask(task.id);
        }
      }
    }
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  private async loadState(): Promise<void> {
    try {
      const content = await readFile(this.stateFile, 'utf-8');
      const state: SchedulerState = JSON.parse(content);

      this.tasks.clear();
      for (const task of state.tasks) {
        this.tasks.set(task.id, task);
      }
    } catch {
      // No saved state, start fresh
    }
  }

  private async saveState(): Promise<void> {
    const state: SchedulerState = {
      tasks: Array.from(this.tasks.values()),
      lastSave: new Date().toISOString(),
    };

    await writeFile(this.stateFile, JSON.stringify(state, null, 2));
  }

  private async loadEntityState(): Promise<State> {
    const manager = getStateManager(this.baseDir);
    const state = await manager.readState();
    if (!state) {
      throw new Error('No state available');
    }
    return state;
  }
}
