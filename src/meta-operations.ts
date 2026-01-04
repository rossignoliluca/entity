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
 * Operation lifecycle status (Ashby ultrastability + AgentOps canary)
 *
 * QUARANTINED: Newly created, cooling period before trial
 * TRIAL: Being tested, metrics collected
 * ACTIVE: Proven safe, can be used in production
 * DEPRECATED: Failed trial or accumulated violations
 */
export type OperationStatus = 'QUARANTINED' | 'TRIAL' | 'ACTIVE' | 'DEPRECATED';

/**
 * Trial metrics for staged activation (Friston epistemic value)
 *
 * An operation graduates TRIAL → ACTIVE only when:
 * - blocks == 0 (no constitutional violations)
 * - avgVDelta <= 0 (Lyapunov never increases)
 * - avgSurpriseDelta <= 0 (uncertainty not increasing)
 * - energyEfficiency >= 1.0 (not worse than parent)
 */
export interface TrialMetrics {
  trialStartedAt: string;
  trialUses: number;
  blocks: number;
  totalVDelta: number;           // Sum of V changes during trial uses
  totalSurpriseDelta: number;    // Sum of surprise changes
  maxVDelta: number;             // Maximum single V increase (for spike detection)
  maxSurpriseDelta: number;      // Maximum single surprise increase
  totalEnergyCost: number;       // Total energy spent in trial
  parentEnergyCost: number;      // Parent operation's energy cost for comparison
  lastTrialUse: string | null;
}

/**
 * Default trial metrics for new operations
 */
export const DEFAULT_TRIAL_METRICS: TrialMetrics = {
  trialStartedAt: '',
  trialUses: 0,
  blocks: 0,
  totalVDelta: 0,
  totalSurpriseDelta: 0,
  maxVDelta: 0,
  maxSurpriseDelta: 0,
  totalEnergyCost: 0,
  parentEnergyCost: 0,
  lastTrialUse: null,
};

/**
 * Quarantine configuration (AgentOps staged rollout)
 */
export interface QuarantineConfig {
  quarantineCycles: number;      // Cycles before QUARANTINED → TRIAL
  minTrialUses: number;          // Minimum uses before TRIAL → ACTIVE
  maxTrialBlocks: number;        // Max blocks before TRIAL → DEPRECATED (0 = strict)
  maxVDeltaPerUse: number;       // Max avg V increase per use (0 = strict)
  maxSurpriseDeltaPerUse: number; // Max avg surprise increase per use
}

export const DEFAULT_QUARANTINE_CONFIG: QuarantineConfig = {
  quarantineCycles: 10,          // 10 cycles cooling period
  minTrialUses: 5,               // 5 successful uses minimum
  maxTrialBlocks: 0,             // Zero tolerance for blocks
  maxVDeltaPerUse: 0,            // Lyapunov must not increase
  maxSurpriseDeltaPerUse: 0.01,  // Small surprise increase tolerated
};

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

  // Sigillo 1: Quarantine Gate (Ashby + AgentOps)
  status: OperationStatus;       // Lifecycle status
  statusChangedAt: string;       // When status last changed
  quarantineStartCycle: number;  // Cycle when quarantine started
  trialMetrics?: TrialMetrics;   // Metrics during trial phase
  deprecationReason?: string;    // Why deprecated (if applicable)
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
 *
 * SIGILLO 1: By default, only returns ACTIVE operations.
 * QUARANTINED, TRIAL, and DEPRECATED operations are excluded from policy selection.
 * Use includeNonActive=true for admin/audit purposes only.
 */
