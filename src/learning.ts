/**
 * Learning & Pattern Recognition
 * AES-SPEC-001 Phase 4: Learning & Adaptation
 *
 * Analyzes event history to detect patterns and learn preferences
 */

import type { Event, State, Timestamp } from './types.js';

/**
 * Pattern types detected
 */
export interface OperationPattern {
  operationId: string;
  count: number;
  frequency: number; // per session
  lastUsed: Timestamp | null;
}

export interface SessionPattern {
  averageEventsPerSession: number;
  averageDurationMs: number;
  totalSessions: number;
  longestSession: number;
  shortestSession: number;
}

export interface EnergyPattern {
  averageConsumptionPerSession: number;
  peakUsageOperation: string | null;
  rechargeFrequency: number; // recharges per 10 sessions
}

export interface TimePattern {
  activeHours: number[]; // hours with most activity (0-23)
  activeDays: number[]; // days with activity (0=Sun, 6=Sat)
  averageSessionsPerDay: number;
}

/**
 * Learned preferences
 */
export interface Preferences {
  topOperations: string[];
  preferredCategory: string | null;
  interactionFrequency: 'low' | 'medium' | 'high';
}

/**
 * Learning state (persisted in State)
 */
export interface LearningState {
  enabled: boolean;
  lastAnalysis: Timestamp | null;
  patterns: {
    operations: OperationPattern[];
    sessions: SessionPattern;
    energy: EnergyPattern;
    time: TimePattern;
  };
  preferences: Preferences;
  insights: string[];
}

/**
 * Default learning state
 */
export function defaultLearningState(): LearningState {
  return {
    enabled: true,
    lastAnalysis: null,
    patterns: {
      operations: [],
      sessions: {
        averageEventsPerSession: 0,
        averageDurationMs: 0,
        totalSessions: 0,
        longestSession: 0,
        shortestSession: Infinity,
      },
      energy: {
        averageConsumptionPerSession: 0,
        peakUsageOperation: null,
        rechargeFrequency: 0,
      },
      time: {
        activeHours: [],
        activeDays: [],
        averageSessionsPerDay: 0,
      },
    },
    preferences: {
      topOperations: [],
      preferredCategory: null,
      interactionFrequency: 'medium',
    },
    insights: [],
  };
}

/**
 * Analyze events and detect patterns
 */
export function analyzePatterns(events: Event[]): LearningState {
  const learning = defaultLearningState();
  learning.lastAnalysis = new Date().toISOString() as Timestamp;

  if (events.length === 0) {
    return learning;
  }

  // Analyze operations
  learning.patterns.operations = analyzeOperations(events);

  // Analyze sessions
  learning.patterns.sessions = analyzeSessions(events);

  // Analyze energy
  learning.patterns.energy = analyzeEnergy(events);

  // Analyze time patterns
  learning.patterns.time = analyzeTimePatterns(events);

  // Derive preferences
  learning.preferences = derivePreferences(learning.patterns);

  // Generate insights
  learning.insights = generateInsights(learning.patterns, learning.preferences);

  return learning;
}

/**
 * Analyze operation patterns
 */
