/**
 * Active Inference Module
 * AES-SPEC-001 Phase 8c: Active Inference (Friston)
 *
 * Implements the Free Energy Principle for action selection.
 *
 * Core concepts:
 * - Generative Model: Predicts future states given actions
 * - Expected Free Energy (EFE): G = ambiguity + risk
 * - Action Selection: Choose action minimizing EFE
 * - Epistemic vs Pragmatic: Balance exploration and goal-seeking
 *
 * The agent actively minimizes surprise through prediction,
 * not just reaction. This is the difference between:
 * - Reactive: "I feel bad, do something"
 * - Active: "If I do X, I predict I'll feel Y, choose best X"
 *
 * References:
 * - Friston, K. (2010). The free-energy principle: a unified brain theory?
 * - Parr, T., & Friston, K. (2019). Generalised free energy and active inference.
 */

import type { State } from '../types.js';
import type { Feeling, Priority } from './agent.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Possible actions the agent can take
 */
export type Action = string | null;  // null = rest (do nothing)

/**
 * Predicted state outcome
 */
export interface PredictedState {
  energy: number;
  lyapunovV: number;
  invariantsSatisfied: number;
  invariantsTotal: number;
  confidence: number;  // 0-1, how confident the prediction is
}

/**
 * Expected Free Energy components
 */
export interface EFEComponents {
  ambiguity: number;      // Uncertainty about outcomes (epistemic)
  risk: number;           // Divergence from preferred state (pragmatic)
  total: number;          // G = ambiguity + risk
}

/**
 * Action evaluation result
 */
export interface ActionEvaluation {
  action: Action;
  predictedState: PredictedState;
  efe: EFEComponents;
  epistemicValue: number;   // Information gain
  pragmaticValue: number;   // Goal achievement
}

/**
 * Preferred state (what the agent "wants")
 * Based on constitutional priorities
 */
export interface PreferredState {
  energy: number;           // Preferred energy level
  lyapunovV: number;        // Preferred V (0 = at attractor)
  invariantsSatisfied: number;
  invariantsTotal: number;
}

/**
 * Learning record for model updates
 */
export interface ObservationRecord {
  timestamp: string;
  action: Action;
  stateBefore: PredictedState;
  stateAfter: PredictedState;
  predicted: PredictedState;
  predictionError: number;
}

/**
 * Active Inference configuration
 */
export interface ActiveInferenceConfig {
  enabled: boolean;
  epistemicWeight: number;    // Weight for exploration (0-1)
  pragmaticWeight: number;    // Weight for goal-seeking (0-1)
  learningRate: number;       // How fast to update model
  historySize: number;        // How many observations to remember
  defaultConfidence: number;  // Confidence for unknown action-state pairs
}

export const DEFAULT_ACTIVE_INFERENCE_CONFIG: ActiveInferenceConfig = {
  enabled: true,
  epistemicWeight: 0.3,       // 30% exploration
  pragmaticWeight: 0.7,       // 70% goal-seeking
  learningRate: 0.1,          // 10% update per observation
  historySize: 100,           // Remember last 100 observations
  defaultConfidence: 0.5,     // 50% confidence for unknown
};

// =============================================================================
// Generative Model
// =============================================================================

/**
 * Generative Model - Predicts future states given actions
 *
 * This is a simple learned model based on observation history.
 * It learns: action → expected state change
 */
export class GenerativeModel {
  private config: ActiveInferenceConfig;
  private observations: ObservationRecord[] = [];

  // Learned state transition expectations
  // Maps action → average state delta
  private actionEffects: Map<string, {
    energyDelta: number;
    vDelta: number;
    observationCount: number;
    confidence: number;
  }> = new Map();

  constructor(config: Partial<ActiveInferenceConfig> = {}) {
    this.config = { ...DEFAULT_ACTIVE_INFERENCE_CONFIG, ...config };
    this.initializeDefaultEffects();
  }

