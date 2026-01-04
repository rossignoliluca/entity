/**
 * Meta-Operations Module
 * AES-SPEC-001 Phase 7a: Self-Production (DEF-007)
 *
 * Implements operations that generate operations, satisfying:
 * Autopoietic(S) ⟺ OperationallyClosed(S) ∧ ∃ P ⊆ 𝕆 : P generates 𝕆
 *
 * P = {meta.define, meta.compose, meta.specialize}
 * These operations generate new members of 𝕆
 */

import type { State } from './types.js';
import type { OperationDef, OperationResult } from './operations.js';
import { OPERATIONS_CATALOG, getOperation } from './operations.js';
import { hashObject } from './hash.js';

// =============================================================================
// Types for Self-Production
// =============================================================================

/**
 * Handler template types - predefined behaviors that can be parameterized
 */
export type HandlerTemplate =
  | 'read_field'      // Read a state field
  | 'set_field'       // Set a state field (with validation)
  | 'compose'         // Execute multiple operations in sequence
  | 'conditional'     // Execute based on condition
  | 'transform'       // Apply transformation to state data
  | 'aggregate'       // Aggregate data from multiple sources
  | 'echo';           // Return input as output

/**
 * Category type including 'generated'
 */
export type GeneratedCategory = OperationDef['category'] | 'generated';

/**
 * Serializable operation definition (can be stored in state)
 */
export interface GeneratedOperationDef {
  id: string;
  name: string;
  description: string;
  category: GeneratedCategory;
  complexity: number;
  energyCost: number;
  requiresCoupling: boolean;
  template: HandlerTemplate;
  templateParams: Record<string, unknown>;
  generatedBy: string;           // Which meta-operation created this
  generatedAt: string;           // Timestamp
  parentOperations?: string[];   // For composed operations
  generation: number;            // How many generations from base (0 = base catalog)
}

/**
 * Autopoiesis state tracking
 */
export interface AutopoiesisState {
  enabled: boolean;
  generatedOperations: GeneratedOperationDef[];
  generationCount: number;       // Total operations ever generated
  lastGeneration: string | null; // Timestamp
  selfProductionHash: string | null; // Hash of P set
}

// =============================================================================
// Template Handlers
// =============================================================================

/**
 * Create handler from template
 */
