import type { AddressInfo } from 'node:net';

import {
  API_PATHS,
  apiPath,
  REALTIME_PATH,
  SpaceResponseSchema,
  type ClientToServerEvents,
  type MeetingRoomDto,
  type ServerToClientEvents,
  type SpaceDetailDto,
  type SpaceKicked,
} from '@bululu/shared';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { z } from 'zod';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { signIn, type TestUser } from '../../../test/session.js';
import { modules } from '../../index.js';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Stands in for E4's `space:join`, which sets `socket.data.spaceId`: here the client passes the
 * space in the handshake `auth` payload.
 */
const fakeSpaceJoin = {
  name: 'fake-space-join',
  register({ io }: { io: TestApp['app']['io'] }) {
    io.on('connection', (socket) => {
      const auth = z.object({ spaceId: z.string() }).safeParse(socket.handshake.auth);
      if (auth.success) socket.data.spaceId = auth.data.spaceId;
    });
  },
};

describe('space notifications to connected sockets', () => {
  let testApp: TestApp;
  let url: string;
  let ana: TestUser;
  let luis: TestUser;
  let space: SpaceDetailDto;
  const clients: Client[] = [];

  beforeAll(async () => {
    testApp = await buildTestApp({ modules: [...modules, fakeSpaceJoin] });
    await testApp.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = testApp.app.server.address() as AddressInfo;
    url = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
    ana = await signIn(testApp.app, 'ana@acme.com');
    luis = await signIn(testApp.app, 'luis@acme.com');
    const created = await testApp.app.inject({
      method: 'POST',
      url: API_PATHS.spaces,
      headers: ana.headers,
      payload: { name: 'Oficina Acme', mapTemplateId: 'office-small@1' },
    });
    space = SpaceResponseSchema.parse(created.json()).space;
    const token = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
    await testApp.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.join, { token }),
      headers: luis.headers,
    });
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
  });

  async function openInSpace(user: TestUser): Promise<Client> {
    const client: Client = connect(url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie: user.cookie },
      auth: { spaceId: space.id },
    });
    clients.push(client);
    await new Promise<void>((resolve) => client.on('connect', resolve));
    return client;
  }

  it('kicked members get space:kicked { reason: "REMOVED" } and are disconnected', async () => {
    const luisSocket = await openInSpace(luis);
    const anaSocket = await openInSpace(ana);
    const kicked = new Promise<SpaceKicked>((resolve) => luisSocket.on('space:kicked', resolve));
    const disconnected = new Promise<string>((resolve) => luisSocket.on('disconnect', resolve));

    const response = await testApp.app.inject({
      method: 'DELETE',
      url: apiPath(API_PATHS.member, { spaceId: space.id, userId: luis.user.id }),
      headers: ana.headers,
    });

    expect(response.statusCode).toBe(204);
    expect(await kicked).toEqual({ reason: 'REMOVED' });
    expect(await disconnected).toBe('io server disconnect');
    expect(anaSocket.connected).toBe(true);
  });

  it('broadcasts room:updated when a Meet link is replaced', async () => {
    const luisSocket = await openInSpace(luis);
    const updated = new Promise<MeetingRoomDto>((resolve) =>
      luisSocket.on('room:updated', resolve),
    );

    await testApp.app.inject({
      method: 'PUT',
      url: apiPath(API_PATHS.room, { spaceId: space.id, areaId: 'sala-reuniones' }),
      headers: ana.headers,
      payload: { meetUri: 'https://meet.google.com/abc-defg-hij' },
    });

    expect(await updated).toEqual({
      areaId: 'sala-reuniones',
      name: 'Sala de reuniones',
      meetUri: 'https://meet.google.com/abc-defg-hij',
      source: 'manual',
    });
  });
});
