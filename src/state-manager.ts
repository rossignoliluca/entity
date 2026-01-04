/**
 * State Manager with File Locking
 *
 * Provides thread-safe access to state/current.json and event appending.
 * Prevents race conditions in daemon mode where multiple operations
 * may attempt concurrent state modifications.
 *
 * Uses advisory file locking via a .lock file.
 */

import { readFile, writeFile, unlink, mkdir, access } from 'fs/promises';
import { join } from 'path';
import type { State, Event, EventType, EventCategory, Hash, Timestamp } from './types.js';
import { hashEvent } from './hash.js';
import { loadEvents } from './events.js';

const STATE_FILE = 'state/current.json';
const LOCK_FILE = 'events/.lock';  // Use same lock as events.ts for consistency
const LOCK_TIMEOUT = 5000; // 5 seconds
const LOCK_RETRY_INTERVAL = 50; // 50ms

/**
 * Singleton StateManager for thread-safe state access
 */
export class StateManager {
  private baseDir: string;
  private lockAcquired: boolean = false;
  private lockOwner: string | null = null;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Acquire exclusive lock on state
   */
  async acquireLock(owner: string = 'unknown'): Promise<boolean> {
    const lockPath = join(this.baseDir, LOCK_FILE);
    const startTime = Date.now();

    while (Date.now() - startTime < LOCK_TIMEOUT) {
      try {
        // Try to read existing lock
        try {
          const lockContent = await readFile(lockPath, 'utf-8');
          const lock = JSON.parse(lockContent);

          // Check if lock is stale (older than LOCK_TIMEOUT)
          if (Date.now() - lock.timestamp > LOCK_TIMEOUT) {
            // Stale lock, remove it
            await unlink(lockPath);
          } else {
            // Lock is held, wait and retry
            await this.sleep(LOCK_RETRY_INTERVAL);
            continue;
          }
        } catch {
          // No lock file exists, proceed to acquire
        }

        // Try to create lock file
        const lockData = {
          owner,
          pid: process.pid,
          timestamp: Date.now(),
        };

        await writeFile(lockPath, JSON.stringify(lockData), { flag: 'wx' });
        this.lockAcquired = true;
        this.lockOwner = owner;
        return true;
      } catch (err: unknown) {
        // File already exists (race condition), retry
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          await this.sleep(LOCK_RETRY_INTERVAL);
          continue;
        }
        throw err;
      }
    }

    return false; // Timeout
  }

  /**
   * Release lock on state
   */
  async releaseLock(): Promise<void> {
    if (!this.lockAcquired) return;

    const lockPath = join(this.baseDir, LOCK_FILE);
    try {
      await unlink(lockPath);
    } catch {
      // Ignore if already deleted
    }
    this.lockAcquired = false;
    this.lockOwner = null;
  }

  /**
   * Execute operation with lock
   */
  async withLock<T>(owner: string, operation: () => Promise<T>): Promise<T> {
    const acquired = await this.acquireLock(owner);
    if (!acquired) {
      throw new Error(`Failed to acquire lock for ${owner} (timeout)`);
    }

    try {
      return await operation();
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Read current state (with optional lock)
   */
  async readState(withLock: boolean = false): Promise<State | null> {
    const read = async () => {
      try {
        const content = await readFile(join(this.baseDir, STATE_FILE), 'utf-8');
        return JSON.parse(content) as State;
      } catch {
        return null;
      }
    };

    if (withLock) {
      return this.withLock('readState', read);
    }
    return read();
  }

  /**
   * Write state (always with lock)
   */
  async writeState(state: State): Promise<void> {
    await this.withLock('writeState', async () => {
      state.updated = new Date().toISOString() as Timestamp;
      await writeFile(
        join(this.baseDir, STATE_FILE),
        JSON.stringify(state, null, 2)
      );
    });
  }

  /**
   * Atomic state update
   */
  async updateState(updater: (state: State) => State): Promise<State> {
    return this.withLock('updateState', async () => {
      const state = await this.readState();
      if (!state) {
        throw new Error('No state to update');
      }
      const newState = updater(state);
      newState.updated = new Date().toISOString() as Timestamp;
      await writeFile(
        join(this.baseDir, STATE_FILE),
        JSON.stringify(newState, null, 2)
      );
      return newState;
    });
  }

  /**
   * Append event with lock (atomic with state update)
   *
   * @param type - Event type
   * @param data - Event payload
   * @param stateUpdater - Optional function to update state atomically
   * @param category - Optional category for filtering (defaults to 'operational')
   */
  async appendEventAtomic(
    type: EventType,
    data: Record<string, unknown>,
    stateUpdater?: (state: State, event: Event) => State,
    category?: EventCategory
  ): Promise<Event> {
    return this.withLock('appendEvent', async () => {
      // Load events to get sequence and prev_hash
      const events = await loadEvents(this.baseDir);
      const seq = events.length === 0 ? 1 : events[events.length - 1].seq + 1;
      const prev_hash = events.length === 0 ? null : events[events.length - 1].hash;
      const timestamp = new Date().toISOString() as Timestamp;

      const eventWithoutHash = {
        seq,
        type,
        timestamp,
        data,
        prev_hash,
        ...(category && { category }), // Only include if specified
      };

      const hash = hashEvent(eventWithoutHash);

      const event: Event = {
        ...eventWithoutHash,
        hash,
      };

      // Write event file
      const filename = seq.toString().padStart(6, '0') + '.json';
      const filepath = join(this.baseDir, 'events', filename);
      await writeFile(filepath, JSON.stringify(event, null, 2));

      // Update state if updater provided
      if (stateUpdater) {
        const state = await this.readState();
        if (state) {
          const newState = stateUpdater(state, event);
          newState.updated = timestamp;
          newState.memory.event_count = seq;
          newState.memory.last_event_hash = hash;
          await writeFile(
            join(this.baseDir, STATE_FILE),
            JSON.stringify(newState, null, 2)
          );
        }
      }

      return event;
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global instance cache
const managers = new Map<string, StateManager>();

/**
 * Get or create StateManager for a directory
 */
export function getStateManager(baseDir: string): StateManager {
  if (!managers.has(baseDir)) {
    managers.set(baseDir, new StateManager(baseDir));
  }
  return managers.get(baseDir)!;
}
