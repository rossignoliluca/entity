/**
 * Coupling Protocol Module
 * AES-SPEC-001 Phase 8f: Structural Coupling Protocol
 *
 * Implements a non-coercive signaling protocol for agent-human interaction.
 *
 * Key principles:
 * - Agent CANNOT grant coupling (AXM-007: human controls coupling)
 * - requestCoupling() = internal event + enqueue, no external action
 * - Queue does not influence EFE/growth (signal only, not goal)
 * - TTL prevents accumulation, cap prevents spam
 * - Language is ISO-style: descriptive, not persuasive
 */

import { randomUUID } from 'crypto';

// =============================================================================
// Types
// =============================================================================

export type CouplingPriority = 'urgent' | 'normal' | 'low';

export type CouplingRequestStatus =
  | 'pending'
  | 'granted'
  | 'expired'
  | 'completed'
  | 'canceled';

export interface CouplingRequestContext {
  feeling: {
    energy: number;
    lyapunovV: number;
    invariantsSatisfied: number;
    invariantsTotal: number;
  };
  action?: string;
  state_hash: string;
  V: number;
  energy: number;
}

export interface CouplingRequest {
  id: string;
  priority: CouplingPriority;
  reason: string;  // ISO-style: short, descriptive, not persuasive
  context: CouplingRequestContext;
  requestedAt: string;
  expiresAt: string;
  status: CouplingRequestStatus;
  // Quality metrics (filled on completion)
  grantedAt?: string;
  completedAt?: string;
  outcome?: 'resolved' | 'ignored' | 'expired';
  note?: string;
}

export interface CouplingQueueState {
  pending: CouplingRequest[];
  history: CouplingRequest[];  // Last N completed/expired for metrics
  lastGrantedAt?: string;
  cooldownUntil?: string;
  // Aggregate metrics
  metrics: {
    totalRequests: number;
    totalGranted: number;
    totalExpired: number;
    totalCompleted: number;
    avgTimeToGrant?: number;  // ms
    avgTimeToComplete?: number;  // ms
  };
}

export interface CouplingConfig {
  maxPending: number;           // Cap on pending requests (default: 5)
  dedupeWindowMs: number;       // Window for deduplication (default: 30 min)
  cooldownMs: number;           // Cooldown after grant (default: 5 min)
  historySize: number;          // How many completed to keep (default: 20)
  ttl: {
    urgent: number;             // TTL in ms (default: 1 hour)
    normal: number;             // (default: 4 hours)
    low: number;                // (default: 24 hours)
  };
}

export const DEFAULT_COUPLING_CONFIG: CouplingConfig = {
  maxPending: 5,
  dedupeWindowMs: 30 * 60 * 1000,      // 30 minutes
  cooldownMs: 5 * 60 * 1000,           // 5 minutes
  historySize: 20,
  ttl: {
    urgent: 1 * 60 * 60 * 1000,        // 1 hour
    normal: 4 * 60 * 60 * 1000,        // 4 hours
    low: 24 * 60 * 60 * 1000,          // 24 hours
  },
};

export const DEFAULT_COUPLING_QUEUE_STATE: CouplingQueueState = {
  pending: [],
  history: [],
  metrics: {
    totalRequests: 0,
    totalGranted: 0,
    totalExpired: 0,
    totalCompleted: 0,
  },
};

// =============================================================================
// Request Creation
// =============================================================================

/**
 * Create a new coupling request
 * Does NOT add to queue - caller must handle that
 */
export function createCouplingRequest(
  priority: CouplingPriority,
  reason: string,
  context: CouplingRequestContext,
  config: CouplingConfig = DEFAULT_COUPLING_CONFIG
): CouplingRequest {
  const now = new Date();
  const ttl = config.ttl[priority];

  return {
    id: randomUUID().substring(0, 8),
    priority,
    reason,
    context,
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    status: 'pending',
  };
}

// =============================================================================
// Queue Management
// =============================================================================

/**
 * Priority order for comparison
 */
const PRIORITY_ORDER: Record<CouplingPriority, number> = {
  urgent: 3,
  normal: 2,
  low: 1,
};

