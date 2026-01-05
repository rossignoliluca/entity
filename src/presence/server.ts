/**
 * Species 2 Presence Server
 * AES-SPEC-002 - SSE + HTTP POST Implementation
 *
 * GET /presence/stream  - SSE channel (text/event-stream)
 * POST /presence/grant  - Coupling grant endpoint
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  SignalType,
  SignalPayload,
  PresenceState,
  StateSnapshot,
  ORG_HASH_V2,
  RATE_LIMITS,
} from './types.js';
import { guardSignal, createPresenceState } from './guard.js';
import { loadState, verifyReadOnly } from '../index.js';
import { appendEvent } from '../events.js';
import { sha256 } from '../hash.js';
import {
  grantRequest,
  completeRequest,
  expireRequests,
  DEFAULT_COUPLING_CONFIG,
  DEFAULT_COUPLING_QUEUE_STATE,
} from '../coupling-protocol.js';
import { writeFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..', '..');

// Server state
let presenceState: PresenceState = createPresenceState();
let previousSnapshot: StateSnapshot | null = null;
let clients: Set<ServerResponse> = new Set();
let pollInterval: NodeJS.Timeout | null = null;

/**
 * Get current state snapshot
 */
async function getStateSnapshot(): Promise<StateSnapshot> {
  const state = await loadState();
  const verification = await verifyReadOnly();

  return {
    energy: state.energy.current,
    V: state.lyapunov.V,
    invariantsSatisfied: verification.invariants.filter(i => i.satisfied).length,
    status: state.integrity.status,
    pendingCouplings: state.couplingQueue?.pending?.length ?? 0,
  };
}

/**
 * Build signal payload
 */
function buildPayload(type: SignalType, snapshot: StateSnapshot, pending: number, urgent: number): SignalPayload {
  presenceState.signalSeq++;

  return {
    type,
    ts: new Date().toISOString(),
    seq: presenceState.signalSeq,
    org_hash: ORG_HASH_V2,
    state: {
      energy: Math.round(snapshot.energy * 100) / 100,
      V: Math.round(snapshot.V * 10000) / 10000,
      integrity: `${snapshot.invariantsSatisfied}/5`,
    },
    coupling: { pending, urgent },
  };
}

/**
 * Log PRESENCE_SIGNAL_EMITTED audit event
 */
async function logSignalEvent(payload: SignalPayload): Promise<void> {
  const payloadHash = sha256(JSON.stringify(payload));

  await appendEvent(BASE_DIR, 'PRESENCE_SIGNAL_EMITTED', {
    signal_type: payload.type,
    signal_seq: payload.seq,
    payload_hash: payloadHash,
    state_energy: payload.state.energy,
    state_V: payload.state.V,
  });
}

/**
 * Broadcast signal to all connected clients
 */
async function broadcast(type: SignalType, snapshot: StateSnapshot): Promise<boolean> {
  const state = await loadState();
  const queue = state.couplingQueue ?? { ...DEFAULT_COUPLING_QUEUE_STATE };
  expireRequests(queue, DEFAULT_COUPLING_CONFIG);

  const pending = queue.pending?.length ?? 0;
  const urgent = queue.pending?.filter(r => r.priority === 'urgent').length ?? 0;

  // Build payload
  const payload = buildPayload(type, snapshot, pending, urgent);

  // Log audit event
  await logSignalEvent(payload);

  // Update presence state
  const now = new Date().toISOString();
  if (type === 'HEARTBEAT') {
    presenceState.lastHeartbeat = now;
  } else {
    presenceState.lastSignal = now;
  }

  // SSE format: event: type\ndata: json\n\n
  const message = `event: ${type.toLowerCase()}\ndata: ${JSON.stringify(payload)}\n\n`;

  // Broadcast to all clients
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }

  console.log(`[PRESENCE] Signal emitted: ${type} seq=${payload.seq} clients=${clients.size}`);
  return true;
}

/**
 * Determine what signal to emit (if any)
 */
function determineSignalType(current: StateSnapshot, previous: StateSnapshot | null): SignalType | null {
  if (!previous) return 'STATUS_CHANGED'; // First snapshot

  // Energy warning
  if (current.energy < 0.2 && previous.energy >= 0.2) {
    return 'ENERGY_WARNING';
  }

  // Status change
  if (current.status !== previous.status ||
      current.invariantsSatisfied !== previous.invariantsSatisfied) {
    return 'STATUS_CHANGED';
  }

  // Coupling requested
  if (current.pendingCouplings > previous.pendingCouplings) {
    return 'COUPLING_REQUESTED';
  }

  // Significant energy change (>10%)
  if (Math.abs(current.energy - previous.energy) > 0.1) {
    return 'STATUS_CHANGED';
  }

  return null;
}

