/**
 * Species 2 Presence Test Client
 * EventSource client for testing SSE channel
 *
 * Usage: npx ts-node src/presence/test-client.ts [port]
 */

const port = process.argv[2] || '3001';
const url = `http://localhost:${port}/presence/stream`;

console.log(`\n┌─────────────────────────────────────────┐`);
console.log(`│  Species 2 Presence Test Client         │`);
console.log(`└─────────────────────────────────────────┘`);
console.log(`\nConnecting to: ${url}\n`);

// Use native fetch with streaming
async function connect() {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    console.log('✓ Connected to presence channel\n');
    console.log('Waiting for signals... (Ctrl+C to exit)\n');
    console.log('─'.repeat(60));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log('\n✗ Connection closed');
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE format: event: type\ndata: json\n\n
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || ''; // Keep incomplete message in buffer

      for (const msg of messages) {
        if (!msg.trim()) continue;

        const lines = msg.split('\n');
        let eventType = '';
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            data = line.substring(5).trim();
          } else if (line.startsWith(':')) {
            // Comment (connection keep-alive)
            console.log(`[comment] ${line.substring(1).trim()}`);
          }
        }

        if (eventType && data) {
          try {
            const payload = JSON.parse(data);
            const ts = new Date(payload.ts).toLocaleTimeString();
            console.log(`\n[${ts}] ${eventType.toUpperCase()}`);
            console.log(`  seq: ${payload.seq}`);
            console.log(`  state: E=${payload.state.energy} V=${payload.state.V} inv=${payload.state.integrity}`);
            console.log(`  coupling: pending=${payload.coupling.pending} urgent=${payload.coupling.urgent}`);
          } catch {
            console.log(`\n[raw] ${eventType}: ${data}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`\n✗ Error: ${(error as Error).message}`);
    console.log('\nMake sure the presence server is running:');
    console.log(`  node dist/src/index.js presence start ${port}`);
    process.exit(1);
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nDisconnected.');
  process.exit(0);
});

connect();
