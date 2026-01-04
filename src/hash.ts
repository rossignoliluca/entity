/**
 * Cryptographic Hashing
 * Content-addressable storage foundation
 *
 * §3.1.6 Domain-Specific Primitives: Hash
 */

import { createHash } from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { Hash, Event } from './types.js';

/**
 * Compute SHA-256 hash of data
 */
export function sha256(data: string | Buffer): Hash {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute deterministic hash of object
 * Keys are sorted for determinism
 */
export function hashObject(obj: unknown): Hash {
  const sortKeys = (o: unknown): unknown => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(sortKeys);
    return Object.keys(o as object)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys((o as Record<string, unknown>)[key]);
        return acc;
      }, {} as Record<string, unknown>);
  };

  const sorted = sortKeys(obj);
  const json = JSON.stringify(sorted);
  return sha256(json);
}

/**
 * Compute event hash (excluding hash field)
 * For Merkle chain integrity
 */
export function hashEvent(event: Omit<Event, 'hash'>): Hash {
  const toHash = {
    seq: event.seq,
    type: event.type,
    timestamp: event.timestamp,
    data: event.data,
    prev_hash: event.prev_hash,
  };
  return hashObject(toHash);
}

/**
 * Verify event hash is correct
 */
export function verifyEventHash(event: Event): boolean {
  const computed = hashEvent(event);
  return computed === event.hash;
}

/**
 * Verify Merkle chain integrity
 * INV-003: events[n].prev_hash = hash(events[n-1])
 */
export function verifyChain(events: Event[]): boolean {
  if (events.length === 0) return true;

  // Genesis must have null prev_hash
  if (events[0].prev_hash !== null) return false;

  for (let i = 0; i < events.length; i++) {
    // Verify own hash
    if (!verifyEventHash(events[i])) return false;

    // Verify chain link
    if (i > 0 && events[i].prev_hash !== events[i - 1].hash) {
      return false;
    }
  }

  return true;
}

/**
 * Compute hash of a file
 */
export async function hashFile(path: string): Promise<Hash> {
  const content = await readFile(path);
  return sha256(content);
}

/**
 * Compute hash of spec/ directory
 * This is the organization hash
 * INV-001: hash(spec/) = ORGANIZATION.sha256
 */
export async function hashSpecDirectory(specDir: string): Promise<Hash> {
  const entries = await readdir(specDir);
  const hashes: string[] = [];

  for (const entry of entries.sort()) {
    const fullPath = join(specDir, entry);
    const s = await stat(fullPath);

    if (s.isFile()) {
      const content = await readFile(fullPath);
      hashes.push(`${entry}:${sha256(content)}`);
    }
  }

  return sha256(hashes.join('\n'));
}

/**
 * Verify organization hash matches spec
 */
export async function verifyOrganizationHash(
  specDir: string,
  expectedHash: Hash
): Promise<boolean> {
  const computed = await hashSpecDirectory(specDir);
  return computed === expectedHash;
}
