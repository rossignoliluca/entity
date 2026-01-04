/**
 * Self-Maintenance Module
 * AES-SPEC-001 Phase 7b: Autonomous Self-Care
 *
 * Monitors system health and performs automatic maintenance.
 */

import { EventEmitter } from 'events';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { State, VerificationResult } from '../types.js';
import { verifyAllInvariants } from '../verify.js';
import { autoRecover } from '../recovery.js';
import { createSnapshot } from '../snapshot.js';
import { appendEvent, loadEvents } from '../events.js';

// =============================================================================
// Types
// =============================================================================

export interface MaintenanceConfig {
  energyThreshold: number;
  energyCritical: number;
  autoRecovery: boolean;
  autoSnapshot: boolean;
  snapshotInterval: number;    // ms between auto-snapshots
  maxSnapshots: number;
}

export interface MaintenanceReport {
  timestamp: string;
  checks: {
    energy: { level: number; status: 'ok' | 'low' | 'critical' };
    invariants: { satisfied: number; violated: number; status: 'ok' | 'degraded' };
    lyapunov: { V: number; stable: boolean };
  };
  actions: string[];
  errors: string[];
}

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  energyThreshold: 0.2,
  energyCritical: 0.05,
  autoRecovery: true,
  autoSnapshot: true,
  snapshotInterval: 3600000,   // 1 hour
  maxSnapshots: 10,
};

// =============================================================================
// SelfMaintenance Class
// =============================================================================

export class SelfMaintenance extends EventEmitter {
  private baseDir: string;
  private config: MaintenanceConfig;
  private running: boolean = false;
  private lastSnapshot: Date | null = null;
  private checkCount: number = 0;

  constructor(baseDir: string, config: Partial<MaintenanceConfig> = {}) {
    super();
    this.baseDir = baseDir;
    this.config = { ...DEFAULT_MAINTENANCE_CONFIG, ...config };
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  start(): void {
    this.running = true;
    this.emit('started');
  }

  stop(): void {
    this.running = false;
    this.emit('stopped');
  }

  // ===========================================================================
  // Checks
  // ===========================================================================

  async runChecks(): Promise<MaintenanceReport> {
    if (!this.running) {
      return this.createEmptyReport();
    }

    this.checkCount++;
    const report: MaintenanceReport = {
      timestamp: new Date().toISOString(),
      checks: {
        energy: { level: 0, status: 'ok' },
        invariants: { satisfied: 0, violated: 0, status: 'ok' },
        lyapunov: { V: 0, stable: true },
      },
      actions: [],
      errors: [],
    };

    try {
      // Load current state
      const state = await this.loadState();

      // Check energy
      report.checks.energy = this.checkEnergy(state);

      // Check invariants
      report.checks.invariants = await this.checkInvariants();

      // Check Lyapunov
      report.checks.lyapunov = this.checkLyapunov(state);

      // Perform automatic actions
      await this.performAutoActions(state, report);

    } catch (error) {
      report.errors.push(`Maintenance check failed: ${error}`);
    }

    this.emit('checkCompleted', report);
    return report;
  }

  private checkEnergy(state: State): MaintenanceReport['checks']['energy'] {
    const level = state.energy.current;

    if (level < this.config.energyCritical) {
      this.emit('energyCritical', level);
      return { level, status: 'critical' };
    }

    if (level < this.config.energyThreshold) {
      this.emit('energyLow', level);
      return { level, status: 'low' };
    }

    return { level, status: 'ok' };
  }

  private async checkInvariants(): Promise<MaintenanceReport['checks']['invariants']> {
    const result = await verifyAllInvariants(this.baseDir);

    const satisfied = result.invariants.filter(i => i.satisfied).length;
    const violated = result.invariants.filter(i => !i.satisfied).length;

    if (violated > 0) {
      for (const inv of result.invariants.filter(i => !i.satisfied)) {
        this.emit('invariantViolation', inv.id);
      }
    }

    return {
      satisfied,
      violated,
      status: violated === 0 ? 'ok' : 'degraded',
    };
  }

  private checkLyapunov(state: State): MaintenanceReport['checks']['lyapunov'] {
    const V = state.lyapunov.V;
    const V_prev = state.lyapunov.V_previous;

    // Lyapunov is stable if V is not increasing
    const stable = V_prev === null || V <= V_prev;

    if (!stable) {
      this.emit('lyapunovUnstable', { V, V_prev });
    }

    return { V, stable };
  }

  // ===========================================================================
  // Automatic Actions
  // ===========================================================================

  private async performAutoActions(state: State, report: MaintenanceReport): Promise<void> {
    // Auto-recovery on invariant violations
    if (this.config.autoRecovery && report.checks.invariants.status === 'degraded') {
      try {
        const recoveryResult = await autoRecover(this.baseDir);
        report.actions.push(`Auto-recovery attempted: ${recoveryResult.final_status}`);
        this.emit('recoveryAttempted', {
          success: recoveryResult.final_status !== 'terminal',
          status: recoveryResult.final_status,
        });
      } catch (error) {
        report.errors.push(`Auto-recovery failed: ${error}`);
      }
    }

    // Auto-snapshot
    if (this.config.autoSnapshot) {
      const shouldSnapshot = this.shouldCreateSnapshot();
      if (shouldSnapshot) {
        try {
          // createSnapshot handles cleanup internally
          await createSnapshot(this.baseDir, `Daemon auto-snapshot #${this.checkCount}`);
          this.lastSnapshot = new Date();
          report.actions.push('Auto-snapshot created');
        } catch (error) {
          report.errors.push(`Auto-snapshot failed: ${error}`);
        }
      }
    }

    // Enter dormant mode on critical energy
    if (report.checks.energy.status === 'critical' && state.integrity.status !== 'dormant') {
      try {
        await this.enterDormantMode(state);
        report.actions.push('Entered dormant mode due to critical energy');
      } catch (error) {
        report.errors.push(`Failed to enter dormant mode: ${error}`);
      }
    }
  }

  private shouldCreateSnapshot(): boolean {
    if (!this.lastSnapshot) {
      return true;
    }

    const elapsed = Date.now() - this.lastSnapshot.getTime();
    return elapsed >= this.config.snapshotInterval;
  }

  private async enterDormantMode(state: State): Promise<void> {
    state.integrity.status = 'dormant';
    state.updated = new Date().toISOString();

    await this.saveState(state);

    await appendEvent(this.baseDir, 'STATE_UPDATE', {
      reason: 'Daemon auto-dormant: critical energy',
      previous_status: 'nominal',
      new_status: 'dormant',
      energy: state.energy.current,
    });

    this.emit('dormantEntered', state.energy.current);
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async loadState(): Promise<State> {
    const content = await readFile(join(this.baseDir, 'state', 'current.json'), 'utf-8');
    return JSON.parse(content) as State;
  }

  private async saveState(state: State): Promise<void> {
    await writeFile(
      join(this.baseDir, 'state', 'current.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private createEmptyReport(): MaintenanceReport {
    return {
      timestamp: new Date().toISOString(),
      checks: {
        energy: { level: 0, status: 'ok' },
        invariants: { satisfied: 0, violated: 0, status: 'ok' },
        lyapunov: { V: 0, stable: true },
      },
      actions: [],
      errors: ['Maintenance not running'],
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  getCheckCount(): number {
    return this.checkCount;
  }

  getLastSnapshotTime(): Date | null {
    return this.lastSnapshot;
  }

  isRunning(): boolean {
    return this.running;
  }
}
