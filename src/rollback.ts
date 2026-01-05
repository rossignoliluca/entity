/**
 * Operation Rollback Module
 * AES-SPEC-001 - Category 3: Boundary Interface
 *
 * Enables reversible operations with time-bounded rollback window.
 * Uses compensating events pattern (not state mutation).
 *
 * Constraints:
 *   - Only state-modifying operations can be rolled back
 *   - TTL: entries expire after rollback window
 *   - Guard protected: core can block rollback
 *   - Creates ROLLBACK_* events for audit trail
 */

import type { State } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Rollback entry tracking a reversible operation
 */
export interface RollbackEntry {
  id: string;
  operationId: string;
  operationName: string;
  timestamp: string;
  expiresAt: string;
  eventSeq: number;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  params: Record<string, unknown>;
  status: 'pending' | 'executed' | 'expired' | 'blocked';
  executedAt?: string;
  blockedReason?: string;
}

/**
 * Rollback store state
 */
export interface RollbackStore {
  entries: RollbackEntry[];
  config: RollbackConfig;
  metrics: {
    totalCreated: number;
    totalExecuted: number;
    totalExpired: number;
    totalBlocked: number;
  };
}

/**
 * Rollback configuration
 */
export interface RollbackConfig {
  enabled: boolean;
  ttlMs: number;           // Default: 1 hour
  maxEntries: number;      // Maximum entries to keep
  allowedOperations: string[];  // Operations that can be rolled back
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  message: string;
  entry?: RollbackEntry;
  compensation?: Record<string, unknown>;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_ROLLBACK_CONFIG: RollbackConfig = {
  enabled: true,
  ttlMs: 60 * 60 * 1000,  // 1 hour
  maxEntries: 50,
  allowedOperations: [
    'memory.add',
    'memory.clear',
    // Add more as needed
  ],
};

/**
 * Operations that modify state and can be rolled back
 */
const REVERSIBLE_OPERATIONS: Record<string, {
  canRollback: boolean;
  getCompensation: (before: Record<string, unknown>, after: Record<string, unknown>, params: Record<string, unknown>) => Record<string, unknown> | null;
}> = {
  'memory.add': {
    canRollback: true,
    getCompensation: (before, _after, _params) => {
      // Compensation: restore previous memories array
      return { important: before.important };
    },
  },
  'memory.clear': {
    canRollback: true,
    getCompensation: (before, _after, _params) => {
      // Compensation: restore cleared memories
      return { important: before.important };
    },
  },
};

// =============================================================================
// Functions
// =============================================================================

/**
 * Generate unique rollback ID
 */
function generateRollbackId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Check if operation is reversible
 */
export function isReversibleOperation(operationId: string): boolean {
  return operationId in REVERSIBLE_OPERATIONS && REVERSIBLE_OPERATIONS[operationId].canRollback;
}

/**
 * Create a rollback entry for an operation
 */
export function createRollbackEntry(
  operationId: string,
  operationName: string,
  eventSeq: number,
  beforeState: Partial<State>,
  afterState: Partial<State>,
  params: Record<string, unknown>,
  config: RollbackConfig = DEFAULT_ROLLBACK_CONFIG
): RollbackEntry | null {
  if (!isReversibleOperation(operationId)) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.ttlMs);

  // Extract only the relevant state parts for this operation
  const relevantBefore: Record<string, unknown> = {};
  const relevantAfter: Record<string, unknown> = {};

  if (operationId.startsWith('memory.')) {
    relevantBefore.important = beforeState.important;
    relevantAfter.important = afterState.important;
  }

  return {
    id: generateRollbackId(),
    operationId,
    operationName,
    timestamp: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    eventSeq,
    beforeState: relevantBefore,
    afterState: relevantAfter,
    params,
    status: 'pending',
  };
}

/**
 * Add entry to rollback store
 */
export function addRollbackEntry(
  store: RollbackStore,
  entry: RollbackEntry
): void {
  // Expire old entries first
  expireOldEntries(store);

  // Add new entry
  store.entries.push(entry);
  store.metrics.totalCreated++;

  // Enforce max entries limit
  while (store.entries.length > store.config.maxEntries) {
    const oldest = store.entries.shift();
    if (oldest && oldest.status === 'pending') {
      oldest.status = 'expired';
      store.metrics.totalExpired++;
    }
  }
}

/**
 * Expire old entries based on TTL
 */
export function expireOldEntries(store: RollbackStore): number {
  const now = new Date();
  let expiredCount = 0;

  for (const entry of store.entries) {
    if (entry.status === 'pending' && new Date(entry.expiresAt) < now) {
      entry.status = 'expired';
      store.metrics.totalExpired++;
      expiredCount++;
    }
  }

  return expiredCount;
}

/**
 * Get pending rollback entries
 */
export function getPendingEntries(store: RollbackStore): RollbackEntry[] {
  expireOldEntries(store);
  return store.entries.filter(e => e.status === 'pending');
}

/**
 * Get rollback entry by ID
 */
export function getRollbackEntry(store: RollbackStore, id: string): RollbackEntry | undefined {
  return store.entries.find(e => e.id === id);
}

/**
 * Execute rollback for an entry
 */
