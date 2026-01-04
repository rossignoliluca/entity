/**
 * Analytics & Insights Dashboard
 * AES-SPEC-001 Phase 5: Analytics & Insights
 *
 * Provides comprehensive metrics and visualizations for system health
 */

import type { Event, State, Timestamp } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface SessionMetrics {
  total: number;
  avgEventsPerSession: number;
  avgDurationMs: number;
  longestSessionEvents: number;
  shortestSessionEvents: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface EnergyMetrics {
  current: number;
  min: number;
  threshold: number;
  avgConsumptionPerSession: number;
  totalConsumed: number;
  totalRecharged: number;
  rechargeCount: number;
  projectedSessionsRemaining: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
}

export interface InvariantMetrics {
  totalVerifications: number;
  successRate: number;
  lastVerification: Timestamp | null;
  violationHistory: { timestamp: Timestamp; invariant: string }[];
  avgTimeBetweenVerifications: number;
  healthScore: number; // 0-100
}

export interface InteractionMetrics {
  totalOperations: number;
  successfulOperations: number;
  blockedOperations: number;
  successRate: number;
  operationsByCategory: Record<string, number>;
  topOperations: { id: string; count: number }[];
  avgOperationsPerSession: number;
}

export interface AnalyticsDashboard {
  generated: Timestamp;
  session: SessionMetrics;
  energy: EnergyMetrics;
  invariants: InvariantMetrics;
  interactions: InteractionMetrics;
  timeline: TimelineEntry[];
  alerts: Alert[];
}

export interface TimelineEntry {
  timestamp: Timestamp;
  type: 'session' | 'verification' | 'recharge' | 'violation' | 'milestone';
  description: string;
}

export interface Alert {
  level: 'info' | 'warning' | 'critical';
  message: string;
  recommendation?: string;
}

// ============================================================================
// Analytics Functions
// ============================================================================

/**
 * Generate full analytics dashboard
 */
export function generateDashboard(events: Event[], state: State): AnalyticsDashboard {
  return {
    generated: new Date().toISOString() as Timestamp,
    session: computeSessionMetrics(events),
    energy: computeEnergyMetrics(events, state),
    invariants: computeInvariantMetrics(events),
    interactions: computeInteractionMetrics(events),
    timeline: generateTimeline(events),
    alerts: generateAlerts(events, state),
  };
}

/**
 * Compute session metrics
 */
export function computeSessionMetrics(events: Event[]): SessionMetrics {
  const sessions: { start: Date; end: Date | null; eventCount: number }[] = [];
  let currentSession: { start: Date; eventCount: number } | null = null;

  for (const event of events) {
    if (event.type === 'SESSION_START') {
      currentSession = { start: new Date(event.timestamp), eventCount: 1 };
    } else if (event.type === 'SESSION_END' && currentSession) {
      sessions.push({
        start: currentSession.start,
        end: new Date(event.timestamp),
        eventCount: currentSession.eventCount,
      });
      currentSession = null;
    } else if (currentSession) {
      currentSession.eventCount++;
    }
  }

  if (sessions.length === 0) {
    return {
      total: 0,
      avgEventsPerSession: 0,
      avgDurationMs: 0,
      longestSessionEvents: 0,
      shortestSessionEvents: 0,
      sessionsToday: 0,
      sessionsThisWeek: 0,
      trend: 'stable',
    };
  }

  const eventCounts = sessions.map((s) => s.eventCount);
  const durations = sessions.filter((s) => s.end).map((s) => s.end!.getTime() - s.start.getTime());

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const sessionsToday = sessions.filter((s) => s.start >= todayStart).length;
  const sessionsThisWeek = sessions.filter((s) => s.start >= weekStart).length;

  // Calculate trend based on recent vs earlier sessions
  const midpoint = Math.floor(sessions.length / 2);
  const recentAvg = sessions.slice(midpoint).length / Math.max(1, sessions.length - midpoint);
  const earlierAvg = sessions.slice(0, midpoint).length / Math.max(1, midpoint);
  let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (recentAvg > earlierAvg * 1.2) trend = 'increasing';
  else if (recentAvg < earlierAvg * 0.8) trend = 'decreasing';

  return {
    total: sessions.length,
    avgEventsPerSession: eventCounts.reduce((a, b) => a + b, 0) / sessions.length,
    avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    longestSessionEvents: Math.max(...eventCounts),
    shortestSessionEvents: Math.min(...eventCounts),
    sessionsToday,
    sessionsThisWeek,
    trend,
  };
}

/**
 * Compute energy metrics
 */
export function computeEnergyMetrics(events: Event[], state: State): EnergyMetrics {
  let totalConsumed = 0;
  let totalRecharged = 0;
  let rechargeCount = 0;
  let sessionCount = 0;

  for (const event of events) {
    if (event.type === 'SESSION_START') {
      sessionCount++;
    }
    if (event.type === 'OPERATION' && event.data.energy_cost) {
      totalConsumed += event.data.energy_cost as number;
    }
    if (event.type === 'STATE_UPDATE' && event.data.recharge_amount) {
      totalRecharged += event.data.recharge_amount as number;
      rechargeCount++;
    }
  }

  const avgConsumption = sessionCount > 0 ? totalConsumed / sessionCount : 0;
  const sessionsRemaining = avgConsumption > 0
    ? Math.floor((state.energy.current - state.energy.min) / (avgConsumption + 0.05)) // +0.05 for session decay
    : Infinity;

  let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (state.energy.current < state.energy.min * 2) {
    healthStatus = 'critical';
  } else if (state.energy.current < state.energy.threshold) {
    healthStatus = 'warning';
  }

  return {
    current: state.energy.current,
    min: state.energy.min,
    threshold: state.energy.threshold,
    avgConsumptionPerSession: avgConsumption,
    totalConsumed,
    totalRecharged,
    rechargeCount,
    projectedSessionsRemaining: sessionsRemaining === Infinity ? 999 : sessionsRemaining,
    healthStatus,
  };
}

/**
 * Compute invariant metrics
 */
export function computeInvariantMetrics(events: Event[]): InvariantMetrics {
  const verifications = events.filter((e) => e.type === 'VERIFICATION');
  const violations: { timestamp: Timestamp; invariant: string }[] = [];

  let successCount = 0;
  for (const v of verifications) {
    if (v.data.all_satisfied) {
      successCount++;
    } else {
      violations.push({
        timestamp: v.timestamp,
        invariant: 'unknown', // Could be enhanced to track specific invariant
      });
    }
  }

  // Calculate average time between verifications
  let avgTimeBetween = 0;
  if (verifications.length > 1) {
    const times = verifications.map((v) => new Date(v.timestamp).getTime());
    const diffs: number[] = [];
    for (let i = 1; i < times.length; i++) {
      diffs.push(times[i] - times[i - 1]);
    }
    avgTimeBetween = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  // Health score: based on success rate and recency
  const successRate = verifications.length > 0 ? successCount / verifications.length : 1;
  const lastVerification = verifications.length > 0 ? verifications[verifications.length - 1].timestamp : null;
  const healthScore = Math.round(successRate * 100);

  return {
    totalVerifications: verifications.length,
    successRate,
    lastVerification,
    violationHistory: violations,
    avgTimeBetweenVerifications: avgTimeBetween,
    healthScore,
  };
}

/**
 * Compute interaction metrics
 */
export function computeInteractionMetrics(events: Event[]): InteractionMetrics {
  const operations = events.filter((e) => e.type === 'OPERATION');
  const blocks = events.filter((e) => e.type === 'BLOCK');
  const sessions = events.filter((e) => e.type === 'SESSION_START');

  const operationsByCategory: Record<string, number> = {};
  const operationCounts: Record<string, number> = {};

  for (const op of operations) {
    const opId = op.data.operation as string;
    if (opId) {
      const category = opId.split('.')[0];
      operationsByCategory[category] = (operationsByCategory[category] || 0) + 1;
      operationCounts[opId] = (operationCounts[opId] || 0) + 1;
    }
  }

  const topOperations = Object.entries(operationCounts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalOps = operations.length;
  const blockedOps = blocks.length;
  const successfulOps = totalOps; // Operations that got through are successful

  return {
    totalOperations: totalOps,
    successfulOperations: successfulOps,
    blockedOperations: blockedOps,
    successRate: totalOps + blockedOps > 0 ? totalOps / (totalOps + blockedOps) : 1,
    operationsByCategory,
    topOperations,
    avgOperationsPerSession: sessions.length > 0 ? totalOps / sessions.length : 0,
  };
}

/**
 * Generate timeline of significant events
 */
export function generateTimeline(events: Event[]): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  let sessionCount = 0;

  for (const event of events) {
    switch (event.type) {
      case 'SESSION_START':
        sessionCount++;
        if (sessionCount === 1 || sessionCount % 10 === 0) {
          timeline.push({
            timestamp: event.timestamp,
            type: 'milestone',
            description: `Session ${sessionCount} started`,
          });
        }
        break;

      case 'VERIFICATION':
        if (!event.data.all_satisfied) {
          timeline.push({
            timestamp: event.timestamp,
            type: 'violation',
            description: `Invariant violation detected`,
          });
        }
        break;

      case 'STATE_UPDATE':
        if (event.data.recharge_amount) {
          timeline.push({
            timestamp: event.timestamp,
            type: 'recharge',
            description: `Energy recharged (+${event.data.recharge_amount})`,
          });
        }
        break;
    }
  }

  // Keep only last 20 entries
  return timeline.slice(-20);
}

/**
 * Generate alerts based on current state
 */
export function generateAlerts(events: Event[], state: State): Alert[] {
  const alerts: Alert[] = [];

  // Energy alerts
  if (state.energy.current < state.energy.min * 2) {
    alerts.push({
      level: 'critical',
      message: `Energy critically low: ${(state.energy.current * 100).toFixed(1)}%`,
      recommendation: 'Recharge immediately to avoid dormant state',
    });
  } else if (state.energy.current < state.energy.threshold) {
    alerts.push({
      level: 'warning',
      message: `Energy below threshold: ${(state.energy.current * 100).toFixed(1)}%`,
      recommendation: 'Consider recharging soon',
    });
  }

  // Invariant alerts
  const recentVerifications = events
    .filter((e) => e.type === 'VERIFICATION')
    .slice(-5);
  const recentFailures = recentVerifications.filter((v) => !v.data.all_satisfied);
  if (recentFailures.length > 0) {
    alerts.push({
      level: 'warning',
      message: `${recentFailures.length} invariant violations in recent verifications`,
      recommendation: 'Run recovery procedure',
    });
  }

  // Status alerts
  if (state.integrity.status === 'degraded') {
    alerts.push({
      level: 'warning',
      message: 'System in degraded state',
      recommendation: 'Verify invariants and recover if needed',
    });
  } else if (state.integrity.status === 'dormant') {
    alerts.push({
      level: 'critical',
      message: 'System in dormant state',
      recommendation: 'Recharge energy to restore operation',
    });
  }

  // Session frequency
  const sessions = events.filter((e) => e.type === 'SESSION_START');
  if (sessions.length > 0) {
    const lastSession = new Date(sessions[sessions.length - 1].timestamp);
    const hoursSinceLastSession = (Date.now() - lastSession.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastSession > 24) {
      alerts.push({
        level: 'info',
        message: `No sessions in ${Math.floor(hoursSinceLastSession)} hours`,
        recommendation: 'System is idle',
      });
    }
  }

  return alerts;
}

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Print full analytics dashboard
 */
export function printDashboard(dashboard: AnalyticsDashboard): void {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        ENTITY ANALYTICS DASHBOARD                         ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log(`║ Generated: ${dashboard.generated.padEnd(63)}║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  // Alerts first if any
  if (dashboard.alerts.length > 0) {
    console.log('┌─ ALERTS ─────────────────────────────────────────────────────────────────┐');
    for (const alert of dashboard.alerts) {
      const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '🔵';
      console.log(`│ ${icon} [${alert.level.toUpperCase()}] ${alert.message.padEnd(54)}│`);
      if (alert.recommendation) {
        console.log(`│    └─ ${alert.recommendation.padEnd(65)}│`);
      }
    }
    console.log('└───────────────────────────────────────────────────────────────────────────┘\n');
  }

  // Session metrics
  printSessionMetrics(dashboard.session);

  // Energy metrics
  printEnergyMetrics(dashboard.energy);

  // Invariant metrics
  printInvariantMetrics(dashboard.invariants);

  // Interaction metrics
  printInteractionMetrics(dashboard.interactions);

  // Timeline
  if (dashboard.timeline.length > 0) {
    printTimeline(dashboard.timeline);
  }
}

function printSessionMetrics(m: SessionMetrics): void {
  console.log('┌─ SESSION METRICS ─────────────────────────────────────────────────────────┐');
  console.log(`│ Total Sessions:      ${m.total.toString().padEnd(15)} Trend: ${m.trend.padEnd(26)}│`);
  console.log(`│ Today:               ${m.sessionsToday.toString().padEnd(15)} This Week: ${m.sessionsThisWeek.toString().padEnd(19)}│`);
  console.log(`│ Avg Events/Session:  ${m.avgEventsPerSession.toFixed(1).padEnd(15)} Duration: ${formatDuration(m.avgDurationMs).padEnd(20)}│`);
  console.log(`│ Longest Session:     ${m.longestSessionEvents.toString().padEnd(15)} Shortest: ${m.shortestSessionEvents.toString().padEnd(21)}│`);
  console.log('└───────────────────────────────────────────────────────────────────────────┘\n');
}

function printEnergyMetrics(m: EnergyMetrics): void {
  const healthIcon = m.healthStatus === 'healthy' ? '✓' : m.healthStatus === 'warning' ? '!' : '✗';
  const bar = generateBar(m.current, 20);

  console.log('┌─ ENERGY METRICS ──────────────────────────────────────────────────────────┐');
  console.log(`│ Current: ${(m.current * 100).toFixed(1)}% [${bar}] ${healthIcon} ${m.healthStatus.padEnd(19)}│`);
  console.log(`│ Threshold: ${(m.threshold * 100).toFixed(0)}%             Min: ${(m.min * 100).toFixed(0)}%                                    │`);
  console.log(`│ Avg Consumption:     ${m.avgConsumptionPerSession.toFixed(4)}/session                                   │`);
  console.log(`│ Total Consumed:      ${m.totalConsumed.toFixed(3).padEnd(15)} Total Recharged: ${m.totalRecharged.toFixed(2).padEnd(14)}│`);
  console.log(`│ Recharge Count:      ${m.rechargeCount.toString().padEnd(15)} Est. Sessions Left: ${m.projectedSessionsRemaining.toString().padEnd(10)}│`);
  console.log('└───────────────────────────────────────────────────────────────────────────┘\n');
}

function printInvariantMetrics(m: InvariantMetrics): void {
  const scoreBar = generateBar(m.healthScore / 100, 10);

  console.log('┌─ INVARIANT HEALTH ────────────────────────────────────────────────────────┐');
  console.log(`│ Health Score:        [${scoreBar}] ${m.healthScore}%                                     │`);
  console.log(`│ Total Verifications: ${m.totalVerifications.toString().padEnd(15)} Success Rate: ${(m.successRate * 100).toFixed(1)}%              │`);
  console.log(`│ Last Verification:   ${(m.lastVerification || 'Never').toString().substring(0, 25).padEnd(50)}│`);
  console.log(`│ Violations History:  ${m.violationHistory.length.toString().padEnd(54)}│`);
  console.log('└───────────────────────────────────────────────────────────────────────────┘\n');
}

function printInteractionMetrics(m: InteractionMetrics): void {
  console.log('┌─ INTERACTION METRICS ─────────────────────────────────────────────────────┐');
  console.log(`│ Total Operations:    ${m.totalOperations.toString().padEnd(15)} Success Rate: ${(m.successRate * 100).toFixed(1)}%              │`);
  console.log(`│ Blocked Operations:  ${m.blockedOperations.toString().padEnd(15)} Avg/Session: ${m.avgOperationsPerSession.toFixed(2).padEnd(16)}│`);
  if (m.topOperations.length > 0) {
    console.log('│ Top Operations:                                                           │');
    for (const op of m.topOperations.slice(0, 3)) {
      console.log(`│   • ${op.id}: ${op.count}x`.padEnd(76) + '│');
    }
  }
  if (Object.keys(m.operationsByCategory).length > 0) {
    const cats = Object.entries(m.operationsByCategory)
      .map(([c, n]) => `${c}:${n}`)
      .join(' | ');
    console.log(`│ By Category: ${cats.substring(0, 60).padEnd(60)}│`);
  }
  console.log('└───────────────────────────────────────────────────────────────────────────┘\n');
}

function printTimeline(timeline: TimelineEntry[]): void {
  console.log('┌─ TIMELINE (Recent) ───────────────────────────────────────────────────────┐');
  for (const entry of timeline.slice(-10)) {
    const icon = entry.type === 'milestone' ? '📍' :
                 entry.type === 'recharge' ? '⚡' :
                 entry.type === 'violation' ? '⚠️' : '•';
    const time = entry.timestamp.substring(11, 19);
    console.log(`│ ${time} ${icon} ${entry.description.substring(0, 55).padEnd(58)}│`);
  }
  console.log('└───────────────────────────────────────────────────────────────────────────┘');
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateBar(ratio: number, width: number): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatDuration(ms: number): string {
  if (ms === 0) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Export metrics as JSON for external tools
 */
export function exportMetrics(dashboard: AnalyticsDashboard): string {
  return JSON.stringify(dashboard, null, 2);
}

/**
 * Get summary for quick status check
 */
export function getQuickSummary(dashboard: AnalyticsDashboard): string {
  const lines: string[] = [];
  lines.push(`Sessions: ${dashboard.session.total} | Energy: ${(dashboard.energy.current * 100).toFixed(0)}% | Health: ${dashboard.invariants.healthScore}%`);

  if (dashboard.alerts.length > 0) {
    const critical = dashboard.alerts.filter((a) => a.level === 'critical').length;
    const warning = dashboard.alerts.filter((a) => a.level === 'warning').length;
    if (critical > 0) lines.push(`⚠ ${critical} critical alert(s)`);
    if (warning > 0) lines.push(`! ${warning} warning(s)`);
  }

  return lines.join('\n');
}
