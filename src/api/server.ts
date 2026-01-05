/**
 * REST API Server - Peripheral Organ (v1.9.x)
 *
 * Read-only HTTP interface for Entity observation.
 * Logs OBSERVATION_RECEIVED events (audit category).
 *
 * Endpoints:
 *   GET /observe - Full state + feeling
 *   GET /verify  - Invariant verification
 *
 * Constraints (per ROADMAP.md):
 *   - category = 'audit' (excluded from production context)
 *   - Does NOT enter EFE / cycle memory / self-production
 *   - Does NOT consume energy
 *   - Does NOT open coupling requests
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendEvent } from '../events.js';
import { hashObject } from '../hash.js';
import { verifyAllInvariants } from '../verify.js';
import type { State, Event, EventCategory } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From dist/src/api, need to go up 3 levels to project root
const BASE_DIR = path.join(__dirname, '../../..');
const STATE_PATH = path.join(BASE_DIR, 'state/current.json');

export interface APIConfig {
  port: number;
  host: string;
}

const DEFAULT_CONFIG: APIConfig = {
  port: 3000,
  host: '127.0.0.1'
};

let server: http.Server | null = null;
let config: APIConfig = DEFAULT_CONFIG;

// Read current state
function readState(): State | null {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

// Compute feeling from state
function computeFeeling(state: State): {
  energy: { value: number; level: string };
  stability: { V: number; level: string };
  priority: string;
  coupled: boolean;
  mode: string;
} {
  const E = state.energy.current;
  const E_min = state.energy.min;
  const V = state.lyapunov.V;

  // Energy level
  let energyLevel = 'comfortable';
  if (E < E_min * 2) energyLevel = 'critical';
  else if (E < 0.2) energyLevel = 'low';
  else if (E > 0.8) energyLevel = 'abundant';

  // Stability level
  let stabilityLevel = 'stable';
  if (V > 0.1) stabilityLevel = 'unstable';
  else if (V > 0.01) stabilityLevel = 'uncertain';

  // Priority (simplified)
  let priority = 'rest';
  if (E < E_min * 2) priority = 'survival';
  else if (V > 0.1) priority = 'stability';
  else if (V > 0) priority = 'growth';

  return {
    energy: { value: E, level: energyLevel },
    stability: { V, level: stabilityLevel },
    priority,
    coupled: state.coupling.active,
    mode: state.integrity.status
  };
}

// Log observation event (audit category)
async function logObservation(
  observer: string,
  channel: string,
  endpoint: string,
  stateHash: string
): Promise<Event> {
  const event = await appendEvent(BASE_DIR, 'OBSERVATION_RECEIVED', {
    observer,
    channel,
    endpoint,
    state_hash: stateHash,
    category: 'audit' as EventCategory
  });
  return event;
}

// Route handlers
type RouteHandler = (req: http.IncomingMessage, url: URL) => Promise<unknown>;

const routes: Record<string, RouteHandler> = {
  '/': async () => ({
    name: 'Entity REST API',
    version: '1.9.0',
    specification: 'AES-SPEC-001',
    endpoints: [
      'GET /observe - Full state + feeling',
      'GET /verify  - Invariant verification'
    ],
    constraints: [
      'Read-only (no mutations)',
      'Logs OBSERVATION_RECEIVED (audit category)',
      'Does not affect EFE / cycle memory / energy'
    ]
  }),

  '/observe': async (req) => {
    const state = readState();
    if (!state) {
      return { error: 'Entity not initialized', initialized: false };
    }

    const stateHash = hashObject(state);
    const observer = req.headers['x-observer'] as string || 'unknown';

    // Log observation (audit-only)
    await logObservation(observer, 'rest', '/observe', stateHash);

    const feeling = computeFeeling(state);

    return {
      timestamp: new Date().toISOString(),
      state: {
        specification: state.specification,
        organization_hash: state.organization_hash,
        mode: state.integrity.status,
        energy: state.energy,
        lyapunov: state.lyapunov,
        coupling: state.coupling,
        session: state.session,
        memory: {
          event_count: state.memory.event_count,
          important_count: state.important.length
        }
      },
      feeling,
      observed: {
        hash: stateHash,
        observer,
        channel: 'rest'
      }
    };
  },

  '/verify': async (req) => {
    const state = readState();
    if (!state) {
      return { error: 'Entity not initialized', initialized: false };
    }

    const stateHash = hashObject(state);
    const observer = req.headers['x-observer'] as string || 'unknown';

    // Log observation (audit-only)
    await logObservation(observer, 'rest', '/verify', stateHash);

    // Run verification
    const result = await verifyAllInvariants(BASE_DIR);

    return {
      timestamp: new Date().toISOString(),
      verification: result,
      observed: {
        hash: stateHash,
        observer,
        channel: 'rest'
      }
    };
  }
};

// Request handler
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Observer');
  res.setHeader('Content-Type', 'application/json');

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only GET allowed
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed. Read-only API.' }));
    return;
  }

  try {
    const url = new URL(req.url ?? '/', `http://${config.host}:${config.port}`);
    const pathname = url.pathname;

    const handler = routes[pathname];
    if (!handler) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found', path: pathname }));
      return;
    }

    const result = await handler(req, url);
    res.writeHead(200);
    res.end(JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    res.writeHead(500);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.end(JSON.stringify({ error: message }));
  }
}

// Start server
export function startServer(customConfig?: Partial<APIConfig>): Promise<string> {
  return new Promise((resolve, reject) => {
    if (server) {
      reject(new Error('Server already running'));
      return;
    }

    config = { ...DEFAULT_CONFIG, ...customConfig };
    server = http.createServer((req, res) => {
      handleRequest(req, res).catch(err => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${config.port} already in use`));
      } else {
        reject(err);
      }
    });

    server.listen(config.port, config.host, () => {
      const url = `http://${config.host}:${config.port}`;
      resolve(url);
    });
  });
}

// Stop server
export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => {
      server = null;
      resolve();
    });
  });
}

// Server status
export function getServerStatus(): { running: boolean; url?: string } {
  if (!server) {
    return { running: false };
  }
  return {
    running: true,
    url: `http://${config.host}:${config.port}`
  };
}

// CLI entry point
if (process.argv[1]?.includes('server')) {
  const port = parseInt(process.argv[2] ?? '3000', 10);
  startServer({ port })
    .then(url => console.log(`Entity API running at ${url}`))
    .catch(console.error);
}
