/**
 * Recovery Procedures
 * AES-SPEC-001 §7.2 Recovery Procedures
 *
 * DEF-047: DormantState (E < E_min)
 * DEF-048: TerminalState (unrecoverable)
 * AXM-016: Graceful Degradation
 */

import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { replayEvents, loadEvents, appendEvent } from './events.js';
import { verifyChain, hashEvent } from './hash.js';
import type { State, Event, Config, VerificationResult, InvariantCheck } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * Recovery result per ISO 9000 terminology
 */
export interface RecoveryResult {
  timestamp: string;
  invariant_id: string;
  status: 'recovered' | 'degraded' | 'terminal';
  procedure: string;
  actions_taken: string[];
  state_before: Partial<State>;
  state_after: Partial<State>;
}

/**
 * Recovery report
 */
export interface RecoveryReport {
  timestamp: string;
  violations_detected: string[];
  recoveries_attempted: RecoveryResult[];
  final_status: 'nominal' | 'degraded' | 'dormant' | 'terminal';
  lyapunov_V: number;
}

/**
 * §7.2.1 INV-002 Recovery: State Reconstruction
 * Procedure: Replay all events to reconstruct valid state
 */
async function recoverStateDeterminism(
  baseDir: string
): Promise<RecoveryResult> {
  const timestamp = new Date().toISOString();
  const actions: string[] = [];

  // Load current (possibly corrupted) state
  const currentPath = join(baseDir, 'state', 'current.json');
  const currentContent = await readFile(currentPath, 'utf-8');
  const stateBefore = JSON.parse(currentContent) as State;

  actions.push('Loaded current state');

  // Replay events to reconstruct
  const replayed = await replayEvents(baseDir);

  if (!replayed) {
    return {
      timestamp,
      invariant_id: 'INV-002',
      status: 'terminal',
      procedure: 'State reconstruction via event replay',
      actions_taken: [...actions, 'No events to replay - terminal state'],
      state_before: { memory: stateBefore.memory },
      state_after: {},
    };
  }

  actions.push(`Replayed ${replayed.memory.event_count} events`);

  // Preserve non-critical fields from current state
  replayed.human = stateBefore.human;
  replayed.important = stateBefore.important;

  // Update timestamp
  replayed.updated = timestamp;

  // Write reconstructed state
  await writeFile(currentPath, JSON.stringify(replayed, null, 2));
  actions.push('Wrote reconstructed state');

  return {
    timestamp,
    invariant_id: 'INV-002',
    status: 'recovered',
    procedure: 'State reconstruction via event replay',
    actions_taken: actions,
    state_before: { memory: stateBefore.memory },
    state_after: { memory: replayed.memory },
  };
}

/**
 * §7.2.2 INV-003 Recovery: Chain Repair
 * Procedure: Find last valid event, truncate corrupted tail
 */
async function recoverChainIntegrity(
  baseDir: string
): Promise<RecoveryResult> {
  const timestamp = new Date().toISOString();
  const actions: string[] = [];

  const events = await loadEvents(baseDir);
  actions.push(`Loaded ${events.length} events`);

  // Find last valid event
  let lastValidIndex = -1;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const computedHash = hashEvent(event);

    // Check hash validity
    if (computedHash !== event.hash) {
      actions.push(`Event ${event.seq}: hash mismatch`);
      break;
    }

    // Check chain link
    if (i > 0 && event.prev_hash !== events[i - 1].hash) {
      actions.push(`Event ${event.seq}: chain link broken`);
      break;
    }

    // Check genesis
    if (i === 0 && event.prev_hash !== null) {
      actions.push('Genesis event has non-null prev_hash');
      break;
    }

    lastValidIndex = i;
  }

  if (lastValidIndex === -1) {
    return {
      timestamp,
      invariant_id: 'INV-003',
      status: 'terminal',
      procedure: 'Chain repair via truncation',
      actions_taken: [...actions, 'No valid events found - terminal state'],
      state_before: { memory: { event_count: events.length } as any },
      state_after: {},
    };
  }

  // Remove corrupted events
  const eventsDir = join(baseDir, 'events');
  const removedCount = events.length - lastValidIndex - 1;

  if (removedCount > 0) {
    for (let i = lastValidIndex + 1; i < events.length; i++) {
      const filename = events[i].seq.toString().padStart(6, '0') + '.json';
      await unlink(join(eventsDir, filename));
      actions.push(`Removed corrupted event ${events[i].seq}`);
    }
  }

  // Reconstruct state from valid events
  const replayed = await replayEvents(baseDir);
  if (replayed) {
    const currentPath = join(baseDir, 'state', 'current.json');
    await writeFile(currentPath, JSON.stringify(replayed, null, 2));
    actions.push('Reconstructed state from valid events');
  }

  return {
    timestamp,
    invariant_id: 'INV-003',
    status: removedCount > 0 ? 'degraded' : 'recovered',
    procedure: 'Chain repair via truncation',
    actions_taken: actions,
    state_before: { memory: { event_count: events.length } as any },
    state_after: { memory: { event_count: lastValidIndex + 1 } as any },
  };
}

