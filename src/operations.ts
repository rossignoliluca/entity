/**
 * Operations Catalog
 * AES-SPEC-001 Phase 3: Operations & Actions
 *
 * Defines allowed operations with their effects and handlers
 */

import type { State } from './types.js';

/**
 * Operation definition in catalog
 */
export interface OperationDef {
  id: string;
  name: string;
  description: string;
  category: 'state' | 'memory' | 'energy' | 'system' | 'interaction';
  complexity: number;
  energyCost: number;
  requiresCoupling: boolean;
  handler: (state: State, params: Record<string, unknown>) => OperationResult;
}

/**
 * Operation result
 */
export interface OperationResult {
  success: boolean;
  message: string;
  effects?: Record<string, unknown>;
  stateChanges?: Partial<State>;
}

/**
 * Operations Catalog
 * All allowed operations with their definitions
 */
export const OPERATIONS_CATALOG: Record<string, OperationDef> = {
  // State operations
  'state.read': {
    id: 'state.read',
    name: 'Read State',
    description: 'Read current system state',
    category: 'state',
    complexity: 1,
    energyCost: 0.001,
    requiresCoupling: false,
    handler: (state) => ({
      success: true,
      message: 'State read successfully',
      effects: { state: JSON.parse(JSON.stringify(state)) },
    }),
  },

  'state.summary': {
    id: 'state.summary',
    name: 'State Summary',
    description: 'Get summarized system status',
    category: 'state',
    complexity: 2,
    energyCost: 0.002,
    requiresCoupling: false,
    handler: (state) => ({
      success: true,
      message: 'Summary generated',
      effects: {
        status: state.integrity.status,
        energy: state.energy.current,
        events: state.memory.event_count,
        sessions: state.session.total_count,
        coupled: state.coupling.active,
      },
    }),
  },

  // Memory operations
  'memory.add': {
    id: 'memory.add',
    name: 'Add Memory',
    description: 'Add important memory',
    category: 'memory',
    complexity: 5,
    energyCost: 0.005,
    requiresCoupling: true,
    handler: (state, params) => {
      const memory = params.memory as string;
      if (!memory) {
        return { success: false, message: 'Memory text required' };
      }
      const timestamp = new Date().toISOString().substring(0, 10);
      const entry = `[${timestamp}] ${memory}`;
      return {
        success: true,
        message: `Memory added: ${entry}`,
        effects: { entry },
        stateChanges: {
          important: [...state.important, entry],
        },
      };
    },
  },

  'memory.list': {
    id: 'memory.list',
    name: 'List Memories',
    description: 'List all important memories',
    category: 'memory',
    complexity: 1,
    energyCost: 0.001,
    requiresCoupling: false,
    handler: (state) => ({
      success: true,
      message: `Found ${state.important.length} memories`,
      effects: { memories: state.important },
    }),
  },

  'memory.clear': {
    id: 'memory.clear',
    name: 'Clear Memories',
    description: 'Clear all memories (requires confirmation)',
    category: 'memory',
    complexity: 10,
    energyCost: 0.01,
    requiresCoupling: true,
    handler: (state, params) => {
      if (params.confirm !== true) {
        return { success: false, message: 'Confirmation required (confirm: true)' };
      }
      return {
        success: true,
        message: `Cleared ${state.important.length} memories`,
        effects: { cleared: state.important.length },
        stateChanges: { important: [] },
      };
    },
  },

  // Energy operations
  'energy.status': {
    id: 'energy.status',
    name: 'Energy Status',
    description: 'Get current energy level',
    category: 'energy',
    complexity: 1,
    energyCost: 0,
    requiresCoupling: false,
    handler: (state) => ({
      success: true,
      message: `Energy: ${state.energy.current.toFixed(2)}`,
      effects: {
        current: state.energy.current,
        min: state.energy.min,
        threshold: state.energy.threshold,
        viable: state.energy.current >= state.energy.min,
      },
    }),
  },

  // Interaction operations
  'interaction.greet': {
    id: 'interaction.greet',
    name: 'Greet',
    description: 'Greet the human partner',
    category: 'interaction',
    complexity: 2,
    energyCost: 0.002,
    requiresCoupling: true,
    handler: (state) => ({
      success: true,
      message: `Hello, ${state.human.name}!`,
      effects: { greeted: state.human.name },
    }),
  },

  'interaction.acknowledge': {
    id: 'interaction.acknowledge',
    name: 'Acknowledge',
    description: 'Acknowledge a message or action',
    category: 'interaction',
    complexity: 1,
    energyCost: 0.001,
    requiresCoupling: true,
    handler: (state, params) => ({
      success: true,
      message: `Acknowledged: ${params.what || 'message'}`,
      effects: { acknowledged: params.what },
    }),
  },

  // System operations
  'system.health': {
    id: 'system.health',
    name: 'Health Check',
    description: 'Check system health',
    category: 'system',
    complexity: 5,
    energyCost: 0.005,
    requiresCoupling: false,
    handler: (state) => {
      const issues: string[] = [];
      if (state.energy.current < state.energy.threshold) {
        issues.push('Energy below threshold');
      }
      if (state.integrity.invariant_violations > 0) {
        issues.push(`${state.integrity.invariant_violations} invariant violations`);
      }
      if (state.integrity.status !== 'nominal') {
        issues.push(`Status: ${state.integrity.status}`);
      }
      return {
        success: true,
        message: issues.length === 0 ? 'System healthy' : `Issues found: ${issues.length}`,
        effects: {
          healthy: issues.length === 0,
          issues,
          status: state.integrity.status,
        },
      };
    },
  },

  'system.info': {
    id: 'system.info',
    name: 'System Info',
    description: 'Get system information',
    category: 'system',
    complexity: 2,
    energyCost: 0.002,
    requiresCoupling: false,
    handler: (state) => ({
      success: true,
      message: 'System info retrieved',
      effects: {
        specification: state.specification,
        version: state.version,
        created: state.created,
        organization: state.organization_hash.substring(0, 16) + '...',
      },
    }),
  },
};