export function getDynamicOperation(
  id: string,
  state: State,
  options?: { includeNonActive?: boolean }
): OperationDef | undefined {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  if (!autopoiesis) return undefined;

  const genOp = autopoiesis.generatedOperations.find((op) => op.id === id);
  if (!genOp) return undefined;

  // Sigillo 1: Only ACTIVE operations are available for execution
  // Legacy operations without status are treated as ACTIVE (pre-quarantine)
  const status = genOp.status || 'ACTIVE';
  if (status !== 'ACTIVE' && !options?.includeNonActive) {
    return undefined;
  }

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
 *
 * SIGILLO 1: By default, only includes ACTIVE dynamic operations.
 * Use includeNonActive=true for admin/audit purposes only.
 */
export function getAllOperations(
  state: State,
  options?: { includeNonActive?: boolean }
): OperationDef[] {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  const catalogOps = Object.values(OPERATIONS_CATALOG);

  if (!autopoiesis) return catalogOps;

  // Sigillo 1: Filter to only ACTIVE operations for policy selection
  const activeOps = autopoiesis.generatedOperations.filter((genOp) => {
    const status = genOp.status || 'ACTIVE'; // Legacy ops treated as ACTIVE
    return status === 'ACTIVE' || options?.includeNonActive;
  });

  const dynamicOps = activeOps.map((genOp) => ({
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
    currentCycle?: number;  // For quarantine tracking
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

  const now = new Date().toISOString();
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
    generatedAt: now,
    generation: 1,
    // Sigillo 1: All new operations start QUARANTINED (Ashby + AgentOps)
    status: 'QUARANTINED',
    statusChangedAt: now,
    quarantineStartCycle: params.currentCycle ?? 0,
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
    currentCycle?: number;  // For quarantine tracking
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

  const now = new Date().toISOString();
  const result = defineOperation(state, {
    id: params.id,
    name: params.name,
    description: params.description,
    category: 'generated',
    complexity,
    energyCost,
    requiresCoupling: true,
    template: 'compose',
    templateParams: { operations: params.operations },
    currentCycle: params.currentCycle,
  });

  if (result.success && result.generatedOperation) {
    // Override with compose-specific metadata
    result.generatedOperation.generatedBy = 'meta.compose';
    result.generatedOperation.parentOperations = params.operations;
    result.generatedOperation.generation = maxGeneration + 1;
  }

  return result;
}

/**
 * Create a specialized version of an existing operation with preset params
 *
 * Sigillo 3: Specialization must RESTRICT, not EXPAND
 *
 * Bounds enforced:
 * - complexity ≤ parent (AXM-008)
 * - scope cannot expand (internal stays internal)
 * - coupling requirements cannot be relaxed
 * - generation depth is limited
 */
const MAX_SPECIALIZATION_DEPTH = 5;

export function specializeOperation(
  state: State,
  params: {
    id: string;
    name: string;
    description: string;
    sourceOperation: string;
    presetParams: Record<string, unknown>;
    currentCycle?: number;  // For quarantine tracking
    // Optional overrides (must satisfy bounds)
    complexity?: number;
    energyCost?: number;
    requiresCoupling?: boolean;
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

  // ===========================================================================
  // Sigillo 3: Bounds Validation
  // ===========================================================================

  // Bound 1: Generation depth limit
  if (sourceGeneration >= MAX_SPECIALIZATION_DEPTH) {
    return {
      success: false,
      message: `Specialization depth limit reached (max ${MAX_SPECIALIZATION_DEPTH}). Cannot specialize ${params.sourceOperation} further.`,
    };
  }

  // Bound 2: Complexity cannot increase (AXM-008)
  const effectiveComplexity = params.complexity ?? sourceOp.complexity;
  if (effectiveComplexity > sourceOp.complexity) {
    return {
      success: false,
      message: `Sigillo 3 violation: complexity ${effectiveComplexity} > parent ${sourceOp.complexity}. Specialization must restrict, not expand.`,
    };
  }

  // Bound 3: Energy cost cannot increase
  const effectiveEnergyCost = params.energyCost ?? sourceOp.energyCost;
  if (effectiveEnergyCost > sourceOp.energyCost) {
    return {
      success: false,
      message: `Sigillo 3 violation: energyCost ${effectiveEnergyCost} > parent ${sourceOp.energyCost}. Specialization must restrict, not expand.`,
    };
  }

  // Bound 4: Coupling requirement cannot be relaxed
  const effectiveRequiresCoupling = params.requiresCoupling ?? sourceOp.requiresCoupling;
  if (sourceOp.requiresCoupling && !effectiveRequiresCoupling) {
    return {
      success: false,
      message: `Sigillo 3 violation: cannot remove coupling requirement. Specialization must restrict, not expand.`,
    };
  }

  // ===========================================================================
  // Create specialized operation (inherits bounds from parent)
  // ===========================================================================

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
    category: sourceOp.category,  // Category inherited, cannot expand
    complexity: effectiveComplexity,
    energyCost: effectiveEnergyCost,
    requiresCoupling: effectiveRequiresCoupling,
    template,
    templateParams,
    currentCycle: params.currentCycle,
  });

  if (result.success && result.generatedOperation) {
    result.generatedOperation.generatedBy = 'meta.specialize';
    result.generatedOperation.parentOperations = [params.sourceOperation];
    result.generatedOperation.generation = sourceGeneration + 1;
  }

  return result;
}

// =============================================================================
// Sigillo 1: Quarantine Lifecycle Management (Ashby + AgentOps)
// =============================================================================

/**
 * Check if operation is ready to transition from QUARANTINED to TRIAL
 * (Ashby: cooling period before structural change takes effect)
 */
export function canTransitionToTrial(
  op: GeneratedOperationDef,
  currentCycle: number,
  config: QuarantineConfig = DEFAULT_QUARANTINE_CONFIG
): boolean {
  if (op.status !== 'QUARANTINED') return false;
  const cyclesSinceCreation = currentCycle - op.quarantineStartCycle;
  return cyclesSinceCreation >= config.quarantineCycles;
}

/**
 * Check if operation passes trial metrics (Friston: epistemic → pragmatic)
 */
export function canTransitionToActive(
  op: GeneratedOperationDef,
  config: QuarantineConfig = DEFAULT_QUARANTINE_CONFIG
): { canActivate: boolean; reason: string } {
  if (op.status !== 'TRIAL') {
    return { canActivate: false, reason: 'Not in TRIAL status' };
  }

  const metrics = op.trialMetrics;
  if (!metrics) {
    return { canActivate: false, reason: 'No trial metrics recorded' };
  }

  if (metrics.trialUses < config.minTrialUses) {
    return { canActivate: false, reason: `Insufficient trial uses: ${metrics.trialUses}/${config.minTrialUses}` };
  }

  if (metrics.blocks > config.maxTrialBlocks) {
    return { canActivate: false, reason: `Too many blocks: ${metrics.blocks}` };
  }

  // Check max (spike) - zero tolerance on any single V increase
  if (metrics.maxVDelta > config.maxVDeltaPerUse) {
    return { canActivate: false, reason: `V spike detected: maxΔV=${metrics.maxVDelta.toFixed(4)}` };
  }

  // Check average as well
  const avgVDelta = metrics.trialUses > 0 ? metrics.totalVDelta / metrics.trialUses : 0;
  if (avgVDelta > config.maxVDeltaPerUse) {
    return { canActivate: false, reason: `V delta too high: avgΔV=${avgVDelta.toFixed(4)}` };
  }

  // Check max surprise spike
  if (metrics.maxSurpriseDelta > config.maxSurpriseDeltaPerUse) {
    return { canActivate: false, reason: `Surprise spike detected: max=${metrics.maxSurpriseDelta.toFixed(4)}` };
  }

  const avgSurpriseDelta = metrics.trialUses > 0 ? metrics.totalSurpriseDelta / metrics.trialUses : 0;
  if (avgSurpriseDelta > config.maxSurpriseDeltaPerUse) {
    return { canActivate: false, reason: `Surprise delta too high: avg=${avgSurpriseDelta.toFixed(4)}` };
  }

  return { canActivate: true, reason: 'All metrics passed' };
}

/**
 * Check if operation should be deprecated (trial failed)
 *
 * Zero tolerance policy:
 * - ANY block → deprecate
 * - ANY single V increase > 0 → deprecate (spike detection via maxVDelta)
 */
export function shouldDeprecate(
  op: GeneratedOperationDef,
  config: QuarantineConfig = DEFAULT_QUARANTINE_CONFIG
): { shouldDeprecate: boolean; reason: string } {
  if (op.status !== 'TRIAL') {
    return { shouldDeprecate: false, reason: 'Not in TRIAL status' };
  }

  const metrics = op.trialMetrics;
  if (!metrics) {
    return { shouldDeprecate: false, reason: 'No metrics yet' };
  }

  // Immediate deprecation on any block (zero tolerance)
  if (metrics.blocks > config.maxTrialBlocks) {
    return { shouldDeprecate: true, reason: `Constitutional block detected: ${metrics.blocks}` };
  }

  // Zero tolerance: ANY single V increase causes deprecation (spike detection)
  // A single spike V=+0.5 followed by V=0 uses should still deprecate
  if (metrics.maxVDelta > config.maxVDeltaPerUse) {
    return { shouldDeprecate: true, reason: `Lyapunov spike detected: maxΔV=${metrics.maxVDelta.toFixed(4)}` };
  }

  // Also check for consistent drift (average, as backup)
  if (metrics.trialUses >= 3) {
    const avgVDelta = metrics.totalVDelta / metrics.trialUses;
    if (avgVDelta > config.maxVDeltaPerUse) {
      return { shouldDeprecate: true, reason: `Lyapunov consistently drifting: avgΔV=${avgVDelta.toFixed(4)}` };
    }
  }

  return { shouldDeprecate: false, reason: 'Metrics within bounds' };
}

/**
 * Transition operation status (immutable - returns new op)
 */
export function transitionOperationStatus(
  op: GeneratedOperationDef,
  newStatus: OperationStatus,
  reason?: string
): GeneratedOperationDef {
  const now = new Date().toISOString();
  const updated: GeneratedOperationDef = {
    ...op,
    status: newStatus,
    statusChangedAt: now,
  };

  if (newStatus === 'TRIAL' && !op.trialMetrics) {
    updated.trialMetrics = {
      ...DEFAULT_TRIAL_METRICS,
      trialStartedAt: now,
      parentEnergyCost: op.energyCost,
    };
  }

  if (newStatus === 'DEPRECATED' && reason) {
    updated.deprecationReason = reason;
  }

  return updated;
}

/**
 * Record trial use metrics
 * Tracks both totals (for averages) and maxes (for spike detection)
 */
export function recordTrialUse(
  op: GeneratedOperationDef,
  vDelta: number,
  surpriseDelta: number,
  energyCost: number,
  blocked: boolean
): GeneratedOperationDef {
  if (op.status !== 'TRIAL' || !op.trialMetrics) {
    return op;
  }

  const now = new Date().toISOString();
  const metrics = op.trialMetrics;

  return {
    ...op,
    trialMetrics: {
      ...metrics,
      trialUses: metrics.trialUses + 1,
      blocks: metrics.blocks + (blocked ? 1 : 0),
      totalVDelta: metrics.totalVDelta + vDelta,
      totalSurpriseDelta: metrics.totalSurpriseDelta + surpriseDelta,
      // Track max for spike detection (zero tolerance on single V increase)
      maxVDelta: Math.max(metrics.maxVDelta, vDelta),
      maxSurpriseDelta: Math.max(metrics.maxSurpriseDelta, surpriseDelta),
      totalEnergyCost: metrics.totalEnergyCost + energyCost,
      lastTrialUse: now,
    },
  };
}

/**
 * Normalize legacy operation to include quarantine fields
 * (Backward compatibility for operations created before v1.7.1)
 */
export function normalizeOperation(op: Partial<GeneratedOperationDef> & { id: string }): GeneratedOperationDef {
  const now = new Date().toISOString();

  // Normalize trialMetrics if present (add missing maxVDelta/maxSurpriseDelta)
  let trialMetrics = op.trialMetrics;
  if (trialMetrics) {
    trialMetrics = {
      ...trialMetrics,
      maxVDelta: trialMetrics.maxVDelta ?? 0,
      maxSurpriseDelta: trialMetrics.maxSurpriseDelta ?? 0,
    };
  }

  return {
    id: op.id,
    name: op.name || op.id,
    description: op.description || '',
    category: op.category || 'generated',
    complexity: op.complexity ?? 5,
    energyCost: op.energyCost ?? 0.01,
    requiresCoupling: op.requiresCoupling ?? true,
    template: op.template || 'echo',
    templateParams: op.templateParams || {},
    generatedBy: op.generatedBy || 'unknown',
    generatedAt: op.generatedAt || now,
    parentOperations: op.parentOperations,
    generation: op.generation ?? 1,
    // Legacy operations without status are treated as ACTIVE (they were pre-quarantine)
    status: op.status || 'ACTIVE',
    statusChangedAt: op.statusChangedAt || op.generatedAt || now,
    quarantineStartCycle: op.quarantineStartCycle ?? 0,
    trialMetrics,
    deprecationReason: op.deprecationReason,
  };
}

/**
 * Get only ACTIVE operations (for production use)
 */
export function getActiveGeneratedOperations(state: State): GeneratedOperationDef[] {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  return (autopoiesis?.generatedOperations || [])
    .map(op => normalizeOperation(op as Partial<GeneratedOperationDef> & { id: string }))
    .filter(op => op.status === 'ACTIVE');
}

/**
 * Get operations available for trial (QUARANTINED ready to transition or TRIAL)
 */
export function getTrialableOperations(
  state: State,
  currentCycle: number,
  config: QuarantineConfig = DEFAULT_QUARANTINE_CONFIG
): GeneratedOperationDef[] {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  return (autopoiesis?.generatedOperations || [])
    .map(op => normalizeOperation(op as Partial<GeneratedOperationDef> & { id: string }))
    .filter(op =>
      op.status === 'TRIAL' ||
      (op.status === 'QUARANTINED' && canTransitionToTrial(op, currentCycle, config))
    );
}

/**
 * List all generated operations (normalized for backward compatibility)
 */
export function listGeneratedOperations(state: State): GeneratedOperationDef[] {
  const autopoiesis = (state as State & { autopoiesis?: AutopoiesisState }).autopoiesis;
  return (autopoiesis?.generatedOperations || [])
    .map(op => normalizeOperation(op as Partial<GeneratedOperationDef> & { id: string }));
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
