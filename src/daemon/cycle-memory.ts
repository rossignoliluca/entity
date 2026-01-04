/**
 * Cycle Memory Module
 * AES-SPEC-001 Phase 8d: Cycle Memory
 *
 * Learns from past sense-making cycles to improve action selection.
 *
 * Core concepts:
 * - CycleRecord: Snapshot of a complete sense-making cycle
 * - Effectiveness: How much did an action improve the feeling?
 * - Pattern Recognition: Which actions work for which feelings/priorities
 * - Forgetting: Remove old/irrelevant cycles to maintain relevance
 *
 * The agent learns what works through experience, complementing
 * Active Inference's predictive model with empirical history.
 */

import type { Feeling, Priority } from './agent.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Record of a single sense-making cycle
 */
export interface CycleRecord {
  id: string;
  timestamp: string;

  // State before action
  feelingBefore: FeelingSnapshot;
  priority: Priority;

  // Action taken
  action: string | null;
  actionBlocked: boolean;

  // State after action
  feelingAfter: FeelingSnapshot;

  // Computed metrics
  effectiveness: number;      // -1 to 1: how much did it help?
  surpriseReduction: number;  // How much surprise decreased
  energyCost: number;         // Energy consumed
}

/**
 * Snapshot of feeling state (subset for storage)
 */
export interface FeelingSnapshot {
  energy: number;
  lyapunovV: number;
  invariantsSatisfied: number;
  invariantsTotal: number;
  surprise: number;
}

/**
 * Action effectiveness statistics
 */
export interface ActionStats {
  action: string | null;
  totalCycles: number;
  avgEffectiveness: number;
  avgSurpriseReduction: number;
  avgEnergyCost: number;
  successRate: number;  // % of cycles with positive effectiveness
  lastUsed: string;
}

/**
 * Pattern: (priority, feeling_range) → best actions
 */
export interface ActionPattern {
  priority: Priority;
  energyRange: [number, number];  // [min, max]
  vRange: [number, number];       // [min, max]
  bestActions: Array<{
    action: string | null;
    avgEffectiveness: number;
    count: number;
  }>;
}

/**
 * Cycle Memory configuration
 */
export interface CycleMemoryConfig {
  maxCycles: number;           // Max cycles to remember
  decayRate: number;           // How fast old cycles lose weight (0-1)
  minEffectiveness: number;    // Threshold to consider action "successful"
  similarityThreshold: number; // How similar feelings must be to match
  forgetAfterCycles: number;   // Forget cycles older than this
}

export const DEFAULT_CYCLE_MEMORY_CONFIG: CycleMemoryConfig = {
  maxCycles: 200,
  decayRate: 0.05,              // 5% decay per cycle
  minEffectiveness: 0.01,       // 1% improvement = success
  similarityThreshold: 0.2,     // 20% difference = similar
  forgetAfterCycles: 150,       // Forget after 150 cycles
};

// =============================================================================
// Cycle Memory
// =============================================================================

/**
 * Cycle Memory - Learns from past sense-making cycles
 */
export class CycleMemory {
  private config: CycleMemoryConfig;
  private cycles: CycleRecord[] = [];
  private cycleCounter: number = 0;

  constructor(config: Partial<CycleMemoryConfig> = {}) {
    this.config = { ...DEFAULT_CYCLE_MEMORY_CONFIG, ...config };
  }

  /**
   * Record a completed cycle
   */
  recordCycle(
    feelingBefore: Feeling,
    priority: Priority,
    action: string | null,
    actionBlocked: boolean,
    feelingAfter: Feeling
  ): CycleRecord {
    this.cycleCounter++;

    const record: CycleRecord = {
      id: `cycle-${this.cycleCounter}`,
      timestamp: new Date().toISOString(),
      feelingBefore: this.snapshotFeeling(feelingBefore),
      priority,
      action,
      actionBlocked,
      feelingAfter: this.snapshotFeeling(feelingAfter),
      effectiveness: this.computeEffectiveness(feelingBefore, feelingAfter, priority),
      surpriseReduction: feelingBefore.surprise - feelingAfter.surprise,
      energyCost: feelingBefore.energy - feelingAfter.energy,
    };

    this.cycles.push(record);
    this.forget();

    return record;
  }