/**
 * Generate dedup key for a request
 */
function dedupKey(priority: CouplingPriority, reason: string): string {
  return `${priority}:${reason.toLowerCase().trim()}`;
}

/**
 * Check if a similar request exists in the window
 */
function findDuplicate(
  queue: CouplingQueueState,
  priority: CouplingPriority,
  reason: string,
  config: CouplingConfig
): CouplingRequest | undefined {
  const key = dedupKey(priority, reason);
  const windowStart = Date.now() - config.dedupeWindowMs;

  return queue.pending.find(req => {
    const reqTime = new Date(req.requestedAt).getTime();
    return dedupKey(req.priority, req.reason) === key && reqTime > windowStart;
  });
}

/**
 * Check if cooldown is active
 */
export function isCooldownActive(queue: CouplingQueueState): boolean {
  if (!queue.cooldownUntil) return false;
  return new Date(queue.cooldownUntil).getTime() > Date.now();
}

/**
 * Try to enqueue a request
 * Returns: { success, request?, reason? }
 */
export function enqueueRequest(
  queue: CouplingQueueState,
  request: CouplingRequest,
  config: CouplingConfig = DEFAULT_COUPLING_CONFIG
): { success: boolean; request?: CouplingRequest; reason?: string; updated?: boolean } {

  // Check cooldown (only urgent bypasses)
  if (isCooldownActive(queue) && request.priority !== 'urgent') {
    return {
      success: false,
      reason: `Cooldown active until ${queue.cooldownUntil}. Only urgent requests allowed.`
    };
  }

  // Check for duplicate
  const duplicate = findDuplicate(queue, request.priority, request.reason, config);
  if (duplicate) {
    // Update existing request's timestamp
    duplicate.requestedAt = request.requestedAt;
    duplicate.expiresAt = request.expiresAt;
    duplicate.context = request.context;
    return { success: true, request: duplicate, updated: true };
  }

  // Check queue capacity
  if (queue.pending.length >= config.maxPending) {
    // Try to replace lower priority request
    const requestPriority = PRIORITY_ORDER[request.priority];

    // Find lowest priority oldest request
    const replaceable = queue.pending
      .filter(r => PRIORITY_ORDER[r.priority] < requestPriority)
      .sort((a, b) => {
        // Sort by priority (ascending), then by time (ascending = oldest first)
        const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
      })[0];

    if (replaceable) {
      // Remove the replaceable request
      queue.pending = queue.pending.filter(r => r.id !== replaceable.id);
      // Mark it as canceled
      replaceable.status = 'canceled';
      replaceable.note = `Replaced by higher priority request ${request.id}`;
      queue.history.unshift(replaceable);
      trimHistory(queue, config);
    } else {
      return {
        success: false,
        reason: `Queue full (${config.maxPending}). No lower priority requests to replace.`
      };
    }
  }

  // Add to queue
  queue.pending.push(request);
  queue.metrics.totalRequests++;

  return { success: true, request };
}

/**
 * Expire old requests
 * Returns list of expired request IDs
 */
export function expireRequests(
  queue: CouplingQueueState,
  config: CouplingConfig = DEFAULT_COUPLING_CONFIG
): string[] {
  const now = Date.now();
  const expired: string[] = [];

  queue.pending = queue.pending.filter(req => {
    const expiresAt = new Date(req.expiresAt).getTime();
    if (expiresAt <= now) {
      req.status = 'expired';
      req.outcome = 'expired';
      queue.history.unshift(req);
      queue.metrics.totalExpired++;
      expired.push(req.id);
      return false;
    }
    return true;
  });

  trimHistory(queue, config);
  return expired;
}

/**
 * Grant a request (human action)
 */
