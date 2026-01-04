/**
 * Cycle Memory Tests
 * AES-SPEC-001 Phase 8d: Cycle Memory
 *
 * Tests learning from past sense-making cycles:
 * - Recording cycles with effectiveness scoring
 * - Finding similar past cycles
 * - Action effectiveness statistics
 * - Pattern detection
 * - Forgetting old cycles
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  CycleMemory,
  createCycleMemory,
  DEFAULT_CYCLE_MEMORY_CONFIG,
  type CycleRecord,
  type FeelingSnapshot,
  type ActionStats,
  type ActionPattern,
} from '../src/daemon/cycle-memory.js';
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

function createImprovedFeeling(before: Feeling): Feeling {
  return {
    ...before,
    timestamp: new Date().toISOString(),
    energy: before.energy + 0.05,
    lyapunovV: Math.max(0, before.lyapunovV - 0.05),
    surprise: Math.max(0, before.surprise - 0.02),
  };
}

function createWorsenedFeeling(before: Feeling): Feeling {
  return {
    ...before,
    timestamp: new Date().toISOString(),
    energy: before.energy - 0.05,
    lyapunovV: before.lyapunovV + 0.05,
    surprise: before.surprise + 0.02,
  };
}

// =============================================================================
// CycleMemory Tests
// =============================================================================

describe('CycleMemory', () => {
  let memory: CycleMemory;

  beforeEach(() => {
    memory = new CycleMemory();
  });

  describe('Initialization', () => {
    it('should create with default config', () => {
      assert.ok(memory);
      assert.strictEqual(memory.getCycleCount(), 0);
      assert.strictEqual(memory.getTotalCyclesRecorded(), 0);
    });

    it('should accept custom config', () => {
      const customMemory = new CycleMemory({ maxCycles: 50 });
      assert.ok(customMemory);
    });
  });

  describe('Recording Cycles', () => {
    it('should record a cycle', () => {
      const before = createTestFeeling();
      const after = createImprovedFeeling(before);

      const record = memory.recordCycle(before, 'stability', 'state.summary', false, after);

      assert.ok(record);
      assert.ok(record.id.startsWith('cycle-'));
      assert.strictEqual(record.priority, 'stability');
      assert.strictEqual(record.action, 'state.summary');
      assert.strictEqual(record.actionBlocked, false);
      assert.strictEqual(memory.getCycleCount(), 1);
    });

    it('should compute positive effectiveness for improvement', () => {
      const before = createTestFeeling({ energy: 0.5, lyapunovV: 0.2 });
      const after = createTestFeeling({ energy: 0.55, lyapunovV: 0.1 });

      const record = memory.recordCycle(before, 'stability', 'state.summary', false, after);

      assert.ok(record.effectiveness > 0, 'Effectiveness should be positive for improvement');
    });

    it('should compute negative effectiveness for worsening', () => {
      const before = createTestFeeling({ energy: 0.5, lyapunovV: 0.1 });
      const after = createTestFeeling({ energy: 0.45, lyapunovV: 0.2 });

      const record = memory.recordCycle(before, 'stability', 'state.summary', false, after);

      assert.ok(record.effectiveness < 0, 'Effectiveness should be negative for worsening');
    });

    it('should track surprise reduction', () => {
      const before = createTestFeeling({ surprise: 0.3 });
      const after = createTestFeeling({ surprise: 0.1 });

      const record = memory.recordCycle(before, 'growth', 'system.health', false, after);

      // Use approximate comparison due to floating point
      assert.ok(Math.abs(record.surpriseReduction - 0.2) < 0.0001);
    });

    it('should track energy cost', () => {
      const before = createTestFeeling({ energy: 0.5 });
      const after = createTestFeeling({ energy: 0.48 });

      const record = memory.recordCycle(before, 'stability', 'state.summary', false, after);

      assert.ok(record.energyCost > 0);
    });

    it('should record blocked actions', () => {
      const before = createTestFeeling();
      const after = before; // No change when blocked

      const record = memory.recordCycle(before, 'stability', 'state.summary', true, after);

      assert.strictEqual(record.actionBlocked, true);
    });
  });

  describe('Finding Similar Cycles', () => {
    it('should find cycles with similar feelings', () => {
      // Record some cycles
      const feeling1 = createTestFeeling({ energy: 0.5, lyapunovV: 0.1 });
      const feeling2 = createTestFeeling({ energy: 0.52, lyapunovV: 0.08 }); // Similar
      const feeling3 = createTestFeeling({ energy: 0.2, lyapunovV: 0.5 }); // Different

      memory.recordCycle(feeling1, 'stability', 'state.summary', false, createImprovedFeeling(feeling1));
      memory.recordCycle(feeling3, 'survival', 'system.health', false, createImprovedFeeling(feeling3));

      // Search for similar to feeling2
      const similar = memory.findSimilarCycles(feeling2);

      assert.strictEqual(similar.length, 1);
      assert.strictEqual(similar[0].priority, 'stability');
    });

    it('should filter by priority', () => {
      const feeling = createTestFeeling({ energy: 0.5, lyapunovV: 0.1 });

      memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      memory.recordCycle(feeling, 'growth', 'system.health', false, createImprovedFeeling(feeling));

      const stabilityOnly = memory.findSimilarCycles(feeling, 'stability');

      assert.strictEqual(stabilityOnly.length, 1);
      assert.strictEqual(stabilityOnly[0].priority, 'stability');
    });

    it('should return empty for dissimilar feelings', () => {
      const feeling1 = createTestFeeling({ energy: 0.9, lyapunovV: 0.0 });
      const feeling2 = createTestFeeling({ energy: 0.1, lyapunovV: 0.8 });

      memory.recordCycle(feeling1, 'rest', null, false, feeling1);

      const similar = memory.findSimilarCycles(feeling2);

      assert.strictEqual(similar.length, 0);
    });
  });

  describe('Action Statistics', () => {
    it('should compute action stats', () => {
      const feeling = createTestFeeling();

      // Record multiple cycles with same action
      for (let i = 0; i < 5; i++) {
        memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      }

      const stats = memory.getActionStats('state.summary');

      assert.ok(stats);
      assert.strictEqual(stats.totalCycles, 5);
      assert.ok(stats.avgEffectiveness > 0);
    });

    it('should filter stats by priority', () => {
      const feeling = createTestFeeling();

      memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      memory.recordCycle(feeling, 'growth', 'state.summary', false, createImprovedFeeling(feeling));

      const stabilityStats = memory.getActionStats('state.summary', 'stability');

      assert.ok(stabilityStats);
      assert.strictEqual(stabilityStats.totalCycles, 1);
    });

    it('should return null for unknown action', () => {
      const stats = memory.getActionStats('unknown.action');
      assert.strictEqual(stats, null);
    });

    it('should compute success rate', () => {
      const feeling = createTestFeeling();

      // 3 successful, 2 unsuccessful
      for (let i = 0; i < 3; i++) {
        memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      }
      for (let i = 0; i < 2; i++) {
        memory.recordCycle(feeling, 'stability', 'state.summary', false, createWorsenedFeeling(feeling));
      }

      const stats = memory.getActionStats('state.summary');

      assert.ok(stats);
      assert.strictEqual(stats.totalCycles, 5);
      assert.ok(stats.successRate >= 0.5); // At least 3/5
    });

    it('should get all action stats sorted by effectiveness', () => {
      const feeling = createTestFeeling();

      memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      memory.recordCycle(feeling, 'stability', 'system.health', false, createWorsenedFeeling(feeling));

      const allStats = memory.getAllActionStats();

      assert.ok(allStats.length >= 2);
      // Should be sorted by effectiveness (descending)
      assert.ok(allStats[0].avgEffectiveness >= allStats[allStats.length - 1].avgEffectiveness);
    });
  });

  describe('Action Suggestions', () => {
    it('should suggest action based on history', () => {
      const feeling = createTestFeeling({ energy: 0.5, lyapunovV: 0.1 });

      // Build history with state.summary being more effective
      for (let i = 0; i < 10; i++) {
        memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      }
      for (let i = 0; i < 5; i++) {
        memory.recordCycle(feeling, 'stability', 'system.health', false, createWorsenedFeeling(feeling));
      }

      const suggestion = memory.suggestAction(feeling, 'stability', [null, 'state.summary', 'system.health']);

      assert.ok(suggestion);
      assert.strictEqual(suggestion.action, 'state.summary');
      assert.ok(suggestion.confidence > 0);
    });

    it('should return null with insufficient history', () => {
      const feeling = createTestFeeling();

      const suggestion = memory.suggestAction(feeling, 'stability', ['state.summary']);

      assert.strictEqual(suggestion, null);
    });

    it('should return null for dissimilar feelings', () => {
      const feeling1 = createTestFeeling({ energy: 0.9, lyapunovV: 0.0 });
      const feeling2 = createTestFeeling({ energy: 0.1, lyapunovV: 0.8 });

      for (let i = 0; i < 10; i++) {
        memory.recordCycle(feeling1, 'rest', null, false, feeling1);
      }

      const suggestion = memory.suggestAction(feeling2, 'survival', [null, 'state.summary']);

      assert.strictEqual(suggestion, null);
    });
  });

  describe('Pattern Detection', () => {
    it('should detect patterns in history', () => {
      // Build substantial history
      for (let i = 0; i < 20; i++) {
        const feeling = createTestFeeling({
          energy: 0.5 + Math.random() * 0.1,
          lyapunovV: 0.05 + Math.random() * 0.05,
        });
        memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      }

      const patterns = memory.detectPatterns();

      // Should detect at least one pattern for stability
      assert.ok(patterns.length > 0 || memory.getCycleCount() < 5);
    });

    it('should return empty patterns for insufficient data', () => {
      const patterns = memory.detectPatterns();
      assert.strictEqual(patterns.length, 0);
    });
  });

  describe('Forgetting', () => {
    it('should respect maxCycles limit', () => {
      const limitedMemory = new CycleMemory({ maxCycles: 5 });
      const feeling = createTestFeeling();

      for (let i = 0; i < 10; i++) {
        limitedMemory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      }

      assert.strictEqual(limitedMemory.getCycleCount(), 5);
      assert.strictEqual(limitedMemory.getTotalCyclesRecorded(), 10);
    });

    it('should keep most recent cycles', () => {
      const limitedMemory = new CycleMemory({ maxCycles: 3 });

      limitedMemory.recordCycle(createTestFeeling(), 'stability', 'action1', false, createTestFeeling());
      limitedMemory.recordCycle(createTestFeeling(), 'growth', 'action2', false, createTestFeeling());
      limitedMemory.recordCycle(createTestFeeling(), 'rest', 'action3', false, createTestFeeling());
      limitedMemory.recordCycle(createTestFeeling(), 'survival', 'action4', false, createTestFeeling());

      const cycles = limitedMemory.getCycles();

      assert.strictEqual(cycles.length, 3);
      // First cycle (action1) should be forgotten
      assert.ok(cycles.every(c => c.action !== 'action1'));
    });
  });

  describe('Summary Statistics', () => {
    it('should compute summary', () => {
      const feeling = createTestFeeling();

      memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));
      memory.recordCycle(feeling, 'growth', 'system.health', false, createImprovedFeeling(feeling));
      memory.recordCycle(feeling, 'rest', null, false, feeling);

      const summary = memory.getSummary();

      assert.strictEqual(summary.totalCycles, 3);
      assert.strictEqual(summary.byPriority.stability.count, 1);
      assert.strictEqual(summary.byPriority.growth.count, 1);
      assert.strictEqual(summary.byPriority.rest.count, 1);
    });

    it('should handle empty memory', () => {
      const summary = memory.getSummary();

      assert.strictEqual(summary.totalCycles, 0);
      assert.strictEqual(summary.avgEffectiveness, 0);
    });
  });

  describe('Export/Import', () => {
    it('should export cycle memory', () => {
      const feeling = createTestFeeling();
      memory.recordCycle(feeling, 'stability', 'state.summary', false, createImprovedFeeling(feeling));

      const exported = memory.export();

      assert.ok(exported.cycles);
      assert.strictEqual(exported.cycles.length, 1);
      assert.strictEqual(exported.counter, 1);
    });

    it('should import cycle memory', () => {
      const newMemory = new CycleMemory();
      const exported = {
        cycles: [{
          id: 'cycle-1',
          timestamp: new Date().toISOString(),
          feelingBefore: { energy: 0.5, lyapunovV: 0.1, invariantsSatisfied: 5, invariantsTotal: 5, surprise: 0.1 },
          priority: 'stability' as Priority,
          action: 'state.summary',
          actionBlocked: false,
          feelingAfter: { energy: 0.55, lyapunovV: 0.05, invariantsSatisfied: 5, invariantsTotal: 5, surprise: 0.05 },
          effectiveness: 0.1,
          surpriseReduction: 0.05,
          energyCost: 0.01,
        }],
        counter: 1,
      };

      newMemory.import(exported);

      assert.strictEqual(newMemory.getCycleCount(), 1);
      assert.strictEqual(newMemory.getTotalCyclesRecorded(), 1);
    });
  });
});

// =============================================================================
// Factory Tests
// =============================================================================

describe('createCycleMemory', () => {
  it('should create memory via factory', () => {
    const memory = createCycleMemory();
    assert.ok(memory);
  });

  it('should pass config to factory', () => {
    const memory = createCycleMemory({ maxCycles: 50 });
    assert.ok(memory);
  });
});

// =============================================================================
// Default Config Tests
// =============================================================================

describe('Default Configuration', () => {
  it('should have reasonable defaults', () => {
    assert.strictEqual(DEFAULT_CYCLE_MEMORY_CONFIG.maxCycles, 200);
    assert.strictEqual(DEFAULT_CYCLE_MEMORY_CONFIG.decayRate, 0.05);
    assert.strictEqual(DEFAULT_CYCLE_MEMORY_CONFIG.minEffectiveness, 0.01);
    assert.strictEqual(DEFAULT_CYCLE_MEMORY_CONFIG.similarityThreshold, 0.2);
    assert.strictEqual(DEFAULT_CYCLE_MEMORY_CONFIG.forgetAfterCycles, 150);
  });
});

// =============================================================================
// Priority-based Effectiveness Tests
// =============================================================================

describe('Priority-based Effectiveness', () => {
  let memory: CycleMemory;

  beforeEach(() => {
    memory = new CycleMemory();
  });

  it('should weight energy highly for survival priority', () => {
    const beforeLowEnergy = createTestFeeling({ energy: 0.1 });
    const afterHigherEnergy = createTestFeeling({ energy: 0.2 });

    const record = memory.recordCycle(beforeLowEnergy, 'survival', 'recharge', false, afterHigherEnergy);

    // Energy improvement should give high effectiveness for survival
    assert.ok(record.effectiveness > 0);
  });

  it('should weight stability highly for stability priority', () => {
    const beforeUnstable = createTestFeeling({ lyapunovV: 0.5 });
    const afterStable = createTestFeeling({ lyapunovV: 0.1 });

    const record = memory.recordCycle(beforeUnstable, 'stability', 'state.summary', false, afterStable);

    // V reduction should give high effectiveness for stability
    assert.ok(record.effectiveness > 0);
  });

  it('should weight surprise reduction highly for growth priority', () => {
    const beforeSurprised = createTestFeeling({ surprise: 0.5 });
    const afterLessSurprised = createTestFeeling({ surprise: 0.1 });

    const record = memory.recordCycle(beforeSurprised, 'growth', 'system.health', false, afterLessSurprised);

    // Surprise reduction should contribute to effectiveness for growth
    assert.ok(record.effectiveness > 0);
  });
});
