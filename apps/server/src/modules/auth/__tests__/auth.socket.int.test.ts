import type { AddressInfo } from 'node:net';

import {
  REALTIME_PATH,
  type ClientToServerEvents,
  type ErrorPayload,
  type ServerToClientEvents,
} from '@bululu/shared';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SocketData } from '../../../platform/socket.js';
import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn } from '../../../test/session.js';
import { modules } from '../../index.js';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

describe('Socket.IO handshake authentication (requireUser for sockets)', () => {
  let testApp: TestApp;
  let url: string;
  const connected: SocketData[] = [];
  const clients: Client[] = [];

  beforeAll(async () => {
    testApp = await buildTestApp({
      modules: [
        ...modules,
        {
          name: 'capture',
          register({ io }) {
            io.on('connection', (socket) => connected.push({ ...socket.data }));
          },
        },
      ],
    });
    await testApp.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = testApp.app.server.address() as AddressInfo;
    url = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    connected.length = 0;
    await resetDatabase(testApp.container.db);
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
  });

  function open(cookie?: string, origin?: string): Client {
    const headers: Record<string, string> = {
      ...(cookie !== undefined && { cookie }),
      ...(origin !== undefined && { origin }),
    };
    const client: Client = connect(url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: headers,
    });
    clients.push(client);
    return client;
  }

  function connectError(client: Client): Promise<Error & { data?: ErrorPayload }> {
    return new Promise((resolve) => client.on('connect_error', resolve));
  }

  it('refuses connections without a session with UNAUTHORIZED', async () => {
    const error = await connectError(open());

    expect(error.data?.code).toBe('UNAUTHORIZED');
    expect(connected).toHaveLength(0);
  });

  it('refuses connections with a logged-out session', async () => {
    const ana = await signIn(testApp.app, 'ana@acme.com');
    await testApp.app.inject({ method: 'POST', url: '/api/auth/logout', headers: ana.headers });

    const error = await connectError(open(ana.cookie));

    expect(error.data?.code).toBe('UNAUTHORIZED');
  });

  it('closes the open connections of a session when it logs out, and only those', async () => {
    const ana = await signIn(testApp.app, 'ana@acme.com');
    const otherDevice = await signIn(testApp.app, 'ana@acme.com');
    const loggingOut = open(ana.cookie);
    const staying = open(otherDevice.cookie);
    await Promise.all(
      [loggingOut, staying].map(
        (client) => new Promise<void>((resolve) => client.on('connect', resolve)),
      ),
    );
    const closed = new Promise<string>((resolve) => loggingOut.on('disconnect', resolve));

    await testApp.app.inject({ method: 'POST', url: '/api/auth/logout', headers: ana.headers });

    expect(await closed).toBe('io server disconnect');
    expect(staying.connected).toBe(true);
  });

  it('accepts a valid session and fills socket.data', async () => {
    const ana = await signIn(testApp.app, 'ana@acme.com');
    const client = open(ana.cookie);

    await new Promise<void>((resolve) => client.on('connect', resolve));

    expect(connected).toHaveLength(1);
    expect(connected[0]?.userId).toBe(ana.user.id);
    expect(connected[0]?.sessionId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses browsers on another origin even with a valid session (cross-site WebSocket hijacking)', async () => {
    const ana = await signIn(testApp.app, 'ana@acme.com');

    const error = await connectError(open(ana.cookie, 'https://evil.example.com'));

    expect(error.message).not.toBe('');
    expect(connected).toHaveLength(0);
  });

  it('accepts browsers on the public origin of the app', async () => {
    const ana = await signIn(testApp.app, 'ana@acme.com');
    const client = open(ana.cookie, testApp.container.config.publicUrl);

    await new Promise<void>((resolve) => client.on('connect', resolve));

    expect(connected[0]?.userId).toBe(ana.user.id);
  });
});