/**
 * §7.2.3 INV-004 Recovery: Lyapunov Reset
 * Procedure: Reset V to valid value
 */
async function recoverLyapunovMonotone(
  baseDir: string
): Promise<RecoveryResult> {
  const timestamp = new Date().toISOString();
  const actions: string[] = [];

  const currentPath = join(baseDir, 'state', 'current.json');
  const content = await readFile(currentPath, 'utf-8');
  const state = JSON.parse(content) as State;

  const stateBefore = {
    lyapunov: { ...state.lyapunov },
  };

  actions.push(`Current V=${state.lyapunov.V}, V_previous=${state.lyapunov.V_previous}`);

  // Reset V to V_previous (or 0 if no previous)
  if (state.lyapunov.V_previous !== null && state.lyapunov.V > state.lyapunov.V_previous) {
    state.lyapunov.V = state.lyapunov.V_previous;
    actions.push(`Reset V to V_previous: ${state.lyapunov.V}`);
  } else {
    state.lyapunov.V = 0;
    state.lyapunov.V_previous = null;
    actions.push('Reset V to 0 (attractor)');
  }

  await writeFile(currentPath, JSON.stringify(state, null, 2));

  return {
    timestamp,
    invariant_id: 'INV-004',
    status: 'recovered',
    procedure: 'Lyapunov value reset',
    actions_taken: actions,
    state_before: stateBefore,
    state_after: { lyapunov: state.lyapunov },
  };
}

/**
 * §7.2.4 INV-005 Recovery: Energy Management
 * Procedure: Enter dormant state or request energy
 */
async function recoverEnergyViable(
  baseDir: string,
  config: Config = DEFAULT_CONFIG
): Promise<RecoveryResult> {
  const timestamp = new Date().toISOString();
  const actions: string[] = [];

  const currentPath = join(baseDir, 'state', 'current.json');
  const content = await readFile(currentPath, 'utf-8');
  const state = JSON.parse(content) as State;

  const stateBefore = {
    energy: { ...state.energy },
    integrity: { ...state.integrity },
  };

  actions.push(`Current energy: ${state.energy.current}, E_min: ${config.E_min}`);

  if (state.energy.current < config.E_min) {
    // Enter dormant state per DEF-047
    state.integrity.status = 'dormant';
    state.coupling.active = false;
    state.coupling.partner = null;
    state.coupling.since = null;

    // Set energy to minimum viable
    state.energy.current = config.E_min;

    actions.push('Entered dormant state (DEF-047)');
    actions.push('Decoupled from partner');
    actions.push(`Set energy to E_min: ${config.E_min}`);

    await writeFile(currentPath, JSON.stringify(state, null, 2));

    // Log dormant event
    await appendEvent(baseDir, 'STATE_UPDATE', {
      reason: 'Energy recovery - entered dormant state',
      energy: state.energy.current,
      status: 'dormant',
    });

    return {
      timestamp,
      invariant_id: 'INV-005',
      status: 'degraded',
      procedure: 'Energy recovery via dormant state',
      actions_taken: actions,
      state_before: stateBefore,
      state_after: { energy: state.energy, integrity: state.integrity },
    };
  }

  return {
    timestamp,
    invariant_id: 'INV-005',
    status: 'recovered',
    procedure: 'Energy verification',
    actions_taken: [...actions, 'Energy is viable - no action needed'],
    state_before: stateBefore,
    state_after: stateBefore,
  };
}

/**
 * §7.2.5 INV-001 Recovery: Organization Integrity
 * Note: Organization hash is immutable - cannot recover, only detect
 */
async function recoverOrganizationHash(
  baseDir: string
): Promise<RecoveryResult> {
  const timestamp = new Date().toISOString();

  // INV-001 violation is terminal - organization cannot be changed
  return {
    timestamp,
    invariant_id: 'INV-001',
    status: 'terminal',
    procedure: 'Organization integrity check',
    actions_taken: [
      'Organization hash is immutable',
      'Violation indicates tampering or corruption',
      'Manual intervention required',
      'System entering terminal state (DEF-048)',
    ],
    state_before: {},
    state_after: {},
  };
}

/**
 * Main recovery procedure
 * Attempts recovery for all violated invariants
 */
