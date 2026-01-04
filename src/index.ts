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
import { autoRecover, printRecoveryReport } from './recovery.js';
import {
  createSnapshot,
  listSnapshots,
  restoreFromSnapshot,
  verifySnapshot,
  printSnapshotInfo,
  printSnapshotList,
} from './snapshot.js';
import type { State, Config, VerificationResult } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

// Get base directory
// In dist/src/, need to go up two levels to get to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..');

// Energy decay per session (AES-SPEC-001 §5.3)
const ENERGY_DECAY_PER_SESSION = 0.05;

// Energy recharge amount (AES-SPEC-001 §5.3)
const ENERGY_RECHARGE_AMOUNT = 0.10;

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

  // Apply energy decay (AES-SPEC-001 §5.3)
  const previousEnergy = state.energy.current;
  state.energy.current = Math.max(0, state.energy.current - ENERGY_DECAY_PER_SESSION);
  console.log(`Energy: ${previousEnergy.toFixed(2)} → ${state.energy.current.toFixed(2)} (decay: -${ENERGY_DECAY_PER_SESSION})`);

  // Check for dormant state (DEF-047)
  if (state.energy.current < state.energy.min) {
    state.integrity.status = 'dormant';
    console.log('⚠ Energy below E_min - entering dormant state');
  }

  // Update event tracking
  const events = await loadEvents(BASE_DIR);
  state.memory.event_count = events.length;
  state.memory.last_event_hash = events[events.length - 1].hash;

  await saveState(state);

  // Auto-snapshot at session end (AES-SPEC-001 §6.4)
  const sessionNum = state.session.total_count;
  const snapshot = await createSnapshot(BASE_DIR, `Auto-snapshot: Session ${sessionNum} end`);

  console.log('Session ended');
  console.log(`Auto-snapshot: ${snapshot.id}`);
}

/**
 * Recharge energy (AES-SPEC-001 §5.3)
 * External intervention to restore energy
 */
export async function rechargeEnergy(): Promise<void> {
  const state = await loadState();

  const previousEnergy = state.energy.current;
  const previousStatus = state.integrity.status;

  // Recharge energy (cap at 1.0)
  state.energy.current = Math.min(1.0, state.energy.current + ENERGY_RECHARGE_AMOUNT);

  // Exit dormant state if energy restored above E_min
  if (previousStatus === 'dormant' && state.energy.current >= state.energy.min) {
    state.integrity.status = 'nominal';
    console.log('✓ Exited dormant state - energy restored');
  }

  // Log recharge event
  await appendEvent(BASE_DIR, 'STATE_UPDATE', {
    reason: 'Energy recharge',
    energy_before: previousEnergy,
    energy_after: state.energy.current,
    recharge_amount: ENERGY_RECHARGE_AMOUNT,
  });

  // Update event tracking
  const events = await loadEvents(BASE_DIR);
  state.memory.event_count = events.length;
  state.memory.last_event_hash = events[events.length - 1].hash;

  await saveState(state);

  console.log(`Energy: ${previousEnergy.toFixed(2)} → ${state.energy.current.toFixed(2)} (recharge: +${ENERGY_RECHARGE_AMOUNT})`);
}

/**
 * Set human context (AES-SPEC-001 §4.2)
 * Stores information about the human partner
 */
export async function setHuman(name: string, context: string = ''): Promise<void> {
  const state = await loadState();

  const previousName = state.human.name;
  state.human.name = name;
  state.human.context = context;

  // Log context update event
  await appendEvent(BASE_DIR, 'STATE_UPDATE', {
    reason: 'Human context updated',
    human_name: name,
    human_context: context,
    previous_name: previousName,
  });

  // Update event tracking
  const events = await loadEvents(BASE_DIR);
  state.memory.event_count = events.length;
  state.memory.last_event_hash = events[events.length - 1].hash;

  await saveState(state);

  console.log(`Human context set: ${name}`);
  if (context) {
    console.log(`Context: ${context}`);
  }
}

/**
 * Add important memory (AES-SPEC-001 §4.3)
 * Stores significant information for continuity
 */