function analyzeOperations(events: Event[]): OperationPattern[] {
  const operationCounts: Record<string, { count: number; lastUsed: Timestamp }> = {};
  let sessionCount = 0;

  for (const event of events) {
    if (event.type === 'SESSION_START') {
      sessionCount++;
    }
    if (event.type === 'OPERATION' && event.data.operation) {
      const opId = event.data.operation as string;
      if (!operationCounts[opId]) {
        operationCounts[opId] = { count: 0, lastUsed: event.timestamp };
      }
      operationCounts[opId].count++;
      operationCounts[opId].lastUsed = event.timestamp;
    }
  }

  const totalSessions = Math.max(sessionCount, 1);

  return Object.entries(operationCounts)
    .map(([operationId, data]) => ({
      operationId,
      count: data.count,
      frequency: data.count / totalSessions,
      lastUsed: data.lastUsed,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Analyze session patterns
 */
function analyzeSessions(events: Event[]): SessionPattern {
  const sessions: { start: Date; end: Date | null; eventCount: number }[] = [];
  let currentSession: { start: Date; eventCount: number } | null = null;

  for (const event of events) {
    if (event.type === 'SESSION_START') {
      currentSession = {
        start: new Date(event.timestamp),
        eventCount: 1,
      };
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
      averageEventsPerSession: 0,
      averageDurationMs: 0,
      totalSessions: 0,
      longestSession: 0,
      shortestSession: 0,
    };
  }

  const durations = sessions
    .filter((s) => s.end)
    .map((s) => s.end!.getTime() - s.start.getTime());

  const eventCounts = sessions.map((s) => s.eventCount);

  return {
    averageEventsPerSession: eventCounts.reduce((a, b) => a + b, 0) / sessions.length,
    averageDurationMs: durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0,
    totalSessions: sessions.length,
    longestSession: Math.max(...eventCounts),
    shortestSession: Math.min(...eventCounts),
  };
}

/**
 * Analyze energy patterns
 */
function analyzeEnergy(events: Event[]): EnergyPattern {
  const operationEnergy: Record<string, number> = {};
  let totalEnergyUsed = 0;
  let sessionCount = 0;
  let rechargeCount = 0;

  for (const event of events) {
    if (event.type === 'SESSION_START') {
      sessionCount++;
    }
    if (event.type === 'OPERATION' && event.data.energy_cost) {
      const cost = event.data.energy_cost as number;
      const opId = event.data.operation as string;
      totalEnergyUsed += cost;
      operationEnergy[opId] = (operationEnergy[opId] || 0) + cost;
    }
    if (event.type === 'STATE_UPDATE' && event.data.reason === 'energy_recharge') {
      rechargeCount++;
    }
  }

  const peakOp = Object.entries(operationEnergy).sort((a, b) => b[1] - a[1])[0];

  return {
    averageConsumptionPerSession: sessionCount > 0 ? totalEnergyUsed / sessionCount : 0,
    peakUsageOperation: peakOp ? peakOp[0] : null,
    rechargeFrequency: sessionCount >= 10 ? (rechargeCount / sessionCount) * 10 : rechargeCount,
  };
}

/**
 * Analyze time patterns
 */
function analyzeTimePatterns(events: Event[]): TimePattern {
  const hourCounts: Record<number, number> = {};
  const dayCounts: Record<number, number> = {};
  const uniqueDays = new Set<string>();

  for (const event of events) {
    const date = new Date(event.timestamp);
    const hour = date.getHours();
    const day = date.getDay();
    const dateStr = date.toISOString().substring(0, 10);

    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    dayCounts[day] = (dayCounts[day] || 0) + 1;
    uniqueDays.add(dateStr);
  }

  // Top 3 active hours
  const activeHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => parseInt(h, 10));

  // Days with activity
  const activeDays = Object.keys(dayCounts).map((d) => parseInt(d, 10)).sort();

  // Sessions per day
  const sessionEvents = events.filter((e) => e.type === 'SESSION_START');
  const avgSessionsPerDay = uniqueDays.size > 0
    ? sessionEvents.length / uniqueDays.size
    : 0;

  return {
    activeHours,
    activeDays,
    averageSessionsPerDay: Math.round(avgSessionsPerDay * 10) / 10,
  };
}

/**
 * Derive preferences from patterns
 */
function derivePreferences(patterns: LearningState['patterns']): Preferences {
  // Top 3 operations
  const topOperations = patterns.operations
    .slice(0, 3)
    .map((p) => p.operationId);

  // Preferred category
  const categoryCount: Record<string, number> = {};
  for (const op of patterns.operations) {
    const category = op.operationId.split('.')[0];
    categoryCount[category] = (categoryCount[category] || 0) + op.count;
  }
  const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

  // Interaction frequency based on sessions per day
  let interactionFrequency: 'low' | 'medium' | 'high' = 'medium';
  if (patterns.time.averageSessionsPerDay > 5) {
    interactionFrequency = 'high';
  } else if (patterns.time.averageSessionsPerDay < 1) {
    interactionFrequency = 'low';
  }

  return {
    topOperations,
    preferredCategory: topCategory ? topCategory[0] : null,
    interactionFrequency,
  };
}

/**
 * Generate insights from patterns
 */
function generateInsights(
  patterns: LearningState['patterns'],
  preferences: Preferences
): string[] {
  const insights: string[] = [];

  // Session insights
  if (patterns.sessions.totalSessions > 0) {
    insights.push(
      `Analyzed ${patterns.sessions.totalSessions} sessions with average ${Math.round(patterns.sessions.averageEventsPerSession)} events each`
    );
  }

  // Top operation insight
  if (patterns.operations.length > 0) {
    const top = patterns.operations[0];
    insights.push(
      `Most used operation: ${top.operationId} (${top.count} times, ${top.frequency.toFixed(1)}/session)`
    );
  }

  // Energy insight
  if (patterns.energy.averageConsumptionPerSession > 0) {
    insights.push(
      `Average energy consumption: ${patterns.energy.averageConsumptionPerSession.toFixed(3)} per session`
    );
  }

  if (patterns.energy.peakUsageOperation) {
    insights.push(`Highest energy operation: ${patterns.energy.peakUsageOperation}`);
  }

  // Time pattern insights
  if (patterns.time.activeHours.length > 0) {
    const hours = patterns.time.activeHours.map((h) => `${h}:00`).join(', ');
    insights.push(`Most active hours: ${hours}`);
  }

  // Preference insights
  if (preferences.preferredCategory) {
    insights.push(`Preferred operation category: ${preferences.preferredCategory}`);
  }

  insights.push(`Interaction frequency: ${preferences.interactionFrequency}`);

  // Suggestions
  if (patterns.energy.rechargeFrequency > 2) {
    insights.push('Suggestion: Consider reducing energy-intensive operations');
  }

  if (patterns.sessions.averageEventsPerSession < 3) {
    insights.push('Suggestion: Sessions are short, consider batching operations');
  }

  return insights;
}

/**
 * Print learning report
 */
export function printLearningReport(learning: LearningState): void {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              LEARNING & PATTERN ANALYSIS                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`Status: ${learning.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`Last Analysis: ${learning.lastAnalysis || 'Never'}\n`);

  // Session patterns
  console.log('┌─ SESSION PATTERNS ──────────────────────────────────────────┐');
  console.log(`│ Total Sessions:     ${learning.patterns.sessions.totalSessions.toString().padEnd(40)}│`);
  console.log(`│ Avg Events/Session: ${learning.patterns.sessions.averageEventsPerSession.toFixed(1).padEnd(40)}│`);
  console.log(`│ Longest Session:    ${learning.patterns.sessions.longestSession.toString().padEnd(40)} events │`);
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  // Operation patterns
  if (learning.patterns.operations.length > 0) {
    console.log('┌─ TOP OPERATIONS ────────────────────────────────────────────┐');
    for (const op of learning.patterns.operations.slice(0, 5)) {
      const line = `${op.operationId}: ${op.count}x (${op.frequency.toFixed(2)}/session)`;
      console.log(`│ ${line.padEnd(60)}│`);
    }
    console.log('└─────────────────────────────────────────────────────────────┘\n');
  }

  // Energy patterns
  console.log('┌─ ENERGY PATTERNS ────────────────────────────────────────────┐');
  console.log(`│ Avg Consumption:    ${learning.patterns.energy.averageConsumptionPerSession.toFixed(4).padEnd(40)}│`);
  console.log(`│ Peak Operation:     ${(learning.patterns.energy.peakUsageOperation || 'N/A').padEnd(40)}│`);
  console.log(`│ Recharge Freq:      ${learning.patterns.energy.rechargeFrequency.toFixed(1).padEnd(37)} /10 sessions │`);
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  // Preferences
  console.log('┌─ LEARNED PREFERENCES ────────────────────────────────────────┐');
  console.log(`│ Top Operations:     ${(learning.preferences.topOperations.join(', ') || 'None').padEnd(40)}│`);
  console.log(`│ Preferred Category: ${(learning.preferences.preferredCategory || 'None').padEnd(40)}│`);
  console.log(`│ Interaction Level:  ${learning.preferences.interactionFrequency.padEnd(40)}│`);
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  // Insights
  if (learning.insights.length > 0) {
    console.log('┌─ INSIGHTS ───────────────────────────────────────────────────┐');
    for (const insight of learning.insights) {
      // Wrap long insights
      const lines = wrapText(insight, 59);
      for (const line of lines) {
        console.log(`│ ${line.padEnd(60)}│`);
      }
    }
    console.log('└─────────────────────────────────────────────────────────────┘');
  }
}

/**
 * Wrap text to fit within width
 */
function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

/**
 * Get adaptive suggestion based on current state and patterns
 */
export function getAdaptiveSuggestion(state: State, learning: LearningState): string | null {
  // Energy warning
  if (state.energy.current < state.energy.threshold) {
    return 'Energy low - consider recharging before continuing';
  }

  // Suggest based on time patterns
  const currentHour = new Date().getHours();
  if (learning.patterns.time.activeHours.includes(currentHour)) {
    return `This is typically an active hour for you`;
  }

  // Suggest based on frequent operations
  if (learning.preferences.topOperations.length > 0) {
    const topOp = learning.preferences.topOperations[0];
    return `Your most used operation is ${topOp}`;
  }

  return null;
}
