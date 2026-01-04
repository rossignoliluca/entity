/**
 * Invariant Verification
 *
 * §6.3 Verification
 *
 * INV-001: hash(spec/) = ORGANIZATION.sha256
 * INV-002: state = replay(events)
 * INV-003: events[n].prev_hash = hash(events[n-1])
 * INV-004: V(σ') ≤ V(σ)
 * INV-005: E ≥ E_min
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { hashFile, verifyChain } from './hash.js';
import { loadEvents, replayEvents } from './events.js';
import { computeV, checkLyapunovMonotone } from './lyapunov.js';
import type {
  State,
  Hash,
  InvariantCheck,
  VerificationResult,
  Config,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * INV-001: Organization hash unchanged
 */
async function verifyOrganizationHash(
  baseDir: string
): Promise<InvariantCheck> {
  try {
    const specHash = await hashFile(join(baseDir, 'spec', 'SPECIFICATION.md'));
    const orgHashContent = await readFile(
      join(baseDir, 'ORGANIZATION.sha256'),
      'utf-8'
    );
    const orgHash = orgHashContent.trim();

    const satisfied = specHash === orgHash;

    return {
      id: 'INV-001',
      name: 'Organization hash unchanged',
      satisfied,
      details: satisfied
        ? `Hash: ${specHash.substring(0, 16)}...`
        : `Mismatch: spec=${specHash.substring(0, 16)}... org=${orgHash.substring(0, 16)}...`,
    };
  } catch (error) {
    return {
      id: 'INV-001',
      name: 'Organization hash unchanged',
      satisfied: false,
      details: `Error: ${error}`,
    };
  }
}

/**
 * INV-002: State equals replay of events
 */
async function verifyStateDeterminism(
  baseDir: string
): Promise<InvariantCheck> {
  try {
    const replayed = await replayEvents(baseDir);
    if (!replayed) {
      return {
        id: 'INV-002',
        name: 'State determinism',
        satisfied: false,
        details: 'No events to replay',
      };
    }

    const storedContent = await readFile(
      join(baseDir, 'state', 'current.json'),
      'utf-8'
    );
    const stored = JSON.parse(storedContent) as State;

    // Compare critical fields
    const matches =
      replayed.organization_hash === stored.organization_hash &&
      replayed.memory.event_count === stored.memory.event_count &&
      replayed.memory.last_event_hash === stored.memory.last_event_hash;

    return {
      id: 'INV-002',
      name: 'State determinism',
      satisfied: matches,
      details: matches
        ? `Events: ${stored.memory.event_count}`
        : 'State does not match replay',
    };
  } catch (error) {
    return {
      id: 'INV-002',
      name: 'State determinism',
      satisfied: false,
      details: `Error: ${error}`,
    };
  }
}

/**
 * INV-003: Merkle chain integrity
 */
async function verifyChainIntegrity(
  baseDir: string
): Promise<InvariantCheck> {
  try {
    const events = await loadEvents(baseDir);
    const valid = verifyChain(events);

    return {
      id: 'INV-003',
      name: 'Chain integrity',
      satisfied: valid,
      details: valid
        ? `Chain length: ${events.length}`
        : 'Chain verification failed',
    };
  } catch (error) {
    return {
      id: 'INV-003',
      name: 'Chain integrity',
      satisfied: false,
      details: `Error: ${error}`,
    };
  }
}

/**
 * INV-004: Lyapunov monotone
 */
function verifyLyapunovMonotone(state: State): InvariantCheck {
  const satisfied = checkLyapunovMonotone(
    state.lyapunov.V,
    state.lyapunov.V_previous
  );

  return {
    id: 'INV-004',
    name: 'Lyapunov monotone',
    satisfied,
    details: satisfied
      ? `V=${state.lyapunov.V.toFixed(4)}`
      : `V increased: ${state.lyapunov.V_previous} → ${state.lyapunov.V}`,
  };
}

/**
 * INV-005: Energy viable
 */
function verifyEnergyViable(
  state: State,
  config: Config = DEFAULT_CONFIG
): InvariantCheck {
  const satisfied = state.energy.current >= config.E_min;

  return {
    id: 'INV-005',
    name: 'Energy viable',
    satisfied,
    details: `E=${state.energy.current.toFixed(4)} (min=${config.E_min})`,
  };
}

/**
 * Run all invariant checks
 */
export async function verifyAllInvariants(
  baseDir: string,
  config: Config = DEFAULT_CONFIG
): Promise<VerificationResult> {
  // Load current state
  const stateContent = await readFile(
    join(baseDir, 'state', 'current.json'),
    'utf-8'
  );
  const state = JSON.parse(stateContent) as State;

  // Run all checks
  const invariants: InvariantCheck[] = [
    await verifyOrganizationHash(baseDir),
    await verifyStateDeterminism(baseDir),
    await verifyChainIntegrity(baseDir),
    verifyLyapunovMonotone(state),
    verifyEnergyViable(state, config),
  ];

  const all_satisfied = invariants.every((inv) => inv.satisfied);

  // Compute Lyapunov V
  const lyapunov_V = computeV(state, invariants, config);

  return {
    timestamp: new Date().toISOString(),
    all_satisfied,
    invariants,
    lyapunov_V,
  };
}

/**
 * Quick health check (essential invariants only)
 */
export async function quickHealthCheck(
  baseDir: string
): Promise<{ healthy: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Check org hash
    const inv001 = await verifyOrganizationHash(baseDir);
    if (!inv001.satisfied) issues.push('Organization hash mismatch');

    // Check chain
    const inv003 = await verifyChainIntegrity(baseDir);
    if (!inv003.satisfied) issues.push('Chain integrity failed');

    // Check energy
    const stateContent = await readFile(
      join(baseDir, 'state', 'current.json'),
      'utf-8'
    );
    const state = JSON.parse(stateContent) as State;
    if (state.energy.current < state.energy.min) {
      issues.push('Energy below minimum');
    }
  } catch (error) {
    issues.push(`Error: ${error}`);
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Print verification report to console
 */
export function printVerificationReport(result: VerificationResult): void {
  console.log('\n=== VERIFICATION REPORT ===');
  console.log(`Timestamp: ${result.timestamp}`);
  console.log(`Status: ${result.all_satisfied ? '✓ ALL PASSED' : '✗ FAILURES'}`);
  console.log(`Lyapunov V: ${result.lyapunov_V.toFixed(6)}`);
  console.log('\nInvariants:');

  for (const inv of result.invariants) {
    const status = inv.satisfied ? '✓' : '✗';
    console.log(`  ${status} ${inv.id}: ${inv.name}`);
    if (inv.details) {
      console.log(`     ${inv.details}`);
    }
  }

  console.log('');
}