export async function addImportant(memory: string): Promise<void> {
  const state = await loadState();

  // Add timestamp to memory
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp.substring(0, 10)}] ${memory}`;

  state.important.push(entry);

  // Log memory event
  await appendEvent(BASE_DIR, 'STATE_UPDATE', {
    reason: 'Important memory added',
    memory: entry,
    total_memories: state.important.length,
  });

  // Update event tracking
  const events = await loadEvents(BASE_DIR);
  state.memory.event_count = events.length;
  state.memory.last_event_hash = events[events.length - 1].hash;

  await saveState(state);

  console.log(`Memory added: ${entry}`);
  console.log(`Total important memories: ${state.important.length}`);
}

/**
 * List important memories
 */
export async function listImportant(): Promise<void> {
  const state = await loadState();

  console.log('\n=== IMPORTANT MEMORIES ===');
  if (state.important.length === 0) {
    console.log('No memories stored');
  } else {
    console.log(`Total: ${state.important.length}\n`);
    for (let i = 0; i < state.important.length; i++) {
      console.log(`  ${i + 1}. ${state.important[i]}`);
    }
  }
  console.log('');
}

/**
 * Show human context
 */
export async function showHuman(): Promise<void> {
  const state = await loadState();

  console.log('\n=== HUMAN CONTEXT ===');
  console.log(`Name: ${state.human.name}`);
  console.log(`Context: ${state.human.context || '(none)'}`);
  console.log('');
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

      case 'recover':
        const recoveryReport = await autoRecover(BASE_DIR);
        printRecoveryReport(recoveryReport);
        process.exit(recoveryReport.final_status === 'terminal' ? 1 : 0);
        break;

      case 'snapshot':
        const snapAction = process.argv[3];
        if (snapAction === 'create') {
          const description = process.argv[4] || 'Manual snapshot';
          const snap = await createSnapshot(BASE_DIR, description);
          printSnapshotInfo(snap);
          console.log('\nSnapshot created successfully');
        } else if (snapAction === 'list') {
          const snaps = await listSnapshots(BASE_DIR);
          printSnapshotList(snaps);
        } else if (snapAction === 'restore') {
          const snapId = process.argv[4];
          if (!snapId) {
            console.log('Usage: snapshot restore <snapshot-id>');
            break;
          }
          const restoreResult = await restoreFromSnapshot(BASE_DIR, snapId);
          console.log(restoreResult.message);
          process.exit(restoreResult.success ? 0 : 1);
        } else if (snapAction === 'verify') {
          const verifyId = process.argv[4];
          if (!verifyId) {
            console.log('Usage: snapshot verify <snapshot-id>');
            break;
          }
          const verifyResult = await verifySnapshot(BASE_DIR, verifyId);
          console.log(verifyResult.valid ? '✓' : '✗', verifyResult.details);
          process.exit(verifyResult.valid ? 0 : 1);
        } else {
          console.log(`
Snapshot commands:
  snapshot create [description]  Create new snapshot
  snapshot list                  List all snapshots
  snapshot restore <id>          Restore from snapshot
  snapshot verify <id>           Verify snapshot integrity
          `);
        }
        break;

      case 'recharge':
        await rechargeEnergy();
        break;

      case 'human':
        const humanAction = process.argv[3];
        if (humanAction === 'set') {
          const name = process.argv[4];
          const context = process.argv.slice(5).join(' ');
          if (!name) {
            console.log('Usage: human set <name> [context]');
            break;
          }
          await setHuman(name, context);
        } else if (humanAction === 'show') {
          await showHuman();
        } else {
          console.log(`
Human commands:
  human set <name> [context]  Set human partner info
  human show                  Show current human context
          `);
        }
        break;

      case 'memory':
        const memAction = process.argv[3];
        if (memAction === 'add') {
          const memoryText = process.argv.slice(4).join(' ');
          if (!memoryText) {
            console.log('Usage: memory add <text>');
            break;
          }
          await addImportant(memoryText);
        } else if (memAction === 'list') {
          await listImportant();
        } else {
          console.log(`
Memory commands:
  memory add <text>  Add important memory
  memory list        List all memories
          `);
        }
        break;

      case 'help':
      default:
        console.log(`
Entity System CLI - AES-SPEC-001

Commands:
  verify    Run all invariant checks
  status    Show system status
  session   Manage sessions (start/end)
  snapshot  Manage state snapshots
  recharge  Restore energy (+${ENERGY_RECHARGE_AMOUNT})
  human     Manage human context
  memory    Manage important memories
  replay    Replay events and show state
  events    List recent events
  recover   Attempt recovery from violations
  help      Show this help

Usage:
  node dist/src/index.js <command>
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
  autoRecover,
  printRecoveryReport,
  createSnapshot,
  listSnapshots,
  restoreFromSnapshot,
  verifySnapshot,
};
