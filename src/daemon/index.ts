/**
 * Daemon Module
 * AES-SPEC-001 Phase 7b: Autonomous Operation
 * AES-SPEC-001 Phase 8: Internal Agency
 *
 * Enables the entity to operate autonomously without constant human interaction.
 * Implements scheduled tasks, self-maintenance, auto-coupling, and internal agency.
 *
 * Phase 8 adds the Internal Agent - an autopoietic sense-making loop that
 * responds to the system's own precariousness based on:
 * - Maturana & Varela: Autopoiesis
 * - Di Paolo: Sense-making and Precariousness
 * - Friston: Free Energy Principle
 * - Ashby: Ultrastability
 */

import { EventEmitter } from 'events';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { Scheduler, type ScheduledTask } from './scheduler.js';
import { HooksManager, type HookEvent } from './hooks.js';
import { IPCServer } from './ipc.js';
import { SelfMaintenance } from './maintenance.js';
import { InternalAgent, type AgentConfig, DEFAULT_AGENT_CONFIG } from './agent.js';
import type { State } from '../types.js';

// =============================================================================
// Types
// =============================================================================

export interface DaemonConfig {
  pidFile: string;
  socketPath: string;
  logFile: string;
  checkInterval: number;      // ms between maintenance checks
  energyAlertThreshold: number;
  autoRecovery: boolean;
  autoCoupling: boolean;
  maxIdleTime: number;        // ms before auto-decoupling
  // Phase 8: Internal Agent
  agentEnabled: boolean;
  agentConfig: Partial<AgentConfig>;
}

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  uptime: number | null;      // seconds
  lastCheck: string | null;
  scheduledTasks: number;
  activeHooks: number;
  couplingRequests: number;
  // Phase 8: Agent status
  agentAwake: boolean;
  agentCycles: number;
}

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  pidFile: 'daemon.pid',
  socketPath: 'daemon.sock',
  logFile: 'daemon.log',
  checkInterval: 60000,       // 1 minute
  energyAlertThreshold: 0.2,
  autoRecovery: true,
  autoCoupling: false,
  maxIdleTime: 300000,        // 5 minutes
  // Phase 8: Agent enabled by default
  agentEnabled: true,
  agentConfig: {},
};

// =============================================================================
// Daemon Class
// =============================================================================

export class Daemon extends EventEmitter {
  private baseDir: string;
  private config: DaemonConfig;
  private scheduler: Scheduler;
  private hooks: HooksManager;
  private ipc: IPCServer;
  private maintenance: SelfMaintenance;
  private agent: InternalAgent;

  private running: boolean = false;
  private startedAt: Date | null = null;
  private mainLoopInterval: NodeJS.Timeout | null = null;
  private lastCheck: Date | null = null;
  private couplingRequests: number = 0;

