/**
 * Entity MCP Server
 * AES-SPEC-001 - Category 3: Boundary Interface
 *
 * Implements Model Context Protocol for structural coupling (AXM-007)
 * with LLM hosts (Claude, OpenAI, Gemini).
 *
 * Resources: Read-only observation
 * Tools: State-modifying actions (guard-protected)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadState, startSession, endSession, rechargeEnergy, runOperation, verify, verifyReadOnly } from '../index.js';
import { loadEvents } from '../events.js';
import { createAgent } from '../daemon/agent.js';
import {
  grantRequest,
  completeRequest,
  expireRequests,
  DEFAULT_COUPLING_CONFIG,
  DEFAULT_COUPLING_QUEUE_STATE,
} from '../coupling-protocol.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get base directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..', '..');

/**
 * Create and configure the MCP server
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: 'entity',
      version: '1.9.2',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // ==========================================================================
  // RESOURCES (Read-Only Observation)
  // ==========================================================================

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'entity://state',
          name: 'Entity State',
          description: 'Current state summary (status, energy, V, events, sessions)',
          mimeType: 'application/json',
        },
        {
          uri: 'entity://feeling',
          name: 'Agent Feeling',
          description: 'Current agent feeling (energy, stability, integrity, surprise)',
          mimeType: 'application/json',
        },
        {
          uri: 'entity://verify',
          name: 'Invariant Verification',
          description: 'Verify all 5 invariants (read-only, no event logged)',
          mimeType: 'application/json',
        },
        {
          uri: 'entity://events/recent',
          name: 'Recent Events',
          description: 'Last 10 events from Merkle chain',
          mimeType: 'application/json',
        },
        {
          uri: 'entity://coupling',
          name: 'Coupling Queue',
          description: 'Pending coupling requests from agent',
          mimeType: 'application/json',
        },
        {
          uri: 'entity://memories',
          name: 'Important Memories',
          description: 'List of important memories',
          mimeType: 'application/json',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    try {
      if (uri === 'entity://state') {
        const state = await loadState();
        const summary = {
          status: state.integrity.status,
          energy: state.energy.current,
          lyapunovV: state.lyapunov.V,
          events: state.memory.event_count,
          sessions: state.session.total_count,
          coupled: state.coupling.active,
          partner: state.coupling.partner,
          updated: state.updated,
        };
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      if (uri === 'entity://feeling') {
        const agent = createAgent(BASE_DIR);
        const feeling = await agent.getCurrentFeeling();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(feeling, null, 2),
            },
          ],
        };
      }

      if (uri === 'entity://verify') {
        const result = await verifyReadOnly();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (uri === 'entity://events/recent') {
        const events = await loadEvents(BASE_DIR);
        const recent = events.slice(-10).map((e) => ({
          seq: e.seq,
          type: e.type,
          timestamp: e.timestamp,
          hash: e.hash.substring(0, 16) + '...',
        }));
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(recent, null, 2),
            },
          ],
        };
      }

      if (uri === 'entity://coupling') {
        const state = await loadState();
        const queue = state.couplingQueue ?? { ...DEFAULT_COUPLING_QUEUE_STATE };

        // Expire old requests
        expireRequests(queue, DEFAULT_COUPLING_CONFIG);

        const summary = {
          pending: queue.pending.map((r) => ({
            id: r.id,
            priority: r.priority,
            reason: r.reason,
            status: r.status,
            expiresAt: r.expiresAt,
          })),
          metrics: queue.metrics,
        };
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      if (uri === 'entity://memories') {
        const state = await loadState();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(state.important, null, 2),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    } catch (error) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Error: ${(error as Error).message}`,
          },
        ],
      };
    }
  });

  // ==========================================================================
  // TOOLS (State-Modifying Actions - Guard Protected)
  // ==========================================================================

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'session_start',
          description: 'Start a coupling session with the entity. Creates a bidirectional coupling (AXM-007).',
          inputSchema: {
            type: 'object',
            properties: {
              partner: {
                type: 'string',
                description: 'Identifier for the partner (e.g., "claude", "human")',
              },
            },
            required: [],
          },
        },
        {
          name: 'session_end',
          description: 'End the current coupling session. Applies energy decay.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'recharge',
          description: 'Recharge entity energy by +0.10. Use when energy is low.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'verify_record',
          description: 'Verify all invariants AND record result to event chain.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'op_exec',
          description: 'Execute an operation from the catalog. Requires active coupling session.',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                description: 'Operation ID (e.g., "state.summary", "energy.status")',
              },
              params: {
                type: 'object',
                description: 'Optional parameters for the operation',
              },
            },
            required: ['operation'],
          },
        },
        {
          name: 'agent_cycle',
          description: 'Force an agent sense-making cycle. The agent will feel and respond.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'coupling_grant',
          description: 'Grant a pending coupling request from the agent.',
          inputSchema: {
            type: 'object',
            properties: {
              request_id: {
                type: 'string',
                description: 'ID of the coupling request to grant',
              },
            },
            required: ['request_id'],
          },
        },
        {
          name: 'coupling_complete',
          description: 'Complete a granted coupling request.',
          inputSchema: {
            type: 'object',
            properties: {
              request_id: {
                type: 'string',
                description: 'ID of the coupling request to complete',
              },
              outcome: {
                type: 'string',
                enum: ['resolved', 'ignored'],
                description: 'Outcome of the request',
              },
              note: {
                type: 'string',
                description: 'Optional note about the resolution',
              },
            },
            required: ['request_id'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'session_start': {
          const partner = (args?.partner as string) || 'mcp-client';
          const sessionId = await startSession(partner);
          return {
            content: [
              {
                type: 'text',
                text: `Session started: ${sessionId}\nCoupling active with partner: ${partner}`,
              },
            ],
          };
        }

        case 'session_end': {
          await endSession();
          const state = await loadState();
          return {
            content: [
              {
                type: 'text',
                text: `Session ended.\nEnergy: ${state.energy.current.toFixed(2)}\nTotal sessions: ${state.session.total_count}`,
              },
            ],
          };
        }

        case 'recharge': {
          await rechargeEnergy();
          const state = await loadState();
          return {
            content: [
              {
                type: 'text',
                text: `Energy recharged: ${state.energy.current.toFixed(2)}`,
              },
            ],
          };
        }

        case 'verify_record': {
          const result = await verify();
          return {
            content: [
              {
                type: 'text',
                text: `Verification: ${result.all_satisfied ? 'PASSED' : 'FAILED'}\nInvariants: ${result.invariants.filter((i) => i.satisfied).length}/${result.invariants.length}\nLyapunov V: ${result.lyapunov_V.toFixed(6)}\n(Recorded to event chain)`,
              },
            ],
          };
        }

        case 'op_exec': {
          const operation = args?.operation as string;
          if (!operation) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: operation parameter required' }],
            };
          }

          const params = (args?.params as Record<string, unknown>) || {};

          // Capture console output
          const originalLog = console.log;
          let output = '';
          console.log = (...msgs: unknown[]) => {
            output += msgs.join(' ') + '\n';
          };

          try {
            await runOperation(operation, params);
          } finally {
            console.log = originalLog;
          }

          return {
            content: [{ type: 'text', text: output.trim() || `Operation ${operation} executed` }],
          };
        }

        case 'agent_cycle': {
          const agent = createAgent(BASE_DIR);
          const { feeling, response } = await agent.forceCycle();

          return {
            content: [
              {
                type: 'text',
                text: `=== Sense-Making Cycle ===

Feeling:
  Energy: ${feeling.energyFeeling} (${(feeling.energy * 100).toFixed(1)}%)
  Stability: ${feeling.stabilityFeeling} (V=${feeling.lyapunovV.toFixed(4)})
  Integrity: ${feeling.integrityFeeling} (${feeling.invariantsSatisfied}/${feeling.invariantsTotal})
  Surprise: ${feeling.surprise.toFixed(4)}

Response:
  Priority: ${response.priority}
  Action: ${response.action || '(rest)'}
  Reason: ${response.reason}
  Constitutional: ${response.constitutionalCheck}`,
              },
            ],
          };
        }

        case 'coupling_grant': {
          const requestId = args?.request_id as string;
          if (!requestId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: request_id parameter required' }],
            };
          }

          const state = await loadState();
          const queue = state.couplingQueue ?? { ...DEFAULT_COUPLING_QUEUE_STATE };

          // Expire old requests first
          expireRequests(queue, DEFAULT_COUPLING_CONFIG);

          const result = grantRequest(queue, requestId, DEFAULT_COUPLING_CONFIG);

          if (result.success && result.request) {
            // Save state (simplified - in production would use proper event logging)
            state.couplingQueue = queue;
            const { writeFile } = await import('fs/promises');
            await writeFile(
              join(BASE_DIR, 'state', 'current.json'),
              JSON.stringify(state, null, 2)
            );

            return {
              content: [
                {
                  type: 'text',
                  text: `Request ${requestId} granted.\nPriority: ${result.request.priority}\nReason: ${result.request.reason}\nUse coupling_complete when done.`,
                },
              ],
            };
          } else {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: ${result.reason}` }],
            };
          }
        }

        case 'coupling_complete': {
          const requestId = args?.request_id as string;
          const outcome = (args?.outcome as 'resolved' | 'ignored') || 'resolved';
          const note = args?.note as string | undefined;

          if (!requestId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: request_id parameter required' }],
            };
          }

          const state = await loadState();
          const queue = state.couplingQueue ?? { ...DEFAULT_COUPLING_QUEUE_STATE };

          const result = completeRequest(queue, requestId, outcome, note, DEFAULT_COUPLING_CONFIG);

          if (result.success && result.request) {
            // Save state
            state.couplingQueue = queue;
            const { writeFile } = await import('fs/promises');
            await writeFile(
              join(BASE_DIR, 'state', 'current.json'),
              JSON.stringify(state, null, 2)
            );

            return {
              content: [
                {
                  type: 'text',
                  text: `Request ${requestId} completed.\nOutcome: ${outcome}${note ? `\nNote: ${note}` : ''}`,
                },
              ],
            };
          } else {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: ${result.reason}` }],
            };
          }
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          };
      }
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      };
    }
  });

  return server;
}

/**
 * Start MCP server with stdio transport
 */
export async function startMCPServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Entity MCP Server started on stdio');
}

// Run if executed directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startMCPServer().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