/**
 * Poll for state changes
 */
async function pollStateChanges(): Promise<void> {
  if (clients.size === 0) return; // No clients, no work

  try {
    const currentSnapshot = await getStateSnapshot();

    // Determine signal type
    const signalType = determineSignalType(currentSnapshot, previousSnapshot);

    if (signalType) {
      // Check guard
      const guardResult = guardSignal(
        signalType,
        presenceState,
        currentSnapshot,
        previousSnapshot,
        0 // epsilon - would need agent for surprise
      );

      if (guardResult.allowed) {
        await broadcast(signalType, currentSnapshot);
        previousSnapshot = currentSnapshot;
      } else {
        console.log(`[PRESENCE] Signal blocked: ${guardResult.reason}`);
      }
    }

    // Update previous for next poll
    previousSnapshot = currentSnapshot;
  } catch (error) {
    console.error('[PRESENCE] Poll error:', (error as Error).message);
  }
}

/**
 * Handle SSE connection: GET /presence/stream
 */
function handleStream(req: IncomingMessage, res: ServerResponse): void {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Add client
  clients.add(res);
  presenceState.connected = clients.size;
  console.log(`[PRESENCE] Client connected. Total: ${clients.size}`);

  // Send initial comment (keeps connection alive)
  res.write(': connected to entity presence channel\n\n');

  // Handle disconnect
  req.on('close', () => {
    clients.delete(res);
    presenceState.connected = clients.size;
    console.log(`[PRESENCE] Client disconnected. Total: ${clients.size}`);
  });
}

/**
 * Handle coupling grant: POST /presence/grant
 */
async function handleGrant(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = '';

  req.on('data', chunk => { body += chunk; });

  req.on('end', async () => {
    try {
      const { request_id, action, outcome, note } = JSON.parse(body);

      if (!request_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'request_id required' }));
        return;
      }

      const state = await loadState();
      const queue = state.couplingQueue ?? { ...DEFAULT_COUPLING_QUEUE_STATE };
      expireRequests(queue, DEFAULT_COUPLING_CONFIG);

      let result;
      if (action === 'complete') {
        result = completeRequest(queue, request_id, outcome || 'resolved', note, DEFAULT_COUPLING_CONFIG);
      } else {
        // Default: grant
        result = grantRequest(queue, request_id, DEFAULT_COUPLING_CONFIG);
      }

      if (result.success) {
        state.couplingQueue = queue;
        await writeFile(
          join(BASE_DIR, 'state', 'current.json'),
          JSON.stringify(state, null, 2)
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          request_id,
          action: action || 'grant',
          status: result.request?.status,
        }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: result.reason }));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  });
}

/**
 * Handle status: GET /presence/status
 */
function handleStatus(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    connected: presenceState.connected,
    lastSignal: presenceState.lastSignal,
    lastHeartbeat: presenceState.lastHeartbeat,
    signalSeq: presenceState.signalSeq,
    silencedUntil: presenceState.silencedUntil,
    org_hash: ORG_HASH_V2,
  }));
}

/**
 * Request handler
 */
function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Routes
  if (url === '/presence/stream' && method === 'GET') {
    handleStream(req, res);
  } else if (url === '/presence/grant' && method === 'POST') {
    handleGrant(req, res);
  } else if (url === '/presence/status' && method === 'GET') {
    handleStatus(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not found',
      endpoints: [
        'GET /presence/stream - SSE channel',
        'POST /presence/grant - Coupling grant',
        'GET /presence/status - Channel status',
      ],
    }));
  }
}

/**
 * Start presence server
 */
export async function startPresenceServer(port: number = 3001): Promise<void> {
  const server = createServer(handleRequest);

  // Start polling for state changes
  pollInterval = setInterval(pollStateChanges, 5000); // Poll every 5 seconds

  server.listen(port, () => {
    console.log(`[PRESENCE] Species 2 Presence Server`);
    console.log(`[PRESENCE] SSE:   http://localhost:${port}/presence/stream`);
    console.log(`[PRESENCE] Grant: http://localhost:${port}/presence/grant`);
    console.log(`[PRESENCE] Org:   ${ORG_HASH_V2.substring(0, 16)}...`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[PRESENCE] Shutting down...');
    if (pollInterval) clearInterval(pollInterval);
    for (const client of clients) {
      client.end();
    }
    server.close();
    process.exit(0);
  });
}

// Export for CLI
export { presenceState, clients };