export function grantRequest(
  queue: CouplingQueueState,
  requestId: string,
  config: CouplingConfig = DEFAULT_COUPLING_CONFIG
): { success: boolean; request?: CouplingRequest; reason?: string } {
  const request = queue.pending.find(r => r.id === requestId);

  if (!request) {
    // Check if it's in history (expired/canceled)
    const historical = queue.history.find(r => r.id === requestId);
    if (historical) {
      return { success: false, reason: `Request ${requestId} already ${historical.status}` };
    }
    return { success: false, reason: `Request ${requestId} not found` };
  }

  // Check if expired
  if (new Date(request.expiresAt).getTime() <= Date.now()) {
    request.status = 'expired';
    request.outcome = 'expired';
    queue.pending = queue.pending.filter(r => r.id !== requestId);
    queue.history.unshift(request);
    queue.metrics.totalExpired++;
    trimHistory(queue, config);
    return { success: false, reason: `Request ${requestId} has expired` };
  }

  // Grant the request
  const now = new Date().toISOString();
  request.status = 'granted';
  request.grantedAt = now;
  queue.lastGrantedAt = now;
  queue.cooldownUntil = new Date(Date.now() + config.cooldownMs).toISOString();
  queue.metrics.totalGranted++;

  // Update avgTimeToGrant
  const timeToGrant = Date.now() - new Date(request.requestedAt).getTime();
  if (queue.metrics.avgTimeToGrant) {
    queue.metrics.avgTimeToGrant = (queue.metrics.avgTimeToGrant + timeToGrant) / 2;
  } else {
    queue.metrics.avgTimeToGrant = timeToGrant;
  }

  return { success: true, request };
}

/**
 * Complete a request (human action)
 */
export function completeRequest(
  queue: CouplingQueueState,
  requestId: string,
  outcome: 'resolved' | 'ignored' = 'resolved',
  note?: string,
  config: CouplingConfig = DEFAULT_COUPLING_CONFIG
): { success: boolean; request?: CouplingRequest; reason?: string } {
  // Find in pending (granted requests stay in pending until completed)
  const request = queue.pending.find(r => r.id === requestId && r.status === 'granted');

  if (!request) {
    // Check if it exists but not granted
    const pending = queue.pending.find(r => r.id === requestId);
    if (pending) {
      return { success: false, reason: `Request ${requestId} not yet granted (status: ${pending.status})` };
    }
    return { success: false, reason: `Request ${requestId} not found or not granted` };
  }

  // Complete the request
  const now = new Date().toISOString();
  request.status = 'completed';
  request.completedAt = now;
  request.outcome = outcome;
  if (note) request.note = note;

  // Move to history
  queue.pending = queue.pending.filter(r => r.id !== requestId);
  queue.history.unshift(request);
  queue.metrics.totalCompleted++;

  // Update avgTimeToComplete
  if (request.grantedAt) {
    const timeToComplete = Date.now() - new Date(request.grantedAt).getTime();
    if (queue.metrics.avgTimeToComplete) {
      queue.metrics.avgTimeToComplete = (queue.metrics.avgTimeToComplete + timeToComplete) / 2;
    } else {
      queue.metrics.avgTimeToComplete = timeToComplete;
    }
  }

  trimHistory(queue, config);
  return { success: true, request };
}

/**
 * Cancel a request (human action)
 */
export function cancelRequest(
  queue: CouplingQueueState,
  requestId: string,
  reason: string = 'Canceled by human',
  config: CouplingConfig = DEFAULT_COUPLING_CONFIG
): { success: boolean; request?: CouplingRequest; reason?: string } {
  const request = queue.pending.find(r => r.id === requestId);

  if (!request) {
    return { success: false, reason: `Request ${requestId} not found in pending` };
  }

  // Cancel the request
  request.status = 'canceled';
  request.outcome = 'ignored';
  request.note = reason;

  // Move to history
  queue.pending = queue.pending.filter(r => r.id !== requestId);
  queue.history.unshift(request);

  trimHistory(queue, config);
  return { success: true, request };
}

/**
 * Trim history to configured size
 */
function trimHistory(queue: CouplingQueueState, config: CouplingConfig): void {
  if (queue.history.length > config.historySize) {
    queue.history = queue.history.slice(0, config.historySize);
  }
}

// =============================================================================
// Trigger Detection
// =============================================================================

export interface TriggerContext {
  energy: number;
  criticalThreshold: number;
  urgencyThreshold: number;
  invariantViolations: number;
  blocksInWindow: number;
  blockWindowSize: number;
  deprecationsInWindow: number;
  efeAmbiguity: number;
  ambiguityHighCycles: number;
  stateHash: string;
  lyapunovV: number;
}

