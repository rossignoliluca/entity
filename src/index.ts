/**
 * Entity System Entry Point
 * AES-SPEC-001 v1.0.0
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
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
import {
  OPERATIONS_CATALOG,
  getOperation,
  listOperations,
  executeOperation,
  printCatalog,
  isAllowedOperation,
} from './operations.js';
import {
  analyzePatterns,
  printLearningReport,
  getAdaptiveSuggestion,
  type LearningState,
} from './learning.js';
import { hashObject } from './hash.js';
import {
  generateDashboard,
  printDashboard,
  getQuickSummary,
  exportMetrics,
} from './analytics.js';
import {
  exportState,
  saveBundleToFile,
  loadBundleFromFile,
  verifyBundle,
  importState,
  verifyIdentity,
  generateFingerprint,
  compareSyncStatus,
  fastForwardMerge,
  printBundleInfo,
  printIdentityVerification,
  printSyncStatus,
  generateExportFilename,
} from './continuity.js';
import {
  defineOperation,
  composeOperations,
  specializeOperation,
  listGeneratedOperations,
  getAutopoiesisStats,
  printAutopoiesisReport,
  getCombinedCatalog,
  META_OPERATIONS_CATALOG,
  type HandlerTemplate,
} from './meta-operations.js';

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
 * Run operation from catalog (AES-SPEC-001 Phase 3)
 */
export async function runOperation(
  operationId: string,
  params: Record<string, unknown> = {}
): Promise<void> {
  const state = await loadState();

  // Check if operation exists in catalog
  if (!isAllowedOperation(operationId)) {
    console.log(`Unknown operation: ${operationId}`);
    console.log('Use "op list" to see available operations');
    return;
  }

  const opDef = getOperation(operationId)!;

  // Execute operation
  const result = executeOperation(operationId, state, params);

  if (!result.success) {
    console.log(`Operation failed: ${result.message}`);
    return;
  }

  // Apply state changes if any
  if (result.stateChanges) {
    Object.assign(state, result.stateChanges);
  }

  // Deduct energy cost
  state.energy.current = Math.max(0, state.energy.current - opDef.energyCost);

  // Log operation event
  await appendEvent(BASE_DIR, 'OPERATION', {
    operation: operationId,
    params,
    result: result.message,
    energy_cost: opDef.energyCost,
  });

  // Update event tracking
  const events = await loadEvents(BASE_DIR);
  state.memory.event_count = events.length;
  state.memory.last_event_hash = events[events.length - 1].hash;

  await saveState(state);

  console.log(`[${operationId}] ${result.message}`);
  if (result.effects) {
    console.log('Effects:', JSON.stringify(result.effects, null, 2));
  }
}

/**
 * Run pattern analysis (AES-SPEC-001 Phase 4)
 */
export async function runLearningAnalysis(): Promise<LearningState> {
  const state = await loadState();
  const events = await loadEvents(BASE_DIR);

  // Analyze patterns
  const learning = analyzePatterns(events);

  // Compute patterns hash for tracking changes
  const patternsHash = hashObject(learning.patterns);

  // Log learning event
  await appendEvent(BASE_DIR, 'LEARNING', {
    reason: 'Pattern analysis',
    patterns_hash: patternsHash,
    sessions_analyzed: learning.patterns.sessions.totalSessions,
    operations_tracked: learning.patterns.operations.length,
    insights_count: learning.insights.length,
  });

  // Update state
  state.learning.lastAnalysis = learning.lastAnalysis;
  state.learning.patternsHash = patternsHash;

  const updatedEvents = await loadEvents(BASE_DIR);
  state.memory.event_count = updatedEvents.length;
  state.memory.last_event_hash = updatedEvents[updatedEvents.length - 1].hash;

  await saveState(state);

  return learning;
}

/**
 * Show learning report (AES-SPEC-001 Phase 4)
 */
export async function showLearningReport(): Promise<void> {
  const events = await loadEvents(BASE_DIR);
  const learning = analyzePatterns(events);
  printLearningReport(learning);
}