/**
 * Get operation by ID
 */
export function getOperation(id: string): OperationDef | undefined {
  return OPERATIONS_CATALOG[id];
}

/**
 * List all operations
 */
export function listOperations(): OperationDef[] {
  return Object.values(OPERATIONS_CATALOG);
}

/**
 * List operations by category
 */
export function listByCategory(category: OperationDef['category']): OperationDef[] {
  return Object.values(OPERATIONS_CATALOG).filter((op) => op.category === category);
}

/**
 * Check if operation is allowed
 */
export function isAllowedOperation(id: string): boolean {
  return id in OPERATIONS_CATALOG;
}

/**
 * Execute operation from catalog
 */
export function executeOperation(
  id: string,
  state: State,
  params: Record<string, unknown> = {}
): OperationResult {
  const op = getOperation(id);

  if (!op) {
    return {
      success: false,
      message: `Unknown operation: ${id}`,
    };
  }

  // Check coupling requirement
  if (op.requiresCoupling && !state.coupling.active) {
    return {
      success: false,
      message: `Operation ${id} requires active coupling`,
    };
  }

  // Check energy
  if (state.energy.current < op.energyCost) {
    return {
      success: false,
      message: `Insufficient energy for ${id} (need ${op.energyCost}, have ${state.energy.current})`,
    };
  }

  // Execute handler
  return op.handler(state, params);
}

/**
 * Print operations catalog
 */
export function printCatalog(): void {
  console.log('\n=== OPERATIONS CATALOG ===\n');

  const categories = ['state', 'memory', 'energy', 'interaction', 'system'] as const;

  for (const category of categories) {
    const ops = listByCategory(category);
    if (ops.length > 0) {
      console.log(`[${category.toUpperCase()}]`);
      for (const op of ops) {
        console.log(`  ${op.id}`);
        console.log(`    ${op.description}`);
        console.log(`    Complexity: ${op.complexity} | Energy: ${op.energyCost}`);
      }
      console.log('');
    }
  }
}