  /**
   * Initialize with reasonable default expectations
   * These will be refined through learning
   */
  private initializeDefaultEffects(): void {
    // Rest (null action) - minimal energy cost, V tends toward 0
    this.actionEffects.set('null', {
      energyDelta: -0.001,  // Tiny decay
      vDelta: -0.01,        // V decreases (toward attractor)
      observationCount: 1,
      confidence: 0.3,
    });

    // State summary - low cost, helps stability
    this.actionEffects.set('state.summary', {
      energyDelta: -0.005,
      vDelta: -0.02,
      observationCount: 1,
      confidence: 0.4,
    });

    // System health - moderate cost, good for understanding
    this.actionEffects.set('system.health', {
      energyDelta: -0.01,
      vDelta: -0.03,
      observationCount: 1,
      confidence: 0.4,
    });

    // Energy status - helps with energy awareness
    this.actionEffects.set('energy.status', {
      energyDelta: -0.005,
      vDelta: -0.01,
      observationCount: 1,
      confidence: 0.4,
    });
  }

  /**
   * Predict state after taking action
   */
  predict(action: Action, currentState: PredictedState): PredictedState {
    const actionKey = action ?? 'null';
    const effects = this.actionEffects.get(actionKey);

    if (!effects) {
      // Unknown action - use default with low confidence
      return {
        energy: Math.max(0, currentState.energy - 0.01),
        lyapunovV: currentState.lyapunovV,
        invariantsSatisfied: currentState.invariantsSatisfied,
        invariantsTotal: currentState.invariantsTotal,
        confidence: this.config.defaultConfidence * 0.5,
      };
    }

    return {
      energy: Math.max(0, Math.min(1, currentState.energy + effects.energyDelta)),
      lyapunovV: Math.max(0, currentState.lyapunovV + effects.vDelta),
      invariantsSatisfied: currentState.invariantsSatisfied, // Assume no change
      invariantsTotal: currentState.invariantsTotal,
      confidence: effects.confidence,
    };
  }

  /**
   * Update model based on observation
   * Bayesian-inspired update: blend prediction with observation
   */
  update(observation: ObservationRecord): void {
    // Store observation
    this.observations.push(observation);
    if (this.observations.length > this.config.historySize) {
      this.observations.shift();
    }

    // Update action effects
    const actionKey = observation.action ?? 'null';
    const existing = this.actionEffects.get(actionKey) ?? {
      energyDelta: 0,
      vDelta: 0,
      observationCount: 0,
      confidence: this.config.defaultConfidence,
    };

    // Compute actual deltas
    const actualEnergyDelta = observation.stateAfter.energy - observation.stateBefore.energy;
    const actualVDelta = observation.stateAfter.lyapunovV - observation.stateBefore.lyapunovV;

    // Blend with existing expectations (exponential moving average)
    const lr = this.config.learningRate;
    const newCount = existing.observationCount + 1;

    this.actionEffects.set(actionKey, {
      energyDelta: existing.energyDelta * (1 - lr) + actualEnergyDelta * lr,
      vDelta: existing.vDelta * (1 - lr) + actualVDelta * lr,
      observationCount: newCount,
      // Confidence increases with observations (asymptotic to 1)
      confidence: Math.min(0.95, 1 - 1 / (newCount + 1)),
    });
  }

  /**
   * Get prediction uncertainty for an action
   */
  getUncertainty(action: Action): number {
    const actionKey = action ?? 'null';
    const effects = this.actionEffects.get(actionKey);
    if (!effects) return 1.0;  // Maximum uncertainty
    return 1 - effects.confidence;
  }

  /**
   * Get observation history
   */
  getObservations(): ObservationRecord[] {
    return [...this.observations];
  }

  /**
   * Get learned action effects
   */
  getActionEffects(): Map<string, { energyDelta: number; vDelta: number; confidence: number }> {
    const result = new Map();
    for (const [action, effects] of this.actionEffects) {
      result.set(action, {
        energyDelta: effects.energyDelta,
        vDelta: effects.vDelta,
        confidence: effects.confidence,
      });
    }
    return result;
  }
}

// =============================================================================
// Expected Free Energy Computation
// =============================================================================

