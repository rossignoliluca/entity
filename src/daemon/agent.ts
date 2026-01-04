/**
 * Internal Agent Module
 * AES-SPEC-001 Phase 8: Internal Agency
 *
 * Implements autopoietic sense-making loop based on:
 * - Maturana & Varela: Autopoiesis and Cognition
 * - Di Paolo: Sense-making and Precariousness
 * - Friston: Free Energy Principle / Active Inference
 * - Ashby: Ultrastability and Homeostasis
 * - Jonas: Responsibility Principle
 *
 * The agent does not "decide" - it RESPONDS to its own precariousness.
 * Cognition = maintaining organization through interaction.
 *
 * Core insight: The agent IS the system sensing itself.
 * There is no separation between "agent" and "system".
 */

import { EventEmitter } from 'events';
import { join } from 'path';
import type { State, InvariantCheck, VerificationResult, Config } from '../types.js';
import { DEFAULT_CONFIG } from '../types.js';
import { verifyAllInvariants, quickHealthCheck } from '../verify.js';
import { computeV, isAtAttractor, stabilityMargin } from '../lyapunov.js';
import { executeOperation, getOperation, OPERATIONS_CATALOG } from '../operations.js';
import { autoRecover } from '../recovery.js';
import { getStateManager } from '../state-manager.js';
import {
  ActiveInferenceEngine,
  type ActiveInferenceConfig,
  type ActionEvaluation,
  type PredictedState,
  DEFAULT_ACTIVE_INFERENCE_CONFIG,
} from './active-inference.js';
import {
  CycleMemory,
  type CycleMemoryConfig,
  type CycleRecord,
  DEFAULT_CYCLE_MEMORY_CONFIG,
} from './cycle-memory.js';
import {
  defineOperation,
  composeOperations,
  specializeOperation,
  listGeneratedOperations,
  getAutopoiesisStats,
  getCombinedCatalog,
  // Sigillo 1: Quarantine lifecycle
  canTransitionToTrial,
  canTransitionToActive,
  shouldDeprecate,
  transitionOperationStatus,
  recordTrialUse,
  getActiveGeneratedOperations,
  getTrialableOperations,
  DEFAULT_QUARANTINE_CONFIG,
  type GeneratedOperationDef,
  type QuarantineConfig,
  type OperationStatus,
} from '../meta-operations.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Agent configuration
 */
export interface AgentConfig {
  enabled: boolean;
  decisionInterval: number;      // ms between sense-making cycles
  feelingCost: number;           // energy cost per feeling cycle
  activeWhenCoupled: boolean;    // pause when human is present
  restThreshold: number;         // V below which to rest
  urgencyThreshold: number;      // energy level for urgent action
  criticalThreshold: number;     // energy level for dormant

  // Phase 8b: Ultrastability (Ashby)
  ultrastabilityEnabled: boolean;
  adaptationInterval: number;    // cycles between adaptation checks
  violationWindowSize: number;   // how many violations to track
  adaptationRate: number;        // adjustment factor (0.1 = 10%)
  minDecisionInterval: number;   // minimum ms between cycles
  maxDecisionInterval: number;   // maximum ms between cycles
  // Caps to prevent hyper-reactivity (ultrastability ≠ nervousness)
  minRestThreshold: number;      // minimum sensitivity (can't be too nervous)
  maxAdaptationsPerWindow: number; // limit adaptation frequency

  // Phase 8c: Active Inference (Friston)
  activeInferenceEnabled: boolean;
  activeInferenceConfig: Partial<ActiveInferenceConfig>;

  // Phase 8d: Cycle Memory
  cycleMemoryEnabled: boolean;
  cycleMemoryConfig: Partial<CycleMemoryConfig>;

  // Phase 8e: Self-Production (Autopoiesis)
  selfProductionEnabled: boolean;
  selfProductionThreshold: number;    // min action count to trigger pattern
  selfProductionCooldown: number;     // cycles between productions

  // Sigillo 1: Quarantine config
  quarantineConfig: QuarantineConfig;
}

/**
 * Cycle context for Sigillo 2 (Observer/Actor separation)
 * - 'production': Normal operation, track patterns for self-production
 * - 'test': Test context, don't track patterns
 * - 'audit': Audit/verification context, don't track patterns
 */
export type CycleContext = 'production' | 'test' | 'audit';

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  decisionInterval: 60000,       // 1 minute between cycles
  feelingCost: 0.001,            // minimal energy for sensing
  activeWhenCoupled: false,      // defer to human when coupled
  restThreshold: 0.001,          // V < 0.001 = at attractor
  urgencyThreshold: 0.15,        // E < 15% = urgent
  criticalThreshold: 0.05,       // E < 5% = critical, prepare dormant

  // Phase 8b: Ultrastability defaults
  ultrastabilityEnabled: true,
  adaptationInterval: 10,        // check every 10 cycles
  violationWindowSize: 50,       // track last 50 violations
  adaptationRate: 0.1,           // 10% adjustment
  minDecisionInterval: 10000,    // min 10 seconds
  maxDecisionInterval: 300000,   // max 5 minutes
  // Caps to prevent hyper-reactivity
  minRestThreshold: 0.0001,      // can't go below this (avoid noise sensitivity)
  maxAdaptationsPerWindow: 5,    // max 5 adaptations per violation window

  // Phase 8c: Active Inference defaults
  activeInferenceEnabled: true,
  activeInferenceConfig: {},

  // Phase 8d: Cycle Memory defaults
  cycleMemoryEnabled: true,
  cycleMemoryConfig: {},

  // Phase 8e: Self-Production defaults
  selfProductionEnabled: true,
  selfProductionThreshold: 10,       // 10 uses of same action triggers pattern
  selfProductionCooldown: 50,        // wait 50 cycles between productions

  // Sigillo 1: Quarantine config
  quarantineConfig: DEFAULT_QUARANTINE_CONFIG,
};

/**
 * Phase 8b: Violation record for ultrastability
 */
export interface ViolationRecord {
  timestamp: string;
  cycle: number;
  invariant: string;
  feeling: {
    energy: number;
    lyapunovV: number;
    surprise: number;
  };
  recovered: boolean;
  recoveryTime?: number;         // ms to recover
}

/**
 * Phase 8b: Parameter snapshot for history
 */
export interface ParameterSnapshot {
  timestamp: string;
  cycle: number;
  criticalThreshold: number;
  urgencyThreshold: number;
  restThreshold: number;
  decisionInterval: number;
  reason: string;
}

/**
 * Phase 8b: Ultrastability state
 */
export interface UltrastabilityState {
  enabled: boolean;
  adaptationCount: number;
  lastAdaptation: string | null;
  violations: ViolationRecord[];
  parameterHistory: ParameterSnapshot[];
  // Computed metrics
  violationRate: number;         // violations per cycle (rolling)
  stabilityScore: number;        // 0-1, higher = more stable
  adaptiveParameters: {
    criticalThreshold: number;
    urgencyThreshold: number;
    restThreshold: number;
    decisionInterval: number;
  };
}

/**
 * Priority levels (from constitutional hierarchy)
 */
export type Priority =
  | 'survival'    // INV-005: Energy viability
  | 'integrity'   // INV-001 to INV-004: Core invariants
  | 'stability'   // Lyapunov: Return to attractor
  | 'growth'      // Learning and autopoiesis
  | 'rest';       // Wu Wei: Do nothing at attractor

/**
 * The feeling state - how the system feels relative to expected state
 * Based on Friston's prediction error / surprise
 */
export interface Feeling {
  timestamp: string;

  // Raw state
  energy: number;
  lyapunovV: number;
  invariantsSatisfied: number;
  invariantsTotal: number;

