import type { AddressInfo } from 'node:net';

import {
  PROTOCOL_VERSION,
  REALTIME_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SpaceSnapshot,
} from '@bululu/shared';
import Fastify from 'fastify';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildTestApp, type TestApp } from '../../test/app.js';
import { AppError } from '../errors.js';
import {
  attachSocketServer,
  REALTIME_HEARTBEAT,
  REALTIME_MAX_MESSAGE_BYTES,
  safeHandler,
} from '../socket.js';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const snapshot: SpaceSnapshot = {
  v: PROTOCOL_VERSION,
  spaceId: 'space-1',
  mapTemplateId: 'office-small@1',
  themeId: 'pixel',
  self: {
    userId: 'u1',
    displayName: 'Ana',
    avatarId: 'avatar-01',
    x: 1,
    y: 1,
    dir: 'down',
    status: 'available',
    away: false,
    roomId: null,
    inConversation: false,
    reconnecting: false,
  },
  players: [],
  rooms: [],
  desks: [],
};

describe('realtime platform', () => {
  let testApp: TestApp;
  let client: Client;

  beforeAll(async () => {
    testApp = await buildTestApp({
      modules: [
        {
          name: 'test-socket',
          register({ io, socketDeps }) {
            io.on('connection', (socket) => {
              socket.on(
                'space:join',
                safeHandler(socketDeps, socket, 'space:join', (payload) => {
                  if (payload.spaceId === 'full') throw new AppError('SPACE_FULL');
                  return snapshot;
                }),
              );
              socket.on(
                'player:move',
                safeHandler(socketDeps, socket, 'player:move', () => {
                  throw new Error('tick exploded');
                }),
              );
            });
          },
        },
      ],
    });
    await testApp.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = testApp.app.server.address() as AddressInfo;
    client = connect(`http://127.0.0.1:${String(port)}`, {
      path: REALTIME_PATH,
      transports: ['websocket'],
    });
    await new Promise<void>((resolve) => client.on('connect', resolve));
  });

  afterAll(async () => {
    client.disconnect();
    await testApp.app.close();
  });

  it('mounts Socket.IO at /realtime and answers acks with data', async () => {
    const response = await client.emitWithAck('space:join', { v: PROTOCOL_VERSION, spaceId: 's' });
    expect(response).toEqual({ ok: true, data: snapshot });
  });

  it('answers AppError codes through the ack', async () => {
    const response = await client.emitWithAck('space:join', {
      v: PROTOCOL_VERSION,
      spaceId: 'full',
    });
    expect(response).toEqual({ ok: false, error: { code: 'SPACE_FULL', message: 'SPACE_FULL' } });
  });

  it('rejects a different protocol version with PROTOCOL_MISMATCH', async () => {
    const response = await client.emitWithAck('space:join', {
      v: PROTOCOL_VERSION + 1,
      spaceId: 's',
    });
    expect(response.ok).toBe(false);
    expect(!response.ok && response.error.code).toBe('PROTOCOL_MISMATCH');
  });

  it('rejects invalid payloads with VALIDATION_ERROR', async () => {
    const response = await client.emitWithAck('space:join', { v: PROTOCOL_VERSION, spaceId: '' });
    expect(!response.ok && response.error.code).toBe('VALIDATION_ERROR');
  });

  it('emits `error` INTERNAL for failing handlers without ack, reports it and keeps serving', async () => {
    const received = new Promise((resolve) => client.once('error', resolve));
    client.emit('player:move', { v: PROTOCOL_VERSION, x: 1, y: 2, dir: 'up' });
    expect(await received).toEqual({ code: 'INTERNAL', message: 'Internal server error' });
    expect(testApp.reporter.captured.at(-1)?.context?.event).toBe('player:move');

    const response = await client.emitWithAck('space:join', { v: PROTOCOL_VERSION, spaceId: 's' });
    expect(response.ok).toBe(true);
  });
});