/**
 * Compute Expected Free Energy for an action
 *
 * G = ambiguity + risk
 *
 * Where:
 * - Ambiguity = uncertainty about outcomes (promotes exploration)
 * - Risk = KL divergence from preferred state (promotes goal-seeking)
 */
export function computeEFE(
  predictedState: PredictedState,
  preferredState: PreferredState,
  uncertainty: number,
  config: ActiveInferenceConfig
): EFEComponents {
  // Ambiguity: How uncertain are we about the outcome?
  // High uncertainty → high ambiguity → epistemic value in trying
  const ambiguity = uncertainty;

  // Risk: How far is predicted state from preferred state?
  // This is a simplified KL divergence approximation
  const energyRisk = Math.abs(predictedState.energy - preferredState.energy);
  const stabilityRisk = predictedState.lyapunovV; // Preferred V = 0
  const integrityRisk = predictedState.invariantsTotal > 0
    ? (predictedState.invariantsTotal - predictedState.invariantsSatisfied) / predictedState.invariantsTotal
    : 0;

  // Weighted risk (priorities matter)
  const risk = (
    0.4 * energyRisk +
    0.4 * stabilityRisk +
    0.2 * integrityRisk
  );

  // Total EFE with epistemic/pragmatic weighting
  const total = config.epistemicWeight * ambiguity + config.pragmaticWeight * risk;

  return { ambiguity, risk, total };
}

/**
 * Get preferred state based on constitutional priorities
 */
export function getPreferredState(currentFeeling: Feeling): PreferredState {
  return {
    energy: 0.8,  // Prefer high energy
    lyapunovV: 0, // Prefer at attractor
    invariantsSatisfied: currentFeeling.invariantsTotal,
    invariantsTotal: currentFeeling.invariantsTotal,
  };
}

// =============================================================================
// Action Selection
// =============================================================================

/**
 * Active Inference Engine
 *
 * Selects actions by minimizing Expected Free Energy.
 * This is the core of active inference: predict → evaluate → choose.
 */
export class ActiveInferenceEngine {
  private model: GenerativeModel;
  private config: ActiveInferenceConfig;

  constructor(config: Partial<ActiveInferenceConfig> = {}) {
    this.config = { ...DEFAULT_ACTIVE_INFERENCE_CONFIG, ...config };
    this.model = new GenerativeModel(this.config);
  }

  /**
   * Evaluate all possible actions and select the best one
   */
  selectAction(
    currentFeeling: Feeling,
    availableActions: Action[],
    priority: Priority
  ): ActionEvaluation {
    const currentState: PredictedState = {
      energy: currentFeeling.energy,
      lyapunovV: currentFeeling.lyapunovV,
      invariantsSatisfied: currentFeeling.invariantsSatisfied,
      invariantsTotal: currentFeeling.invariantsTotal,
      confidence: 1.0,  // Current state is known
    };

    const preferredState = getPreferredState(currentFeeling);

    // Adjust weights based on priority
    const adjustedConfig = this.adjustWeightsForPriority(priority);

    // Evaluate all actions
    const evaluations: ActionEvaluation[] = availableActions.map(action => {
      const predictedState = this.model.predict(action, currentState);
      const uncertainty = this.model.getUncertainty(action);
      const efe = computeEFE(predictedState, preferredState, uncertainty, adjustedConfig);

      // Epistemic value = information gain from trying uncertain action
      const epistemicValue = uncertainty * adjustedConfig.epistemicWeight;

      // Pragmatic value = expected improvement toward preferred state
      const pragmaticValue = (1 - efe.risk) * adjustedConfig.pragmaticWeight;

      return {
        action,
        predictedState,
        efe,
        epistemicValue,
        pragmaticValue,
      };
    });

    // Select action with minimum EFE
    let bestEvaluation = evaluations[0];
    for (const evaluation of evaluations) {
      if (evaluation.efe.total < bestEvaluation.efe.total) {
        bestEvaluation = evaluation;
      }
    }

    return bestEvaluation;
  }

