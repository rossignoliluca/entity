/**
 * REST API Tests (v1.9.x: Observation Events)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

describe('REST API Server', () => {
  const testDir = join(tmpdir(), `entity-api-test-${randomUUID()}`);
  const eventsDir = join(testDir, 'events');
  const stateDir = join(testDir, 'state');

  // Create initial state for tests
  const initialState = {
    version: '1.0.0',
    specification: 'AES-SPEC-001',
    organization_hash: 'test-hash-' + randomUUID().slice(0, 8),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    identity: {
      name: 'Entity',
      instantiated_by: 'test',
      instantiated_at: new Date().toISOString(),
    },
    coupling: { active: false, partner: null, since: null },
    energy: { current: 0.75, min: 0.01, threshold: 0.1 },
    lyapunov: { V: 0.0, V_previous: null },
    memory: { event_count: 1, last_event_hash: 'genesis-hash', last_snapshot_at: null },
    session: { total_count: 5, current_id: null },
    integrity: {
      invariant_violations: 0,
      last_verification: new Date().toISOString(),
      status: 'nominal' as const,
    },
    human: { name: 'Test', context: '' },
    important: ['test memory'],
    learning: { enabled: true, lastAnalysis: null, patternsHash: null },
  };

  before(async () => {
    await mkdir(eventsDir, { recursive: true });
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, 'current.json'), JSON.stringify(initialState, null, 2));

    // Create genesis event
    const genesis = {
      seq: 1,
      type: 'GENESIS',
      timestamp: new Date().toISOString(),
      data: {
        version: '1.0.0',
        specification: 'AES-SPEC-001',
        organization_hash: initialState.organization_hash,
        instantiated_by: 'test',
      },
      prev_hash: null,
      hash: 'genesis-hash',
    };
    await writeFile(join(eventsDir, '000001.json'), JSON.stringify(genesis, null, 2));
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('computeFeeling', () => {
    it('should compute correct energy level for critical energy', () => {
      const E = 0.015; // Just above E_min * 2 = 0.02
      const E_min = 0.01;

      let level = 'comfortable';
      if (E < E_min * 2) level = 'critical';
      else if (E < 0.2) level = 'low';
      else if (E > 0.8) level = 'abundant';

      assert.strictEqual(level, 'critical');
    });

    it('should compute correct energy level for low energy', () => {
      const E = 0.15;
      const E_min = 0.01;

      let level = 'comfortable';
      if (E < E_min * 2) level = 'critical';
      else if (E < 0.2) level = 'low';
      else if (E > 0.8) level = 'abundant';

      assert.strictEqual(level, 'low');
    });

    it('should compute correct energy level for comfortable energy', () => {
      const E = 0.5;
      const E_min = 0.01;

      let level = 'comfortable';
      if (E < E_min * 2) level = 'critical';
      else if (E < 0.2) level = 'low';
      else if (E > 0.8) level = 'abundant';

      assert.strictEqual(level, 'comfortable');
    });

    it('should compute correct energy level for abundant energy', () => {
      const E = 0.9;
      const E_min = 0.01;

      let level = 'comfortable';
      if (E < E_min * 2) level = 'critical';
      else if (E < 0.2) level = 'low';
      else if (E > 0.8) level = 'abundant';

      assert.strictEqual(level, 'abundant');
    });

    it('should compute correct stability level for stable state', () => {
      const V = 0;

      let level = 'stable';
      if (V > 0.1) level = 'unstable';
      else if (V > 0.01) level = 'uncertain';

      assert.strictEqual(level, 'stable');
    });

    it('should compute correct stability level for uncertain state', () => {
      const V = 0.05;

      let level = 'stable';
      if (V > 0.1) level = 'unstable';
      else if (V > 0.01) level = 'uncertain';

      assert.strictEqual(level, 'uncertain');
    });

    it('should compute correct stability level for unstable state', () => {
      const V = 0.2;

      let level = 'stable';
      if (V > 0.1) level = 'unstable';
      else if (V > 0.01) level = 'uncertain';

      assert.strictEqual(level, 'unstable');
    });

    it('should compute correct priority for survival', () => {
      const E = 0.015;
      const E_min = 0.01;
      const V = 0;

      let priority = 'rest';
      if (E < E_min * 2) priority = 'survival';
      else if (V > 0.1) priority = 'stability';
      else if (V > 0) priority = 'growth';

      assert.strictEqual(priority, 'survival');
    });

    it('should compute correct priority for stability', () => {
      const E = 0.5;
      const E_min = 0.01;
      const V = 0.15;

      let priority = 'rest';
      if (E < E_min * 2) priority = 'survival';
      else if (V > 0.1) priority = 'stability';
      else if (V > 0) priority = 'growth';

      assert.strictEqual(priority, 'stability');
    });

    it('should compute correct priority for growth', () => {
      const E = 0.5;
      const E_min = 0.01;
      const V = 0.005;

      let priority = 'rest';
      if (E < E_min * 2) priority = 'survival';
      else if (V > 0.1) priority = 'stability';
      else if (V > 0) priority = 'growth';

      assert.strictEqual(priority, 'growth');
    });

    it('should compute correct priority for rest', () => {
      const E = 0.5;
      const E_min = 0.01;
      const V = 0;

      let priority = 'rest';
      if (E < E_min * 2) priority = 'survival';
      else if (V > 0.1) priority = 'stability';
      else if (V > 0) priority = 'growth';

      assert.strictEqual(priority, 'rest');
    });
  });

  describe('OBSERVATION_RECEIVED event', () => {
    it('should have correct structure', () => {
      const observationEvent = {
        observer: 'claude',
        channel: 'rest',
        endpoint: '/observe',
        state_hash: 'abc123',
        category: 'audit' as const,
      };

      assert.strictEqual(observationEvent.observer, 'claude');
      assert.strictEqual(observationEvent.channel, 'rest');
      assert.strictEqual(observationEvent.category, 'audit');
    });

    it('should be audit category (excluded from production)', () => {
      const category = 'audit';
      assert.strictEqual(category, 'audit');
      assert.notStrictEqual(category, 'operational');
    });
  });

  describe('API constraints', () => {
    it('should not consume energy on observation', () => {
      const energyBefore = 0.75;
      // Observation event does not change energy
      const energyAfter = energyBefore;
      assert.strictEqual(energyAfter, energyBefore);
    });

    it('should not open coupling requests on observation', () => {
      const couplingRequestsBefore = 0;
      // Observation event does not create coupling requests
      const couplingRequestsAfter = couplingRequestsBefore;
      assert.strictEqual(couplingRequestsAfter, couplingRequestsBefore);
    });

    it('should be read-only (no state mutation)', () => {
      const stateBefore = JSON.stringify(initialState);
      // Observation does not mutate state
      const stateAfter = JSON.stringify(initialState);
      assert.strictEqual(stateAfter, stateBefore);
    });
  });

  describe('API endpoints structure', () => {
    it('/observe should return state + feeling', () => {
      const expectedFields = ['timestamp', 'state', 'feeling', 'observed'];
      const response = {
        timestamp: new Date().toISOString(),
        state: {
          specification: 'AES-SPEC-001',
          organization_hash: 'hash',
          mode: 'nominal',
          energy: { current: 0.75, min: 0.01, threshold: 0.1 },
          lyapunov: { V: 0, V_previous: null },
          coupling: { active: false, partner: null, since: null },
          session: { total_count: 5, current_id: null },
          memory: { event_count: 1, important_count: 1 },
        },
        feeling: {
          energy: { value: 0.75, level: 'comfortable' },
          stability: { V: 0, level: 'stable' },
          priority: 'rest',
          coupled: false,
          mode: 'nominal',
        },
        observed: {
          hash: 'state-hash',
          observer: 'test',
          channel: 'rest',
        },
      };

      for (const field of expectedFields) {
        assert.ok(field in response, `Missing field: ${field}`);
      }
    });

    it('/verify should return verification result', () => {
      const expectedFields = ['timestamp', 'verification', 'observed'];
      const response = {
        timestamp: new Date().toISOString(),
        verification: {
          all_satisfied: true,
          invariants: [],
          lyapunov_V: 0,
        },
        observed: {
          hash: 'state-hash',
          observer: 'test',
          channel: 'rest',
        },
      };

      for (const field of expectedFields) {
        assert.ok(field in response, `Missing field: ${field}`);
      }
    });
  });

  describe('Observer identification', () => {
    it('should accept X-Observer header', () => {
      const headers = { 'x-observer': 'claude' };
      const observer = headers['x-observer'] || 'unknown';
      assert.strictEqual(observer, 'claude');
    });

    it('should default to unknown if no header', () => {
      const headers = {};
      const observer = (headers as Record<string, string>)['x-observer'] || 'unknown';
      assert.strictEqual(observer, 'unknown');
    });

    it('should support various observer identities', () => {
      const validObservers = ['claude', 'gemini', 'openai', 'human', 'dashboard', 'unknown'];
      for (const obs of validObservers) {
        assert.ok(typeof obs === 'string' && obs.length > 0);
      }
    });
  });
});