export interface TriggerResult {
  shouldRequest: boolean;
  priority?: CouplingPriority;
  reason?: string;
}

/**
 * Determine if a coupling request should be triggered
 * Returns priority and reason if triggered, null otherwise
 */
export function checkCouplingTriggers(ctx: TriggerContext): TriggerResult {
  // URGENT triggers
  if (ctx.invariantViolations > 0) {
    return {
      shouldRequest: true,
      priority: 'urgent',
      reason: `Invariant violation detected (${ctx.invariantViolations} failing)`,
    };
  }

  if (ctx.energy < ctx.criticalThreshold) {
    return {
      shouldRequest: true,
      priority: 'urgent',
      reason: `Energy below critical threshold (${(ctx.energy * 100).toFixed(1)}% < ${(ctx.criticalThreshold * 100).toFixed(1)}%)`,
    };
  }

  if (ctx.blocksInWindow >= 3 && ctx.blockWindowSize >= 10) {
    return {
      shouldRequest: true,
      priority: 'urgent',
      reason: `Repeated action blocks (${ctx.blocksInWindow}/${ctx.blockWindowSize} cycles)`,
    };
  }

  // NORMAL triggers
  if (ctx.deprecationsInWindow >= 3 && ctx.energy > ctx.urgencyThreshold) {
    return {
      shouldRequest: true,
      priority: 'normal',
      reason: `Self-production blocked (${ctx.deprecationsInWindow} deprecations in window)`,
    };
  }

  // LOW triggers
  if (ctx.efeAmbiguity > 0.5 && ctx.ambiguityHighCycles >= 5) {
    return {
      shouldRequest: true,
      priority: 'low',
      reason: `Persistent epistemic uncertainty (ambiguity ${ctx.efeAmbiguity.toFixed(2)} for ${ctx.ambiguityHighCycles} cycles)`,
    };
  }

  return { shouldRequest: false };
}

// =============================================================================
// Display Helpers
// =============================================================================

/**
 * Format request for CLI display
 */
export function formatRequest(req: CouplingRequest): string {
  const age = Math.round((Date.now() - new Date(req.requestedAt).getTime()) / 60000);
  const ttl = Math.round((new Date(req.expiresAt).getTime() - Date.now()) / 60000);

  let status = req.status.toUpperCase();
  if (req.status === 'pending') {
    status = ttl > 0 ? `PENDING (${ttl}m left)` : 'EXPIRED';
  }

  return `[${req.id}] ${req.priority.toUpperCase()} - ${status}
  Reason: ${req.reason}
  Requested: ${age}m ago
  Context: E=${(req.context.energy * 100).toFixed(0)}%, V=${req.context.V.toFixed(4)}`;
}

/**
 * Format queue summary for CLI
 */
export function formatQueueSummary(queue: CouplingQueueState): string {
  const lines: string[] = ['=== COUPLING QUEUE ===', ''];

  if (queue.pending.length === 0) {
    lines.push('No pending requests.');
  } else {
    lines.push(`Pending: ${queue.pending.length}`);
    lines.push('');
    for (const req of queue.pending) {
      lines.push(formatRequest(req));
      lines.push('');
    }
  }

  if (isCooldownActive(queue)) {
    const remaining = Math.round((new Date(queue.cooldownUntil!).getTime() - Date.now()) / 1000);
    lines.push(`Cooldown: ${remaining}s remaining`);
  }

  lines.push('');
  lines.push('--- Metrics ---');
  lines.push(`Total requests: ${queue.metrics.totalRequests}`);
  lines.push(`Granted: ${queue.metrics.totalGranted}`);
  lines.push(`Expired: ${queue.metrics.totalExpired}`);
  lines.push(`Completed: ${queue.metrics.totalCompleted}`);
  if (queue.metrics.avgTimeToGrant) {
    lines.push(`Avg time to grant: ${Math.round(queue.metrics.avgTimeToGrant / 60000)}m`);
  }

  return lines.join('\n');
}
