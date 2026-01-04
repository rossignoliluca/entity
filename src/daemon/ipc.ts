/**
 * IPC Module
 * AES-SPEC-001 Phase 7b: Inter-Process Communication
 *
 * Provides communication between CLI and daemon via Unix socket.
 */

import { EventEmitter } from 'events';
import { createServer, createConnection, Socket, Server } from 'net';
import { unlink } from 'fs/promises';

// =============================================================================
// Types
// =============================================================================

export interface IPCMessage {
  id: string;
  type: 'request' | 'response' | 'broadcast';
  command?: { type: string; payload?: unknown };
  result?: unknown;
  error?: string;
  data?: unknown;
}

// =============================================================================
// IPCServer Class
// =============================================================================

export class IPCServer extends EventEmitter {
  private socketPath: string;
  private server: Server | null = null;
  private clients: Set<Socket> = new Set();

  constructor(socketPath: string) {
    super();
    this.socketPath = socketPath;
  }

  async start(): Promise<void> {
    // Remove existing socket file
    try {
      await unlink(this.socketPath);
    } catch {
      // Ignore if doesn't exist
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));

      this.server.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });

      this.server.listen(this.socketPath, () => {
        this.emit('listening', this.socketPath);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    // Close server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;
          // Remove socket file
          unlink(this.socketPath).catch(() => {});
          resolve();
        });
      });
    }
  }

  private handleConnection(socket: Socket): void {
    this.clients.add(socket);
    this.emit('connection', socket);

    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      // Try to parse complete messages (newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const message: IPCMessage = JSON.parse(line);
          await this.handleMessage(socket, message);
        } catch (error) {
          this.sendError(socket, 'parse-error', `Invalid message: ${error}`);
        }
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.emit('disconnection', socket);
    });

    socket.on('error', (error) => {
      this.emit('clientError', { socket, error });
    });
  }

  private async handleMessage(socket: Socket, message: IPCMessage): Promise<void> {
    if (message.type !== 'request' || !message.command) {
      this.sendError(socket, message.id, 'Invalid request');
      return;
    }

    // Emit command event with response callback
    this.emit('command', message.command, (result: unknown) => {
      this.sendResponse(socket, message.id, result);
    });
  }

  private sendResponse(socket: Socket, id: string, result: unknown): void {
    const response: IPCMessage = {
      id,
      type: 'response',
      result,
    };
    socket.write(JSON.stringify(response) + '\n');
  }

  private sendError(socket: Socket, id: string, error: string): void {
    const response: IPCMessage = {
      id,
      type: 'response',
      error,
    };
    socket.write(JSON.stringify(response) + '\n');
  }

  broadcast(message: unknown): void {
    const data = JSON.stringify({ type: 'broadcast', data: message }) + '\n';
    for (const client of this.clients) {
      client.write(data);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// =============================================================================
// IPCClient Class
// =============================================================================

export class IPCClient extends EventEmitter {
  private socketPath: string;
  private socket: Socket | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private requestTimeout: number = 5000;

  constructor(socketPath: string) {
    super();
    this.socketPath = socketPath;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath);

      let connected = false;

      this.socket.on('connect', () => {
        connected = true;
        this.emit('connected');
        resolve();
      });

      this.socket.on('error', (error) => {
        // Only reject if we haven't connected yet
        // Don't emit 'error' event to avoid unhandled error crashes
        if (!connected) {
          reject(error);
        }
      });

      let buffer = '';
      this.socket.on('data', (data) => {
        buffer += data.toString();

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const message: IPCMessage = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            this.emit('parseError', error);
          }
        }
      });

      this.socket.on('close', () => {
        this.emit('disconnected');
        this.rejectAllPending(new Error('Connection closed'));
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.rejectAllPending(new Error('Client disconnected'));
  }

  async send(command: { type: string; payload?: unknown }): Promise<unknown> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message: IPCMessage = {
        id,
        type: 'request',
        command,
      };

      this.socket!.write(JSON.stringify(message) + '\n');
    });
  }

  private handleMessage(message: IPCMessage): void {
    if (message.type === 'response') {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.type === 'broadcast') {
      this.emit('broadcast', message);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Send a command to the daemon and get the response
 */
export async function sendDaemonCommand(
  socketPath: string,
  command: { type: string; payload?: unknown }
): Promise<unknown> {
  const client = new IPCClient(socketPath);

  try {
    await client.connect();
    const result = await client.send(command);
    client.disconnect();
    return result;
  } catch (error) {
    client.disconnect();
    throw error;
  }
}

/**
 * Check if daemon is running
 */
export async function isDaemonRunning(socketPath: string): Promise<boolean> {
  try {
    const result = await sendDaemonCommand(socketPath, { type: 'status' });
    return (result as { running?: boolean })?.running === true;
  } catch {
    return false;
  }
}
