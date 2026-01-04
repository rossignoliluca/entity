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
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { State, InvariantCheck, VerificationResult, Config } from '../types.js';
import { DEFAULT_CONFIG } from '../types.js';
import { verifyAllInvariants, quickHealthCheck } from '../verify.js';
import { computeV, isAtAttractor, stabilityMargin } from '../lyapunov.js';
import { appendEvent } from '../events.js';
import { executeOperation, getOperation, OPERATIONS_CATALOG } from '../operations.js';
import { autoRecover } from '../recovery.js';

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
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  decisionInterval: 60000,       // 1 minute between cycles
  feelingCost: 0.001,            // minimal energy for sensing
  activeWhenCoupled: false,      // defer to human when coupled
  restThreshold: 0.001,          // V < 0.001 = at attractor
  urgencyThreshold: 0.15,        // E < 15% = urgent
  criticalThreshold: 0.05,       // E < 5% = critical, prepare dormant
};

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
    };
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
   */
  private async senseMakingCycle(): Promise<void> {
    this.stats.cycleCount++;
    this.stats.lastCycle = new Date().toISOString();

    try {
      // 1. FEEL - sense the current state relative to expected
      const feeling = await this.feel();

      // 2. CHECK COUPLING - defer to human if present
      if (feeling.energy > 0) {  // Only check if we have energy to sense
        const state = await this.loadState();
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
        } else {
          this.stats.actionsBlocked++;
        }
      } else {
        this.stats.restCycles++;
      }
      this.stats.totalEnergyConsumed += response.energyCost;

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
    if (energy < this.config.criticalThreshold) return 'critical';
    if (energy < this.config.urgencyThreshold) return 'low';
    if (energy < this.entityConfig.E_threshold * 2) return 'adequate';
    return 'vital';
  }

  private feelStability(V: number): Feeling['stabilityFeeling'] {
    if (V < this.config.restThreshold) return 'attractor';
    if (V < 0.1) return 'stable';
    if (V < 0.3) return 'drifting';
    return 'unstable';
  }

  private feelIntegrity(satisfied: number, total: number): Feeling['integrityFeeling'] {
    if (satisfied === total) return 'whole';
    if (satisfied >= total - 1) return 'stressed';
    return 'violated';
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
      return {
        priority: 'stability',
        action: 'state.summary',  // Understand current state
        reason: `Stability feeling: ${feeling.stabilityFeeling} (V=${feeling.lyapunovV.toFixed(4)})`,
      };
    }

    // Priority 4: GROWTH (only if stable and vital)
    if (feeling.needsGrowth && feeling.energyFeeling === 'vital') {
      // Alternate between learning and introspection
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
    return {
      priority: 'rest',
      action: null,
      reason: feeling.stabilityFeeling === 'attractor'
        ? 'At attractor - resting (Wu Wei)'
        : `Adequate state (ε=${feeling.surprise.toFixed(4)}) - resting`,
    };
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
  // REMEMBER - Communicate with future self
  // ===========================================================================

  /**
   * Remember - log to event chain
   *
   * This is not "logging" in the debugging sense.
   * This is communication with the future self through the Merkle chain.
   */
  private async remember(
    type: 'AGENT_WAKE' | 'AGENT_SLEEP' | 'AGENT_RESPONSE' | 'AGENT_REST',
    data: Record<string, unknown>
  ): Promise<void> {
    // Append to event chain with appropriate agent event type
    await appendEvent(this.baseDir, type, data);
  }

  // ===========================================================================
  // State Helpers
  // ===========================================================================

  private async loadState(): Promise<State> {
    const content = await readFile(
      join(this.baseDir, 'state', 'current.json'),
      'utf-8'
    );
    return JSON.parse(content) as State;
  }

  private async updateState(changes: Partial<State>): Promise<void> {
    const state = await this.loadState();
    const updated = { ...state, ...changes, updated: new Date().toISOString() };
    await writeFile(
      join(this.baseDir, 'state', 'current.json'),
      JSON.stringify(updated, null, 2)
    );
  }

  private async consumeEnergy(amount: number): Promise<void> {
    const state = await this.loadState();
    const newEnergy = Math.max(state.energy.min, state.energy.current - amount);
    await this.updateState({
      energy: { ...state.energy, current: newEnergy },
    });
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
