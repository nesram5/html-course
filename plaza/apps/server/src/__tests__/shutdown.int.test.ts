import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  API_PATHS,
  CLIENT_HEADER,
  REALTIME_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@plaza/shared';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { testEnv } from '../test/config.js';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * E8-S5: a deploy stops the server with SIGTERM. The process closes the realtime connections
 * without ending the Socket.IO sessions (clients see "transport close" and reconnect by
 * themselves to the new server, E4-S6) and exits with code 0.
 */
describe('graceful shutdown (E8-S5)', () => {
  let child: ChildProcess | undefined;

  afterAll(() => {
    child?.kill('SIGKILL');
  });

  it('closes realtime connections so clients reconnect, then exits 0 on SIGTERM', async () => {
    const port = await freePort();
    const base = `http://127.0.0.1:${String(port)}`;
    let output = '';
    // Node itself (with the tsx loader), not a wrapper: the signal must reach the server.
    const args = ['--import', 'tsx', '--conditions=@plaza/source', 'src/main.ts'];
    const server = spawn(process.execPath, args, {
      cwd: serverDir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...testEnv({ PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'info' }),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child = server;
    server.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    server.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => server.on('exit', resolve));

    await vi.waitFor(
      async () => {
        const health = await fetch(`${base}${API_PATHS.health}`);
        expect(health.status).toBe(200);
      },
      { timeout: 30_000, interval: 250 },
    );
    const login = await fetch(`${base}${API_PATHS.authTestLogin}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CLIENT_HEADER]: 'test' },
      body: JSON.stringify({ email: 'shutdown@acme.com' }),
    });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const client: ClientSocket<ServerToClientEvents, ClientToServerEvents> = connect(base, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      extraHeaders: { cookie },
      reconnectionDelay: 60_000,
    });
    try {
      await new Promise<void>((resolve) => client.on('connect', resolve));
      const disconnected = new Promise<string>((resolve) => client.on('disconnect', resolve));

      server.kill('SIGTERM');

      expect(await disconnected).toBe('transport close');
      expect(client.active).toBe(true);
      expect(await exited).toBe(0);
      expect(output).toContain('Shutting down');
    } finally {
      client.disconnect();
    }
  }, 60_000);
});