  /**
   * Adjust epistemic/pragmatic weights based on priority
   */
  private adjustWeightsForPriority(priority: Priority): ActiveInferenceConfig {
    const config = { ...this.config };

    switch (priority) {
      case 'survival':
        // In survival mode: pure pragmatic, no exploration
        config.epistemicWeight = 0;
        config.pragmaticWeight = 1;
        break;

      case 'integrity':
        // Integrity threatened: mostly pragmatic
        config.epistemicWeight = 0.1;
        config.pragmaticWeight = 0.9;
        break;

      case 'stability':
        // Stability issues: balanced but pragmatic-leaning
        config.epistemicWeight = 0.2;
        config.pragmaticWeight = 0.8;
        break;

      case 'growth':
        // Growth mode: more exploration
        config.epistemicWeight = 0.5;
        config.pragmaticWeight = 0.5;
        break;

      case 'rest':
        // At rest: can afford exploration
        config.epistemicWeight = 0.6;
        config.pragmaticWeight = 0.4;
        break;
    }

    return config;
  }

  /**
   * Update model after observing action outcome
   */
  recordObservation(
    action: Action,
    stateBefore: Feeling,
    stateAfter: Feeling,
    predicted: PredictedState
  ): void {
    const observation: ObservationRecord = {
      timestamp: new Date().toISOString(),
      action,
      stateBefore: {
        energy: stateBefore.energy,
        lyapunovV: stateBefore.lyapunovV,
        invariantsSatisfied: stateBefore.invariantsSatisfied,
        invariantsTotal: stateBefore.invariantsTotal,
        confidence: 1.0,
      },
      stateAfter: {
        energy: stateAfter.energy,
        lyapunovV: stateAfter.lyapunovV,
        invariantsSatisfied: stateAfter.invariantsSatisfied,
        invariantsTotal: stateAfter.invariantsTotal,
        confidence: 1.0,
      },
      predicted,
      predictionError: this.computePredictionError(predicted, stateAfter),
    };

    this.model.update(observation);
  }

  /**
   * Compute prediction error (surprise)
   */
  private computePredictionError(predicted: PredictedState, actual: Feeling): number {
    const energyError = Math.abs(predicted.energy - actual.energy);
    const vError = Math.abs(predicted.lyapunovV - actual.lyapunovV);
    const integrityError = Math.abs(
      predicted.invariantsSatisfied - actual.invariantsSatisfied
    ) / Math.max(1, predicted.invariantsTotal);

    return (energyError + vError + integrityError) / 3;
  }

  /**
   * Get model for inspection
   */
  getModel(): GenerativeModel {
    return this.model;
  }

  /**
   * Get configuration
   */
  getConfig(): ActiveInferenceConfig {
    return { ...this.config };
  }

  /**
   * Print active inference status
   */
  printStatus(): void {
    console.log('\n=== ACTIVE INFERENCE STATUS ===');
    console.log(`Enabled: ${this.config.enabled}`);
    console.log(`Epistemic Weight: ${(this.config.epistemicWeight * 100).toFixed(0)}%`);
    console.log(`Pragmatic Weight: ${(this.config.pragmaticWeight * 100).toFixed(0)}%`);
    console.log(`Learning Rate: ${this.config.learningRate}`);
    console.log('');
    console.log('--- Learned Action Effects ---');
    for (const [action, effects] of this.model.getActionEffects()) {
      console.log(`  ${action}:`);
      console.log(`    Energy: ${effects.energyDelta > 0 ? '+' : ''}${(effects.energyDelta * 100).toFixed(2)}%`);
      console.log(`    V: ${effects.vDelta > 0 ? '+' : ''}${effects.vDelta.toFixed(4)}`);
      console.log(`    Confidence: ${(effects.confidence * 100).toFixed(0)}%`);
    }
    console.log('');
    console.log(`Observations: ${this.model.getObservations().length}`);
    console.log('');
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create active inference engine
 */
export function createActiveInferenceEngine(
  config?: Partial<ActiveInferenceConfig>
): ActiveInferenceEngine {
  return new ActiveInferenceEngine(config);
}