describe('realtime message size (E8-S2)', () => {
  it('closes the connection of a client that sends an oversized message', async () => {
    const app = Fastify();
    attachSocketServer(app, { corsOrigin: 'http://localhost:5173' });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const client: Client = connect(`http://127.0.0.1:${String(port)}`, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve) => client.on('connect', resolve));
      const disconnected = new Promise<string>((resolve) => client.on('disconnect', resolve));

      client.emit(
        'chat:send',
        { v: PROTOCOL_VERSION, body: 'x'.repeat(REALTIME_MAX_MESSAGE_BYTES + 1) },
        () => undefined,
      );

      expect(await disconnected).toMatch(/transport (close|error)/);
    } finally {
      client.disconnect();
      await app.close();
    }
  });
});

describe('realtime heartbeat (E4-S6)', () => {
  it('notices a silent network cut within 20 s', () => {
    expect(
      REALTIME_HEARTBEAT.pingIntervalMs + REALTIME_HEARTBEAT.pingTimeoutMs,
    ).toBeLessThanOrEqual(20_000);
  });

  it('announces the heartbeat in the handshake and drops a client that stops answering', async () => {
    const app = Fastify();
    const io = attachSocketServer(app, {
      corsOrigin: 'http://localhost:5173',
      heartbeat: { pingIntervalMs: 100, pingTimeoutMs: 100 },
    });
    const reasons: string[] = [];
    io.on('connection', (socket) => {
      socket.on('disconnect', (reason) => reasons.push(reason));
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    // A raw Engine.IO client that connects and then goes silent (never answers a ping), like a
    // browser whose network vanished without closing the TCP connection.
    const ws = new WebSocket(
      `ws://127.0.0.1:${String(port)}${REALTIME_PATH}/?EIO=4&transport=websocket`,
    );
    const received: string[] = [];
    ws.addEventListener('message', (event) => {
      received.push(String(event.data));
    });
    await new Promise((resolve) => {
      ws.addEventListener('open', resolve);
    });
    ws.send('40'); // Socket.IO CONNECT to the main namespace.

    try {
      await vi.waitFor(() => {
        expect(reasons).toEqual(['ping timeout']);
      });
      const open = received.find((packet) => packet.startsWith('0'));
      expect(JSON.parse(open?.slice(1) ?? '{}')).toMatchObject({
        pingInterval: 100,
        pingTimeout: 100,
      });
    } finally {
      ws.close();
      await app.close();
    }
  });
});

describe('realtime shutdown (E4-S6)', () => {
  it('closes the connections so that clients reconnect by themselves once the server is back', async () => {
    const app = Fastify();
    attachSocketServer(app, { corsOrigin: 'http://localhost:5173' });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const client: Client = connect(`http://127.0.0.1:${String(port)}`, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnectionDelay: 60_000,
    });
    await new Promise<void>((resolve) => client.on('connect', resolve));
    const disconnected = new Promise<string>((resolve) => {
      client.on('disconnect', resolve);
    });

    try {
      await app.close();

      // Not "io server disconnect", after which Socket.IO clients never retry.
      expect(await disconnected).toBe('transport close');
      expect(client.active).toBe(true);
    } finally {
      client.disconnect();
    }
  });
});

describe('realtime connection rate limit (E8-S2)', () => {
  it('refuses new connections from an address over REALTIME_CONNECTIONS_PER_MINUTE', async () => {
    const testApp = await buildTestApp({
      modules: [],
      env: { REALTIME_CONNECTIONS_PER_MINUTE: '2', TRUST_PROXY: '1' },
    });
    await testApp.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = testApp.app.server.address() as AddressInfo;
    const clients: Client[] = [];
    const attempt = (forwardedFor: string): Promise<'connected' | 'refused'> => {
      const client: Client = connect(`http://127.0.0.1:${String(port)}`, {
        path: REALTIME_PATH,
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { 'x-forwarded-for': forwardedFor },
      });
      clients.push(client);
      return new Promise((resolve) => {
        client.on('connect', () => {
          resolve('connected');
        });
        client.on('connect_error', () => {
          resolve('refused');
        });
      });
    };

    try {
      const results: string[] = [];
      for (let i = 0; i < 3; i++) results.push(await attempt(`6.6.6.${String(i)}, 198.51.100.7`));
      expect(results).toEqual(['connected', 'connected', 'refused']);
      // Other addresses keep their own allowance.
      expect(await attempt('198.51.100.8')).toBe('connected');
    } finally {
      for (const client of clients) client.disconnect();
      await testApp.app.close();
    }
  });
});
