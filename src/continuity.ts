/**
 * Multi-Instance Continuity
 * AES-SPEC-001 Phase 6: Multi-Instance Continuity
 *
 * Enables state portability, identity verification, and cross-instance sync
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import type { Event, State, Hash, Timestamp } from './types.js';
import { hashObject, verifyChain } from './hash.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Portable state bundle for export/import
 */
export interface StateBundle {
  version: string;
  format: 'entity-bundle-v1';
  exported: Timestamp;
  exporter: string;

  // Identity
  identity: {
    organization_hash: Hash;
    created: Timestamp;
    instantiated_by: string;
  };

  // State snapshot
  state: State;

  // Event chain (for verification)
  events: Event[];
  events_hash: Hash;

  // Continuity token
  continuity_token: ContinuityToken;

  // Signature for integrity
  bundle_hash: Hash;
}

/**
 * Continuity token for cross-session identity
 */
export interface ContinuityToken {
  id: string;
  issued: Timestamp;
  issuer: string;
  sequence: number;
  prev_token_hash: Hash | null;
  state_hash: Hash;
  events_count: number;
  signature: Hash;
}

/**
 * Identity verification result
 */
export interface IdentityVerification {
  verified: boolean;
  checks: {
    organization_hash: boolean;
    chain_integrity: boolean;
    state_consistency: boolean;
    continuity_valid: boolean;
  };
  details: string;
  confidence: number; // 0-100
}

/**
 * Sync status between instances
 */
export interface SyncStatus {
  local_events: number;
  remote_events: number;
  diverged_at: number | null;
  can_merge: boolean;
  conflicts: string[];
}

// ============================================================================
// Continuity Token Management
// ============================================================================

/**
 * Generate continuity token for current state
 */
export function generateContinuityToken(
  state: State,
  events: Event[],
  prevToken: ContinuityToken | null = null
): ContinuityToken {
  const now = new Date().toISOString() as Timestamp;
  const stateHash = hashObject(state);

  const tokenData = {
    id: generateTokenId(),
    issued: now,
    issuer: state.identity.name,
    sequence: prevToken ? prevToken.sequence + 1 : 1,
    prev_token_hash: prevToken ? hashObject(prevToken) : null,
    state_hash: stateHash,
    events_count: events.length,
  };

  const signature = hashObject(tokenData);

  return {
    ...tokenData,
    signature,
  };
}

/**
 * Generate unique token ID
 */