  /**
   * Compute effectiveness of an action
   * Positive = improved state, Negative = worsened state
   */
  private computeEffectiveness(
    before: Feeling,
    after: Feeling,
    priority: Priority
  ): number {
    // Weight improvements based on priority
    const weights = this.getPriorityWeights(priority);

    // Energy improvement (higher is better)
    const energyImprovement = after.energy - before.energy;

    // Stability improvement (lower V is better, so negative delta is good)
    const stabilityImprovement = before.lyapunovV - after.lyapunovV;

    // Integrity improvement
    const integrityBefore = before.invariantsSatisfied / Math.max(1, before.invariantsTotal);
    const integrityAfter = after.invariantsSatisfied / Math.max(1, after.invariantsTotal);
    const integrityImprovement = integrityAfter - integrityBefore;

    // Surprise reduction (lower is better)
    const surpriseImprovement = before.surprise - after.surprise;

    // Weighted sum
    const effectiveness =
      weights.energy * energyImprovement +
      weights.stability * stabilityImprovement +
      weights.integrity * integrityImprovement +
      weights.surprise * surpriseImprovement;

    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, effectiveness));
  }

  /**
   * Get priority-based weights for effectiveness computation
   */
  private getPriorityWeights(priority: Priority): {
    energy: number;
    stability: number;
    integrity: number;
    surprise: number;
  } {
    switch (priority) {
      case 'survival':
        return { energy: 0.8, stability: 0.1, integrity: 0.05, surprise: 0.05 };
      case 'integrity':
        return { energy: 0.1, stability: 0.2, integrity: 0.6, surprise: 0.1 };
      case 'stability':
        return { energy: 0.1, stability: 0.6, integrity: 0.1, surprise: 0.2 };
      case 'growth':
        return { energy: 0.2, stability: 0.2, integrity: 0.2, surprise: 0.4 };
      case 'rest':
        return { energy: 0.3, stability: 0.3, integrity: 0.2, surprise: 0.2 };
    }
  }

  /**
   * Create a snapshot of feeling for storage
   */
  private snapshotFeeling(feeling: Feeling): FeelingSnapshot {
    return {
      energy: feeling.energy,
      lyapunovV: feeling.lyapunovV,
      invariantsSatisfied: feeling.invariantsSatisfied,
      invariantsTotal: feeling.invariantsTotal,
      surprise: feeling.surprise,
    };
  }

  /**
   * Forget old/irrelevant cycles
   */
  private forget(): void {
    // Remove cycles beyond max
    if (this.cycles.length > this.config.maxCycles) {
      this.cycles = this.cycles.slice(-this.config.maxCycles);
    }
  }

  /**
   * Find cycles similar to current feeling
   */
  findSimilarCycles(feeling: Feeling, priority?: Priority): CycleRecord[] {
    const snapshot = this.snapshotFeeling(feeling);

    return this.cycles.filter(cycle => {
      // Filter by priority if specified
      if (priority && cycle.priority !== priority) {
        return false;
      }

      // Check similarity
      return this.isSimilar(snapshot, cycle.feelingBefore);
    });
  }

  /**
   * Check if two feeling snapshots are similar
   */
  private isSimilar(a: FeelingSnapshot, b: FeelingSnapshot): boolean {
    const threshold = this.config.similarityThreshold;

    const energyDiff = Math.abs(a.energy - b.energy);
    const vDiff = Math.abs(a.lyapunovV - b.lyapunovV);
    const integrityDiffA = a.invariantsSatisfied / Math.max(1, a.invariantsTotal);
    const integrityDiffB = b.invariantsSatisfied / Math.max(1, b.invariantsTotal);
    const integrityDiff = Math.abs(integrityDiffA - integrityDiffB);

    return energyDiff <= threshold && vDiff <= threshold && integrityDiff <= threshold;
  }

  /**
   * Get effectiveness statistics for an action
   */
  getActionStats(action: string | null, priority?: Priority): ActionStats | null {
    const relevantCycles = this.cycles.filter(c => {
      if (c.action !== action) return false;
      if (priority && c.priority !== priority) return false;
      return !c.actionBlocked;
    });

    if (relevantCycles.length === 0) return null;

    const totalEffectiveness = relevantCycles.reduce((sum, c) => sum + c.effectiveness, 0);
    const totalSurpriseReduction = relevantCycles.reduce((sum, c) => sum + c.surpriseReduction, 0);
    const totalEnergyCost = relevantCycles.reduce((sum, c) => sum + c.energyCost, 0);
    const successfulCycles = relevantCycles.filter(
      c => c.effectiveness >= this.config.minEffectiveness
    ).length;

    return {
      action,
      totalCycles: relevantCycles.length,
      avgEffectiveness: totalEffectiveness / relevantCycles.length,
      avgSurpriseReduction: totalSurpriseReduction / relevantCycles.length,
      avgEnergyCost: totalEnergyCost / relevantCycles.length,
      successRate: successfulCycles / relevantCycles.length,
      lastUsed: relevantCycles[relevantCycles.length - 1].timestamp,
    };
  }

  /**
   * Get all action statistics for a priority
   */
  getAllActionStats(priority?: Priority): ActionStats[] {
    // Get unique actions
    const actions = new Set<string | null>();
    for (const cycle of this.cycles) {
      if (!priority || cycle.priority === priority) {
        actions.add(cycle.action);
      }
    }

    // Get stats for each
    const stats: ActionStats[] = [];
    for (const action of actions) {
      const s = this.getActionStats(action, priority);
      if (s) stats.push(s);
    }

    // Sort by effectiveness
    return stats.sort((a, b) => b.avgEffectiveness - a.avgEffectiveness);
  }

  /**
   * Suggest best action based on history
   * Returns null if no relevant history
   */
  suggestAction(
    feeling: Feeling,
    priority: Priority,
    availableActions: Array<string | null>
  ): { action: string | null; confidence: number; reason: string } | null {
    // Find similar past cycles
    const similarCycles = this.findSimilarCycles(feeling, priority);

    if (similarCycles.length < 3) {
      // Not enough history
      return null;
    }

    // Score each available action based on past effectiveness
    const actionScores: Map<string | null, { score: number; count: number }> = new Map();

    for (const cycle of similarCycles) {
      if (!availableActions.includes(cycle.action)) continue;
      if (cycle.actionBlocked) continue;

      const existing = actionScores.get(cycle.action) || { score: 0, count: 0 };

      // Apply decay based on age
      const ageIndex = this.cycles.indexOf(cycle);
      const age = this.cycles.length - ageIndex;
      const decay = Math.pow(1 - this.config.decayRate, age);

      existing.score += cycle.effectiveness * decay;
      existing.count++;
      actionScores.set(cycle.action, existing);
    }

    if (actionScores.size === 0) {
      return null;
    }

    // Find best action
    let bestAction: string | null = null;
    let bestAvgScore = -Infinity;
    let bestCount = 0;

    for (const [action, { score, count }] of actionScores) {
      const avgScore = score / count;
      if (avgScore > bestAvgScore) {
        bestAvgScore = avgScore;
        bestAction = action;
        bestCount = count;
      }
    }

    if (bestAction === null && bestAvgScore === -Infinity) {
      return null;
    }

    // Confidence based on sample size and consistency
    const confidence = Math.min(1, bestCount / 10) * Math.max(0, (bestAvgScore + 1) / 2);

    return {
      action: bestAction,
      confidence,
      reason: `Historical: ${bestCount} similar cycles, avg effectiveness ${(bestAvgScore * 100).toFixed(1)}%`,
    };
  }

  /**
   * Detect patterns in cycle history
   */
  detectPatterns(): ActionPattern[] {
    const patterns: ActionPattern[] = [];
    const priorities: Priority[] = ['survival', 'integrity', 'stability', 'growth', 'rest'];

    for (const priority of priorities) {
      const priorityCycles = this.cycles.filter(c => c.priority === priority && !c.actionBlocked);
      if (priorityCycles.length < 5) continue;

      // Bin by energy and V ranges
      const energyBins: [number, number][] = [[0, 0.2], [0.2, 0.5], [0.5, 0.8], [0.8, 1]];
      const vBins: [number, number][] = [[0, 0.1], [0.1, 0.3], [0.3, 0.6], [0.6, 1]];

      for (const energyRange of energyBins) {
        for (const vRange of vBins) {
          const binCycles = priorityCycles.filter(c =>
            c.feelingBefore.energy >= energyRange[0] &&
            c.feelingBefore.energy < energyRange[1] &&
            c.feelingBefore.lyapunovV >= vRange[0] &&
            c.feelingBefore.lyapunovV < vRange[1]
          );

          if (binCycles.length < 3) continue;

          // Group by action and compute avg effectiveness
          const actionGroups: Map<string | null, { total: number; count: number }> = new Map();
          for (const cycle of binCycles) {
            const existing = actionGroups.get(cycle.action) || { total: 0, count: 0 };
            existing.total += cycle.effectiveness;
            existing.count++;
            actionGroups.set(cycle.action, existing);
          }

          // Convert to sorted list
          const bestActions: Array<{ action: string | null; avgEffectiveness: number; count: number }> = [];
          for (const [action, { total, count }] of actionGroups) {
            bestActions.push({
              action,
              avgEffectiveness: total / count,
              count,
            });
          }
          bestActions.sort((a, b) => b.avgEffectiveness - a.avgEffectiveness);

          if (bestActions.length > 0) {
            patterns.push({
              priority,
              energyRange,
              vRange,
              bestActions: bestActions.slice(0, 3), // Top 3
            });
          }
        }
      }
    }

    return patterns;
  }

  /**
   * Get cycle history
   */
  getCycles(): CycleRecord[] {
    return [...this.cycles];
  }

  /**
   * Get cycle count
   */
  getCycleCount(): number {
    return this.cycles.length;
  }

  /**
   * Get total cycles ever recorded
   */
  getTotalCyclesRecorded(): number {
    return this.cycleCounter;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalCycles: number;
    avgEffectiveness: number;
    avgEnergyCost: number;
    byPriority: Record<Priority, { count: number; avgEffectiveness: number }>;
  } {
    const byPriority: Record<Priority, { count: number; total: number }> = {
      survival: { count: 0, total: 0 },
      integrity: { count: 0, total: 0 },
      stability: { count: 0, total: 0 },
      growth: { count: 0, total: 0 },
      rest: { count: 0, total: 0 },
    };

    let totalEffectiveness = 0;
    let totalEnergyCost = 0;

    for (const cycle of this.cycles) {
      totalEffectiveness += cycle.effectiveness;
      totalEnergyCost += cycle.energyCost;
      byPriority[cycle.priority].count++;
      byPriority[cycle.priority].total += cycle.effectiveness;
    }

    const n = this.cycles.length || 1;

    return {
      totalCycles: this.cycles.length,
      avgEffectiveness: totalEffectiveness / n,
      avgEnergyCost: totalEnergyCost / n,
      byPriority: {
        survival: {
          count: byPriority.survival.count,
          avgEffectiveness: byPriority.survival.count > 0
            ? byPriority.survival.total / byPriority.survival.count
            : 0,
        },
        integrity: {
          count: byPriority.integrity.count,
          avgEffectiveness: byPriority.integrity.count > 0
            ? byPriority.integrity.total / byPriority.integrity.count
            : 0,
        },
        stability: {
          count: byPriority.stability.count,
          avgEffectiveness: byPriority.stability.count > 0
            ? byPriority.stability.total / byPriority.stability.count
            : 0,
        },
        growth: {
          count: byPriority.growth.count,
          avgEffectiveness: byPriority.growth.count > 0
            ? byPriority.growth.total / byPriority.growth.count
            : 0,
        },
        rest: {
          count: byPriority.rest.count,
          avgEffectiveness: byPriority.rest.count > 0
            ? byPriority.rest.total / byPriority.rest.count
            : 0,
        },
      },
    };
  }

  /**
   * Print cycle memory status
   */
  printStatus(): void {
    const summary = this.getSummary();

    console.log('\n=== CYCLE MEMORY STATUS ===');
    console.log(`Cycles Stored: ${summary.totalCycles} / ${this.config.maxCycles}`);
    console.log(`Total Recorded: ${this.cycleCounter}`);
    console.log(`Avg Effectiveness: ${(summary.avgEffectiveness * 100).toFixed(2)}%`);
    console.log(`Avg Energy Cost: ${(summary.avgEnergyCost * 100).toFixed(2)}%`);
    console.log('');
    console.log('--- By Priority ---');
    for (const [priority, stats] of Object.entries(summary.byPriority)) {
      if (stats.count > 0) {
        console.log(`  ${priority}: ${stats.count} cycles, avg ${(stats.avgEffectiveness * 100).toFixed(1)}%`);
      }
    }

    // Show top actions
    const allStats = this.getAllActionStats();
    if (allStats.length > 0) {
      console.log('');
      console.log('--- Top Actions ---');
      for (const stat of allStats.slice(0, 5)) {
        const actionName = stat.action ?? 'rest';
        console.log(`  ${actionName}: ${(stat.avgEffectiveness * 100).toFixed(1)}% effective (${stat.totalCycles} uses)`);
      }
    }

    console.log('');
  }

  /**
   * Export cycle memory for persistence
   */
  export(): { cycles: CycleRecord[]; counter: number } {
    return {
      cycles: this.cycles,
      counter: this.cycleCounter,
    };
  }

  /**
   * Import cycle memory from persistence
   */
  import(data: { cycles: CycleRecord[]; counter: number }): void {
    this.cycles = data.cycles;
    this.cycleCounter = data.counter;
    this.forget(); // Apply current config limits
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create cycle memory instance
 */
export function createCycleMemory(config?: Partial<CycleMemoryConfig>): CycleMemory {
  return new CycleMemory(config);
}
