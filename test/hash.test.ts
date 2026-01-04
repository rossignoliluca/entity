/**
 * Hash Module Tests
 * INV-003: Merkle chain integrity
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sha256, hashObject, hashEvent, verifyEventHash, verifyChain } from '../src/hash.js';
import type { Event } from '../src/types.js';

describe('sha256', () => {
  it('should produce consistent hashes', () => {
    const hash1 = sha256('test');
    const hash2 = sha256('test');
    assert.strictEqual(hash1, hash2);
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = sha256('test1');
    const hash2 = sha256('test2');
    assert.notStrictEqual(hash1, hash2);
  });

  it('should produce 64-character hex string', () => {
    const hash = sha256('test');
    assert.strictEqual(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });
});

describe('hashObject', () => {
  it('should produce consistent hashes regardless of key order', () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };
    assert.strictEqual(hashObject(obj1), hashObject(obj2));
  });

  it('should handle nested objects', () => {
    const obj = { outer: { inner: 'value' } };
    const hash = hashObject(obj);
    assert.strictEqual(hash.length, 64);
  });

  it('should handle arrays', () => {
    const obj = { items: [1, 2, 3] };
    const hash = hashObject(obj);
    assert.strictEqual(hash.length, 64);
  });
});

describe('hashEvent', () => {
  it('should hash event without hash field', () => {
    const event = {
      seq: 1,
      type: 'GENESIS' as const,
      timestamp: '2025-01-04T00:00:00.000Z',
      data: {},
      prev_hash: null,
    };
    const hash = hashEvent(event);
    assert.strictEqual(hash.length, 64);
  });
});

describe('verifyEventHash', () => {
  it('should verify correct hash', () => {
    const eventWithoutHash = {
      seq: 1,
      type: 'GENESIS' as const,
      timestamp: '2025-01-04T00:00:00.000Z',
      data: {},
      prev_hash: null,
    };
    const hash = hashEvent(eventWithoutHash);
    const event: Event = { ...eventWithoutHash, hash };
    assert.strictEqual(verifyEventHash(event), true);
  });

  it('should reject incorrect hash', () => {
    const event: Event = {
      seq: 1,
      type: 'GENESIS',
      timestamp: '2025-01-04T00:00:00.000Z',
      data: {},
      prev_hash: null,
      hash: 'invalid_hash',
    };
    assert.strictEqual(verifyEventHash(event), false);
  });
});

describe('verifyChain', () => {
  it('should verify empty chain', () => {
    assert.strictEqual(verifyChain([]), true);
  });

  it('should verify valid chain', () => {
    const genesis = {
      seq: 1,
      type: 'GENESIS' as const,
      timestamp: '2025-01-04T00:00:00.000Z',
      data: {},
      prev_hash: null,
    };
    const genesisHash = hashEvent(genesis);
    const genesisEvent: Event = { ...genesis, hash: genesisHash };

    const event2 = {
      seq: 2,
      type: 'SESSION_START' as const,
      timestamp: '2025-01-04T00:01:00.000Z',
      data: { session_id: 'test' },
      prev_hash: genesisHash,
    };
    const event2Hash = hashEvent(event2);
    const event2Complete: Event = { ...event2, hash: event2Hash };

    assert.strictEqual(verifyChain([genesisEvent, event2Complete]), true);
  });

  it('should reject broken chain', () => {
    const genesis: Event = {
      seq: 1,
      type: 'GENESIS',
      timestamp: '2025-01-04T00:00:00.000Z',
      data: {},
      prev_hash: null,
      hash: hashEvent({
        seq: 1,
        type: 'GENESIS',
        timestamp: '2025-01-04T00:00:00.000Z',
        data: {},
        prev_hash: null,
      }),
    };

    const event2: Event = {
      seq: 2,
      type: 'SESSION_START',
      timestamp: '2025-01-04T00:01:00.000Z',
      data: {},
      prev_hash: 'wrong_hash', // Wrong prev_hash
      hash: 'some_hash',
    };

    assert.strictEqual(verifyChain([genesis, event2]), false);
  });

  it('should reject genesis with non-null prev_hash', () => {
    const genesis: Event = {
      seq: 1,
      type: 'GENESIS',
      timestamp: '2025-01-04T00:00:00.000Z',
      data: {},
      prev_hash: 'should_be_null',
      hash: 'some_hash',
    };
    assert.strictEqual(verifyChain([genesis]), false);
  });
});
