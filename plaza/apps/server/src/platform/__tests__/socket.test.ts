import type { AddressInfo } from 'node:net';

import {
  PROTOCOL_VERSION,
  REALTIME_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SpaceSnapshot,
} from '@plaza/shared';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../test/app.js';
import { AppError } from '../errors.js';
import { safeHandler } from '../socket.js';

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