function createHandler(
  template: HandlerTemplate,
  params: Record<string, unknown>
): (state: State, opParams: Record<string, unknown>) => OperationResult {
  switch (template) {
    case 'read_field':
      return (state) => {
        const field = params.field as string;
        const value = getNestedValue(state, field);
        return {
          success: true,
          message: `Read ${field}`,
          effects: { [field]: value },
        };
      };

    case 'set_field':
      return (state, opParams) => {
        const field = params.field as string;
        const value = opParams.value ?? params.defaultValue;
        if (value === undefined) {
          return { success: false, message: `Value required for ${field}` };
        }
        const stateChanges = setNestedValue({}, field, value);
        return {
          success: true,
          message: `Set ${field} to ${JSON.stringify(value)}`,
          effects: { [field]: value },
          stateChanges: stateChanges as Partial<State>,
        };
      };

    case 'compose':
      return (state, opParams) => {
        const operations = params.operations as string[];
        const results: OperationResult[] = [];
        let currentState = state;

        for (const opId of operations) {
          const op = getOperation(opId) || getDynamicOperation(opId, state);
          if (!op) {
            return { success: false, message: `Operation not found: ${opId}` };
          }
          const result = op.handler(currentState, opParams);
          results.push(result);
          if (!result.success) {
            return {
              success: false,
              message: `Composition failed at ${opId}: ${result.message}`,
              effects: { partial_results: results },
            };
          }
          if (result.stateChanges) {
            currentState = { ...currentState, ...result.stateChanges };
          }
        }

        return {
          success: true,
          message: `Composed ${operations.length} operations`,
          effects: { results },
          stateChanges: results.reduce(
            (acc, r) => ({ ...acc, ...(r.stateChanges || {}) }),
            {}
          ) as Partial<State>,
        };
      };

    case 'conditional':
      return (state, opParams) => {
        const condition = params.condition as string;
        const thenOp = params.thenOperation as string;
        const elseOp = params.elseOperation as string | undefined;

        const conditionMet = evaluateCondition(state, condition);
        const targetOp = conditionMet ? thenOp : elseOp;

        if (!targetOp) {
          return {
            success: true,
            message: `Condition ${conditionMet ? 'met' : 'not met'}, no operation`,
            effects: { condition_result: conditionMet },
          };
        }

        const op = getOperation(targetOp) || getDynamicOperation(targetOp, state);
        if (!op) {
          return { success: false, message: `Operation not found: ${targetOp}` };
        }

        const result = op.handler(state, opParams);
        return {
          ...result,
          effects: {
            ...result.effects,
            condition_result: conditionMet,
            executed_operation: targetOp,
          },
        };
      };

    case 'transform':
      return (state) => {
        const sourceField = params.sourceField as string;
        const targetField = params.targetField as string;
        const transform = params.transform as string;

        const value = getNestedValue(state, sourceField);
        const transformed = applyTransform(value, transform);

        return {
          success: true,
          message: `Transformed ${sourceField} -> ${targetField}`,
          effects: { original: value, transformed },
          stateChanges: setNestedValue({}, targetField, transformed) as Partial<State>,
        };
      };

    case 'aggregate':
      return (state) => {
        const fields = params.fields as string[];
        const aggregation: Record<string, unknown> = {};

        for (const field of fields) {
          aggregation[field] = getNestedValue(state, field);
        }

        return {
          success: true,
          message: `Aggregated ${fields.length} fields`,
          effects: { aggregation },
        };
      };

    case 'echo':
      return (_state, opParams) => ({
        success: true,
        message: params.message as string || 'Echo',
        effects: { input: opParams, echo: true },
      });

    default:
      return () => ({ success: false, message: `Unknown template: ${template}` });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  const result = { ...obj };
  let current = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    current[part] = current[part] ? { ...(current[part] as Record<string, unknown>) } : {};
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}

function evaluateCondition(state: State, condition: string): boolean {
  // Simple condition evaluation: "field.path op value"
  const match = condition.match(/^([\w.]+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
  if (!match) return false;

  const [, field, op, rawValue] = match;
  const stateValue = getNestedValue(state, field);
  let compareValue: unknown;

  try {
    compareValue = JSON.parse(rawValue);
  } catch {
    compareValue = rawValue;
  }

  switch (op) {
    case '==': return stateValue === compareValue;
    case '!=': return stateValue !== compareValue;
    case '>': return (stateValue as number) > (compareValue as number);
    case '<': return (stateValue as number) < (compareValue as number);
    case '>=': return (stateValue as number) >= (compareValue as number);
    case '<=': return (stateValue as number) <= (compareValue as number);
    default: return false;
  }
}

function applyTransform(value: unknown, transform: string): unknown {
  switch (transform) {
    case 'uppercase':
      return typeof value === 'string' ? value.toUpperCase() : value;
    case 'lowercase':
      return typeof value === 'string' ? value.toLowerCase() : value;
    case 'negate':
      return typeof value === 'number' ? -value : value;
    case 'invert':
      return typeof value === 'boolean' ? !value : value;
    case 'double':
      return typeof value === 'number' ? value * 2 : value;
    case 'stringify':
      return JSON.stringify(value);
    default:
      return value;
  }
}

// =============================================================================
// Dynamic Operations Registry
// =============================================================================

/**
 * Get dynamic operation from state
 */
export function getDynamicOperation(
  id: string,
  state: State
): OperationDef | undefined {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  if (!autopoiesis) return undefined;

  const genOp = autopoiesis.generatedOperations.find((op) => op.id === id);
  if (!genOp) return undefined;

  return {
    id: genOp.id,
    name: genOp.name,
    description: genOp.description,
    category: (genOp.category === 'generated' ? 'system' : genOp.category) as OperationDef['category'],
    complexity: genOp.complexity,
    energyCost: genOp.energyCost,
    requiresCoupling: genOp.requiresCoupling,
    handler: createHandler(genOp.template as HandlerTemplate, genOp.templateParams),
  };
}

/**
 * Get all operations (catalog + dynamic)
 */
export function getAllOperations(state: State): OperationDef[] {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  const catalogOps = Object.values(OPERATIONS_CATALOG);

  if (!autopoiesis) return catalogOps;

  const dynamicOps = autopoiesis.generatedOperations.map((genOp) => ({
    id: genOp.id,
    name: genOp.name,
    description: genOp.description,
    category: (genOp.category === 'generated' ? 'system' : genOp.category) as OperationDef['category'],
    complexity: genOp.complexity,
    energyCost: genOp.energyCost,
    requiresCoupling: genOp.requiresCoupling,
    handler: createHandler(genOp.template as HandlerTemplate, genOp.templateParams),
  } as OperationDef));

  return [...catalogOps, ...dynamicOps];
}

// =============================================================================
// Meta-Operations (P set that generates 𝕆)
// =============================================================================

/**
 * Define a new operation from template
 * This is the core self-production capability
 */
export function defineOperation(
  state: State,
  params: {
    id: string;
    name: string;
    description: string;
    category?: GeneratedCategory;
    complexity?: number;
    energyCost?: number;
    requiresCoupling?: boolean;
    template: HandlerTemplate;
    templateParams: Record<string, unknown>;
  }
): OperationResult & { generatedOperation?: GeneratedOperationDef } {
  // Validate ID doesn't conflict with catalog
  if (OPERATIONS_CATALOG[params.id]) {
    return {
      success: false,
      message: `Operation ${params.id} already exists in base catalog`,
    };
  }

  // Get current autopoiesis state
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis || {
    enabled: true,
    generatedOperations: [],
    generationCount: 0,
    lastGeneration: null,
    selfProductionHash: null,
  };

  // Check if ID already exists in generated
  if (autopoiesis.generatedOperations.some((op) => op.id === params.id)) {
    return {
      success: false,
      message: `Operation ${params.id} already exists in generated operations`,
    };
  }

  const generatedOp: GeneratedOperationDef = {
    id: params.id,
    name: params.name,
    description: params.description,
    category: params.category || 'generated',
    complexity: params.complexity ?? 5,
    energyCost: params.energyCost ?? 0.01,
    requiresCoupling: params.requiresCoupling ?? true,
    template: params.template,
    templateParams: params.templateParams,
    generatedBy: 'meta.define',
    generatedAt: new Date().toISOString(),
    generation: 1,
  };

  const newAutopoiesis: AutopoiesisState = {
    ...autopoiesis,
    generatedOperations: [...autopoiesis.generatedOperations, generatedOp],
    generationCount: autopoiesis.generationCount + 1,
    lastGeneration: generatedOp.generatedAt,
    selfProductionHash: hashObject([...autopoiesis.generatedOperations, generatedOp]),
  };

  return {
    success: true,
    message: `Generated operation: ${params.id}`,
    effects: {
      operation_id: params.id,
      template: params.template,
      generation: 1,
    },
    stateChanges: {
      autopoiesis: newAutopoiesis,
    } as unknown as Partial<State>,
    generatedOperation: generatedOp,
  };
}

/**
 * Compose existing operations into a new operation
 */
export function composeOperations(
  state: State,
  params: {
    id: string;
    name: string;
    description: string;
    operations: string[];
    energyCost?: number;
  }
): OperationResult & { generatedOperation?: GeneratedOperationDef } {
  // Validate all source operations exist
  for (const opId of params.operations) {
    const exists = OPERATIONS_CATALOG[opId] || getDynamicOperation(opId, state);
    if (!exists) {
      return {
        success: false,
        message: `Source operation not found: ${opId}`,
      };
    }
  }

  // Calculate complexity from components
  const complexity = params.operations.reduce((sum, opId) => {
    const op = OPERATIONS_CATALOG[opId] || getDynamicOperation(opId, state);
    return sum + (op?.complexity || 0);
  }, 0);

  // Calculate energy cost from components
  const energyCost = params.energyCost ?? params.operations.reduce((sum, opId) => {
    const op = OPERATIONS_CATALOG[opId] || getDynamicOperation(opId, state);
    return sum + (op?.energyCost || 0);
  }, 0);

  // Find max generation of parent operations
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  const maxGeneration = params.operations.reduce((max, opId) => {
    if (OPERATIONS_CATALOG[opId]) return max;
    const genOp = autopoiesis?.generatedOperations.find((op) => op.id === opId);
    return Math.max(max, genOp?.generation || 0);
  }, 0);

  return defineOperation(state, {
    id: params.id,
    name: params.name,
    description: params.description,
    category: 'generated',
    complexity,
    energyCost,
    requiresCoupling: true,
    template: 'compose',
    templateParams: { operations: params.operations },
  }).success
    ? {
        ...defineOperation(state, {
          id: params.id,
          name: params.name,
          description: params.description,
          category: 'generated',
          complexity,
          energyCost,
          requiresCoupling: true,
          template: 'compose',
          templateParams: { operations: params.operations },
        }),
        generatedOperation: {
          id: params.id,
          name: params.name,
          description: params.description,
          category: 'generated',
          complexity,
          energyCost,
          requiresCoupling: true,
          template: 'compose',
          templateParams: { operations: params.operations },
          generatedBy: 'meta.compose',
          generatedAt: new Date().toISOString(),
          parentOperations: params.operations,
          generation: maxGeneration + 1,
        },
      }
    : defineOperation(state, {
        id: params.id,
        name: params.name,
        description: params.description,
        category: 'generated',
        complexity,
        energyCost,
        requiresCoupling: true,
        template: 'compose',
        templateParams: { operations: params.operations },
      });
}

/**
 * Create a specialized version of an existing operation with preset params
 */
export function specializeOperation(
  state: State,
  params: {
    id: string;
    name: string;
    description: string;
    sourceOperation: string;
    presetParams: Record<string, unknown>;
  }
): OperationResult & { generatedOperation?: GeneratedOperationDef } {
  // Find source operation
  const sourceOp = OPERATIONS_CATALOG[params.sourceOperation] ||
    getDynamicOperation(params.sourceOperation, state);

  if (!sourceOp) {
    return {
      success: false,
      message: `Source operation not found: ${params.sourceOperation}`,
    };
  }

  // Get source generation (or 0 if from catalog)
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  const sourceGenOp = autopoiesis?.generatedOperations.find(
    (op) => op.id === params.sourceOperation
  );
  const sourceGeneration = sourceGenOp?.generation || 0;

  // For catalog operations, we need to determine the template
  let template: HandlerTemplate = 'echo';
  let templateParams: Record<string, unknown> = { ...params.presetParams };

  if (sourceGenOp) {
    // Inherit from generated operation
    template = sourceGenOp.template as HandlerTemplate;
    templateParams = { ...sourceGenOp.templateParams, ...params.presetParams };
  }

  const result = defineOperation(state, {
    id: params.id,
    name: params.name,
    description: params.description,
    category: sourceOp.category,
    complexity: sourceOp.complexity,
    energyCost: sourceOp.energyCost,
    requiresCoupling: sourceOp.requiresCoupling,
    template,
    templateParams,
  });

  if (result.success && result.generatedOperation) {
    result.generatedOperation.generatedBy = 'meta.specialize';
    result.generatedOperation.parentOperations = [params.sourceOperation];
    result.generatedOperation.generation = sourceGeneration + 1;
  }

  return result;
}

/**
 * List all generated operations
 */
export function listGeneratedOperations(state: State): GeneratedOperationDef[] {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  return autopoiesis?.generatedOperations || [];
}

/**
 * Get autopoiesis statistics
 */
export function getAutopoiesisStats(state: State): {
  enabled: boolean;
  baseOperations: number;
  generatedOperations: number;
  totalOperations: number;
  generationCount: number;
  maxGeneration: number;
  selfProductionHash: string | null;
  lastGeneration: string | null;
  satisfiesDEF007: boolean;
} {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  const baseOps = Object.keys(OPERATIONS_CATALOG).length;
  const genOps = autopoiesis?.generatedOperations || [];

  const maxGeneration = genOps.reduce((max, op) => Math.max(max, op.generation), 0);

  // DEF-007: Autopoietic(S) ⟺ OperationallyClosed(S) ∧ ∃ P ⊆ 𝕆 : P generates 𝕆
  // P = {meta.define, meta.compose, meta.specialize}
  // P generates 𝕆 if there exists at least one generated operation
  const satisfiesDEF007 = genOps.length > 0;

  return {
    enabled: autopoiesis?.enabled ?? false,
    baseOperations: baseOps,
    generatedOperations: genOps.length,
    totalOperations: baseOps + genOps.length,
    generationCount: autopoiesis?.generationCount ?? 0,
    maxGeneration,
    selfProductionHash: autopoiesis?.selfProductionHash ?? null,
    lastGeneration: autopoiesis?.lastGeneration ?? null,
    satisfiesDEF007,
  };
}

/**
 * Print autopoiesis report
 */
export function printAutopoiesisReport(state: State): void {
  const stats = getAutopoiesisStats(state);
  const genOps = listGeneratedOperations(state);

  console.log('\n=== AUTOPOIESIS REPORT (DEF-007) ===\n');

  console.log('Self-Production Status:');
  console.log(`  DEF-007 Satisfied: ${stats.satisfiesDEF007 ? 'YES' : 'NO'}`);
  console.log(`  P set: {meta.define, meta.compose, meta.specialize}`);
  console.log(`  |P generates 𝕆|: ${stats.generatedOperations} operations`);
  console.log('');

  console.log('Statistics:');
  console.log(`  Base Operations (catalog): ${stats.baseOperations}`);
  console.log(`  Generated Operations: ${stats.generatedOperations}`);
  console.log(`  Total Operations |𝕆|: ${stats.totalOperations}`);
  console.log(`  Generation Count: ${stats.generationCount}`);
  console.log(`  Max Generation Depth: ${stats.maxGeneration}`);
  console.log('');

  if (genOps.length > 0) {
    console.log('Generated Operations:');
    for (const op of genOps) {
      console.log(`  ${op.id} [gen ${op.generation}]`);
      console.log(`    Template: ${op.template}`);
      console.log(`    Generated by: ${op.generatedBy}`);
      if (op.parentOperations) {
        console.log(`    Parents: ${op.parentOperations.join(', ')}`);
      }
    }
    console.log('');
  }

  if (stats.selfProductionHash) {
    console.log(`Self-Production Hash: ${stats.selfProductionHash.substring(0, 16)}...`);
  }

  console.log('');
}

// =============================================================================
// Meta-Operations Catalog (The P set)
// =============================================================================

export const META_OPERATIONS_CATALOG: Record<string, OperationDef> = {
  'meta.define': {
    id: 'meta.define',
    name: 'Define Operation',
    description: 'Define a new operation from template (self-production)',
    category: 'system',
    complexity: 10,
    energyCost: 0.05,
    requiresCoupling: true,
    handler: (state, params) => {
      return defineOperation(state, params as Parameters<typeof defineOperation>[1]);
    },
  },

  'meta.compose': {
    id: 'meta.compose',
    name: 'Compose Operations',
    description: 'Compose existing operations into a new operation',
    category: 'system',
    complexity: 15,
    energyCost: 0.08,
    requiresCoupling: true,
    handler: (state, params) => {
      return composeOperations(state, params as Parameters<typeof composeOperations>[1]);
    },
  },

  'meta.specialize': {
    id: 'meta.specialize',
    name: 'Specialize Operation',
    description: 'Create specialized version of existing operation',
    category: 'system',
    complexity: 8,
    energyCost: 0.04,
    requiresCoupling: true,
    handler: (state, params) => {
      return specializeOperation(state, params as Parameters<typeof specializeOperation>[1]);
    },
  },

  'meta.list': {
    id: 'meta.list',
    name: 'List Generated',
    description: 'List all generated operations',
    category: 'system',
    complexity: 2,
    energyCost: 0.002,
    requiresCoupling: false,
    handler: (state) => {
      const ops = listGeneratedOperations(state);
      return {
        success: true,
        message: `Found ${ops.length} generated operations`,
        effects: { operations: ops.map((op) => op.id), count: ops.length },
      };
    },
  },

  'meta.introspect': {
    id: 'meta.introspect',
    name: 'Introspect',
    description: 'Analyze self-production capabilities',
    category: 'system',
    complexity: 5,
    energyCost: 0.01,
    requiresCoupling: false,
    handler: (state) => {
      const stats = getAutopoiesisStats(state);
      return {
        success: true,
        message: stats.satisfiesDEF007 ? 'System is autopoietic' : 'System not yet autopoietic',
        effects: stats,
      };
    },
  },
};

/**
 * Get combined catalog (base + meta + generated)
 */
export function getCombinedCatalog(state: State): Record<string, OperationDef> {
  const combined = { ...OPERATIONS_CATALOG, ...META_OPERATIONS_CATALOG };

  // Add generated operations
  const genOps = listGeneratedOperations(state);
  for (const genOp of genOps) {
    combined[genOp.id] = {
      id: genOp.id,
      name: genOp.name,
      description: genOp.description,
      category: genOp.category === 'generated' ? 'system' : genOp.category,
      complexity: genOp.complexity,
      energyCost: genOp.energyCost,
      requiresCoupling: genOp.requiresCoupling,
      handler: createHandler(genOp.template, genOp.templateParams),
    };
  }

  return combined;
}