/**
 * Get adaptive suggestion (AES-SPEC-001 Phase 4)
 */
export async function getLearningsuggestion(): Promise<string | null> {
  const state = await loadState();
  const events = await loadEvents(BASE_DIR);
  const learning = analyzePatterns(events);
  return getAdaptiveSuggestion(state, learning);
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

      case 'op':
        const opAction = process.argv[3];
        if (opAction === 'list') {
          printCatalog();
        } else if (opAction === 'run') {
          const opId = process.argv[4];
          if (!opId) {
            console.log('Usage: op run <operation-id> [params...]');
            break;
          }
          // Parse params from remaining args (key=value format)
          const params: Record<string, unknown> = {};
          for (let i = 5; i < process.argv.length; i++) {
            const arg = process.argv[i];
            const eqIndex = arg.indexOf('=');
            if (eqIndex > 0) {
              const key = arg.substring(0, eqIndex);
              let value: unknown = arg.substring(eqIndex + 1);
              // Try to parse as JSON for complex values
              try {
                value = JSON.parse(value as string);
              } catch {
                // Keep as string
              }
              params[key] = value;
            }
          }
          await runOperation(opId, params);
        } else if (opAction === 'info') {
          const opId = process.argv[4];
          if (!opId) {
            console.log('Usage: op info <operation-id>');
            break;
          }
          const op = getOperation(opId);
          if (!op) {
            console.log(`Unknown operation: ${opId}`);
          } else {
            console.log(`\n=== ${op.id} ===`);
            console.log(`Name: ${op.name}`);
            console.log(`Description: ${op.description}`);
            console.log(`Category: ${op.category}`);
            console.log(`Complexity: ${op.complexity}`);
            console.log(`Energy cost: ${op.energyCost}`);
            console.log(`Requires coupling: ${op.requiresCoupling}`);
            console.log('');
          }
        } else {
          console.log(`
Operation commands:
  op list              List all available operations
  op run <id> [params] Execute operation (params: key=value)
  op info <id>         Show operation details
          `);
        }
        break;

      case 'learn':
        const learnAction = process.argv[3];
        if (learnAction === 'analyze') {
          console.log('Running pattern analysis...');
          const learning = await runLearningAnalysis();
          printLearningReport(learning);
          console.log('\nAnalysis logged to event chain');
        } else if (learnAction === 'report') {
          await showLearningReport();
        } else if (learnAction === 'suggest') {
          const suggestion = await getLearningsuggestion();
          if (suggestion) {
            console.log(`\n💡 Suggestion: ${suggestion}\n`);
          } else {
            console.log('\nNo suggestions at this time\n');
          }
        } else {
          console.log(`
Learning commands:
  learn analyze   Run pattern analysis and log results
  learn report    Show current learning report (no logging)
  learn suggest   Get adaptive suggestion based on patterns
          `);
        }
        break;

      case 'analytics':
        const analyticsAction = process.argv[3];
        const analyticsEvents = await loadEvents(BASE_DIR);
        const analyticsState = await loadState();
        const dashboard = generateDashboard(analyticsEvents, analyticsState);

        if (analyticsAction === 'dashboard' || !analyticsAction) {
          printDashboard(dashboard);
        } else if (analyticsAction === 'summary') {
          console.log('\n' + getQuickSummary(dashboard) + '\n');
        } else if (analyticsAction === 'export') {
          console.log(exportMetrics(dashboard));
        } else if (analyticsAction === 'alerts') {
          if (dashboard.alerts.length === 0) {
            console.log('\n✓ No alerts\n');
          } else {
            console.log('\n=== ALERTS ===\n');
            for (const alert of dashboard.alerts) {
              const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '🔵';
              console.log(`${icon} [${alert.level.toUpperCase()}] ${alert.message}`);
              if (alert.recommendation) {
                console.log(`   → ${alert.recommendation}`);
              }
            }
            console.log('');
          }
        } else {
          console.log(`
Analytics commands:
  analytics              Show full dashboard
  analytics dashboard    Show full dashboard
  analytics summary      Quick one-line summary
  analytics alerts       Show only alerts
  analytics export       Export metrics as JSON
          `);
        }
        break;

      case 'continuity':
        const contAction = process.argv[3];
        const contEvents = await loadEvents(BASE_DIR);
        const contState = await loadState();

        if (contAction === 'export') {
          const outputPath = process.argv[4] || join(BASE_DIR, 'exports', generateExportFilename(contState));
          // Ensure exports directory exists
          try {
            await mkdir(join(BASE_DIR, 'exports'), { recursive: true });
          } catch { /* ignore if exists */ }

          const bundle = await exportState(BASE_DIR, contState, contEvents);
          await saveBundleToFile(bundle, outputPath);
          console.log(`\n✓ State exported to: ${outputPath}`);
          console.log(`  Events: ${bundle.events.length}`);
          console.log(`  Token:  ${bundle.continuity_token.id}`);
          console.log(`  Hash:   ${bundle.bundle_hash.substring(0, 32)}...\n`);
        } else if (contAction === 'import') {
          const inputPath = process.argv[4];
          if (!inputPath) {
            console.log('Usage: continuity import <bundle-file> [--overwrite]');
            break;
          }
          const overwrite = process.argv.includes('--overwrite');
          try {
            const bundle = await loadBundleFromFile(inputPath);
            const result = await importState(BASE_DIR, bundle, { overwrite });
            console.log(result.success ? `\n✓ ${result.message}\n` : `\n✗ ${result.message}\n`);
          } catch (err) {
            console.log(`\n✗ Failed to load bundle: ${err}\n`);
          }
        } else if (contAction === 'verify') {
          const bundlePath = process.argv[4];
          if (!bundlePath) {
            console.log('Usage: continuity verify <bundle-file>');
            break;
          }
          try {
            const bundle = await loadBundleFromFile(bundlePath);
            const verification = verifyBundle(bundle);
            if (verification.valid) {
              console.log('\n✓ Bundle is valid\n');
              printBundleInfo(bundle);
            } else {
              console.log('\n✗ Bundle verification failed:');
              for (const err of verification.errors) {
                console.log(`  - ${err}`);
              }
              console.log('');
            }
          } catch (err) {
            console.log(`\n✗ Failed to load bundle: ${err}\n`);
          }
        } else if (contAction === 'identity') {
          const bundlePath = process.argv[4];
          if (bundlePath) {
            try {
              const bundle = await loadBundleFromFile(bundlePath);
              const result = verifyIdentity({ state: contState, events: contEvents }, bundle);
              printIdentityVerification(result);
            } catch (err) {
              console.log(`\n✗ Failed to load bundle: ${err}\n`);
            }
          } else {
            // Show local fingerprint
            const fingerprint = generateFingerprint(contState, contEvents);
            console.log(`\n=== IDENTITY FINGERPRINT ===\n`);
            console.log(`Fingerprint: ${fingerprint}`);
            console.log(`Org Hash:    ${contState.organization_hash.substring(0, 32)}...`);
            console.log(`Created:     ${contState.created}`);
            console.log(`Events:      ${contEvents.length}`);
            console.log(`Sessions:    ${contState.session.total_count}\n`);
          }
        } else if (contAction === 'sync') {
          const bundlePath = process.argv[4];
          if (!bundlePath) {
            console.log('Usage: continuity sync <bundle-file>');
            break;
          }
          try {
            const bundle = await loadBundleFromFile(bundlePath);
            const status = compareSyncStatus(contEvents, bundle.events);
            printSyncStatus(status);

            if (status.can_merge && bundle.events.length > contEvents.length) {
              console.log('Run with --merge to fast-forward local state');
            }

            if (process.argv.includes('--merge') && status.can_merge) {
              const result = await fastForwardMerge(BASE_DIR, contEvents, bundle);
              console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
            }
          } catch (err) {
            console.log(`\n✗ Failed to load bundle: ${err}\n`);
          }
        } else {
          console.log(`
Continuity commands (Phase 6):
  continuity export [path]       Export state as portable bundle
  continuity import <file>       Import state from bundle (--overwrite)
  continuity verify <file>       Verify bundle integrity
  continuity identity [file]     Show/verify identity fingerprint
  continuity sync <file>         Compare and sync with remote bundle (--merge)
          `);
        }
        break;

      case 'meta':
        const metaAction = process.argv[3];
        const metaState = await loadState();

        if (metaAction === 'define') {
          // Usage: meta define <id> <name> <template> [params...]
          const opId = process.argv[4];
          const opName = process.argv[5];
          const template = process.argv[6] as HandlerTemplate;

          if (!opId || !opName || !template) {
            console.log('Usage: meta define <id> <name> <template> [templateParams...]');
            console.log('Templates: read_field, set_field, compose, conditional, transform, aggregate, echo');
            console.log('Example: meta define custom.greet "Custom Greet" echo message="Hello!"');
            break;
          }

          // Parse template params
          const templateParams: Record<string, unknown> = {};
          for (let i = 7; i < process.argv.length; i++) {
            const arg = process.argv[i];
            const eqIndex = arg.indexOf('=');
            if (eqIndex > 0) {
              const key = arg.substring(0, eqIndex);
              let value: unknown = arg.substring(eqIndex + 1);
              try {
                value = JSON.parse(value as string);
              } catch {
                // Keep as string
              }
              templateParams[key] = value;
            }
          }

          const defineResult = defineOperation(metaState, {
            id: opId,
            name: opName,
            description: `Generated operation: ${opName}`,
            template,
            templateParams,
          });

          if (defineResult.success) {
            // Apply state changes
            if (defineResult.stateChanges) {
              Object.assign(metaState, defineResult.stateChanges);
            }

            // Log meta-operation event
            await appendEvent(BASE_DIR, 'META_OPERATION', {
              action: 'define',
              operation_id: opId,
              template,
              autopoiesis: metaState.autopoiesis,
            });

            // Update event tracking
            const metaEvents = await loadEvents(BASE_DIR);
            metaState.memory.event_count = metaEvents.length;
            metaState.memory.last_event_hash = metaEvents[metaEvents.length - 1].hash;

            await saveState(metaState);

            console.log(`\n✓ Operation generated: ${opId}`);
            console.log(`  Template: ${template}`);
            console.log(`  DEF-007: Self-production achieved\n`);
          } else {
            console.log(`\n✗ ${defineResult.message}\n`);
          }
        } else if (metaAction === 'compose') {
          // Usage: meta compose <id> <name> <op1,op2,...>
          const opId = process.argv[4];
          const opName = process.argv[5];
          const opsStr = process.argv[6];

          if (!opId || !opName || !opsStr) {
            console.log('Usage: meta compose <id> <name> <op1,op2,...>');
            console.log('Example: meta compose combined.status "Combined Status" state.read,energy.status');
            break;
          }

          const operations = opsStr.split(',');
          const composeResult = composeOperations(metaState, {
            id: opId,
            name: opName,
            description: `Composed from: ${operations.join(', ')}`,
            operations,
          });

          if (composeResult.success) {
            if (composeResult.stateChanges) {
              Object.assign(metaState, composeResult.stateChanges);
            }

            await appendEvent(BASE_DIR, 'META_OPERATION', {
              action: 'compose',
              operation_id: opId,
              source_operations: operations,
              autopoiesis: metaState.autopoiesis,
            });

            const metaEvents = await loadEvents(BASE_DIR);
            metaState.memory.event_count = metaEvents.length;
            metaState.memory.last_event_hash = metaEvents[metaEvents.length - 1].hash;

            await saveState(metaState);

            console.log(`\n✓ Composed operation: ${opId}`);
            console.log(`  From: ${operations.join(' → ')}`);
            console.log(`  DEF-007: Self-production achieved\n`);
          } else {
            console.log(`\n✗ ${composeResult.message}\n`);
          }
        } else if (metaAction === 'specialize') {
          // Usage: meta specialize <id> <name> <sourceOp> [presetParams...]
          const opId = process.argv[4];
          const opName = process.argv[5];
          const sourceOp = process.argv[6];

          if (!opId || !opName || !sourceOp) {
            console.log('Usage: meta specialize <id> <name> <sourceOp> [presetParams...]');
            console.log('Example: meta specialize greet.luca "Greet Luca" interaction.greet target=Luca');
            break;
          }

          const presetParams: Record<string, unknown> = {};
          for (let i = 7; i < process.argv.length; i++) {
            const arg = process.argv[i];
            const eqIndex = arg.indexOf('=');
            if (eqIndex > 0) {
              const key = arg.substring(0, eqIndex);
              let value: unknown = arg.substring(eqIndex + 1);
              try {
                value = JSON.parse(value as string);
              } catch {
                // Keep as string
              }
              presetParams[key] = value;
            }
          }

          const specResult = specializeOperation(metaState, {
            id: opId,
            name: opName,
            description: `Specialized from: ${sourceOp}`,
            sourceOperation: sourceOp,
            presetParams,
          });

          if (specResult.success) {
            if (specResult.stateChanges) {
              Object.assign(metaState, specResult.stateChanges);
            }

            await appendEvent(BASE_DIR, 'META_OPERATION', {
              action: 'specialize',
              operation_id: opId,
              source_operation: sourceOp,
              autopoiesis: metaState.autopoiesis,
            });

            const metaEvents = await loadEvents(BASE_DIR);
            metaState.memory.event_count = metaEvents.length;
            metaState.memory.last_event_hash = metaEvents[metaEvents.length - 1].hash;

            await saveState(metaState);

            console.log(`\n✓ Specialized operation: ${opId}`);
            console.log(`  From: ${sourceOp}`);
            console.log(`  DEF-007: Self-production achieved\n`);
          } else {
            console.log(`\n✗ ${specResult.message}\n`);
          }
        } else if (metaAction === 'list') {
          const genOps = listGeneratedOperations(metaState);
          console.log('\n=== GENERATED OPERATIONS ===\n');
          if (genOps.length === 0) {
            console.log('No operations generated yet');
            console.log('Use "meta define" to create first operation');
          } else {
            for (const op of genOps) {
              console.log(`${op.id} [gen ${op.generation}]`);
              console.log(`  Name: ${op.name}`);
              console.log(`  Template: ${op.template}`);
              console.log(`  Generated by: ${op.generatedBy}`);
              if (op.parentOperations) {
                console.log(`  Parents: ${op.parentOperations.join(', ')}`);
              }
            }
          }
          console.log('');
        } else if (metaAction === 'report' || metaAction === 'status') {
          printAutopoiesisReport(metaState);
        } else if (metaAction === 'catalog') {
          // Show combined catalog (base + meta + generated)
          const combined = getCombinedCatalog(metaState);
          const baseOps = Object.keys(OPERATIONS_CATALOG);
          const metaOps = Object.keys(META_OPERATIONS_CATALOG);
          const genOps = listGeneratedOperations(metaState).map((o) => o.id);

          console.log('\n=== COMPLETE OPERATIONS CATALOG ===\n');
          console.log(`[BASE] (${baseOps.length} operations)`);
          for (const id of baseOps) {
            console.log(`  ${id}`);
          }
          console.log('');
          console.log(`[META] (${metaOps.length} operations) - P set for DEF-007`);
          for (const id of metaOps) {
            console.log(`  ${id}`);
          }
          console.log('');
          if (genOps.length > 0) {
            console.log(`[GENERATED] (${genOps.length} operations) - Self-produced`);
            for (const id of genOps) {
              console.log(`  ${id}`);
            }
            console.log('');
          }
          console.log(`Total |𝕆|: ${Object.keys(combined).length}\n`);
        } else {
          const stats = getAutopoiesisStats(metaState);
          console.log(`
Meta-Operations (Phase 7a: Self-Production)

DEF-007: Autopoietic(S) ⟺ OperationallyClosed(S) ∧ ∃ P ⊆ 𝕆 : P generates 𝕆
Status: ${stats.satisfiesDEF007 ? '✓ AUTOPOIETIC' : '○ Not yet autopoietic'}

Commands:
  meta define <id> <name> <template> [params]   Create new operation from template
  meta compose <id> <name> <op1,op2,...>        Combine operations
  meta specialize <id> <name> <source> [params] Specialize existing operation
  meta list                                      List generated operations
  meta report                                    Show autopoiesis report
  meta catalog                                   Show complete catalog

Templates: read_field, set_field, compose, conditional, transform, aggregate, echo
          `);
        }
        break;

      case 'daemon':
        const daemonAction = process.argv[3];
        const { Daemon, sendDaemonCommand, isDaemonRunning } = await import('./daemon/index.js');
        const socketPath = join(BASE_DIR, 'daemon.sock');

        if (daemonAction === 'start') {
          // Check if already running
          const running = await isDaemonRunning(socketPath);
          if (running) {
            console.log('Daemon is already running');
            break;
          }

          // Start daemon in background
          const daemon = new Daemon(BASE_DIR);
          const result = await daemon.start();

          if (result.success) {
            console.log(`\n${result.message}`);
            console.log('Daemon is now running in background');
            console.log('Use "daemon status" to check status');
            console.log('Use "daemon stop" to stop\n');

            // Keep process running
            daemon.on('log', ({ level, message }) => {
              if (level === 'error') console.error(`[DAEMON] ${message}`);
            });

            // Exit when daemon stops (via IPC command)
            daemon.on('stopped', () => {
              console.log('\nDaemon stopped via IPC command');
              process.exit(0);
            });

            // Handle shutdown signals
            process.on('SIGINT', async () => {
              console.log('\nStopping daemon...');
              await daemon.stop();
              process.exit(0);
            });

            process.on('SIGTERM', async () => {
              await daemon.stop();
              process.exit(0);
            });

            // Keep alive
            const keepAlive = setInterval(() => {
              if (!daemon.isRunning()) {
                clearInterval(keepAlive);
                process.exit(0);
              }
            }, 1000);
          } else {
            console.log(`\n${result.message}\n`);
            process.exit(1);
          }
        } else if (daemonAction === 'stop') {
          try {
            const result = await sendDaemonCommand(socketPath, { type: 'stop' });
            console.log('\nDaemon stopped\n');
          } catch (error) {
            console.log('\nDaemon is not running\n');
          }
        } else if (daemonAction === 'status') {
          try {
            const status = await sendDaemonCommand(socketPath, { type: 'status' }) as {
              running: boolean;
              pid: number;
              uptime: number;
              scheduledTasks: number;
              activeHooks: number;
              lastCheck: string;
            };

            console.log('\n=== DAEMON STATUS ===\n');
            console.log(`Running: ${status.running ? 'Yes' : 'No'}`);
            console.log(`PID: ${status.pid}`);
            console.log(`Uptime: ${status.uptime}s`);
            console.log(`Scheduled Tasks: ${status.scheduledTasks}`);
            console.log(`Active Hooks: ${status.activeHooks}`);
            console.log(`Last Check: ${status.lastCheck || 'Never'}`);
            console.log('');
          } catch {
            console.log('\nDaemon is not running\n');
          }
        } else if (daemonAction === 'tasks') {
          try {
            const tasks = await sendDaemonCommand(socketPath, { type: 'tasks' }) as Array<{
              id: string;
              name: string;
              operation: string;
              interval: number;
              enabled: boolean;
              lastRun?: string;
              runCount?: number;
            }>;

            console.log('\n=== SCHEDULED TASKS ===\n');
            if (tasks.length === 0) {
              console.log('No tasks scheduled');
            } else {
              for (const task of tasks) {
                const status = task.enabled ? 'ON' : 'OFF';
                const interval = Math.round(task.interval / 1000);
                console.log(`[${status}] ${task.id}: ${task.operation} (every ${interval}s)`);
                if (task.lastRun) {
                  console.log(`     Last run: ${task.lastRun} (${task.runCount || 0} times)`);
                }
              }
            }
            console.log('');
          } catch {
            console.log('\nDaemon is not running\n');
          }
        } else if (daemonAction === 'logs') {
          try {
            const count = parseInt(process.argv[4] || '20', 10);
            const logs = await sendDaemonCommand(socketPath, { type: 'logs', payload: count }) as string[];

            console.log('\n=== DAEMON LOGS ===\n');
            if (logs.length === 0) {
              console.log('No logs available');
            } else {
              for (const line of logs) {
                console.log(line);
              }
            }
            console.log('');
          } catch {
            console.log('\nDaemon is not running\n');
          }
        } else if (daemonAction === 'maintenance') {
          try {
            const report = await sendDaemonCommand(socketPath, { type: 'maintenance' }) as {
              timestamp: string;
              checks: {
                energy: { level: number; status: string };
                invariants: { satisfied: number; violated: number; status: string };
                lyapunov: { V: number; stable: boolean };
              };
              actions: string[];
              errors: string[];
            };

            console.log('\n=== MAINTENANCE REPORT ===\n');
            console.log(`Timestamp: ${report.timestamp}`);
            console.log('');
            console.log('Checks:');
            console.log(`  Energy: ${(report.checks.energy.level * 100).toFixed(0)}% (${report.checks.energy.status})`);
            console.log(`  Invariants: ${report.checks.invariants.satisfied}/${report.checks.invariants.satisfied + report.checks.invariants.violated} (${report.checks.invariants.status})`);
            console.log(`  Lyapunov V: ${report.checks.lyapunov.V.toFixed(4)} (${report.checks.lyapunov.stable ? 'stable' : 'unstable'})`);

            if (report.actions.length > 0) {
              console.log('\nActions:');
              for (const action of report.actions) {
                console.log(`  - ${action}`);
              }
            }

            if (report.errors.length > 0) {
              console.log('\nErrors:');
              for (const error of report.errors) {
                console.log(`  - ${error}`);
              }
            }
            console.log('');
          } catch {
            console.log('\nDaemon is not running\n');
          }
        } else {
          const running = await isDaemonRunning(socketPath);
          console.log(`
Daemon Commands (Phase 7b: Autonomous Operation)

Status: ${running ? 'RUNNING' : 'STOPPED'}

Commands:
  daemon start        Start daemon in foreground
  daemon stop         Stop running daemon
  daemon status       Show daemon status
  daemon tasks        List scheduled tasks
  daemon logs [n]     Show last n log lines (default: 20)
  daemon maintenance  Run maintenance check now

Default scheduled tasks:
  - health-check: every 5 minutes
  - energy-check: every 2 minutes
  - autopoiesis-check: every hour
          `);
        }
        break;

      case 'help':
      default:
        console.log(`
Entity System CLI - AES-SPEC-001

Commands:
  verify      Run all invariant checks
  status      Show system status
  session     Manage sessions (start/end)
  snapshot    Manage state snapshots
  recharge    Restore energy (+${ENERGY_RECHARGE_AMOUNT})
  human       Manage human context
  memory      Manage important memories
  op          Execute operations from catalog
  learn       Pattern analysis and learning (Phase 4)
  analytics   Metrics dashboard and insights (Phase 5)
  continuity  Multi-instance export/import (Phase 6)
  meta        Self-production meta-operations (Phase 7a)
  daemon      Autonomous daemon mode (Phase 7b)
  replay      Replay events and show state
  events      List recent events
  recover     Attempt recovery from violations
  help        Show this help

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