export function executeRollback(
  store: RollbackStore,
  entryId: string,
  currentState: State
): RollbackResult {
  // Expire old entries first
  expireOldEntries(store);

  const entry = getRollbackEntry(store, entryId);

  if (!entry) {
    return {
      success: false,
      message: `Rollback entry not found: ${entryId}`,
    };
  }

  if (entry.status !== 'pending') {
    return {
      success: false,
      message: `Rollback entry is ${entry.status}, cannot execute`,
      entry,
    };
  }

  // Get compensation function
  const opConfig = REVERSIBLE_OPERATIONS[entry.operationId];
  if (!opConfig) {
    entry.status = 'blocked';
    entry.blockedReason = 'Operation not reversible';
    store.metrics.totalBlocked++;
    return {
      success: false,
      message: `Operation ${entry.operationId} is not reversible`,
      entry,
    };
  }

  // Calculate compensation
  const compensation = opConfig.getCompensation(
    entry.beforeState,
    entry.afterState,
    entry.params
  );

  if (!compensation) {
    entry.status = 'blocked';
    entry.blockedReason = 'Cannot compute compensation';
    store.metrics.totalBlocked++;
    return {
      success: false,
      message: 'Cannot compute compensation for rollback',
      entry,
    };
  }

  // Guard check: verify current state matches expected after-state
  // This prevents rollback if state has changed since the operation
  if (entry.operationId.startsWith('memory.')) {
    const currentMemories = JSON.stringify(currentState.important);
    const expectedMemories = JSON.stringify(entry.afterState.important);

    if (currentMemories !== expectedMemories) {
      entry.status = 'blocked';
      entry.blockedReason = 'State has changed since operation';
      store.metrics.totalBlocked++;
      return {
        success: false,
        message: 'State has changed since operation, rollback blocked',
        entry,
      };
    }
  }

  // Mark as executed
  entry.status = 'executed';
  entry.executedAt = new Date().toISOString();
  store.metrics.totalExecuted++;

  return {
    success: true,
    message: `Rollback executed for ${entry.operationName}`,
    entry,
    compensation,
  };
}

/**
 * Block a rollback entry (guard decision)
 */
export function blockRollback(
  store: RollbackStore,
  entryId: string,
  reason: string
): RollbackResult {
  const entry = getRollbackEntry(store, entryId);

  if (!entry) {
    return {
      success: false,
      message: `Rollback entry not found: ${entryId}`,
    };
  }

  if (entry.status !== 'pending') {
    return {
      success: false,
      message: `Rollback entry is ${entry.status}, cannot block`,
      entry,
    };
  }

  entry.status = 'blocked';
  entry.blockedReason = reason;
  store.metrics.totalBlocked++;

  return {
    success: true,
    message: `Rollback blocked: ${reason}`,
    entry,
  };
}

/**
 * Create default rollback store
 */
export function createRollbackStore(config?: Partial<RollbackConfig>): RollbackStore {
  return {
    entries: [],
    config: { ...DEFAULT_ROLLBACK_CONFIG, ...config },
    metrics: {
      totalCreated: 0,
      totalExecuted: 0,
      totalExpired: 0,
      totalBlocked: 0,
    },
  };
}

/**
 * Get rollback store summary
 */
export function getRollbackSummary(store: RollbackStore): {
  pending: number;
  executed: number;
  expired: number;
  blocked: number;
  ttlMinutes: number;
  enabled: boolean;
} {
  expireOldEntries(store);

  const pending = store.entries.filter(e => e.status === 'pending').length;
  const executed = store.entries.filter(e => e.status === 'executed').length;
  const expired = store.entries.filter(e => e.status === 'expired').length;
  const blocked = store.entries.filter(e => e.status === 'blocked').length;

  return {
    pending,
    executed,
    expired,
    blocked,
    ttlMinutes: Math.round(store.config.ttlMs / 60000),
    enabled: store.config.enabled,
  };
}

/**
 * Print rollback status
 */
export function printRollbackStatus(store: RollbackStore): void {
  const summary = getRollbackSummary(store);

  console.log('\n=== ROLLBACK STATUS ===');
  console.log(`Enabled: ${summary.enabled ? 'Yes' : 'No'}`);
  console.log(`TTL: ${summary.ttlMinutes} minutes`);
  console.log(`\nEntries:`);
  console.log(`  Pending:  ${summary.pending}`);
  console.log(`  Executed: ${summary.executed}`);
  console.log(`  Expired:  ${summary.expired}`);
  console.log(`  Blocked:  ${summary.blocked}`);
  console.log(`\nMetrics:`);
  console.log(`  Total Created:  ${store.metrics.totalCreated}`);
  console.log(`  Total Executed: ${store.metrics.totalExecuted}`);
  console.log(`  Total Expired:  ${store.metrics.totalExpired}`);
  console.log(`  Total Blocked:  ${store.metrics.totalBlocked}`);
}

/**
 * Print pending rollback entries
 */
export function printPendingEntries(store: RollbackStore): void {
  const pending = getPendingEntries(store);

  console.log('\n=== PENDING ROLLBACKS ===');

  if (pending.length === 0) {
    console.log('No pending rollback entries.');
    return;
  }

  for (const entry of pending) {
    const expiresIn = Math.max(0, Math.round(
      (new Date(entry.expiresAt).getTime() - Date.now()) / 60000
    ));

    console.log(`\n[${entry.id}] ${entry.operationName}`);
    console.log(`  Operation: ${entry.operationId}`);
    console.log(`  Event Seq: ${entry.eventSeq}`);
    console.log(`  Created:   ${entry.timestamp}`);
    console.log(`  Expires:   ${expiresIn} minutes`);
  }
}
