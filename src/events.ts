/**
 * Event Sourcing with Merkle Chain
 *
 * INV-002: state = replay(events)
 * INV-003: events[n].prev_hash = hash(events[n-1])
 */

import { readFile, writeFile, readdir, access, unlink } from 'fs/promises';
import { join } from 'path';
import { hashEvent, verifyChain } from './hash.js';
import type { Event, EventType, Hash, State, Timestamp } from './types.js';

// Simple file lock for event appending
const LOCK_FILE = 'events/.lock';
const LOCK_TIMEOUT = 5000;
const LOCK_RETRY = 50;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireEventLock(baseDir: string): Promise<boolean> {
  const lockPath = join(baseDir, LOCK_FILE);
  const startTime = Date.now();

  while (Date.now() - startTime < LOCK_TIMEOUT) {
    try {
      // Check for stale lock
      try {
        const content = await readFile(lockPath, 'utf-8');
        const lock = JSON.parse(content);
        if (Date.now() - lock.timestamp > LOCK_TIMEOUT) {
          await unlink(lockPath);
        } else {
          await sleep(LOCK_RETRY);
          continue;
        }
      } catch {
        // No lock file
      }

      // Try to create lock
      await writeFile(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }), { flag: 'wx' });
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        await sleep(LOCK_RETRY);
        continue;
      }
      throw err;
    }
  }
  return false;
}

async function releaseEventLock(baseDir: string): Promise<void> {
  try {
    await unlink(join(baseDir, LOCK_FILE));
  } catch {
    // Ignore
  }
}

// Export lock functions for use in verification
export { acquireEventLock, releaseEventLock };

const EVENTS_DIR = 'events';

/**
 * Load all events in order
 */
export async function loadEvents(baseDir: string): Promise<Event[]> {
  const eventsDir = join(baseDir, EVENTS_DIR);

  let files: string[];
  try {
    files = await readdir(eventsDir);
  } catch {
    return [];
  }

  // Sort by sequence number
  const eventFiles = files
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => {
      const seqA = parseInt(a.replace('.json', ''), 10);
      const seqB = parseInt(b.replace('.json', ''), 10);
      return seqA - seqB;
    });

  const events: Event[] = [];
  for (const file of eventFiles) {
    const content = await readFile(join(eventsDir, file), 'utf-8');
    events.push(JSON.parse(content) as Event);
  }

  return events;
}

/**
 * Get next sequence number
 */
export async function getNextSeq(baseDir: string): Promise<number> {
  const events = await loadEvents(baseDir);
  if (events.length === 0) return 1;
  return events[events.length - 1].seq + 1;
}

/**
 * Get last event hash
 */
export async function getLastEventHash(
  baseDir: string
): Promise<Hash | null> {
  const events = await loadEvents(baseDir);
  if (events.length === 0) return null;
  return events[events.length - 1].hash;
}

/**
 * Append new event (Merkle chain)
 * Uses file locking to prevent race conditions in concurrent access
 */
export async function appendEvent(
  baseDir: string,
  type: EventType,
  data: Record<string, unknown>
): Promise<Event> {
  // Acquire lock to prevent concurrent event writing
  const acquired = await acquireEventLock(baseDir);
  if (!acquired) {
    throw new Error('Failed to acquire event lock (timeout)');
  }

  try {
    const seq = await getNextSeq(baseDir);
    const prev_hash = await getLastEventHash(baseDir);
    const timestamp = new Date().toISOString() as Timestamp;

    const eventWithoutHash = {
      seq,
      type,
      timestamp,
      data,
      prev_hash,
    };

    const hash = hashEvent(eventWithoutHash);

    const event: Event = {
      ...eventWithoutHash,
      hash,
    };

    // Write event file
    const filename = seq.toString().padStart(6, '0') + '.json';
    const filepath = join(baseDir, EVENTS_DIR, filename);
    await writeFile(filepath, JSON.stringify(event, null, 2));

    return event;
  } finally {
    await releaseEventLock(baseDir);
  }
}

/**
 * Verify event chain integrity
 */
export async function verifyEventChain(baseDir: string): Promise<boolean> {
  const events = await loadEvents(baseDir);
  return verifyChain(events);
}

/**
 * Replay events to reconstruct state
 * INV-002: state = replay(events)
 */
export async function replayEvents(baseDir: string): Promise<State | null> {
  const events = await loadEvents(baseDir);
  if (events.length === 0) return null;

  // Start with genesis
  const genesis = events[0];
  if (genesis.type !== 'GENESIS') {
    throw new Error('First event must be GENESIS');
  }

  // Initial state from genesis
  let state: State = {
    version: genesis.data.version as string,
    specification: genesis.data.specification as string,
    organization_hash: genesis.data.organization_hash as Hash,
    created: genesis.timestamp,
    updated: genesis.timestamp,
    identity: {
      name: 'Entity',
      instantiated_by: genesis.data.instantiated_by as string,
      instantiated_at: genesis.timestamp,
    },
    coupling: {
      active: false,
      partner: null,
      since: null,
    },
    energy: {
      current: 1.0,
      min: 0.01,
      threshold: 0.1,
    },
    lyapunov: {
      V: 0.0,
      V_previous: null,
    },
    memory: {
      event_count: 1,
      last_event_hash: genesis.hash,
      last_snapshot_at: null,
    },
    session: {
      total_count: 0,
      current_id: null,
    },
    integrity: {
      invariant_violations: 0,
      last_verification: genesis.timestamp,
      status: 'nominal',
    },
    human: {
      name: 'Unknown',
      context: '',
    },
    important: [],
    learning: {
      enabled: true,
      lastAnalysis: null,
      patternsHash: null,
    },
  };

  // Apply subsequent events
  for (let i = 1; i < events.length; i++) {
    state = applyEvent(state, events[i]);
  }

  return state;
}