export async function recover(
  baseDir: string,
  violations: InvariantCheck[],
  config: Config = DEFAULT_CONFIG
): Promise<RecoveryReport> {
  const timestamp = new Date().toISOString();
  const violatedIds = violations.filter(v => !v.satisfied).map(v => v.id);
  const recoveries: RecoveryResult[] = [];

  // Process violations in priority order
  // INV-001 first (most critical - may be terminal)
  if (violatedIds.includes('INV-001')) {
    recoveries.push(await recoverOrganizationHash(baseDir));
  }

  // INV-003 second (chain must be valid for replay)
  if (violatedIds.includes('INV-003')) {
    recoveries.push(await recoverChainIntegrity(baseDir));
  }

  // INV-002 third (depends on valid chain)
  if (violatedIds.includes('INV-002')) {
    recoveries.push(await recoverStateDeterminism(baseDir));
  }

  // INV-004 fourth
  if (violatedIds.includes('INV-004')) {
    recoveries.push(await recoverLyapunovMonotone(baseDir));
  }

  // INV-005 last
  if (violatedIds.includes('INV-005')) {
    recoveries.push(await recoverEnergyViable(baseDir, config));
  }

  // Determine final status
  let finalStatus: 'nominal' | 'degraded' | 'dormant' | 'terminal' = 'nominal';

  for (const r of recoveries) {
    if (r.status === 'terminal') {
      finalStatus = 'terminal';
      break;
    }
    if (r.status === 'degraded') {
      finalStatus = 'degraded';
    }
  }

  // Check for dormant
  if (finalStatus !== 'terminal') {
    const currentPath = join(baseDir, 'state', 'current.json');
    const content = await readFile(currentPath, 'utf-8');
    const state = JSON.parse(content) as State;
    if (state.integrity.status === 'dormant') {
      finalStatus = 'dormant';
    }
  }

  // Compute final V
  let lyapunovV = 0;
  if (finalStatus !== 'nominal') {
    // V > 0 when not at attractor
    lyapunovV = finalStatus === 'terminal' ? 1.0 :
                finalStatus === 'dormant' ? 0.5 : 0.2;
  }

  // Log recovery event and update state to match
  if (recoveries.length > 0 && finalStatus !== 'terminal') {
    await appendEvent(baseDir, 'STATE_UPDATE', {
      reason: 'Recovery procedure executed',
      violations: violatedIds,
      recoveries: recoveries.map(r => ({ id: r.invariant_id, status: r.status })),
      final_status: finalStatus,
    });

    // Re-sync state after logging event
    const events = await loadEvents(baseDir);
    const currentPath = join(baseDir, 'state', 'current.json');
    const content = await readFile(currentPath, 'utf-8');
    const state = JSON.parse(content) as State;
    state.memory.event_count = events.length;
    state.memory.last_event_hash = events[events.length - 1].hash;
    state.updated = new Date().toISOString();
    await writeFile(currentPath, JSON.stringify(state, null, 2));
  }

  return {
    timestamp,
    violations_detected: violatedIds,
    recoveries_attempted: recoveries,
    final_status: finalStatus,
    lyapunov_V: lyapunovV,
  };
}

/**
 * Print recovery report
 */
export function printRecoveryReport(report: RecoveryReport): void {
  console.log('\n=== RECOVERY REPORT ===');
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Violations: ${report.violations_detected.join(', ') || 'none'}`);
  console.log(`Final Status: ${report.final_status.toUpperCase()}`);
  console.log(`Lyapunov V: ${report.lyapunov_V.toFixed(4)}`);

  if (report.recoveries_attempted.length > 0) {
    console.log('\nRecovery Procedures:');
    for (const r of report.recoveries_attempted) {
      const statusIcon = r.status === 'recovered' ? '✓' :
                         r.status === 'degraded' ? '⚠' : '✗';
      console.log(`  ${statusIcon} ${r.invariant_id}: ${r.procedure}`);
      console.log(`     Status: ${r.status}`);
      for (const action of r.actions_taken) {
        console.log(`     - ${action}`);
      }
    }
  }

  console.log('');
}

/**
 * Auto-recovery: detect and recover violations
 */
export async function autoRecover(
  baseDir: string,
  config: Config = DEFAULT_CONFIG
): Promise<RecoveryReport> {
  // Import verify to avoid circular dependency
  const { verifyAllInvariants } = await import('./verify.js');

  // Check current state
  const verification = await verifyAllInvariants(baseDir, config);

  if (verification.all_satisfied) {
    return {
      timestamp: new Date().toISOString(),
      violations_detected: [],
      recoveries_attempted: [],
      final_status: 'nominal',
      lyapunov_V: 0,
    };
  }

  // Attempt recovery
  return recover(baseDir, verification.invariants, config);
}
