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
}

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
      this.checkAndAdaptParameters();

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
   */
  private checkAndAdaptParameters(): void {
    if (!this.stats.ultrastability.enabled) return;
    if (this.stats.cycleCount % this.config.adaptationInterval !== 0) return;
    if (this.stats.cycleCount === 0) return;

    const us = this.stats.ultrastability;
    const rate = this.config.adaptationRate;

    // Analyze violation patterns
    const recentViolations = us.violations.slice(-this.config.adaptationInterval);
    if (recentViolations.length === 0) {
      // No violations - system is stable, can relax parameters slightly
      this.relaxParameters(rate * 0.5); // Relax more slowly than tighten
      return;
    }

    // Count violation types
    const energyViolations = recentViolations.filter(v =>
      v.invariant === 'INV-005' || v.feeling.energy < this.config.urgencyThreshold
    ).length;

    const stabilityViolations = recentViolations.filter(v =>
      v.invariant === 'INV-002' || v.invariant === 'INV-004' || v.feeling.lyapunovV > 0.1
    ).length;

    const integrityViolations = recentViolations.filter(v =>
      v.invariant === 'INV-001' || v.invariant === 'INV-003'
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

    // Record adaptation if any changes made
    if (reasons.length > 0) {
      this.recordParameterChange(reasons.join('; '));
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
   */
  private tightenStabilityParameters(rate: number): void {
    const ap = this.stats.ultrastability.adaptiveParameters;

    // Lower rest threshold (more sensitive to drift)
    ap.restThreshold = Math.max(0.0001, ap.restThreshold * (1 - rate));

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
    type: 'AGENT_WAKE' | 'AGENT_SLEEP' | 'AGENT_RESPONSE' | 'AGENT_REST',
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
