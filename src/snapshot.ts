/**
 * State Snapshots
 * AES-SPEC-001 §6.4 Backup and Recovery
 *
 * Snapshots provide point-in-time state backups
 * for faster recovery than full event replay.
 */

import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { sha256 } from './hash.js';
import { appendEvent, loadEvents } from './events.js';
import type { State, Hash, Timestamp } from './types.js';

const SNAPSHOTS_DIR = 'state/snapshots';

/**
 * Snapshot metadata
 */
export interface Snapshot {
  id: string;
  timestamp: Timestamp;
  event_seq: number;
  event_hash: Hash;
  state_hash: Hash;
  description: string;
}

/**
 * Snapshot index
 */
export interface SnapshotIndex {
  version: string;
  snapshots: Snapshot[];
  latest: string | null;
}

/**
 * Load snapshot index
 */
async function loadIndex(baseDir: string): Promise<SnapshotIndex> {
  const indexPath = join(baseDir, SNAPSHOTS_DIR, 'index.json');
  try {
    const content = await readFile(indexPath, 'utf-8');
    return JSON.parse(content) as SnapshotIndex;
  } catch {
    return {
      version: '1.0.0',
      snapshots: [],
      latest: null,
    };
  }
}

/**
 * Save snapshot index
 */
async function saveIndex(baseDir: string, index: SnapshotIndex): Promise<void> {
  const indexPath = join(baseDir, SNAPSHOTS_DIR, 'index.json');
  await writeFile(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Ensure snapshots directory exists
 */
async function ensureSnapshotsDir(baseDir: string): Promise<void> {
  const snapshotsPath = join(baseDir, SNAPSHOTS_DIR);
  try {
    await mkdir(snapshotsPath, { recursive: true });
  } catch {
    // Directory exists
  }
}

/**
 * Create a state snapshot
 */
export async function createSnapshot(
  baseDir: string,
  description: string = 'Manual snapshot'
): Promise<Snapshot> {
  await ensureSnapshotsDir(baseDir);

  // Load current state
  const statePath = join(baseDir, 'state', 'current.json');
  const stateContent = await readFile(statePath, 'utf-8');
  const state = JSON.parse(stateContent) as State;

  // Get current event info
  const events = await loadEvents(baseDir);
  const lastEvent = events[events.length - 1];

  // Generate snapshot ID
  const timestamp = new Date().toISOString() as Timestamp;
  const id = 'snap-' + timestamp.replace(/[:.]/g, '-').substring(0, 19);

  // Compute state hash
  const stateHash = sha256(stateContent);

  // Create snapshot metadata
  const snapshot: Snapshot = {
    id,
    timestamp,
    event_seq: lastEvent.seq,
    event_hash: lastEvent.hash,
    state_hash: stateHash,
    description,
  };

  // Save snapshot state
  const snapshotPath = join(baseDir, SNAPSHOTS_DIR, `${id}.json`);
  await writeFile(snapshotPath, stateContent);

  // Update index
  const index = await loadIndex(baseDir);
  index.snapshots.push(snapshot);
  index.latest = id;
  await saveIndex(baseDir, index);

  // Update state with snapshot reference
  state.memory.last_snapshot_at = timestamp;
  await writeFile(statePath, JSON.stringify(state, null, 2));

  // Log snapshot event
  await appendEvent(baseDir, 'SNAPSHOT', {
    snapshot_id: id,
    event_seq: lastEvent.seq,
    state_hash: stateHash,
    description,
  });

  // Re-sync state after event
  const newEvents = await loadEvents(baseDir);
  state.memory.event_count = newEvents.length;
  state.memory.last_event_hash = newEvents[newEvents.length - 1].hash;
  state.updated = new Date().toISOString();
  await writeFile(statePath, JSON.stringify(state, null, 2));

  return snapshot;
}

/**
 * List all snapshots
 */
export async function listSnapshots(baseDir: string): Promise<Snapshot[]> {
  const index = await loadIndex(baseDir);
  return index.snapshots;
}

/**
 * Get latest snapshot
 */
export async function getLatestSnapshot(
  baseDir: string
): Promise<Snapshot | null> {
  const index = await loadIndex(baseDir);
  if (!index.latest) return null;
  return index.snapshots.find((s) => s.id === index.latest) || null;
}

/**
 * Load snapshot state
 */
export async function loadSnapshot(
  baseDir: string,
  snapshotId: string
): Promise<State | null> {
  const snapshotPath = join(baseDir, SNAPSHOTS_DIR, `${snapshotId}.json`);
  try {
    const content = await readFile(snapshotPath, 'utf-8');
    return JSON.parse(content) as State;
  } catch {
    return null;
  }
}

/**
 * Restore state from snapshot
 * Note: This does NOT rollback events - it only restores state
 */
export async function restoreFromSnapshot(
  baseDir: string,
  snapshotId: string
): Promise<{ success: boolean; message: string }> {
  const index = await loadIndex(baseDir);
  const snapshot = index.snapshots.find((s) => s.id === snapshotId);

  if (!snapshot) {
    return { success: false, message: `Snapshot ${snapshotId} not found` };
  }

  // Load snapshot state
  const snapshotState = await loadSnapshot(baseDir, snapshotId);
  if (!snapshotState) {
    return { success: false, message: `Cannot load snapshot ${snapshotId}` };
  }

  // Verify snapshot integrity
  const snapshotPath = join(baseDir, SNAPSHOTS_DIR, `${snapshotId}.json`);
  const content = await readFile(snapshotPath, 'utf-8');
  const computedHash = sha256(content);

  if (computedHash !== snapshot.state_hash) {
    return { success: false, message: 'Snapshot integrity check failed' };
  }

  // Log restore event BEFORE restoring (to maintain chain)
  await appendEvent(baseDir, 'STATE_UPDATE', {
    reason: 'Restored from snapshot',
    snapshot_id: snapshotId,
    snapshot_event_seq: snapshot.event_seq,
  });

  // Get current events for state sync
  const events = await loadEvents(baseDir);

  // Update snapshot state with current event info
  snapshotState.memory.event_count = events.length;
  snapshotState.memory.last_event_hash = events[events.length - 1].hash;
  snapshotState.updated = new Date().toISOString();

  // Write restored state
  const statePath = join(baseDir, 'state', 'current.json');
  await writeFile(statePath, JSON.stringify(snapshotState, null, 2));

  return {
    success: true,
    message: `Restored from snapshot ${snapshotId} (event ${snapshot.event_seq})`,
  };
}

/**
 * Verify snapshot integrity
 */
export async function verifySnapshot(
  baseDir: string,
  snapshotId: string
): Promise<{ valid: boolean; details: string }> {
  const index = await loadIndex(baseDir);
  const snapshot = index.snapshots.find((s) => s.id === snapshotId);

  if (!snapshot) {
    return { valid: false, details: 'Snapshot not found' };
  }

  const snapshotPath = join(baseDir, SNAPSHOTS_DIR, `${snapshotId}.json`);
  try {
    const content = await readFile(snapshotPath, 'utf-8');
    const computedHash = sha256(content);

    if (computedHash !== snapshot.state_hash) {
      return { valid: false, details: 'Hash mismatch - snapshot corrupted' };
    }

    return {
      valid: true,
      details: `Verified: event ${snapshot.event_seq}, hash ${snapshot.state_hash.substring(0, 16)}...`,
    };
  } catch {
    return { valid: false, details: 'Cannot read snapshot file' };
  }
}

/**
 * Print snapshot info
 */
export function printSnapshotInfo(snapshot: Snapshot): void {
  console.log(`\nSnapshot: ${snapshot.id}`);
  console.log(`  Timestamp:   ${snapshot.timestamp}`);
  console.log(`  Event seq:   ${snapshot.event_seq}`);
  console.log(`  Event hash:  ${snapshot.event_hash.substring(0, 32)}...`);
  console.log(`  State hash:  ${snapshot.state_hash.substring(0, 32)}...`);
  console.log(`  Description: ${snapshot.description}`);
}

/**
 * Print all snapshots
 */
export function printSnapshotList(snapshots: Snapshot[]): void {
  console.log('\n=== SNAPSHOTS ===');
  if (snapshots.length === 0) {
    console.log('No snapshots found');
    return;
  }

  console.log(`Total: ${snapshots.length}\n`);
  for (const s of snapshots) {
    console.log(`  ${s.id}`);
    console.log(`    Event: ${s.event_seq} | ${s.timestamp}`);
    console.log(`    ${s.description}`);
  }
  console.log('');
}