  // Computed feelings
  surprise: number;              // Overall deviation from expected (ε)
  energyFeeling: 'vital' | 'adequate' | 'low' | 'critical';
  stabilityFeeling: 'attractor' | 'stable' | 'drifting' | 'unstable';
  integrityFeeling: 'whole' | 'stressed' | 'violated';

  // Urgency assessment
  threatsExistence: boolean;
  threatsStability: boolean;
  needsGrowth: boolean;
}

/**
 * The response - what emerges from feeling
 */
export interface Response {
  timestamp: string;
  feeling: Feeling;
  priority: Priority;
  action: string | null;         // null = rest
  reason: string;

  // Constitutional check
  constitutionalCheck: 'passed' | 'blocked' | 'skipped';
  blockReason?: string;

  // Energy accounting
  energyBefore: number;
  energyCost: number;
  energyAfter: number;

  // Execution result
  executed: boolean;
  result?: {
    success: boolean;
    message: string;
    effects?: Record<string, unknown>;
  };
}

/**
 * Agent statistics
 */
export interface AgentStats {
  cycleCount: number;
  responsesTotal: number;
  responsesByPriority: Record<Priority, number>;
  actionsExecuted: number;
  actionsBlocked: number;
  restCycles: number;
  totalEnergyConsumed: number;
  startedAt: string | null;
  lastCycle: string | null;
  // Phase 8b: Ultrastability stats
  ultrastability: UltrastabilityState;
  // Phase 8e: Self-Production stats
  selfProduction: SelfProductionState;
}

/**
 * Phase 8e: Self-Production state
 */
export interface SelfProductionState {
  enabled: boolean;
  operationsCreated: number;
  lastProductionCycle: number;
  actionUsageCount: Record<string, number>;  // track action frequency
  createdOperations: string[];               // IDs of ops we created
}

// =============================================================================
// Internal Agent Class
// =============================================================================

/**
 * Internal Agent - Autopoietic Sense-Making Loop
 *
 * The agent embodies the philosophical principles:
 * 1. FEEL (not observe) - sense deviation from expected state
 * 2. CARE (not evaluate) - priorities from precariousness
 * 3. RESPOND (not decide) - action emerges from structure
 * 4. REMEMBER (not log) - communicate with future self
 * 5. REST (not idle) - rest is state, not absence
 */
export class InternalAgent extends EventEmitter {
  private baseDir: string;
  private config: AgentConfig;
  private entityConfig: Config;

  private running: boolean = false;
  private cycleInterval: NodeJS.Timeout | null = null;
  private stats: AgentStats;

  // Phase 8c: Active Inference
  private activeInference: ActiveInferenceEngine;
  private lastFeeling: Feeling | null = null;
  private lastPrediction: PredictedState | null = null;

  // Phase 8d: Cycle Memory
  private cycleMemory: CycleMemory;
  private lastAction: string | null = null;
  private lastActionBlocked: boolean = false;

  // Sigillo 2: Context tracking for observer/actor separation
  // Context is derived from environment, with optional manual override
  private manualContextOverride: CycleContext | null = null;
  private lastKnownCoupling: boolean = false; // Cached from state reads