/**
 * Apply single event to state
 */
function applyEvent(state: State, event: Event): State {
  const newState = { ...state };
  newState.updated = event.timestamp;
  newState.memory.event_count = event.seq;
  newState.memory.last_event_hash = event.hash;

  switch (event.type) {
    case 'SESSION_START':
      newState.session.total_count++;
      newState.session.current_id = event.data.session_id as string;
      newState.coupling.active = true;
      newState.coupling.since = event.timestamp;
      newState.coupling.partner = event.data.partner as string;
      break;

    case 'SESSION_END':
      newState.session.current_id = null;
      newState.coupling.active = false;
      newState.coupling.since = null;
      newState.coupling.partner = null;
      break;

    case 'STATE_UPDATE':
      if (event.data.energy !== undefined) {
        newState.energy.current = event.data.energy as number;
      }
      if (event.data.lyapunov_V !== undefined) {
        newState.lyapunov.V_previous = newState.lyapunov.V;
        newState.lyapunov.V = event.data.lyapunov_V as number;
      }
      if (event.data.human !== undefined) {
        newState.human = event.data.human as State['human'];
      }
      if (event.data.important !== undefined) {
        newState.important = event.data.important as string[];
      }
      break;

    case 'VERIFICATION':
      newState.integrity.last_verification = event.timestamp;
      newState.integrity.invariant_violations =
        event.data.violations as number;
      newState.integrity.status = event.data.status as State['integrity']['status'];
      break;

    case 'BLOCK':
      // Record but don't change state
      break;

    case 'SNAPSHOT':
      newState.memory.last_snapshot_at = event.timestamp;
      break;

    case 'LEARNING':
      newState.learning.lastAnalysis = event.timestamp;
      if (event.data.patterns_hash) {
        newState.learning.patternsHash = event.data.patterns_hash as Hash;
      }
      break;

    case 'META_OPERATION':
      // Self-production event - update autopoiesis state
      if (event.data.autopoiesis) {
        newState.autopoiesis = event.data.autopoiesis as State['autopoiesis'];
      }
      break;

    // Phase 8: Internal Agency events
    case 'AGENT_WAKE':
      if (!newState.agent) {
        newState.agent = {
          enabled: true,
          awake: true,
          lastCycle: null,
          cycleCount: 0,
          responsesByPriority: { survival: 0, integrity: 0, stability: 0, growth: 0, rest: 0 },
          totalEnergyConsumed: 0,
        };
      } else {
        newState.agent.awake = true;
      }
      break;

    case 'AGENT_SLEEP':
      if (newState.agent) {
        newState.agent.awake = false;
        if (event.data.stats) {
          const stats = event.data.stats as Record<string, unknown>;
          newState.agent.cycleCount = (stats.cycleCount as number) || newState.agent.cycleCount;
          newState.agent.totalEnergyConsumed = (stats.totalEnergyConsumed as number) || newState.agent.totalEnergyConsumed;
        }
      }
      break;

    case 'AGENT_RESPONSE':
      if (newState.agent) {
        newState.agent.lastCycle = event.timestamp;
        const priority = event.data.priority as keyof typeof newState.agent.responsesByPriority;
        if (priority && newState.agent.responsesByPriority[priority] !== undefined) {
          newState.agent.responsesByPriority[priority]++;
        }
        if (event.data.energyCost) {
          newState.agent.totalEnergyConsumed += event.data.energyCost as number;
        }
      }
      break;

    case 'AGENT_REST':
      if (newState.agent) {
        newState.agent.lastCycle = event.timestamp;
        newState.agent.responsesByPriority.rest++;
      }
      break;

    default:
      // Unknown event type - no state change
      break;
  }

  return newState;
}

/**
 * Compare replayed state with stored state
 * Uses file locking to ensure consistent comparison during concurrent access
 */
export async function verifyStateConsistency(
  baseDir: string
): Promise<boolean> {
  // Acquire lock to prevent concurrent event writes during verification
  const acquired = await acquireEventLock(baseDir);
  if (!acquired) {
    // Can't acquire lock, assume inconsistent (will trigger recovery)
    return false;
  }

  try {
    const replayed = await replayEvents(baseDir);
    if (!replayed) return false;

    const storedContent = await readFile(
      join(baseDir, 'state', 'current.json'),
      'utf-8'
    );
    const stored = JSON.parse(storedContent) as State;

    // Compare key fields
    return (
      replayed.organization_hash === stored.organization_hash &&
      replayed.memory.event_count === stored.memory.event_count &&
      replayed.memory.last_event_hash === stored.memory.last_event_hash
    );
  } finally {
    await releaseEventLock(baseDir);
  }
}