  constructor(baseDir: string, config: Partial<DaemonConfig> = {}) {
    super();
    this.baseDir = baseDir;
    this.config = { ...DEFAULT_DAEMON_CONFIG, ...config };

    this.scheduler = new Scheduler(baseDir);
    this.hooks = new HooksManager(baseDir);
    this.ipc = new IPCServer(join(baseDir, this.config.socketPath));
    this.maintenance = new SelfMaintenance(baseDir, {
      energyThreshold: this.config.energyAlertThreshold,
      autoRecovery: this.config.autoRecovery,
    });
    // Phase 8: Internal Agent
    this.agent = new InternalAgent(baseDir, {
      enabled: this.config.agentEnabled,
      ...this.config.agentConfig,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Scheduler events
    this.scheduler.on('taskExecuted', (task, result) => {
      this.log(`Task executed: ${task.id} - ${result.success ? 'OK' : 'FAILED'}`);
      this.hooks.trigger('onTaskExecuted', { task, result });
    });

    this.scheduler.on('taskError', (task, error) => {
      this.log(`Task error: ${task.id} - ${error.message}`, 'error');
      this.hooks.trigger('onTaskError', { task, error });
    });

    // Maintenance events
    this.maintenance.on('energyLow', (level) => {
      this.log(`Energy low: ${(level * 100).toFixed(0)}%`, 'warn');
      this.hooks.trigger('onEnergyLow', { level });
    });

    this.maintenance.on('energyCritical', (level) => {
      this.log(`Energy critical: ${(level * 100).toFixed(0)}%`, 'error');
      this.hooks.trigger('onEnergyCritical', { level });
    });

    this.maintenance.on('invariantViolation', (invariant) => {
      this.log(`Invariant violation: ${invariant}`, 'error');
      this.hooks.trigger('onInvariantViolation', { invariant });
    });

    this.maintenance.on('recoveryAttempted', (result) => {
      this.log(`Recovery attempted: ${result.success ? 'OK' : 'FAILED'}`);
      this.hooks.trigger('onRecoveryAttempted', { result });
    });

    // IPC events
    this.ipc.on('command', async (cmd, respond) => {
      const result = await this.handleCommand(cmd);
      respond(result);
    });

    this.ipc.on('couplingRequest', (partner) => {
      this.couplingRequests++;
      this.log(`Coupling request from: ${partner}`);
      this.hooks.trigger('onCouplingRequest', { partner });
    });

    // Phase 8: Agent events
    this.agent.on('wake', () => {
      this.log('Internal agent awakened');
      this.hooks.trigger('onAgentWake', {});
    });

    this.agent.on('sleep', () => {
      this.log('Internal agent sleeping');
      this.hooks.trigger('onAgentSleep', {});
    });

    this.agent.on('cycle', ({ feeling, response }) => {
      if (response?.action) {
        this.log(`Agent response: ${response.priority} -> ${response.action}`);
      }
      this.hooks.trigger('onAgentCycle', { feeling, response });
    });

    this.agent.on('error', ({ error, cycle }) => {
      this.log(`Agent error in cycle ${cycle}: ${error}`, 'error');
      this.hooks.trigger('onAgentError', { error, cycle });
    });

    // Phase 8b: Ultrastability events
    this.agent.on('parameterAdapted', (data) => {
      this.log(`Ultrastability: ${data.type} ${data.direction} - interval=${(data.decisionInterval/1000).toFixed(1)}s`);
      this.hooks.trigger('onParameterAdapted', data);
    });
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  async start(): Promise<{ success: boolean; message: string }> {
    if (this.running) {
      return { success: false, message: 'Daemon already running' };
    }

    try {
      // Check for existing PID file
      const existingPid = await this.readPidFile();
      if (existingPid) {
        // Check if process is actually running
        if (this.isProcessRunning(existingPid)) {
          return { success: false, message: `Daemon already running (PID: ${existingPid})` };
        }
        // Stale PID file, remove it
        await this.removePidFile();
      }

      // Write PID file
      await this.writePidFile(process.pid);

      // Start components
      await this.scheduler.start();
      await this.ipc.start();
      this.maintenance.start();

      // Start main loop
      this.mainLoopInterval = setInterval(() => this.mainLoop(), this.config.checkInterval);

      this.running = true;
      this.startedAt = new Date();

      this.log('Daemon started');
      this.hooks.trigger('onDaemonStart', { pid: process.pid });

      // Register default tasks
      this.registerDefaultTasks();

      // Phase 8: Wake the internal agent
      if (this.config.agentEnabled) {
        await this.agent.wake();
      }

      return { success: true, message: `Daemon started (PID: ${process.pid})` };
    } catch (error) {
      return { success: false, message: `Failed to start daemon: ${error}` };
    }
  }

  async stop(): Promise<{ success: boolean; message: string }> {
    if (!this.running) {
      return { success: false, message: 'Daemon not running' };
    }

    try {
      this.log('Stopping daemon...');
      this.hooks.trigger('onDaemonStop', {});

      // Phase 8: Sleep the internal agent first
      if (this.agent.isAwake()) {
        await this.agent.sleep();
      }

      // Stop main loop
      if (this.mainLoopInterval) {
        clearInterval(this.mainLoopInterval);
        this.mainLoopInterval = null;
      }

      // Stop components
      this.scheduler.stop();
      await this.ipc.stop();
      this.maintenance.stop();

      // Remove PID file
      await this.removePidFile();

      this.running = false;
      this.startedAt = null;

      this.log('Daemon stopped');
      this.emit('stopped');
      return { success: true, message: 'Daemon stopped' };
    } catch (error) {
      return { success: false, message: `Failed to stop daemon: ${error}` };
    }
  }

  async getStatus(): Promise<DaemonStatus> {
    const pid = await this.readPidFile();
    const uptime = this.startedAt
      ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
      : null;
    const agentStats = this.agent.getStats();

    return {
      running: this.running,
      pid: pid || (this.running ? process.pid : null),
      startedAt: this.startedAt?.toISOString() || null,
      uptime,
      lastCheck: this.lastCheck?.toISOString() || null,
      scheduledTasks: this.scheduler.getTaskCount(),
      activeHooks: this.hooks.getHookCount(),
      couplingRequests: this.couplingRequests,
      // Phase 8: Agent status
      agentAwake: this.agent.isAwake(),
      agentCycles: agentStats.cycleCount,
    };
  }

  // ===========================================================================
  // Main Loop
  // ===========================================================================

  private async mainLoop(): Promise<void> {
    this.lastCheck = new Date();

    try {
      // Run maintenance checks
      await this.maintenance.runChecks();

      // Process scheduled tasks
      await this.scheduler.tick();

      // Emit heartbeat
      this.emit('heartbeat', { timestamp: this.lastCheck });
      this.hooks.trigger('onHeartbeat', { timestamp: this.lastCheck.toISOString() });
    } catch (error) {
      this.log(`Main loop error: ${error}`, 'error');
    }
  }

  // ===========================================================================
  // Commands
  // ===========================================================================

  private async handleCommand(cmd: { type: string; payload?: unknown }): Promise<unknown> {
    switch (cmd.type) {
      case 'status':
        return this.getStatus();

      case 'stop':
        // Schedule stop after response is sent
        setImmediate(() => this.stop());
        return { success: true, message: 'Daemon stopping...' };

      case 'tasks':
        return this.scheduler.listTasks();

      case 'addTask':
        return this.scheduler.addTask(cmd.payload as ScheduledTask);

      case 'removeTask':
        return this.scheduler.removeTask(cmd.payload as string);

      case 'hooks':
        return this.hooks.listHooks();

      case 'trigger':
        const { event, data } = cmd.payload as { event: HookEvent; data: unknown };
        return this.hooks.trigger(event, data);

      case 'maintenance':
        return this.maintenance.runChecks();

      case 'logs':
        return this.getLogs(cmd.payload as number || 50);

      // Phase 8: Agent commands
      case 'agent-status':
        return {
          awake: this.agent.isAwake(),
          stats: this.agent.getStats(),
        };

      case 'agent-wake':
        return this.agent.wake();

      case 'agent-sleep':
        return this.agent.sleep();

      case 'agent-feeling':
        return this.agent.getCurrentFeeling();

      case 'agent-cycle':
        return this.agent.forceCycle();

      default:
        return { error: `Unknown command: ${cmd.type}` };
    }
  }

  // ===========================================================================
  // Default Tasks
  // ===========================================================================

  private registerDefaultTasks(): void {
    // Health check every 5 minutes
    this.scheduler.addTask({
      id: 'health-check',
      name: 'Health Check',
      operation: 'system.health',
      interval: 300000,
      enabled: true,
    });

    // Autopoiesis introspection every hour
    this.scheduler.addTask({
      id: 'autopoiesis-check',
      name: 'Autopoiesis Check',
      operation: 'meta.introspect',
      interval: 3600000,
      enabled: true,
    });

    // Energy check every 2 minutes
    this.scheduler.addTask({
      id: 'energy-check',
      name: 'Energy Check',
      operation: 'energy.status',
      interval: 120000,
      enabled: true,
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async readPidFile(): Promise<number | null> {
    try {
      const content = await readFile(join(this.baseDir, this.config.pidFile), 'utf-8');
      return parseInt(content.trim(), 10);
    } catch {
      return null;
    }
  }

  private async writePidFile(pid: number): Promise<void> {
    await writeFile(join(this.baseDir, this.config.pidFile), pid.toString());
  }

  private async removePidFile(): Promise<void> {
    try {
      await unlink(join(this.baseDir, this.config.pidFile));
    } catch {
      // Ignore if file doesn't exist
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Emit log event
    this.emit('log', { timestamp, level, message });

    // Append to log file (async, don't await)
    writeFile(
      join(this.baseDir, this.config.logFile),
      logLine + '\n',
      { flag: 'a' }
    ).catch(() => {});
  }

  private async getLogs(lines: number): Promise<string[]> {
    try {
      const content = await readFile(join(this.baseDir, this.config.logFile), 'utf-8');
      return content.split('\n').filter(Boolean).slice(-lines);
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  addTask(task: ScheduledTask): void {
    this.scheduler.addTask(task);
  }

  removeTask(taskId: string): void {
    this.scheduler.removeTask(taskId);
  }

  registerHook(event: HookEvent, handler: (data: unknown) => void): void {
    this.hooks.register(event, handler);
  }

  isRunning(): boolean {
    return this.running;
  }

  // Phase 8: Agent public API
  getAgent(): InternalAgent {
    return this.agent;
  }

  async wakeAgent(): Promise<{ success: boolean; message: string }> {
    return this.agent.wake();
  }

  async sleepAgent(): Promise<{ success: boolean; message: string }> {
    return this.agent.sleep();
  }

  isAgentAwake(): boolean {
    return this.agent.isAwake();
  }
}

// =============================================================================
// Exports
// =============================================================================

export { Scheduler, type ScheduledTask } from './scheduler.js';
export { HooksManager, type HookEvent, type HookHandler } from './hooks.js';
export { IPCServer, IPCClient, sendDaemonCommand, isDaemonRunning } from './ipc.js';
export { SelfMaintenance } from './maintenance.js';
// Phase 8: Export agent
export {
  InternalAgent,
  createAgent,
  type AgentConfig,
  type AgentStats,
  type Feeling,
  type Response,
  type Priority,
  DEFAULT_AGENT_CONFIG,
} from './agent.js';