function generateTokenId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ct-${timestamp}-${random}`;
}

/**
 * Verify continuity token chain
 */
export function verifyContinuityToken(
  token: ContinuityToken,
  state: State,
  events: Event[]
): boolean {
  // Verify state hash matches
  const currentStateHash = hashObject(state);
  if (token.state_hash !== currentStateHash) {
    return false;
  }

  // Verify events count
  if (token.events_count !== events.length) {
    return false;
  }

  // Verify signature
  const tokenData = {
    id: token.id,
    issued: token.issued,
    issuer: token.issuer,
    sequence: token.sequence,
    prev_token_hash: token.prev_token_hash,
    state_hash: token.state_hash,
    events_count: token.events_count,
  };
  const expectedSignature = hashObject(tokenData);

  return token.signature === expectedSignature;
}

// ============================================================================
// State Export
// ============================================================================

/**
 * Export state as portable bundle
 */
export async function exportState(
  baseDir: string,
  state: State,
  events: Event[],
  prevToken: ContinuityToken | null = null
): Promise<StateBundle> {
  const now = new Date().toISOString() as Timestamp;
  const eventsHash = hashObject(events);
  const continuityToken = generateContinuityToken(state, events, prevToken);

  const bundleWithoutHash: Omit<StateBundle, 'bundle_hash'> = {
    version: '1.0.0',
    format: 'entity-bundle-v1',
    exported: now,
    exporter: state.identity.name,
    identity: {
      organization_hash: state.organization_hash,
      created: state.created,
      instantiated_by: state.identity.instantiated_by,
    },
    state,
    events,
    events_hash: eventsHash,
    continuity_token: continuityToken,
  };

  const bundleHash = hashObject(bundleWithoutHash);

  return {
    ...bundleWithoutHash,
    bundle_hash: bundleHash,
  };
}

/**
 * Save bundle to file
 */
export async function saveBundleToFile(
  bundle: StateBundle,
  outputPath: string
): Promise<void> {
  await writeFile(outputPath, JSON.stringify(bundle, null, 2));
}

/**
 * Generate export filename
 */
export function generateExportFilename(state: State): string {
  const date = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const shortHash = state.organization_hash.substring(0, 8);
  return `entity-${shortHash}-${date}.bundle.json`;
}

// ============================================================================
// State Import
// ============================================================================

/**
 * Load bundle from file
 */
export async function loadBundleFromFile(path: string): Promise<StateBundle> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content) as StateBundle;
}

/**
 * Verify bundle integrity
 */
export function verifyBundle(bundle: StateBundle): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check format
  if (bundle.format !== 'entity-bundle-v1') {
    errors.push(`Unknown format: ${bundle.format}`);
  }

  // Verify bundle hash
  const bundleWithoutHash: Omit<StateBundle, 'bundle_hash'> = {
    version: bundle.version,
    format: bundle.format,
    exported: bundle.exported,
    exporter: bundle.exporter,
    identity: bundle.identity,
    state: bundle.state,
    events: bundle.events,
    events_hash: bundle.events_hash,
    continuity_token: bundle.continuity_token,
  };
  const expectedBundleHash = hashObject(bundleWithoutHash);
  if (bundle.bundle_hash !== expectedBundleHash) {
    errors.push('Bundle hash mismatch - file may be corrupted');
  }

  // Verify events hash
  const expectedEventsHash = hashObject(bundle.events);
  if (bundle.events_hash !== expectedEventsHash) {
    errors.push('Events hash mismatch');
  }

  // Verify chain integrity
  if (!verifyChain(bundle.events)) {
    errors.push('Event chain integrity failed');
  }

  // Verify continuity token
  if (!verifyContinuityToken(bundle.continuity_token, bundle.state, bundle.events)) {
    errors.push('Continuity token verification failed');
  }

  // Verify organization hash matches
  if (bundle.state.organization_hash !== bundle.identity.organization_hash) {
    errors.push('Organization hash mismatch between state and identity');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Import state from bundle
 */
export async function importState(
  baseDir: string,
  bundle: StateBundle,
  options: { overwrite?: boolean; merge?: boolean } = {}
): Promise<{ success: boolean; message: string }> {
  // Verify bundle first
  const verification = verifyBundle(bundle);
  if (!verification.valid) {
    return {
      success: false,
      message: `Bundle verification failed: ${verification.errors.join(', ')}`,
    };
  }

  const stateDir = join(baseDir, 'state');
  const eventsDir = join(baseDir, 'events');

  if (options.overwrite) {
    // Full overwrite - replace everything
    await writeFile(
      join(stateDir, 'current.json'),
      JSON.stringify(bundle.state, null, 2)
    );

    // Write all events
    for (const event of bundle.events) {
      const filename = event.seq.toString().padStart(6, '0') + '.json';
      await writeFile(
        join(eventsDir, filename),
        JSON.stringify(event, null, 2)
      );
    }

    return {
      success: true,
      message: `Imported ${bundle.events.length} events, state restored to ${bundle.exported}`,
    };
  }

  return {
    success: false,
    message: 'Import requires --overwrite flag for safety',
  };
}

// ============================================================================
// Identity Verification
// ============================================================================

/**
 * Verify identity between two states/bundles
 */
export function verifyIdentity(
  local: { state: State; events: Event[] },
  remote: StateBundle
): IdentityVerification {
  const checks = {
    organization_hash: false,
    chain_integrity: false,
    state_consistency: false,
    continuity_valid: false,
  };

  // Check organization hash
  checks.organization_hash =
    local.state.organization_hash === remote.identity.organization_hash;

  // Check chain integrity of remote
  checks.chain_integrity = verifyChain(remote.events);

  // Check state consistency (genesis matches)
  if (local.events.length > 0 && remote.events.length > 0) {
    checks.state_consistency =
      local.events[0].hash === remote.events[0].hash;
  }

  // Check continuity token
  checks.continuity_valid = verifyContinuityToken(
    remote.continuity_token,
    remote.state,
    remote.events
  );

  const passedChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  const confidence = Math.round((passedChecks / totalChecks) * 100);

  let details = '';
  if (confidence === 100) {
    details = 'Identity fully verified - same entity';
  } else if (confidence >= 75) {
    details = 'Identity likely matches - some checks failed';
  } else if (confidence >= 50) {
    details = 'Identity uncertain - multiple checks failed';
  } else {
    details = 'Identity mismatch - different entity';
  }

  return {
    verified: confidence >= 75,
    checks,
    details,
    confidence,
  };
}

/**
 * Generate identity fingerprint
 */
export function generateFingerprint(state: State, events: Event[]): string {
  const data = {
    organization_hash: state.organization_hash,
    created: state.created,
    instantiated_by: state.identity.instantiated_by,
    genesis_hash: events.length > 0 ? events[0].hash : null,
  };
  const hash = hashObject(data);
  // Return human-readable fingerprint
  return `${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}`;
}

// ============================================================================
// Sync Protocol
// ============================================================================

/**
 * Compare two event chains for sync
 */
export function compareSyncStatus(
  localEvents: Event[],
  remoteEvents: Event[]
): SyncStatus {
  const conflicts: string[] = [];
  let divergedAt: number | null = null;

  // Find divergence point
  const minLength = Math.min(localEvents.length, remoteEvents.length);
  for (let i = 0; i < minLength; i++) {
    if (localEvents[i].hash !== remoteEvents[i].hash) {
      divergedAt = i;
      conflicts.push(`Event ${i}: hash mismatch`);
      break;
    }
  }

  // Check if one is ahead of the other
  const canMerge =
    divergedAt === null &&
    (localEvents.length === remoteEvents.length ||
      // One is strictly ahead
      (localEvents.length > remoteEvents.length &&
        localEvents[remoteEvents.length - 1]?.hash ===
          remoteEvents[remoteEvents.length - 1]?.hash) ||
      (remoteEvents.length > localEvents.length &&
        remoteEvents[localEvents.length - 1]?.hash ===
          localEvents[localEvents.length - 1]?.hash));

  return {
    local_events: localEvents.length,
    remote_events: remoteEvents.length,
    diverged_at: divergedAt,
    can_merge: canMerge,
    conflicts,
  };
}

/**
 * Fast-forward merge (when remote is strictly ahead)
 */
export async function fastForwardMerge(
  baseDir: string,
  localEvents: Event[],
  remoteBundle: StateBundle
): Promise<{ success: boolean; message: string; events_added: number }> {
  const status = compareSyncStatus(localEvents, remoteBundle.events);

  if (!status.can_merge) {
    return {
      success: false,
      message: 'Cannot fast-forward: chains have diverged',
      events_added: 0,
    };
  }

  if (remoteBundle.events.length <= localEvents.length) {
    return {
      success: true,
      message: 'Already up to date',
      events_added: 0,
    };
  }

  // Add new events from remote
  const eventsDir = join(baseDir, 'events');
  const newEvents = remoteBundle.events.slice(localEvents.length);

  for (const event of newEvents) {
    const filename = event.seq.toString().padStart(6, '0') + '.json';
    await writeFile(
      join(eventsDir, filename),
      JSON.stringify(event, null, 2)
    );
  }

  // Update state
  await writeFile(
    join(baseDir, 'state', 'current.json'),
    JSON.stringify(remoteBundle.state, null, 2)
  );

  return {
    success: true,
    message: `Fast-forwarded ${newEvents.length} events`,
    events_added: newEvents.length,
  };
}

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Print bundle info
 */
export function printBundleInfo(bundle: StateBundle): void {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    STATE BUNDLE INFO                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`Format:       ${bundle.format}`);
  console.log(`Version:      ${bundle.version}`);
  console.log(`Exported:     ${bundle.exported}`);
  console.log(`Exporter:     ${bundle.exporter}`);
  console.log('');

  console.log('┌─ IDENTITY ──────────────────────────────────────────────────────┐');
  console.log(`│ Organization: ${bundle.identity.organization_hash.substring(0, 48)}...│`);
  console.log(`│ Created:      ${bundle.identity.created.padEnd(49)}│`);
  console.log(`│ Instantiated: ${bundle.identity.instantiated_by.padEnd(49)}│`);
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  console.log('┌─ CONTENTS ───────────────────────────────────────────────────────┐');
  console.log(`│ Events:       ${bundle.events.length.toString().padEnd(49)}│`);
  console.log(`│ Sessions:     ${bundle.state.session.total_count.toString().padEnd(49)}│`);
  console.log(`│ Memories:     ${bundle.state.important.length.toString().padEnd(49)}│`);
  console.log(`│ Energy:       ${(bundle.state.energy.current * 100).toFixed(1)}%`.padEnd(65) + '│');
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  console.log('┌─ CONTINUITY TOKEN ────────────────────────────────────────────────┐');
  console.log(`│ ID:           ${bundle.continuity_token.id.padEnd(49)}│`);
  console.log(`│ Sequence:     ${bundle.continuity_token.sequence.toString().padEnd(49)}│`);
  console.log(`│ Issued:       ${bundle.continuity_token.issued.padEnd(49)}│`);
  console.log('└─────────────────────────────────────────────────────────────────┘\n');

  console.log(`Bundle Hash:  ${bundle.bundle_hash.substring(0, 32)}...`);
}

/**
 * Print identity verification result
 */
export function printIdentityVerification(result: IdentityVerification): void {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                  IDENTITY VERIFICATION                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const icon = result.verified ? '✓' : '✗';
  console.log(`Result:     ${icon} ${result.verified ? 'VERIFIED' : 'FAILED'}`);
  console.log(`Confidence: ${result.confidence}%`);
  console.log(`Details:    ${result.details}\n`);

  console.log('Checks:');
  for (const [check, passed] of Object.entries(result.checks)) {
    const checkIcon = passed ? '✓' : '✗';
    console.log(`  ${checkIcon} ${check.replace(/_/g, ' ')}`);
  }
  console.log('');
}

/**
 * Print sync status
 */
export function printSyncStatus(status: SyncStatus): void {
  console.log('\n=== SYNC STATUS ===\n');
  console.log(`Local events:  ${status.local_events}`);
  console.log(`Remote events: ${status.remote_events}`);

  if (status.diverged_at !== null) {
    console.log(`Diverged at:   event ${status.diverged_at}`);
  }

  console.log(`Can merge:     ${status.can_merge ? 'Yes' : 'No'}`);

  if (status.conflicts.length > 0) {
    console.log('\nConflicts:');
    for (const conflict of status.conflicts) {
      console.log(`  - ${conflict}`);
    }
  }
  console.log('');
}
