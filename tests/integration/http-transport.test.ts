import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

interface JsonRpcResponse {
  id: number | null;
  result?: {
    serverInfo?: { name: string };
    tools?: Array<{ name: string }>;
  };
  error?: { message: string };
}

async function availablePort(): Promise<number> {
  const server = createNetServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function startGravApiMock(): Promise<{
  server: HttpServer;
  url: string;
  manifestRequests: () => number;
}> {
  let manifestRequestCount = 0;
  const server = createHttpServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/mcp/tools') {
      manifestRequestCount++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        data: {
          tools: [{
            name: 'testplugin_status',
            plugin: 'testplugin',
            description: 'Read test plugin status.',
            method: 'GET',
            path: '/testplugin/status',
            input_schema: { type: 'object', properties: {} },
          }],
        },
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 404, title: 'Not Found' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    url: `http://127.0.0.1:${port}/v1`,
    manifestRequests: () => manifestRequestCount,
  };
}

async function startGravMcp(apiUrl: string) {
  const port = await availablePort();
  const child = spawn(process.execPath, [
    tsxCli,
    'src/index.ts',
    '--transport', 'http',
    '--port', String(port),
    '--url', apiUrl,
    '--key', 'grav_test',
  ], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  };

  try {
    const deadline = Date.now() + 10_000;
    while (!stderr.includes('HTTP server listening')) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`grav-mcp exited during startup:\n${stderr}`);
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for grav-mcp to listen:\n${stderr}`);
      }
      await delay(25);
    }
  } catch (error) {
    await stop();
    throw error;
  }

  return { child, port, stderr: () => stderr, stop };
}

async function mcpRequest(
  port: number,
  body: Record<string, unknown>,
): Promise<{ status: number; body: JsonRpcResponse }> {
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text.split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');

  return { status: response.status, body: JSON.parse(data || text) as JsonRpcResponse };
}

function initializeRequest(id: number) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'http-regression-test', version: '1.0.0' },
    },
  };
}

describe('stateless HTTP transport', () => {
  it('handles sequential and concurrent MCP requests in one process', async () => {
    const api = await startGravApiMock();
    let server: Awaited<ReturnType<typeof startGravMcp>> | undefined;

    try {
      server = await startGravMcp(api.url);
      const initialized = await mcpRequest(server.port, initializeRequest(1));
      expect(initialized.status).toBe(200);
      expect(initialized.body.error).toBeUndefined();
      expect(initialized.body.result?.serverInfo?.name).toBe('grav-mcp');

      const listed = await mcpRequest(server.port, {
        jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
      });
      expect(listed.status).toBe(200);
      expect(listed.body.error).toBeUndefined();
      expect(listed.body.result?.tools?.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['list_pages', 'testplugin_status']),
      );

      const concurrent = await Promise.all([
        mcpRequest(server.port, initializeRequest(3)),
        mcpRequest(server.port, { jsonrpc: '2.0', id: 4, method: 'ping' }),
      ]);
      expect(concurrent.map((response) => response.status)).toEqual([200, 200]);
      expect(concurrent.map((response) => response.body.error)).toEqual([undefined, undefined]);

      const malformed = await fetch(`http://127.0.0.1:${server.port}/`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: '{',
      });
      expect(malformed.status).toBe(400);
      await malformed.arrayBuffer();

      const afterMalformed = await mcpRequest(server.port, {
        jsonrpc: '2.0', id: 5, method: 'ping',
      });
      expect(afterMalformed.status).toBe(200);
      expect(afterMalformed.body.error).toBeUndefined();

      expect(server.child.exitCode).toBeNull();
      expect(server.child.signalCode).toBeNull();
      expect(server.stderr()).not.toContain('Already connected to a transport');
      expect(api.manifestRequests()).toBe(1);
    } finally {
      await server?.stop();
      await closeHttpServer(api.server);
    }
  });
});
