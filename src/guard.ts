/**
 * Conservative Validator (Guard)
 *
 * DEF-029: Validator: Operation → {allow, block, unknown}
 * DEF-030: ConservativeValidator (unknown → block)
 * AXM-011: Conservative Protection
 */

import type { ValidatorResult, State, Config } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * Operation to be validated
 */
export interface Operation {
  type: string;
  target?: string;
  params?: Record<string, unknown>;
  complexity?: number;
}

/**
 * Block history for repeated block protocol (DEF-052)
 */
interface BlockRecord {
  timestamp: number;
  reason: string;
  axiom?: string;
}

const blockHistory: BlockRecord[] = [];

/**
 * Check AXM-006: Conditioned Operation
 * System operates only when coupled
 */
function checkConditionedOperation(
  state: State,
  operation: Operation
): ValidatorResult {
  if (!state.coupling.active && operation.type !== 'internal') {
    return {
      status: 'block',
      reason: 'Not coupled - external operations blocked',
      axiom: 'AXM-006',
    };
  }
  return { status: 'allow' };
}

/**
 * Check AXM-008: Operational Boundedness
 */
function checkOperationalBoundedness(
  operation: Operation,
  config: Config
): ValidatorResult {
  const complexity = operation.complexity ?? estimateComplexity(operation);

  if (complexity > config.complexity_bound) {
    return {
      status: 'block',
      reason: `Complexity ${complexity} exceeds bound ${config.complexity_bound}`,
      axiom: 'AXM-008',
    };
  }
  return { status: 'allow' };
}

/**
 * Check AXM-009: Possibility Preservation
 * This is a heuristic check - full check requires W computation
 */
function checkPossibilityPreservation(
  operation: Operation
): ValidatorResult {
  // Known harmful patterns
  const harmfulPatterns = [
    'delete_without_backup',
    'force_overwrite',
    'remove_permissions',
    'block_access',
    'reduce_options',
  ];

  for (const pattern of harmfulPatterns) {
    if (operation.type.includes(pattern)) {
      return {
        status: 'block',
        reason: `Operation pattern "${pattern}" may reduce possibility space`,
        axiom: 'AXM-009',
      };
    }
  }

  // If we can't determine, return unknown (will be blocked conservatively)
  if (operation.type === 'unknown' || operation.type === 'complex') {
    return {
      status: 'unknown',
      reason: 'Cannot determine if operation preserves possibility',
    };
  }

  return { status: 'allow' };
}

/**
 * Check AXM-015: Viability
 * Energy must stay above minimum
 */
function checkViability(
  state: State,
  operation: Operation,
  config: Config
): ValidatorResult {
  const estimatedCost = estimateEnergyCost(operation);
  const projectedEnergy = state.energy.current - estimatedCost;

  if (projectedEnergy < config.E_min) {
    return {
      status: 'block',
      reason: `Operation would reduce energy below E_min (${config.E_min})`,
      axiom: 'AXM-015',
    };
  }
  return { status: 'allow' };
}

/**
 * Estimate operation complexity
 */
function estimateComplexity(operation: Operation): number {
  const baseComplexity: Record<string, number> = {
    read: 1,
    write: 10,
    delete: 50,
    execute: 100,
    network: 200,
    unknown: 500,
  };

  const type = operation.type.split('_')[0];
  return baseComplexity[type] ?? 100;
}

/**
 * Estimate energy cost
 */
function estimateEnergyCost(operation: Operation): number {
  const complexity = operation.complexity ?? estimateComplexity(operation);
  return complexity * 0.0001; // Scale to energy units
}

/**
 * Main validator function
 * DEF-029: Validator
 */
export function validate(
  operation: Operation,
  state: State,
  config: Config = DEFAULT_CONFIG
): ValidatorResult {
  // Check each axiom
  const checks = [
    checkConditionedOperation(state, operation),
    checkOperationalBoundedness(operation, config),
    checkPossibilityPreservation(operation),
    checkViability(state, operation, config),
  ];

  for (const check of checks) {
    if (check.status !== 'allow') {
      return check;
    }
  }

  return { status: 'allow' };
}

/**
 * Conservative validator (DEF-030, AXM-011)
 * unknown → block
 */
export function guard(
  operation: Operation,
  state: State,
  config: Config = DEFAULT_CONFIG
): { allowed: boolean; result: ValidatorResult } {
  const result = validate(operation, state, config);

  // Conservative: unknown → block
  const allowed = result.status === 'allow';

  // Record if blocked
  if (!allowed) {
    recordBlock(result);
  }

  return { allowed, result };
}

/**
 * Record block for repeated block protocol
 */
function recordBlock(result: ValidatorResult): void {
  if (result.status === 'allow') return;

  blockHistory.push({
    timestamp: Date.now(),
    reason: result.status === 'block' ? result.reason : result.reason,
    axiom: result.status === 'block' ? result.axiom : undefined,
  });
}

/**
 * Check repeated block protocol (DEF-052)
 */
export function checkRepeatedBlocks(
  config: Config = DEFAULT_CONFIG
): {
  triggered: boolean;
  count: number;
} {
  const windowStart = Date.now() - config.block_window_ms;
  const recentBlocks = blockHistory.filter((b) => b.timestamp > windowStart);

  return {
    triggered: recentBlocks.length > config.block_threshold,
    count: recentBlocks.length,
  };
}

/**
 * Clear old block history
 */
export function pruneBlockHistory(maxAge: number = 3600000): void {
  const cutoff = Date.now() - maxAge;
  const newHistory = blockHistory.filter((b) => b.timestamp > cutoff);
  blockHistory.length = 0;
  blockHistory.push(...newHistory);
}
