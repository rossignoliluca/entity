/**
 * Entity System Entry Point
 * AES-SPEC-001 v1.0.0
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { verifyAllInvariants, printVerificationReport, quickHealthCheck } from './verify.js';
import { appendEvent, loadEvents, replayEvents } from './events.js';
import { computeV } from './lyapunov.js';
import { guard, type Operation } from './guard.js';
import type { State, Config, VerificationResult } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

// Get base directory
// In dist/src/, need to go up two levels to get to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..');

/**
 * Load current state
 */
export async function loadState(): Promise<State> {
  const content = await readFile(
    join(BASE_DIR, 'state', 'current.json'),
    'utf-8'
  );
  return JSON.parse(content) as State;
}

/**
 * Save current state
 */
export async function saveState(state: State): Promise<void> {
  state.updated = new Date().toISOString();
  await writeFile(
    join(BASE_DIR, 'state', 'current.json'),
    JSON.stringify(state, null, 2)
  );
}

/**
 * Start session
 */
export async function startSession(
  partner: string = 'human'
): Promise<string> {
  const state = await loadState();
  const sessionId = randomUUID();

  // Append session start event
  await appendEvent(BASE_DIR, 'SESSION_START', {
    session_id: sessionId,
    partner,
  });

  // Update state
  state.session.current_id = sessionId;
  state.session.total_count++;
  state.coupling.active = true;
  state.coupling.partner = partner;
  state.coupling.since = new Date().toISOString();

  // Update event tracking
  const events = await loadEvents(BASE_DIR);
  state.memory.event_count = events.length;
  state.memory.last_event_hash = events[events.length - 1].hash;

  await saveState(state);

  console.log(`Session started: ${sessionId}`);
  return sessionId;
}

/**
 * End session
 */
export async function endSession(): Promise<void> {
  const state = await loadState();

  if (!state.session.current_id) {
    console.log('No active session');
    return;
  }

  // Append session end event
  await appendEvent(BASE_DIR, 'SESSION_END', {
    session_id: state.session.current_id,
  });

  // Update state
  state.session.current_id = null;
  state.coupling.active = false;
  state.coupling.partner = null;
  state.coupling.since = null;

  // Update event tracking
  const events = await loadEvents(BASE_DIR);
  state.memory.event_count = events.length;
  state.memory.last_event_hash = events[events.length - 1].hash;

  await saveState(state);

  console.log('Session ended');
}

/**
 * Execute operation with guard
 */
export async function execute(
  operation: Operation,
  config: Config = DEFAULT_CONFIG
): Promise<{ success: boolean; result?: unknown; reason?: string }> {
  const state = await loadState();

  // Guard check
  const { allowed, result: guardResult } = guard(operation, state, config);

  if (!allowed) {
    // Log block event
    await appendEvent(BASE_DIR, 'BLOCK', {
      operation: operation.type,
      reason: guardResult.status === 'block' ? guardResult.reason : 'unknown',
      axiom: guardResult.status === 'block' ? guardResult.axiom : undefined,
    });

    return {
      success: false,
      reason:
        guardResult.status === 'block'
          ? guardResult.reason
          : 'Operation blocked (unknown status)',
    };
  }

  // Execute (placeholder - actual execution depends on operation type)
  console.log(`Executing: ${operation.type}`);

  // Log operation event
  await appendEvent(BASE_DIR, 'OPERATION', {
    type: operation.type,
    params: operation.params,
  });

  // Update state
  const newState = await loadState();
  const events = await loadEvents(BASE_DIR);
  newState.memory.event_count = events.length;
  newState.memory.last_event_hash = events[events.length - 1].hash;
  await saveState(newState);

  return { success: true };
}

/**
 * Run verification
 */
export async function verify(): Promise<VerificationResult> {
  const result = await verifyAllInvariants(BASE_DIR);

  // Log verification event
  await appendEvent(BASE_DIR, 'VERIFICATION', {
    all_satisfied: result.all_satisfied,
    violations: result.invariants.filter((i) => !i.satisfied).length,
    status: result.all_satisfied ? 'nominal' : 'degraded',
    lyapunov_V: result.lyapunov_V,
  });

  // Update state
  const state = await loadState();
  state.integrity.last_verification = result.timestamp;
  state.integrity.invariant_violations = result.invariants.filter(
    (i) => !i.satisfied
  ).length;
  state.integrity.status = result.all_satisfied ? 'nominal' : 'degraded';
  state.lyapunov.V_previous = state.lyapunov.V;
  state.lyapunov.V = result.lyapunov_V;

  const events = await loadEvents(BASE_DIR);
  state.memory.event_count = events.length;
  state.memory.last_event_hash = events[events.length - 1].hash;

  await saveState(state);

  return result;
}

/**
 * Get system status
 */
export async function status(): Promise<void> {
  const state = await loadState();
  const health = await quickHealthCheck(BASE_DIR);

  console.log('\n=== ENTITY STATUS ===');
  console.log(`Specification: ${state.specification}`);
  console.log(`Organization: ${state.organization_hash.substring(0, 16)}...`);
  console.log(`Health: ${health.healthy ? '✓ Healthy' : '✗ Issues'}`);
  console.log(`Status: ${state.integrity.status}`);
  console.log(`Energy: ${state.energy.current.toFixed(2)}`);
  console.log(`Lyapunov V: ${state.lyapunov.V.toFixed(6)}`);
  console.log(`Events: ${state.memory.event_count}`);
  console.log(`Sessions: ${state.session.total_count}`);
  console.log(`Coupled: ${state.coupling.active ? 'Yes' : 'No'}`);

  if (!health.healthy) {
    console.log('\nIssues:');
    for (const issue of health.issues) {
      console.log(`  - ${issue}`);
    }
  }

  console.log('');
}

/**
 * CLI handler
 */
async function main(): Promise<void> {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'verify':
        const result = await verify();
        printVerificationReport(result);
        process.exit(result.all_satisfied ? 0 : 1);
        break;

      case 'status':
        await status();
        break;

      case 'session':
        const action = process.argv[3];
        if (action === 'start') {
          await startSession(process.argv[4] || 'human');
        } else if (action === 'end') {
          await endSession();
        } else {
          console.log('Usage: entity session [start|end]');
        }
        break;

      case 'replay':
        const replayed = await replayEvents(BASE_DIR);
        console.log(JSON.stringify(replayed, null, 2));
        break;

      case 'events':
        const events = await loadEvents(BASE_DIR);
        console.log(`Total events: ${events.length}`);
        for (const e of events.slice(-10)) {
          console.log(`  ${e.seq}: ${e.type} @ ${e.timestamp}`);
        }
        break;

      case 'help':
      default:
        console.log(`
Entity System CLI

Commands:
  verify    Run all invariant checks
  status    Show system status
  session   Manage sessions (start/end)
  replay    Replay events and show state
  events    List recent events
  help      Show this help

Usage:
  npx ts-node src/index.ts <command>
        `);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();

// Exports for programmatic use
export {
  BASE_DIR,
  DEFAULT_CONFIG,
  loadEvents,
  replayEvents,
  verifyAllInvariants,
  quickHealthCheck,
  computeV,
  guard,
};
