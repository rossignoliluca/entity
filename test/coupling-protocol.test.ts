/**
 * Tests for Coupling Protocol Module
 * AES-SPEC-001 Phase 8f: Structural Coupling Protocol
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  createCouplingRequest,
  enqueueRequest,
  expireRequests,
  grantRequest,
  completeRequest,
  cancelRequest,
  isCooldownActive,
  checkCouplingTriggers,
  formatRequest,
  formatQueueSummary,
  DEFAULT_COUPLING_CONFIG,
  DEFAULT_COUPLING_QUEUE_STATE,
  type CouplingQueueState,
  type CouplingRequest,
  type CouplingConfig,
  type TriggerContext,
} from '../src/coupling-protocol.js';

describe('Coupling Protocol', () => {
  let queue: CouplingQueueState;
  let config: CouplingConfig;

  beforeEach(() => {
    queue = JSON.parse(JSON.stringify(DEFAULT_COUPLING_QUEUE_STATE));
    config = { ...DEFAULT_COUPLING_CONFIG };
  });

  describe('createCouplingRequest', () => {
    it('should create a request with correct fields', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('urgent', 'Test reason', context, config);

      assert.strictEqual(request.priority, 'urgent');
      assert.strictEqual(request.reason, 'Test reason');
      assert.strictEqual(request.status, 'pending');
      assert.strictEqual(request.context.energy, 0.5);
      assert.ok(request.id.length === 8);
      assert.ok(request.requestedAt);
      assert.ok(request.expiresAt);
    });

    it('should set TTL based on priority', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const urgentReq = createCouplingRequest('urgent', 'Urgent', context, config);
      const normalReq = createCouplingRequest('normal', 'Normal', context, config);
      const lowReq = createCouplingRequest('low', 'Low', context, config);

      const urgentTTL = new Date(urgentReq.expiresAt).getTime() - new Date(urgentReq.requestedAt).getTime();
      const normalTTL = new Date(normalReq.expiresAt).getTime() - new Date(normalReq.requestedAt).getTime();
      const lowTTL = new Date(lowReq.expiresAt).getTime() - new Date(lowReq.requestedAt).getTime();

      assert.strictEqual(urgentTTL, config.ttl.urgent);
      assert.strictEqual(normalTTL, config.ttl.normal);
      assert.strictEqual(lowTTL, config.ttl.low);
    });
  });

  describe('enqueueRequest', () => {
    it('should add request to empty queue', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('normal', 'Test', context, config);
      const result = enqueueRequest(queue, request, config);

      assert.strictEqual(result.success, true);
      assert.strictEqual(queue.pending.length, 1);
      assert.strictEqual(queue.metrics.totalRequests, 1);
    });

    it('should deduplicate same priority+reason within window', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request1 = createCouplingRequest('normal', 'Test', context, config);
      const request2 = createCouplingRequest('normal', 'Test', context, config);

      enqueueRequest(queue, request1, config);
      const result2 = enqueueRequest(queue, request2, config);

      assert.strictEqual(result2.success, true);
      assert.strictEqual(result2.updated, true);
      assert.strictEqual(queue.pending.length, 1); // Not 2
    });

    it('should respect max pending cap', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      // Fill queue with low priority
      for (let i = 0; i < config.maxPending; i++) {
        const req = createCouplingRequest('low', `Test ${i}`, context, config);
        enqueueRequest(queue, req, config);
      }

      assert.strictEqual(queue.pending.length, config.maxPending);

      // Try to add another low priority - should fail
      const lowReq = createCouplingRequest('low', 'Another low', context, config);
      const result = enqueueRequest(queue, lowReq, config);

      assert.strictEqual(result.success, false);
      assert.ok(result.reason?.includes('Queue full'));
    });

    it('should replace lower priority when queue full', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      // Fill queue with low priority
      for (let i = 0; i < config.maxPending; i++) {
        const req = createCouplingRequest('low', `Test ${i}`, context, config);
        enqueueRequest(queue, req, config);
      }

      // Add urgent - should replace a low
      const urgentReq = createCouplingRequest('urgent', 'Urgent', context, config);
      const result = enqueueRequest(queue, urgentReq, config);

      assert.strictEqual(result.success, true);
      assert.strictEqual(queue.pending.length, config.maxPending);
      assert.ok(queue.pending.some(r => r.priority === 'urgent'));
    });

    it('should block non-urgent during cooldown', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      // Set cooldown
      queue.cooldownUntil = new Date(Date.now() + 60000).toISOString();

      const normalReq = createCouplingRequest('normal', 'Normal', context, config);
      const result = enqueueRequest(queue, normalReq, config);

      assert.strictEqual(result.success, false);
      assert.ok(result.reason?.includes('Cooldown'));
    });

    it('should allow urgent during cooldown', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      // Set cooldown
      queue.cooldownUntil = new Date(Date.now() + 60000).toISOString();

      const urgentReq = createCouplingRequest('urgent', 'Urgent', context, config);
      const result = enqueueRequest(queue, urgentReq, config);

      assert.strictEqual(result.success, true);
    });
  });

  describe('expireRequests', () => {
    it('should expire old requests', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      // Create an already-expired request
      const request = createCouplingRequest('urgent', 'Test', context, config);
      request.expiresAt = new Date(Date.now() - 1000).toISOString();
      queue.pending.push(request);

      const expiredIds = expireRequests(queue, config);

      assert.strictEqual(expiredIds.length, 1);
      assert.strictEqual(queue.pending.length, 0);
      assert.strictEqual(queue.history.length, 1);
      assert.strictEqual(queue.history[0].status, 'expired');
      assert.strictEqual(queue.metrics.totalExpired, 1);
    });

    it('should not expire valid requests', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('urgent', 'Test', context, config);
      queue.pending.push(request);

      const expiredIds = expireRequests(queue, config);

      assert.strictEqual(expiredIds.length, 0);
      assert.strictEqual(queue.pending.length, 1);
    });
  });

  describe('grantRequest', () => {
    it('should grant pending request', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('normal', 'Test', context, config);
      queue.pending.push(request);

      const result = grantRequest(queue, request.id, config);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.request?.status, 'granted');
      assert.ok(result.request?.grantedAt);
      assert.ok(queue.cooldownUntil); // Cooldown set
      assert.strictEqual(queue.metrics.totalGranted, 1);
    });

    it('should fail for non-existent request', () => {
      const result = grantRequest(queue, 'nonexistent', config);

      assert.strictEqual(result.success, false);
      assert.ok(result.reason?.includes('not found'));
    });

    it('should fail for expired request', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('normal', 'Test', context, config);
      request.expiresAt = new Date(Date.now() - 1000).toISOString();
      queue.pending.push(request);

      const result = grantRequest(queue, request.id, config);

      assert.strictEqual(result.success, false);
      assert.ok(result.reason?.includes('expired'));
    });
  });

  describe('completeRequest', () => {
    it('should complete granted request', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('normal', 'Test', context, config);
      request.status = 'granted';
      request.grantedAt = new Date().toISOString();
      queue.pending.push(request);

      const result = completeRequest(queue, request.id, 'resolved', 'Done', config);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.request?.status, 'completed');
      assert.strictEqual(result.request?.outcome, 'resolved');
      assert.strictEqual(result.request?.note, 'Done');
      assert.strictEqual(queue.pending.length, 0);
      assert.strictEqual(queue.history.length, 1);
      assert.strictEqual(queue.metrics.totalCompleted, 1);
    });

    it('should fail for non-granted request', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('normal', 'Test', context, config);
      queue.pending.push(request);

      const result = completeRequest(queue, request.id, 'resolved', undefined, config);

      assert.strictEqual(result.success, false);
      assert.ok(result.reason?.includes('not yet granted'));
    });
  });

  describe('cancelRequest', () => {
    it('should cancel pending request', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('normal', 'Test', context, config);
      queue.pending.push(request);

      const result = cancelRequest(queue, request.id, 'Not needed', config);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.request?.status, 'canceled');
      assert.strictEqual(result.request?.note, 'Not needed');
      assert.strictEqual(queue.pending.length, 0);
      assert.strictEqual(queue.history.length, 1);
    });
  });

  describe('isCooldownActive', () => {
    it('should return false when no cooldown set', () => {
      assert.strictEqual(isCooldownActive(queue), false);
    });

    it('should return true during cooldown', () => {
      queue.cooldownUntil = new Date(Date.now() + 60000).toISOString();
      assert.strictEqual(isCooldownActive(queue), true);
    });

    it('should return false after cooldown expires', () => {
      queue.cooldownUntil = new Date(Date.now() - 1000).toISOString();
      assert.strictEqual(isCooldownActive(queue), false);
    });
  });

  describe('checkCouplingTriggers', () => {
    it('should trigger urgent on invariant violations', () => {
      const ctx: TriggerContext = {
        energy: 0.5,
        criticalThreshold: 0.05,
        urgencyThreshold: 0.15,
        invariantViolations: 1,
        blocksInWindow: 0,
        blockWindowSize: 10,
        deprecationsInWindow: 0,
        efeAmbiguity: 0,
        ambiguityHighCycles: 0,
        stateHash: 'abc',
        lyapunovV: 0,
      };

      const result = checkCouplingTriggers(ctx);

      assert.strictEqual(result.shouldRequest, true);
      assert.strictEqual(result.priority, 'urgent');
      assert.ok(result.reason?.includes('Invariant'));
    });

    it('should trigger urgent on critical energy', () => {
      const ctx: TriggerContext = {
        energy: 0.03,
        criticalThreshold: 0.05,
        urgencyThreshold: 0.15,
        invariantViolations: 0,
        blocksInWindow: 0,
        blockWindowSize: 10,
        deprecationsInWindow: 0,
        efeAmbiguity: 0,
        ambiguityHighCycles: 0,
        stateHash: 'abc',
        lyapunovV: 0,
      };

      const result = checkCouplingTriggers(ctx);

      assert.strictEqual(result.shouldRequest, true);
      assert.strictEqual(result.priority, 'urgent');
      assert.ok(result.reason?.includes('critical'));
    });

    it('should trigger urgent on repeated blocks', () => {
      const ctx: TriggerContext = {
        energy: 0.5,
        criticalThreshold: 0.05,
        urgencyThreshold: 0.15,
        invariantViolations: 0,
        blocksInWindow: 3,
        blockWindowSize: 10,
        deprecationsInWindow: 0,
        efeAmbiguity: 0,
        ambiguityHighCycles: 0,
        stateHash: 'abc',
        lyapunovV: 0,
      };

      const result = checkCouplingTriggers(ctx);

      assert.strictEqual(result.shouldRequest, true);
      assert.strictEqual(result.priority, 'urgent');
      assert.ok(result.reason?.includes('blocks'));
    });

    it('should trigger normal on deprecations', () => {
      const ctx: TriggerContext = {
        energy: 0.5,
        criticalThreshold: 0.05,
        urgencyThreshold: 0.15,
        invariantViolations: 0,
        blocksInWindow: 0,
        blockWindowSize: 10,
        deprecationsInWindow: 3,
        efeAmbiguity: 0,
        ambiguityHighCycles: 0,
        stateHash: 'abc',
        lyapunovV: 0,
      };

      const result = checkCouplingTriggers(ctx);

      assert.strictEqual(result.shouldRequest, true);
      assert.strictEqual(result.priority, 'normal');
      assert.ok(result.reason?.includes('deprecation'));
    });

    it('should trigger low on persistent ambiguity', () => {
      const ctx: TriggerContext = {
        energy: 0.5,
        criticalThreshold: 0.05,
        urgencyThreshold: 0.15,
        invariantViolations: 0,
        blocksInWindow: 0,
        blockWindowSize: 10,
        deprecationsInWindow: 0,
        efeAmbiguity: 0.6,
        ambiguityHighCycles: 5,
        stateHash: 'abc',
        lyapunovV: 0,
      };

      const result = checkCouplingTriggers(ctx);

      assert.strictEqual(result.shouldRequest, true);
      assert.strictEqual(result.priority, 'low');
      assert.ok(result.reason?.includes('uncertainty'));
    });

    it('should not trigger when stable', () => {
      const ctx: TriggerContext = {
        energy: 0.5,
        criticalThreshold: 0.05,
        urgencyThreshold: 0.15,
        invariantViolations: 0,
        blocksInWindow: 0,
        blockWindowSize: 10,
        deprecationsInWindow: 0,
        efeAmbiguity: 0.3,
        ambiguityHighCycles: 2,
        stateHash: 'abc',
        lyapunovV: 0,
      };

      const result = checkCouplingTriggers(ctx);

      assert.strictEqual(result.shouldRequest, false);
    });
  });

  describe('formatRequest', () => {
    it('should format request for display', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('urgent', 'Test reason', context, config);
      const formatted = formatRequest(request);

      assert.ok(formatted.includes(request.id));
      assert.ok(formatted.includes('URGENT'));
      assert.ok(formatted.includes('Test reason'));
    });
  });

  describe('formatQueueSummary', () => {
    it('should format empty queue', () => {
      const summary = formatQueueSummary(queue);

      assert.ok(summary.includes('No pending'));
      assert.ok(summary.includes('Total requests: 0'));
    });

    it('should format queue with requests', () => {
      const context = {
        feeling: { energy: 0.5, lyapunovV: 0, invariantsSatisfied: 5, invariantsTotal: 5 },
        state_hash: 'abc123',
        V: 0,
        energy: 0.5,
      };

      const request = createCouplingRequest('urgent', 'Test', context, config);
      enqueueRequest(queue, request, config);

      const summary = formatQueueSummary(queue);

      assert.ok(summary.includes('Pending: 1'));
      assert.ok(summary.includes('URGENT'));
    });

    it('should show cooldown status', () => {
      queue.cooldownUntil = new Date(Date.now() + 60000).toISOString();

      const summary = formatQueueSummary(queue);

      assert.ok(summary.includes('Cooldown'));
    });
  });
});
