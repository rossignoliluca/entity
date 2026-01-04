/**
 * Lyapunov Function V(σ)
 *
 * DEF-038: V: Σ → ℝ≥0
 * Annex B: Concrete specification
 *
 * INV-004: V(σ') ≤ V(σ)
 */

import type { State, Config, InvariantCheck } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * Compute integrity distance
 * Fraction of violated invariants
 */
export function integrityDistance(
  invariants: InvariantCheck[]
): number {
  if (invariants.length === 0) return 0;

  const violated = invariants.filter((inv) => !inv.satisfied).length;
  return violated / invariants.length;
}

/**
 * Compute coherence distance
 * 1 - (satisfied / total)
 */
export function coherenceDistance(
  invariants: InvariantCheck[]
): number {
  if (invariants.length === 0) return 0;

  const satisfied = invariants.filter((inv) => inv.satisfied).length;
  return 1 - satisfied / invariants.length;
}

/**
 * Compute energy distance
 * Distance from threshold, normalized
 */
export function energyDistance(
  energy: number,
  threshold: number
): number {
  if (energy >= threshold) return 0;
  return Math.max(0, threshold - energy) / threshold;
}

/**
 * Compute Lyapunov function V(σ)
 *
 * V(σ) = w₁ · IntegrityDistance(σ)
 *      + w₂ · CoherenceDistance(σ)
 *      + w₃ · EnergyDistance(σ)
 *
 * Properties:
 * - V(σ) = 0 ⟺ σ ∈ Attractor (all invariants satisfied, energy good)
 * - V(σ) ≥ 0 always
 * - V must never increase (INV-004)
 */
export function computeV(
  state: State,
  invariants: InvariantCheck[],
  config: Config = DEFAULT_CONFIG
): number {
  const d_integrity = integrityDistance(invariants);
  const d_coherence = coherenceDistance(invariants);
  const d_energy = energyDistance(state.energy.current, state.energy.threshold);

  const V =
    config.w1 * d_integrity +
    config.w2 * d_coherence +
    config.w3 * d_energy;

  return Math.max(0, V); // Ensure non-negative
}

/**
 * Check if V is non-increasing (INV-004)
 */
export function checkLyapunovMonotone(
  V_current: number,
  V_previous: number | null
): boolean {
  if (V_previous === null) return true; // No previous, ok
  return V_current <= V_previous;
}

/**
 * Check if system is at attractor
 */
export function isAtAttractor(V: number, epsilon: number = 0.001): boolean {
  return V < epsilon;
}

/**
 * Compute stability margin
 * How far from degraded/dormant state
 */
export function stabilityMargin(
  state: State,
  config: Config = DEFAULT_CONFIG
): number {
  const energyMargin =
    (state.energy.current - config.E_min) /
    (config.E_threshold - config.E_min);

  return Math.max(0, Math.min(1, energyMargin));
}

/**
 * Predict steps to attractor (rough estimate)
 * Based on current V and typical decay rate
 */
export function estimateConvergenceSteps(
  V_current: number,
  V_previous: number | null,
  epsilon: number = 0.01
): number | null {
  if (V_current < epsilon) return 0;
  if (V_previous === null) return null;

  const decay = V_previous - V_current;
  if (decay <= 0) return null; // Not converging

  return Math.ceil(V_current / decay);
}
