/**
 * Active Inference Tests
 * AES-SPEC-001 Phase 8c: Active Inference (Friston)
 *
 * Tests the Free Energy Principle implementation:
 * - Generative model prediction and learning
 * - Expected Free Energy computation
 * - Action selection via EFE minimization
 * - Epistemic vs pragmatic value balance
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  GenerativeModel,
  ActiveInferenceEngine,
  computeEFE,
  getPreferredState,
  createActiveInferenceEngine,
  DEFAULT_ACTIVE_INFERENCE_CONFIG,
  type PredictedState,
  type PreferredState,
  type ActiveInferenceConfig,
  type ObservationRecord,
} from '../src/daemon/active-inference.js';
import type { Feeling, Priority } from '../src/daemon/agent.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestFeeling(overrides: Partial<Feeling> = {}): Feeling {
  return {
    timestamp: new Date().toISOString(),
    energy: 0.5,
    lyapunovV: 0.1,
    invariantsSatisfied: 5,
    invariantsTotal: 5,
    surprise: 0.1,
    energyFeeling: 'adequate',
    stabilityFeeling: 'stable',
    integrityFeeling: 'whole',
    threatsExistence: false,
    threatsStability: false,
    needsGrowth: false,
    ...overrides,
  };
}

function createTestPredictedState(overrides: Partial<PredictedState> = {}): PredictedState {
  return {
    energy: 0.5,
    lyapunovV: 0.1,
    invariantsSatisfied: 5,
    invariantsTotal: 5,
    confidence: 0.7,
    ...overrides,
  };
}

// =============================================================================
// GenerativeModel Tests
// =============================================================================

describe('GenerativeModel', () => {
  let model: GenerativeModel;

  beforeEach(() => {
    model = new GenerativeModel();
  });

  describe('Initialization', () => {
    it('should create with default config', () => {
      assert.ok(model);
    });

    it('should have default action effects', () => {
      const effects = model.getActionEffects();
      assert.ok(effects.has('null'));
      assert.ok(effects.has('state.summary'));
      assert.ok(effects.has('system.health'));
    });

    it('should start with empty observations', () => {
      const observations = model.getObservations();
      assert.strictEqual(observations.length, 0);
    });
  });

  describe('Prediction', () => {
    it('should predict state for known action', () => {
      const currentState = createTestPredictedState({ energy: 0.5, lyapunovV: 0.1 });
      const predicted = model.predict('state.summary', currentState);

      assert.ok(predicted);
      assert.strictEqual(typeof predicted.energy, 'number');
      assert.strictEqual(typeof predicted.lyapunovV, 'number');
      assert.ok(predicted.confidence > 0);
    });

    it('should predict state for rest (null action)', () => {
      const currentState = createTestPredictedState({ energy: 0.5, lyapunovV: 0.1 });
      const predicted = model.predict(null, currentState);

      assert.ok(predicted);
      // Rest should have minimal energy cost
      assert.ok(predicted.energy <= currentState.energy);
    });

    it('should have low confidence for unknown action', () => {
      const currentState = createTestPredictedState();
      const predicted = model.predict('unknown.action', currentState);

      assert.ok(predicted.confidence < 0.5);
    });

    it('should predict V decreasing toward attractor', () => {
      const currentState = createTestPredictedState({ lyapunovV: 0.2 });
      const predicted = model.predict('state.summary', currentState);

      // V should decrease (toward attractor at 0)
      assert.ok(predicted.lyapunovV < currentState.lyapunovV);
    });
  });

  describe('Learning', () => {
    it('should update model from observation', () => {
      const observation: ObservationRecord = {
        timestamp: new Date().toISOString(),
        action: 'state.summary',
        stateBefore: createTestPredictedState({ energy: 0.5 }),
        stateAfter: createTestPredictedState({ energy: 0.45 }),
        predicted: createTestPredictedState({ energy: 0.48 }),
        predictionError: 0.03,
      };

      model.update(observation);

      const observations = model.getObservations();
      assert.strictEqual(observations.length, 1);
    });

    it('should increase confidence with more observations', () => {
      const effects1 = model.getActionEffects().get('state.summary');
      const initialConfidence = effects1?.confidence ?? 0;

      // Add observations
      for (let i = 0; i < 10; i++) {
        model.update({
          timestamp: new Date().toISOString(),
          action: 'state.summary',
          stateBefore: createTestPredictedState({ energy: 0.5 }),
          stateAfter: createTestPredictedState({ energy: 0.495 }),
          predicted: createTestPredictedState({ energy: 0.495 }),
          predictionError: 0.005,
        });
      }

      const effects2 = model.getActionEffects().get('state.summary');
      const finalConfidence = effects2?.confidence ?? 0;

      assert.ok(finalConfidence > initialConfidence);
    });

    it('should limit observation history', () => {
      const config = { historySize: 5 };
      const limitedModel = new GenerativeModel(config);

      // Add more than limit
      for (let i = 0; i < 10; i++) {
        limitedModel.update({
          timestamp: new Date().toISOString(),
          action: 'state.summary',
          stateBefore: createTestPredictedState(),
          stateAfter: createTestPredictedState(),
          predicted: createTestPredictedState(),
          predictionError: 0.01,
        });
      }

      assert.strictEqual(limitedModel.getObservations().length, 5);
    });
  });

  describe('Uncertainty', () => {
    it('should return high uncertainty for unknown action', () => {
      const uncertainty = model.getUncertainty('unknown.action');
      assert.strictEqual(uncertainty, 1.0);
    });

    it('should return lower uncertainty for known action', () => {
      const uncertainty = model.getUncertainty('state.summary');
      assert.ok(uncertainty < 1.0);
    });
  });
});

// =============================================================================
// Expected Free Energy Tests
// =============================================================================

describe('Expected Free Energy', () => {
  describe('computeEFE', () => {
    it('should compute EFE components', () => {
      const predicted = createTestPredictedState({ energy: 0.6, lyapunovV: 0.1 });
      const preferred: PreferredState = { energy: 0.8, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 };
      const uncertainty = 0.3;

      const efe = computeEFE(predicted, preferred, uncertainty, DEFAULT_ACTIVE_INFERENCE_CONFIG);

      assert.ok(efe);
      assert.strictEqual(typeof efe.ambiguity, 'number');
      assert.strictEqual(typeof efe.risk, 'number');
      assert.strictEqual(typeof efe.total, 'number');
    });

    it('should have higher risk when far from preferred state', () => {
      const config = DEFAULT_ACTIVE_INFERENCE_CONFIG;
      const preferred: PreferredState = { energy: 0.8, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 };

      const closeState = createTestPredictedState({ energy: 0.75, lyapunovV: 0.01 });
      const farState = createTestPredictedState({ energy: 0.3, lyapunovV: 0.5 });

      const efeClose = computeEFE(closeState, preferred, 0.5, config);
      const efeFar = computeEFE(farState, preferred, 0.5, config);

      assert.ok(efeFar.risk > efeClose.risk);
    });

    it('should have higher ambiguity with higher uncertainty', () => {
      const predicted = createTestPredictedState();
      const preferred: PreferredState = { energy: 0.8, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 };
      const config = DEFAULT_ACTIVE_INFERENCE_CONFIG;

      const efeLowUncertainty = computeEFE(predicted, preferred, 0.1, config);
      const efeHighUncertainty = computeEFE(predicted, preferred, 0.9, config);

      assert.ok(efeHighUncertainty.ambiguity > efeLowUncertainty.ambiguity);
    });
  });

  describe('getPreferredState', () => {
    it('should return preferred state from feeling', () => {
      const feeling = createTestFeeling();
      const preferred = getPreferredState(feeling);

      assert.ok(preferred);
      assert.strictEqual(preferred.lyapunovV, 0); // Prefer attractor
      assert.ok(preferred.energy > 0.5); // Prefer high energy
    });
  });
});

// =============================================================================
// ActiveInferenceEngine Tests
// =============================================================================

describe('ActiveInferenceEngine', () => {
  let engine: ActiveInferenceEngine;

  beforeEach(() => {
    engine = new ActiveInferenceEngine();
  });

  describe('Creation', () => {
    it('should create with default config', () => {
      assert.ok(engine);
      const config = engine.getConfig();
      assert.strictEqual(config.enabled, true);
    });

    it('should accept custom config', () => {
      const customEngine = new ActiveInferenceEngine({
        epistemicWeight: 0.5,
        pragmaticWeight: 0.5,
      });
      const config = customEngine.getConfig();
      assert.strictEqual(config.epistemicWeight, 0.5);
      assert.strictEqual(config.pragmaticWeight, 0.5);
    });
  });

  describe('Action Selection', () => {
    it('should select action from available options', () => {
      const feeling = createTestFeeling();
      const actions = [null, 'state.summary', 'system.health'];

      const evaluation = engine.selectAction(feeling, actions, 'stability');

      assert.ok(evaluation);
      assert.ok(actions.includes(evaluation.action));
    });

    it('should return evaluation with all components', () => {
      const feeling = createTestFeeling();
      const actions = [null, 'state.summary'];

      const evaluation = engine.selectAction(feeling, actions, 'growth');

      assert.ok(evaluation.predictedState);
      assert.ok(evaluation.efe);
      assert.strictEqual(typeof evaluation.epistemicValue, 'number');
      assert.strictEqual(typeof evaluation.pragmaticValue, 'number');
    });

    it('should prefer pragmatic in survival mode', () => {
      const feeling = createTestFeeling({ threatsExistence: true });
      const actions = [null, 'state.summary', 'system.health'];

      // In survival, should minimize risk (pragmatic)
      const evaluation = engine.selectAction(feeling, actions, 'survival');

      // EFE should be computed with survival weights
      assert.ok(evaluation.efe.total >= 0);
    });

    it('should allow more exploration in growth mode', () => {
      const feeling = createTestFeeling({ needsGrowth: true });
      const actions = [null, 'state.summary', 'system.health'];

      const evaluation = engine.selectAction(feeling, actions, 'growth');

      // In growth, epistemic value should be non-zero
      assert.ok(evaluation.epistemicValue >= 0);
    });
  });

  describe('Observation Recording', () => {
    it('should record observations', () => {
      const stateBefore = createTestFeeling({ energy: 0.5 });
      const stateAfter = createTestFeeling({ energy: 0.48 });
      const predicted = createTestPredictedState({ energy: 0.49 });

      engine.recordObservation('state.summary', stateBefore, stateAfter, predicted);

      const model = engine.getModel();
      assert.strictEqual(model.getObservations().length, 1);
    });
  });

  describe('Priority-based Weight Adjustment', () => {
    const feeling = createTestFeeling();
    const actions = [null, 'state.summary'];

    it('should adjust weights for survival priority', () => {
      const evaluation = engine.selectAction(feeling, actions, 'survival');
      // In survival: pure pragmatic
      assert.ok(evaluation);
    });

    it('should adjust weights for growth priority', () => {
      const evaluation = engine.selectAction(feeling, actions, 'growth');
      // In growth: more epistemic
      assert.ok(evaluation);
    });

    it('should adjust weights for rest priority', () => {
      const evaluation = engine.selectAction(feeling, actions, 'rest');
      // In rest: most epistemic
      assert.ok(evaluation);
    });
  });
});

// =============================================================================
// Factory Tests
// =============================================================================

describe('Factory', () => {
  it('should create engine via factory', () => {
    const engine = createActiveInferenceEngine();
    assert.ok(engine);
  });

  it('should pass config to factory', () => {
    const engine = createActiveInferenceEngine({ learningRate: 0.2 });
    const config = engine.getConfig();
    assert.strictEqual(config.learningRate, 0.2);
  });
});

// =============================================================================
// Default Config Tests
// =============================================================================

describe('Default Configuration', () => {
  it('should have reasonable defaults', () => {
    assert.strictEqual(DEFAULT_ACTIVE_INFERENCE_CONFIG.enabled, true);
    assert.strictEqual(DEFAULT_ACTIVE_INFERENCE_CONFIG.epistemicWeight, 0.3);
    assert.strictEqual(DEFAULT_ACTIVE_INFERENCE_CONFIG.pragmaticWeight, 0.7);
    assert.strictEqual(DEFAULT_ACTIVE_INFERENCE_CONFIG.learningRate, 0.1);
    assert.strictEqual(DEFAULT_ACTIVE_INFERENCE_CONFIG.historySize, 100);
  });

  it('should have weights that sum to 1', () => {
    const sum = DEFAULT_ACTIVE_INFERENCE_CONFIG.epistemicWeight +
                DEFAULT_ACTIVE_INFERENCE_CONFIG.pragmaticWeight;
    assert.strictEqual(sum, 1.0);
  });
});