  constructor(
    baseDir: string,
    config: Partial<AgentConfig> = {},
    entityConfig: Config = DEFAULT_CONFIG
  ) {
    super();
    this.baseDir = baseDir;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.entityConfig = entityConfig;

    this.stats = {
      cycleCount: 0,
      responsesTotal: 0,
      responsesByPriority: {
        survival: 0,
        integrity: 0,
        stability: 0,
        growth: 0,
        rest: 0,
      },
      actionsExecuted: 0,
      actionsBlocked: 0,
      restCycles: 0,
      totalEnergyConsumed: 0,
      startedAt: null,
      lastCycle: null,
      // Phase 8b: Initialize ultrastability
      ultrastability: {
        enabled: this.config.ultrastabilityEnabled,
        adaptationCount: 0,
        lastAdaptation: null,
        violations: [],
        parameterHistory: [{
          timestamp: new Date().toISOString(),
          cycle: 0,
          criticalThreshold: this.config.criticalThreshold,
          urgencyThreshold: this.config.urgencyThreshold,
          restThreshold: this.config.restThreshold,
          decisionInterval: this.config.decisionInterval,
          reason: 'Initial parameters',
        }],
        violationRate: 0,
        stabilityScore: 1.0,
        adaptiveParameters: {
          criticalThreshold: this.config.criticalThreshold,
          urgencyThreshold: this.config.urgencyThreshold,
          restThreshold: this.config.restThreshold,
          decisionInterval: this.config.decisionInterval,
        },
      },
      // Phase 8e: Initialize Self-Production
      selfProduction: {
        enabled: this.config.selfProductionEnabled,
        operationsCreated: 0,
        lastProductionCycle: 0,
        actionUsageCount: {},
        createdOperations: [],
      },
    };

    // Phase 8c: Initialize Active Inference
    this.activeInference = new ActiveInferenceEngine(this.config.activeInferenceConfig);

    // Phase 8d: Initialize Cycle Memory
    this.cycleMemory = new CycleMemory(this.config.cycleMemoryConfig);
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Wake the agent - begin sense-making loop
   */
  async wake(): Promise<{ success: boolean; message: string }> {
    if (this.running) {
      return { success: false, message: 'Agent already awake' };
    }

    if (!this.config.enabled) {
      return { success: false, message: 'Agent is disabled' };
    }

    this.running = true;
    this.stats.startedAt = new Date().toISOString();

    // Log awakening
    await this.remember('AGENT_WAKE', {
      config: this.config,
      reason: 'Agent awakened to begin sense-making',
    });

    // Start the sense-making loop
    this.cycleInterval = setInterval(
      () => this.senseMakingCycle(),
      this.config.decisionInterval
    );

    // Run first cycle immediately
    await this.senseMakingCycle();

    this.emit('wake', { timestamp: this.stats.startedAt });
    return { success: true, message: 'Agent awakened' };
  }

  /**
   * Sleep - pause sense-making (not death, just rest)
   */
  async sleep(): Promise<{ success: boolean; message: string }> {
    if (!this.running) {
      return { success: false, message: 'Agent already sleeping' };
    }

    if (this.cycleInterval) {
      clearInterval(this.cycleInterval);
      this.cycleInterval = null;
    }

    this.running = false;

    // Log sleep
    await this.remember('AGENT_SLEEP', {
      stats: this.stats,
      reason: 'Agent entering sleep state',
    });

    this.emit('sleep', { timestamp: new Date().toISOString() });
    return { success: true, message: 'Agent sleeping' };
  }

  isAwake(): boolean {
    return this.running;
  }

  getStats(): AgentStats {
    return { ...this.stats };
  }

  // ===========================================================================
  // The Sense-Making Cycle
  // ===========================================================================

  /**
   * Core sense-making cycle
   *
   * This is NOT a decision loop. It is the system feeling itself
   * and responding from its structure, not from calculation.
   *
   * Phase 8c adds Active Inference: the agent predicts outcomes
   * and selects actions to minimize expected free energy.
   */
  private async senseMakingCycle(): Promise<void> {
    this.stats.cycleCount++;
    this.stats.lastCycle = new Date().toISOString();

    try {
      // 1. FEEL - sense the current state relative to expected
      const feeling = await this.feel();

      // Phase 8c: Record previous cycle's outcome for learning
      if (this.config.activeInferenceEnabled && this.lastFeeling && this.lastPrediction) {
        this.activeInference.recordObservation(
          this.lastAction,
          this.lastFeeling,
          feeling,
          this.lastPrediction
        );
      }

      // Phase 8d: Record previous cycle to cycle memory
      if (this.config.cycleMemoryEnabled && this.lastFeeling) {
        // Determine what priority was used last cycle
        const lastPriority = this.determinePriorityFromFeeling(this.lastFeeling);
        this.cycleMemory.recordCycle(
          this.lastFeeling,
          lastPriority,
          this.lastAction,
          this.lastActionBlocked,
          feeling
        );
      }

      this.lastFeeling = feeling;

      // 2. CHECK COUPLING - defer to human if present
      if (feeling.energy > 0) {  // Only check if we have energy to sense
        const state = await this.loadState();
        this.updateCouplingCache(state); // Sigillo 2: Keep context cache fresh
        if (state.coupling.active && !this.config.activeWhenCoupled) {
          // Human is present - rest and let them lead
          this.emit('cycle', {
            feeling,
            response: null,
            reason: 'Deferring to coupled human'
          });
          return;
        }
      }

      // 3. RESPOND - let response emerge from feeling
      const response = await this.respond(feeling);

      // Phase 8d: Track action for next cycle's memory
      this.lastAction = response.action;
      this.lastActionBlocked = response.constitutionalCheck === 'blocked';

      // 4. REMEMBER - communicate with future self
      if (response.action) {
        await this.remember('AGENT_RESPONSE', {
          priority: response.priority,
          action: response.action,
          reason: response.reason,
          constitutionalCheck: response.constitutionalCheck,
          energyBefore: response.energyBefore,
          energyAfter: response.energyAfter,
          executed: response.executed,
          result: response.result,
        });
      } else if (response.priority === 'rest') {
        // Occasionally log rest state (not every cycle)
        if (this.stats.restCycles % 10 === 0) {
          await this.remember('AGENT_REST', {
            cycleCount: this.stats.cycleCount,
            restCycles: this.stats.restCycles,
            feeling: {
              surprise: feeling.surprise,
              energyFeeling: feeling.energyFeeling,
              stabilityFeeling: feeling.stabilityFeeling,
            },
          });
        }
      }

      // Update stats
      this.stats.responsesTotal++;
      this.stats.responsesByPriority[response.priority]++;
      if (response.action) {
        if (response.executed) {
          this.stats.actionsExecuted++;
          // Phase 8e: Track action usage for self-production
          this.trackActionUsage(response.action);
        } else {
          this.stats.actionsBlocked++;
        }
      } else {
        this.stats.restCycles++;
      }
      this.stats.totalEnergyConsumed += response.energyCost;

      // 6. SELF-PRODUCTION - check for patterns in growth mode
      if (this.config.selfProductionEnabled && response.priority === 'growth') {
        await this.checkSelfProduction(feeling);
      }

      // 7. QUARANTINE LIFECYCLE - manage operation transitions (Sigillo 1)
      if (this.config.selfProductionEnabled) {
        await this.manageQuarantineLifecycles();
      }

      // 5. ULTRASTABILITY - record violations and adapt
      if (feeling.integrityFeeling !== 'whole') {
        // Record violation based on what's wrong
        if (feeling.invariantsSatisfied < feeling.invariantsTotal) {
          this.recordViolation('INV-*', feeling, true); // Recovered since we're still running
        }
      }
      if (feeling.stabilityFeeling === 'unstable' || feeling.stabilityFeeling === 'drifting') {
        this.recordViolation('stability', feeling, feeling.stabilityFeeling !== 'unstable');
      }
      if (feeling.energyFeeling === 'critical' || feeling.energyFeeling === 'low') {
        this.recordViolation('energy', feeling, feeling.energyFeeling !== 'critical');
      }

      // Check if parameters need adaptation
      await this.checkAndAdaptParameters();

      this.emit('cycle', { feeling, response });

    } catch (error) {
      this.emit('error', { error, cycle: this.stats.cycleCount });
    }
  }

  // ===========================================================================
  // FEEL - Sense the state relative to expected
  // ===========================================================================

  /**
   * Feel the current state
   *
   * This is not "observing" in a detached sense.
   * The feeling IS the system's self-awareness of its own precariousness.
   */
  private async feel(): Promise<Feeling> {
    const timestamp = new Date().toISOString();
    const state = await this.loadState();

    // Run verification to get invariant status
    const verification = await verifyAllInvariants(this.baseDir, this.entityConfig);

    const energy = state.energy.current;
    const lyapunovV = verification.lyapunov_V;
    const invariantsSatisfied = verification.invariants.filter(i => i.satisfied).length;
    const invariantsTotal = verification.invariants.length;

    // Compute surprise (ε) - deviation from expected state
    // Expected state: V=0, all invariants satisfied, energy adequate
    const surprise = this.computeSurprise(energy, lyapunovV, invariantsSatisfied, invariantsTotal);

    // Translate raw values to felt qualities
    const energyFeeling = this.feelEnergy(energy);
    const stabilityFeeling = this.feelStability(lyapunovV);
    const integrityFeeling = this.feelIntegrity(invariantsSatisfied, invariantsTotal);

    // Assess threats
    const threatsExistence = energy < this.config.criticalThreshold;
    const threatsStability = lyapunovV > 0.1 || invariantsSatisfied < invariantsTotal;
    const needsGrowth =
      energyFeeling === 'vital' &&
      stabilityFeeling === 'attractor' &&
      integrityFeeling === 'whole';

    return {
      timestamp,
      energy,
      lyapunovV,
      invariantsSatisfied,
      invariantsTotal,
      surprise,
      energyFeeling,
      stabilityFeeling,
      integrityFeeling,
      threatsExistence,
      threatsStability,
      needsGrowth,
    };
  }

  /**
   * Compute surprise (ε) - Free Energy Principle
   *
   * Surprise = how far current state is from expected state
   * Expected: V=0, E>=threshold, all invariants satisfied
   */
  private computeSurprise(
    energy: number,
    lyapunovV: number,
    satisfied: number,
    total: number
  ): number {
    // Energy surprise (expected: E >= threshold)
    const energySurprise = energy < this.entityConfig.E_threshold
      ? (this.entityConfig.E_threshold - energy) / this.entityConfig.E_threshold
      : 0;

    // Stability surprise (expected: V = 0)
    const stabilitySurprise = lyapunovV;

    // Integrity surprise (expected: all invariants satisfied)
    const integritySurprise = total > 0 ? (total - satisfied) / total : 0;

    // Weighted combination
    return (
      0.4 * energySurprise +
      0.4 * stabilitySurprise +
      0.2 * integritySurprise
    );
  }

  private feelEnergy(energy: number): Feeling['energyFeeling'] {
    // Use adaptive thresholds from ultrastability
    const critical = this.getAdaptiveThreshold('critical');
    const urgency = this.getAdaptiveThreshold('urgency');

    if (energy < critical) return 'critical';
    if (energy < urgency) return 'low';
    if (energy < this.entityConfig.E_threshold * 2) return 'adequate';
    return 'vital';
  }

  private feelStability(V: number): Feeling['stabilityFeeling'] {
    // Use adaptive threshold from ultrastability
    const restThreshold = this.getAdaptiveThreshold('rest');

    if (V < restThreshold) return 'attractor';
    if (V < 0.1) return 'stable';
    if (V < 0.3) return 'drifting';
    return 'unstable';
  }

  private feelIntegrity(satisfied: number, total: number): Feeling['integrityFeeling'] {
    if (satisfied === total) return 'whole';
    if (satisfied >= total - 1) return 'stressed';
    return 'violated';
  }

  /**
   * Determine priority from feeling (for cycle memory tracking)
   */
  private determinePriorityFromFeeling(feeling: Feeling): Priority {
    if (feeling.threatsExistence) return 'survival';
    if (feeling.integrityFeeling === 'violated') return 'integrity';
    if (feeling.stabilityFeeling === 'unstable' || feeling.stabilityFeeling === 'drifting') return 'stability';
    if (feeling.needsGrowth && feeling.energyFeeling === 'vital') return 'growth';
    return 'rest';
  }

  // ===========================================================================
  // RESPOND - Let response emerge from feeling
  // ===========================================================================

  /**
   * Respond to feeling
   *
   * The response is not "decided" - it EMERGES from the structure.
   * Given the feeling, the appropriate response is determined by
   * the constitutional hierarchy, not by calculation.
   */
  private async respond(feeling: Feeling): Promise<Response> {
    const timestamp = new Date().toISOString();
    const energyBefore = feeling.energy;

    // Determine priority from feeling (constitutional hierarchy)
    const { priority, action, reason } = this.determineResponse(feeling);

    // If no action needed, return rest response
    if (!action) {
      return {
        timestamp,
        feeling,
        priority,
        action: null,
        reason,
        constitutionalCheck: 'skipped',
        energyBefore,
        energyCost: this.config.feelingCost,
        energyAfter: energyBefore - this.config.feelingCost,
        executed: false,
      };
    }

    // Constitutional check before action
    const constitutionalResult = await this.constitutionalCheck(action, feeling);

    if (constitutionalResult.blocked) {
      return {
        timestamp,
        feeling,
        priority,
        action,
        reason,
        constitutionalCheck: 'blocked',
        blockReason: constitutionalResult.reason,
        energyBefore,
        energyCost: this.config.feelingCost,
        energyAfter: energyBefore - this.config.feelingCost,
        executed: false,
      };
    }

    // Execute action
    const state = await this.loadState();
    const operation = getOperation(action);
    const energyCost = (operation?.energyCost ?? 0) + this.config.feelingCost;

    const result = executeOperation(action, state, {});

    // Update state if action succeeded and has state changes
    if (result.success && result.stateChanges) {
      await this.updateState(result.stateChanges);
    }

    // Deduct energy
    await this.consumeEnergy(energyCost);

    return {
      timestamp,
      feeling,
      priority,
      action,
      reason,
      constitutionalCheck: 'passed',
      energyBefore,
      energyCost,
      energyAfter: energyBefore - energyCost,
      executed: true,
      result: {
        success: result.success,
        message: result.message,
        effects: result.effects,
      },
    };
  }

  /**
   * Determine response from feeling
   *
   * This is the constitutional hierarchy in action:
   * 1. Survival (existence threatened) -> conserve/dormant
   * 2. Integrity (invariants violated) -> recover
   * 3. Stability (V > 0) -> stabilize
   * 4. Growth (at attractor, energy good) -> learn/create
   * 5. Rest (nothing needed) -> do nothing
   */
  private determineResponse(feeling: Feeling): {
    priority: Priority;
    action: string | null;
    reason: string;
  } {
    // Priority 1: SURVIVAL
    if (feeling.threatsExistence) {
      if (feeling.energyFeeling === 'critical') {
        // Cannot act - must enter dormant
        return {
          priority: 'survival',
          action: null,  // No action, just rest to conserve
          reason: 'Energy critical - conserving for survival',
        };
      }
      return {
        priority: 'survival',
        action: 'system.health',  // Check what's wrong
        reason: 'Existence threatened - assessing situation',
      };
    }

    // Priority 2: INTEGRITY
    if (feeling.integrityFeeling === 'violated') {
      return {
        priority: 'integrity',
        action: null,  // Recovery is handled by maintenance module
        reason: 'Invariants violated - recovery needed (delegated to maintenance)',
      };
    }

    // Priority 3: STABILITY
    if (feeling.stabilityFeeling === 'unstable' || feeling.stabilityFeeling === 'drifting') {
      // Phase 8c: Use Active Inference for action selection
      if (this.config.activeInferenceEnabled) {
        const evaluation = this.selectActionViaActiveInference(feeling, 'stability');
        return {
          priority: 'stability',
          action: evaluation.action,
          reason: `Stability (V=${feeling.lyapunovV.toFixed(4)}) - AI selected: EFE=${evaluation.efe.total.toFixed(4)}`,
        };
      }
      return {
        priority: 'stability',
        action: 'state.summary',  // Fallback: understand current state
        reason: `Stability feeling: ${feeling.stabilityFeeling} (V=${feeling.lyapunovV.toFixed(4)})`,
      };
    }

    // Priority 4: GROWTH (only if stable and vital)
    if (feeling.needsGrowth && feeling.energyFeeling === 'vital') {
      // Phase 8c: Use Active Inference for exploration
      if (this.config.activeInferenceEnabled) {
        const evaluation = this.selectActionViaActiveInference(feeling, 'growth');
        return {
          priority: 'growth',
          action: evaluation.action,
          reason: `Growth mode - AI selected: epistemic=${evaluation.epistemicValue.toFixed(3)}, pragmatic=${evaluation.pragmaticValue.toFixed(3)}`,
        };
      }
      // Fallback: alternate between learning and introspection
      const action = this.stats.cycleCount % 3 === 0
        ? 'system.health'
        : 'state.summary';
      return {
        priority: 'growth',
        action,
        reason: 'At attractor with vital energy - exploring/learning',
      };
    }

    // Priority 5: REST (Wu Wei - do nothing at attractor)
    // Phase 8c: Even at rest, active inference can suggest exploration
    if (this.config.activeInferenceEnabled && feeling.stabilityFeeling === 'attractor') {
      const evaluation = this.selectActionViaActiveInference(feeling, 'rest');
      // Only act if epistemic value is high (worth exploring)
      if (evaluation.epistemicValue > 0.3) {
        return {
          priority: 'rest',
          action: evaluation.action,
          reason: `Rest with exploration - epistemic value: ${evaluation.epistemicValue.toFixed(3)}`,
        };
      }
    }

    return {
      priority: 'rest',
      action: null,
      reason: feeling.stabilityFeeling === 'attractor'
        ? 'At attractor - resting (Wu Wei)'
        : `Adequate state (ε=${feeling.surprise.toFixed(4)}) - resting`,
    };
  }

  /**
   * Select action using Active Inference (Phase 8c) and Cycle Memory (Phase 8d)
   */
  private selectActionViaActiveInference(feeling: Feeling, priority: Priority): ActionEvaluation & { cycleMemoryHint?: string } {
    // Available actions for the agent
    const availableActions: (string | null)[] = [
      null,              // Rest
      'state.summary',   // Check state
      'system.health',   // Check health
      'energy.status',   // Check energy
    ];

    // Phase 8d: Check cycle memory for suggestions
    let cycleMemoryHint: string | undefined;
    if (this.config.cycleMemoryEnabled) {
      const suggestion = this.cycleMemory.suggestAction(feeling, priority, availableActions);
      if (suggestion && suggestion.confidence > 0.5) {
        cycleMemoryHint = suggestion.reason;
        // Boost the suggested action by moving it to front (Active Inference will still evaluate)
        const idx = availableActions.indexOf(suggestion.action);
        if (idx > 0) {
          availableActions.splice(idx, 1);
          availableActions.unshift(suggestion.action);
        }
      }
    }

    const evaluation = this.activeInference.selectAction(feeling, availableActions, priority);

    // Store prediction for learning in next cycle
    this.lastPrediction = evaluation.predictedState;

    return { ...evaluation, cycleMemoryHint };
  }

  // ===========================================================================
  // Constitutional Check
  // ===========================================================================

  /**
   * Constitutional check - Jonas principle
   *
   * "Act so that the effects of your action are compatible
   * with the permanence of your organization."
   */
  private async constitutionalCheck(
    action: string,
    feeling: Feeling
  ): Promise<{ blocked: boolean; reason?: string }> {
    const operation = getOperation(action);

    if (!operation) {
      return { blocked: true, reason: `Unknown operation: ${action}` };
    }

    // Check 1: Energy sufficient for action
    if (feeling.energy < operation.energyCost + this.config.feelingCost) {
      return {
        blocked: true,
        reason: `Insufficient energy (need ${operation.energyCost}, have ${feeling.energy})`
      };
    }

    // Check 2: Action won't cause energy to drop below critical
    const energyAfter = feeling.energy - operation.energyCost - this.config.feelingCost;
    if (energyAfter < this.entityConfig.E_min) {
      return {
        blocked: true,
        reason: `Action would reduce energy below E_min (${energyAfter} < ${this.entityConfig.E_min})`,
      };
    }

    // Check 3: Operation doesn't require coupling (agent acts without human)
    if (operation.requiresCoupling) {
      return {
        blocked: true,
        reason: `Operation ${action} requires coupling - agent cannot execute alone`,
      };
    }

    // All checks passed
    return { blocked: false };
  }

  // ===========================================================================
  // SELF-PRODUCTION - Phase 8e: Agent creates its own operations
  // ===========================================================================

  /**
   * Track action usage for pattern detection
   * Sigillo 2: Only track in production context (observer/actor separation)
   */
  private trackActionUsage(action: string): void {
    // Sigillo 2: Don't track actions in test/audit context
    if (this.getContext() !== 'production') {
      return;
    }
    const sp = this.stats.selfProduction;
    sp.actionUsageCount[action] = (sp.actionUsageCount[action] || 0) + 1;
  }

  /**
   * Set manual context override (Sigillo 2)
   * Use 'test' or 'audit' to prevent action tracking during verification/testing.
   * Set to null to use derived context (recommended).
   */
  setContext(context: CycleContext | null): void {
    this.manualContextOverride = context;
  }

  /**
   * Get the effective cycle context (Sigillo 2)
   *
   * Context is DERIVED from verifiable properties, not manually set:
   * - NODE_ENV === 'test' → 'test' (cannot be bypassed)
   * - coupling.active === true → 'audit' (human is observing)
   * - Otherwise → 'production'
   *
   * Manual override is only for explicit test scenarios.
   */
  getContext(): CycleContext {
    // Environment check cannot be bypassed
    if (process.env.NODE_ENV === 'test') {
      return 'test';
    }

    // Manual override takes precedence (for explicit test/audit scenarios)
    if (this.manualContextOverride !== null) {
      return this.manualContextOverride;
    }

    // Derived from coupling state: if human is coupled, we're in audit mode
    if (this.lastKnownCoupling) {
      return 'audit';
    }

    return 'production';
  }

  /**
   * Update cached coupling state (called when state is loaded)
   */
  private updateCouplingCache(state: State): void {
    this.lastKnownCoupling = state.coupling?.active ?? false;
  }

  /**
   * Check if we should create a new operation based on patterns
   * Sigillo 2: Only in production context
   */
  private async checkSelfProduction(feeling: Feeling): Promise<void> {
    const sp = this.stats.selfProduction;
    if (!sp.enabled) return;

    // Sigillo 2: Don't produce in test/audit context
    if (this.getContext() !== 'production') return;

    // Cooldown check
    const cyclesSinceLastProduction = this.stats.cycleCount - sp.lastProductionCycle;
    if (cyclesSinceLastProduction < this.config.selfProductionCooldown) return;

    // Find most used action that exceeds threshold
    const candidates = Object.entries(sp.actionUsageCount)
      .filter(([action, count]) => count >= this.config.selfProductionThreshold)
      .filter(([action]) => !sp.createdOperations.some(op => op.includes(action)))
      .sort((a, b) => b[1] - a[1]);

    if (candidates.length === 0) return;

    const [topAction, usageCount] = candidates[0];

    // Determine what kind of operation to create based on the pattern
    const state = await this.loadState();
    const newOpId = await this.createSpecializedOperation(state, topAction, usageCount);

    if (newOpId) {
      sp.operationsCreated++;
      sp.lastProductionCycle = this.stats.cycleCount;
      sp.createdOperations.push(newOpId);

      // Log the self-production event
      await this.remember('AGENT_RESPONSE', {
        priority: 'growth',
        action: 'meta.define',
        reason: `Self-production: created ${newOpId} (${topAction} used ${usageCount}x)`,
        constitutionalCheck: 'passed',
        energyBefore: feeling.energy,
        energyAfter: feeling.energy - 0.005,
        executed: true,
        result: { success: true, operationId: newOpId },
      });

      this.emit('selfProduction', { operationId: newOpId, basedOn: topAction, usageCount });
    }
  }

  /**
   * Create a specialized operation based on observed pattern
   */
  private async createSpecializedOperation(
    state: State,
    baseAction: string,
    usageCount: number
  ): Promise<string | null> {
    // Constitutional check: would this operation reduce possibility space?
    if (!this.constitutionalCheckForProduction(baseAction)) {
      return null;
    }

    const newId = `self.${baseAction.replace('.', '_')}_v${this.stats.selfProduction.operationsCreated + 1}`;

    try {
      // Use specializeOperation to create an optimized version
      // Pass currentCycle for Sigillo 1: Quarantine lifecycle
      const result = specializeOperation(state, {
        id: newId,
        name: `Self-produced: ${baseAction}`,
        description: `Optimized ${baseAction} created by agent after ${usageCount} uses`,
        sourceOperation: baseAction,
        presetParams: {},
        currentCycle: this.stats.cycleCount,
      });

      if (result.success) {
        return newId;
      }
    } catch (error) {
      // If specialization fails, that's OK - we tried
      this.emit('error', { context: 'selfProduction', error });
    }

    return null;
  }

  /**
   * Constitutional check for self-production
   * Ensures created operations don't reduce possibility space
   */
  private constitutionalCheckForProduction(baseAction: string): boolean {
    // Only allow specializing existing catalog operations
    const existingOp = getOperation(baseAction);
    if (!existingOp) return false;

    // Don't create too many operations (prevent runaway self-production)
    if (this.stats.selfProduction.operationsCreated >= 10) return false;

    // Don't specialize already-specialized operations (prevent infinite recursion)
    if (baseAction.startsWith('self.')) return false;

    return true;
  }

  // ===========================================================================
  // SIGILLO 1: QUARANTINE LIFECYCLE MANAGEMENT
  // ===========================================================================

  /**
   * Manage quarantine lifecycle transitions for all generated operations
   * Called each sense-making cycle to:
   * 1. Transition QUARANTINED → TRIAL after quarantineCycles
   * 2. Transition TRIAL → ACTIVE if metrics pass
   * 3. Transition TRIAL → DEPRECATED if metrics fail
   */
  private async manageQuarantineLifecycles(): Promise<void> {
    const sp = this.stats.selfProduction;
    if (!sp.enabled) return;

    // Sigillo 2: Only manage in production context
    if (this.getContext() !== 'production') return;

    const state = await this.loadState();
    this.updateCouplingCache(state); // Keep coupling cache fresh
    const autopoiesis = (state as State & { autopoiesis?: { generatedOperations: GeneratedOperationDef[] } }).autopoiesis;
    if (!autopoiesis?.generatedOperations.length) return;

    const config = this.config.quarantineConfig;
    const currentCycle = this.stats.cycleCount;
    let stateModified = false;

    for (const op of autopoiesis.generatedOperations) {
      // Skip already ACTIVE or DEPRECATED operations
      if (op.status === 'ACTIVE' || op.status === 'DEPRECATED') continue;

      // Transition QUARANTINED → TRIAL
      if (op.status === 'QUARANTINED') {
        if (canTransitionToTrial(op, currentCycle, config)) {
          transitionOperationStatus(op, 'TRIAL', 'Quarantine period complete');
          stateModified = true;
          this.emit('quarantineTransition', { operationId: op.id, from: 'QUARANTINED', to: 'TRIAL' });
        }
        continue;
      }

      // Transition TRIAL → ACTIVE or DEPRECATED
      if (op.status === 'TRIAL') {
        // Check for deprecation first
        const deprecateCheck = shouldDeprecate(op, config);
        if (deprecateCheck.shouldDeprecate) {
          transitionOperationStatus(op, 'DEPRECATED', deprecateCheck.reason);
          stateModified = true;
          this.emit('quarantineTransition', { operationId: op.id, from: 'TRIAL', to: 'DEPRECATED', reason: deprecateCheck.reason });
          continue;
        }

        // Check for activation
        const activateCheck = canTransitionToActive(op, config);
        if (activateCheck.canActivate) {
          transitionOperationStatus(op, 'ACTIVE', activateCheck.reason);
          stateModified = true;
          this.emit('quarantineTransition', { operationId: op.id, from: 'TRIAL', to: 'ACTIVE', reason: activateCheck.reason });
        }
      }
    }

    // Save state if modified
    if (stateModified) {
      const stateManager = getStateManager(this.baseDir);
      await stateManager.writeState(state);
    }
  }

  /**
   * Record trial use metrics when an operation is executed
   * Called during operation execution to track effectiveness
   */
  recordOperationTrialUse(
    operationId: string,
    vDelta: number,
    surpriseDelta: number,
    energyCost: number,
    blocked: boolean
  ): void {
    // Will be called from operations when executing trial operations
    // The actual recording is done in meta-operations.ts
    // This method is a placeholder for future integration
  }

  // ===========================================================================
  // ULTRASTABILITY - Ashby's adaptive parameter adjustment
  // ===========================================================================

  /**
   * Record a violation for ultrastability tracking
   */
  private recordViolation(
    invariant: string,
    feeling: Feeling,
    recovered: boolean,
    recoveryTime?: number
  ): void {
    if (!this.stats.ultrastability.enabled) return;

    const violation: ViolationRecord = {
      timestamp: new Date().toISOString(),
      cycle: this.stats.cycleCount,
      invariant,
      feeling: {
        energy: feeling.energy,
        lyapunovV: feeling.lyapunovV,
        surprise: feeling.surprise,
      },
      recovered,
      recoveryTime,
    };

    this.stats.ultrastability.violations.push(violation);

    // Keep only recent violations (rolling window)
    if (this.stats.ultrastability.violations.length > this.config.violationWindowSize) {
      this.stats.ultrastability.violations.shift();
    }

    // Update violation rate
    this.updateStabilityMetrics();
  }

  /**
   * Update stability metrics based on violation history
   */
  private updateStabilityMetrics(): void {
    const us = this.stats.ultrastability;
    const windowSize = Math.min(this.stats.cycleCount, this.config.violationWindowSize);

    if (windowSize === 0) {
      us.violationRate = 0;
      us.stabilityScore = 1.0;
      return;
    }

    // Count recent violations (in last windowSize cycles)
    const recentViolations = us.violations.filter(
      v => this.stats.cycleCount - v.cycle < windowSize
    ).length;

    us.violationRate = recentViolations / windowSize;
    us.stabilityScore = Math.max(0, 1 - us.violationRate);
  }

  /**
   * Check if adaptation is needed and perform it
   * Called periodically based on adaptationInterval
   * Respects maxAdaptationsPerWindow to prevent thrashing
   */
  private async checkAndAdaptParameters(): Promise<void> {
    if (!this.stats.ultrastability.enabled) return;
    if (this.stats.cycleCount % this.config.adaptationInterval !== 0) return;
    if (this.stats.cycleCount === 0) return;

    const us = this.stats.ultrastability;
    const rate = this.config.adaptationRate;

    // Rate limiting: Check if we've adapted too many times recently
    // Prevents hyper-reactivity / thrashing
    const recentAdaptations = us.parameterHistory.filter(p =>
      this.stats.cycleCount - p.cycle < this.config.violationWindowSize
    ).length - 1; // -1 for initial snapshot

    if (recentAdaptations >= this.config.maxAdaptationsPerWindow) {
      // Already adapted enough - skip to avoid thrashing
      return;
    }

    // Capture state before adaptation for logging
    const beforeState = {
      interval: us.adaptiveParameters.decisionInterval,
      criticalThreshold: us.adaptiveParameters.criticalThreshold,
      urgencyThreshold: us.adaptiveParameters.urgencyThreshold,
      restThreshold: us.adaptiveParameters.restThreshold,
    };
    const energyBefore = await this.getEnergyLevel();

    // Analyze violation patterns
    const recentViolations = us.violations.slice(-this.config.adaptationInterval);
    if (recentViolations.length === 0) {
      // No violations - system is stable, can relax parameters slightly
      this.relaxParameters(rate * 0.5); // Relax more slowly than tighten
      return;
    }

    // Count violation types
    const energyViolations = recentViolations.filter(v =>
      v.invariant === 'INV-005' || v.invariant === 'energy' || v.feeling.energy < this.config.urgencyThreshold
    ).length;

    const stabilityViolations = recentViolations.filter(v =>
      v.invariant === 'INV-002' || v.invariant === 'INV-004' || v.invariant === 'stability' || v.feeling.lyapunovV > 0.1
    ).length;

    const integrityViolations = recentViolations.filter(v =>
      v.invariant === 'INV-001' || v.invariant === 'INV-003' || v.invariant === 'INV-*'
    ).length;

    // Adapt based on patterns
    const reasons: string[] = [];

    // Too many energy issues → raise thresholds
    if (energyViolations > recentViolations.length * 0.3) {
      this.raiseEnergyThresholds(rate);
      reasons.push(`Energy issues (${energyViolations}/${recentViolations.length})`);
    }

    // Too many stability issues → tighten stability, speed up cycles
    if (stabilityViolations > recentViolations.length * 0.3) {
      this.tightenStabilityParameters(rate);
      reasons.push(`Stability issues (${stabilityViolations}/${recentViolations.length})`);
    }

    // Integrity issues → cannot adapt, but note them
    if (integrityViolations > 0) {
      reasons.push(`Integrity issues (${integrityViolations}) - requires attention`);
    }

    // Record adaptation and log to Merkle chain if any changes made
    if (reasons.length > 0) {
      this.recordParameterChange(reasons.join('; '));

      // Log to Merkle chain for audit/explainability
      const energyAfter = await this.getEnergyLevel();
      await this.remember('AGENT_ULTRASTABILITY', {
        cycle: this.stats.cycleCount,
        before: beforeState,
        after: {
          interval: us.adaptiveParameters.decisionInterval,
          criticalThreshold: us.adaptiveParameters.criticalThreshold,
          urgencyThreshold: us.adaptiveParameters.urgencyThreshold,
          restThreshold: us.adaptiveParameters.restThreshold,
        },
        reason: reasons.join('; '),
        violationCounts: {
          energy: energyViolations,
          stability: stabilityViolations,
          integrity: integrityViolations,
          total: recentViolations.length,
        },
        energyBefore,
        energyAfter,
        adaptationCount: us.adaptationCount,
      });
    }
  }

  /**
   * Raise energy thresholds to be more conservative
   */
  private raiseEnergyThresholds(rate: number): void {
    const ap = this.stats.ultrastability.adaptiveParameters;

    // Raise critical threshold (but cap at 0.15)
    ap.criticalThreshold = Math.min(0.15, ap.criticalThreshold * (1 + rate));

    // Raise urgency threshold (but cap at 0.3)
    ap.urgencyThreshold = Math.min(0.3, ap.urgencyThreshold * (1 + rate));

    this.emit('parameterAdapted', {
      type: 'energy',
      direction: 'raise',
      criticalThreshold: ap.criticalThreshold,
      urgencyThreshold: ap.urgencyThreshold,
    });
  }

  /**
   * Tighten stability parameters - more sensitive, faster response
   * Respects caps to prevent hyper-reactivity (ultrastability ≠ nervousness)
   */
  private tightenStabilityParameters(rate: number): void {
    const ap = this.stats.ultrastability.adaptiveParameters;

    // Lower rest threshold (more sensitive to drift)
    // BUT respect minRestThreshold to avoid noise sensitivity
    ap.restThreshold = Math.max(
      this.config.minRestThreshold,
      ap.restThreshold * (1 - rate)
    );

    // Speed up decision interval (but not below minimum)
    ap.decisionInterval = Math.max(
      this.config.minDecisionInterval,
      ap.decisionInterval * (1 - rate)
    );

    this.emit('parameterAdapted', {
      type: 'stability',
      direction: 'tighten',
      restThreshold: ap.restThreshold,
      decisionInterval: ap.decisionInterval,
    });

    // Reschedule cycle interval if running
    if (this.running && this.cycleInterval) {
      clearInterval(this.cycleInterval);
      this.cycleInterval = setInterval(
        () => this.senseMakingCycle(),
        ap.decisionInterval
      );
    }
  }

  /**
   * Relax parameters when stable - save energy, slower cycles
   */
  private relaxParameters(rate: number): void {
    const ap = this.stats.ultrastability.adaptiveParameters;
    const reasons: string[] = [];

    // Only relax if stability score is high
    if (this.stats.ultrastability.stabilityScore < 0.9) return;

    // Slow down decision interval (but not above maximum)
    const oldInterval = ap.decisionInterval;
    ap.decisionInterval = Math.min(
      this.config.maxDecisionInterval,
      ap.decisionInterval * (1 + rate)
    );

    if (ap.decisionInterval !== oldInterval) {
      reasons.push('Stable - slowing cycles');

      // Reschedule cycle interval if running
      if (this.running && this.cycleInterval) {
        clearInterval(this.cycleInterval);
        this.cycleInterval = setInterval(
          () => this.senseMakingCycle(),
          ap.decisionInterval
        );
      }
    }

    // Slightly lower thresholds if very stable
    if (this.stats.ultrastability.stabilityScore > 0.95) {
      ap.criticalThreshold = Math.max(0.03, ap.criticalThreshold * (1 - rate * 0.5));
      ap.urgencyThreshold = Math.max(0.1, ap.urgencyThreshold * (1 - rate * 0.5));
      reasons.push('Very stable - relaxing thresholds');
    }

    if (reasons.length > 0) {
      this.recordParameterChange(reasons.join('; '));
      this.emit('parameterAdapted', {
        type: 'relax',
        direction: 'relax',
        ...ap,
      });
    }
  }

  /**
   * Record parameter change to history
   */
  private recordParameterChange(reason: string): void {
    const ap = this.stats.ultrastability.adaptiveParameters;

    this.stats.ultrastability.parameterHistory.push({
      timestamp: new Date().toISOString(),
      cycle: this.stats.cycleCount,
      criticalThreshold: ap.criticalThreshold,
      urgencyThreshold: ap.urgencyThreshold,
      restThreshold: ap.restThreshold,
      decisionInterval: ap.decisionInterval,
      reason,
    });

    // Keep only last 20 parameter changes
    if (this.stats.ultrastability.parameterHistory.length > 20) {
      this.stats.ultrastability.parameterHistory.shift();
    }

    this.stats.ultrastability.adaptationCount++;
    this.stats.ultrastability.lastAdaptation = new Date().toISOString();
  }

  /**
   * Get current adaptive parameters (used instead of config)
   */
  private getAdaptiveThreshold(param: 'critical' | 'urgency' | 'rest'): number {
    if (!this.stats.ultrastability.enabled) {
      switch (param) {
        case 'critical': return this.config.criticalThreshold;
        case 'urgency': return this.config.urgencyThreshold;
        case 'rest': return this.config.restThreshold;
      }
    }
    const ap = this.stats.ultrastability.adaptiveParameters;
    switch (param) {
      case 'critical': return ap.criticalThreshold;
      case 'urgency': return ap.urgencyThreshold;
      case 'rest': return ap.restThreshold;
    }
  }

  // ===========================================================================
  // REMEMBER - Communicate with future self
  // ===========================================================================

  /**
   * Remember - log to event chain
   *
   * This is not "logging" in the debugging sense.
   * This is communication with the future self through the Merkle chain.
   * Uses StateManager for atomic event + state update.
   */
  private async remember(
    type: 'AGENT_WAKE' | 'AGENT_SLEEP' | 'AGENT_RESPONSE' | 'AGENT_REST' | 'AGENT_ULTRASTABILITY',
    data: Record<string, unknown>
  ): Promise<void> {
    const manager = getStateManager(this.baseDir);
    // IMPORTANT: This state update MUST match applyEvent() in events.ts exactly!
    // Any mismatch causes INV-002 violations (state != replay(events))
    await manager.appendEventAtomic(type, data, (state, event) => {
      const newState = { ...state };

      // Initialize agent state if needed (matches AGENT_WAKE in applyEvent)
      if (!newState.agent) {
        newState.agent = {
          enabled: true,
          awake: type === 'AGENT_WAKE',
          lastCycle: null,
          cycleCount: 0,
          responsesByPriority: { survival: 0, integrity: 0, stability: 0, growth: 0, rest: 0 },
          totalEnergyConsumed: 0,
        };
      }

      // Apply event exactly as applyEvent() does in events.ts
      switch (type) {
        case 'AGENT_WAKE':
          newState.agent.awake = true;
          break;

        case 'AGENT_SLEEP':
          newState.agent.awake = false;
          // Only update from data.stats if present (matches applyEvent)
          if (data.stats) {
            const stats = data.stats as Record<string, unknown>;
            newState.agent.cycleCount = (stats.cycleCount as number) || newState.agent.cycleCount;
            newState.agent.totalEnergyConsumed = (stats.totalEnergyConsumed as number) || newState.agent.totalEnergyConsumed;
          }
          break;

        case 'AGENT_RESPONSE':
          newState.agent.lastCycle = event.timestamp;
          // Note: cycleCount is NOT updated here (matches applyEvent)
          const priority = data.priority as keyof typeof newState.agent.responsesByPriority;
          if (priority && newState.agent.responsesByPriority[priority] !== undefined) {
            newState.agent.responsesByPriority[priority]++;
          }
          if (data.energyCost) {
            newState.agent.totalEnergyConsumed += data.energyCost as number;
          }
          break;

        case 'AGENT_REST':
          newState.agent.lastCycle = event.timestamp;
          newState.agent.responsesByPriority.rest++;
          break;

        case 'AGENT_ULTRASTABILITY':
          // Ultrastability adjustment - no state change needed
          // Event is logged for audit/explainability only
          newState.agent.lastCycle = event.timestamp;
          break;
      }

      return newState;
    });
  }

  // ===========================================================================
  // State Helpers (using StateManager for thread-safety)
  // ===========================================================================

  private async loadState(): Promise<State> {
    const manager = getStateManager(this.baseDir);
    const state = await manager.readState();
    if (!state) {
      throw new Error('No state available');
    }
    return state;
  }

  private async updateState(changes: Partial<State>): Promise<void> {
    const manager = getStateManager(this.baseDir);
    await manager.updateState((state) => ({
      ...state,
      ...changes,
    }));
  }

  private async consumeEnergy(amount: number): Promise<void> {
    const manager = getStateManager(this.baseDir);
    await manager.updateState((state) => ({
      ...state,
      energy: {
        ...state.energy,
        current: Math.max(state.energy.min, state.energy.current - amount),
      },
    }));
  }

  private async getEnergyLevel(): Promise<number> {
    const state = await this.loadState();
    return state.energy.current;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Force a sense-making cycle (for testing/debugging)
   */
  async forceCycle(): Promise<{ feeling: Feeling; response: Response }> {
    const feeling = await this.feel();
    const response = await this.respond(feeling);
    return { feeling, response };
  }

  /**
   * Get current feeling without acting
   */
  async getCurrentFeeling(): Promise<Feeling> {
    return this.feel();
  }

  /**
   * Print agent status
   */
  async printStatus(): Promise<void> {
    const feeling = await this.feel();

    console.log('\n=== INTERNAL AGENT STATUS ===');
    console.log(`State: ${this.running ? 'AWAKE' : 'SLEEPING'}`);
    console.log(`Started: ${this.stats.startedAt || 'Never'}`);
    console.log(`Last Cycle: ${this.stats.lastCycle || 'Never'}`);
    console.log(`Cycles: ${this.stats.cycleCount}`);
    console.log('');
    console.log('--- Current Feeling ---');
    console.log(`Energy: ${feeling.energyFeeling} (${(feeling.energy * 100).toFixed(1)}%)`);
    console.log(`Stability: ${feeling.stabilityFeeling} (V=${feeling.lyapunovV.toFixed(4)})`);
    console.log(`Integrity: ${feeling.integrityFeeling} (${feeling.invariantsSatisfied}/${feeling.invariantsTotal})`);
    console.log(`Surprise (ε): ${feeling.surprise.toFixed(4)}`);
    console.log('');
    console.log('--- Statistics ---');
    console.log(`Responses: ${this.stats.responsesTotal}`);
    console.log(`  Survival: ${this.stats.responsesByPriority.survival}`);
    console.log(`  Integrity: ${this.stats.responsesByPriority.integrity}`);
    console.log(`  Stability: ${this.stats.responsesByPriority.stability}`);
    console.log(`  Growth: ${this.stats.responsesByPriority.growth}`);
    console.log(`  Rest: ${this.stats.responsesByPriority.rest}`);
    console.log(`Actions: ${this.stats.actionsExecuted} executed, ${this.stats.actionsBlocked} blocked`);
    console.log(`Energy consumed: ${this.stats.totalEnergyConsumed.toFixed(4)}`);
    console.log('');

    // Phase 8b: Ultrastability info
    const us = this.stats.ultrastability;
    console.log('--- Ultrastability (Ashby) ---');
    console.log(`Enabled: ${us.enabled}`);
    console.log(`Stability Score: ${(us.stabilityScore * 100).toFixed(1)}%`);
    console.log(`Violation Rate: ${(us.violationRate * 100).toFixed(1)}%`);
    console.log(`Violations Tracked: ${us.violations.length}`);
    console.log(`Adaptations: ${us.adaptationCount}`);
    if (us.lastAdaptation) {
      console.log(`Last Adaptation: ${us.lastAdaptation}`);
    }
    console.log('');
    console.log('--- Adaptive Parameters ---');
    console.log(`  Critical: ${(us.adaptiveParameters.criticalThreshold * 100).toFixed(1)}% (default: ${(this.config.criticalThreshold * 100).toFixed(1)}%)`);
    console.log(`  Urgency: ${(us.adaptiveParameters.urgencyThreshold * 100).toFixed(1)}% (default: ${(this.config.urgencyThreshold * 100).toFixed(1)}%)`);
    console.log(`  Rest: ${us.adaptiveParameters.restThreshold.toFixed(4)} (default: ${this.config.restThreshold.toFixed(4)})`);
    console.log(`  Interval: ${(us.adaptiveParameters.decisionInterval / 1000).toFixed(1)}s (default: ${(this.config.decisionInterval / 1000).toFixed(1)}s)`);
    console.log('');

    // Phase 8c: Active Inference info
    if (this.config.activeInferenceEnabled) {
      const aiConfig = this.activeInference.getConfig();
      const model = this.activeInference.getModel();
      console.log('--- Active Inference (Friston) ---');
      console.log(`Enabled: ${aiConfig.enabled}`);
      console.log(`Epistemic Weight: ${(aiConfig.epistemicWeight * 100).toFixed(0)}%`);
      console.log(`Pragmatic Weight: ${(aiConfig.pragmaticWeight * 100).toFixed(0)}%`);
      console.log(`Learning Rate: ${aiConfig.learningRate}`);
      console.log(`Observations: ${model.getObservations().length}`);
      console.log('');
      console.log('--- Learned Action Effects ---');
      for (const [action, effects] of model.getActionEffects()) {
        const actionName = action === 'null' ? 'rest' : action;
        console.log(`  ${actionName}: E${effects.energyDelta > 0 ? '+' : ''}${(effects.energyDelta * 100).toFixed(1)}%, V${effects.vDelta > 0 ? '+' : ''}${effects.vDelta.toFixed(3)}, conf=${(effects.confidence * 100).toFixed(0)}%`);
      }
      console.log('');
    }

    // Phase 8d: Cycle Memory info
    if (this.config.cycleMemoryEnabled) {
      const summary = this.cycleMemory.getSummary();
      console.log('--- Cycle Memory (Phase 8d) ---');
      console.log(`Cycles Stored: ${summary.totalCycles}`);
      console.log(`Total Recorded: ${this.cycleMemory.getTotalCyclesRecorded()}`);
      console.log(`Avg Effectiveness: ${(summary.avgEffectiveness * 100).toFixed(2)}%`);
      console.log(`Avg Energy Cost: ${(summary.avgEnergyCost * 100).toFixed(2)}%`);
      if (summary.totalCycles > 0) {
        console.log('');
        console.log('--- Effectiveness by Priority ---');
        for (const [priority, stats] of Object.entries(summary.byPriority)) {
          if (stats.count > 0) {
            console.log(`  ${priority}: ${stats.count} cycles, ${(stats.avgEffectiveness * 100).toFixed(1)}% effective`);
          }
        }
      }
      // Show top actions from history
      const topActions = this.cycleMemory.getAllActionStats();
      if (topActions.length > 0) {
        console.log('');
        console.log('--- Top Actions (Historical) ---');
        for (const stat of topActions.slice(0, 3)) {
          const actionName = stat.action ?? 'rest';
          console.log(`  ${actionName}: ${(stat.avgEffectiveness * 100).toFixed(1)}% effective, ${(stat.successRate * 100).toFixed(0)}% success rate (${stat.totalCycles} uses)`);
        }
      }
      console.log('');
    }

    // Phase 8e: Self-Production info
    const sp = this.stats.selfProduction;
    console.log('--- Self-Production (Phase 8e) ---');
    console.log(`Enabled: ${sp.enabled}`);
    console.log(`Operations Created: ${sp.operationsCreated}`);
    console.log(`Created IDs: ${sp.createdOperations.length > 0 ? sp.createdOperations.join(', ') : 'none'}`);
    if (Object.keys(sp.actionUsageCount).length > 0) {
      console.log('');
      console.log('--- Action Usage (Pattern Detection) ---');
      const sorted = Object.entries(sp.actionUsageCount).sort((a, b) => b[1] - a[1]);
      for (const [action, count] of sorted.slice(0, 5)) {
        const threshold = this.config.selfProductionThreshold;
        const marker = count >= threshold ? ' [PATTERN]' : '';
        console.log(`  ${action}: ${count} uses${marker}`);
      }
    }
    console.log('');
  }

  /**
   * Get active inference engine (for inspection)
   */
  getActiveInference(): ActiveInferenceEngine {
    return this.activeInference;
  }

  /**
   * Get cycle memory (for inspection)
   */
  getCycleMemory(): CycleMemory {
    return this.cycleMemory;
  }
}

// =============================================================================
// Factory and Exports
// =============================================================================

/**
 * Create internal agent for base directory
 */
export function createAgent(
  baseDir: string,
  config?: Partial<AgentConfig>,
  entityConfig?: Config
): InternalAgent {
  return new InternalAgent(baseDir, config, entityConfig);
}
