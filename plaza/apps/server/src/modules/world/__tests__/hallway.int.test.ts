import type { AddressInfo } from 'node:net';

import {
  API_PATHS,
  apiPath,
  HealthResponseSchema,
  PROTOCOL_VERSION,
  REALTIME_PATH,
  SpaceResponseSchema,
  TICK_MS,
  type ClientToServerEvents,
  type Direction,
  type MediaPeers,
  type ServerToClientEvents,
  type SpaceDetailDto,
  type SpaceSnapshot,
  type Tile,
  type WorldDelta,
} from '@plaza/shared';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { signIn, type TestUser } from '../../../test/session.js';
import { modules } from '../../index.js';
import { createWorldModule, type WorldService } from '../index.js';
import type { SpaceRuntime } from '../space-runtime.js';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

interface Inbox {
  peers: MediaPeers[];
  deltas: WorldDelta[];
}

// office-small@1: spawns (11..14, 25); rows 24 and 25 are walkable from x = 1 to 38; the meeting
// room "sala-reuniones" is entered from (27,7) → (28,7).
const ROW = 25;

describe('hallway media: media:peers and inConversation (E5-S2)', () => {
  const timers = new ManualTimers();
  let testApp: TestApp;
  let world: WorldService;
  let url: string;
  let space: SpaceDetailDto;
  let ana: TestUser;
  let luis: TestUser;
  let eva: TestUser;
  let carla: TestUser;
  const clients: Client[] = [];
  const inboxes = new Map<Client, Inbox>();

  beforeAll(async () => {
    testApp = await buildTestApp({
      modules: [
        ...modules.filter((module) => module.name !== 'world'),
        createWorldModule({ timers }),
        {
          name: 'capture-world',
          register({ services }) {
            world = services.get('world');
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
    await resetDatabase(testApp.container.db);
    testApp.media.removals.length = 0;
    ana = await signIn(testApp.app, 'ana@acme.com', { displayName: 'Ana' });
    luis = await signIn(testApp.app, 'luis@acme.com', { displayName: 'Luis' });
    eva = await signIn(testApp.app, 'eva@acme.com', { displayName: 'Eva' });
    carla = await signIn(testApp.app, 'carla@acme.com', { displayName: 'Carla' });
    const created = await testApp.app.inject({
      method: 'POST',
      url: API_PATHS.spaces,
      headers: ana.headers,
      payload: { name: 'Oficina Acme', mapTemplateId: 'office-small@1' },
    });
    space = SpaceResponseSchema.parse(created.json()).space;
    const token = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
    for (const member of [luis, eva, carla]) {
      const joined = await testApp.app.inject({
        method: 'POST',
        url: apiPath(API_PATHS.join, { token }),
        headers: member.headers,
      });
      expect(joined.statusCode).toBe(200);
    }
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
    inboxes.clear();
    world.close();
  });

  async function open(user: TestUser): Promise<Client> {
    const client: Client = connect(url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie: user.cookie },
    });
    clients.push(client);
    const inbox: Inbox = { peers: [], deltas: [] };
    inboxes.set(client, inbox);
    client.on('media:peers', (peers) => inbox.peers.push(peers));
    client.on('world:delta', (delta) => inbox.deltas.push(delta));
    await new Promise<void>((resolve) => client.on('connect', resolve));
    return client;
  }

  function inbox(client: Client): Inbox {
    const found = inboxes.get(client);
    if (found === undefined) throw new Error('unknown client');
    return found;
  }

  async function join(client: Client): Promise<SpaceSnapshot> {
    const ack = await client.emitWithAck('space:join', { v: PROTOCOL_VERSION, spaceId: space.id });
    if (!ack.ok) throw new Error(`space:join failed: ${ack.error.code}`);
    return ack.data;
  }

  /** Enters the space and, when given, puts the avatar on `tile` (a server-side placement). */
  async function enter(user: TestUser, tile?: Tile): Promise<Client> {
    const client = await open(user);
    await join(client);
    if (tile !== undefined) runtime().place(user.user.id, tile);
    return client;
  }

  /** Same-socket `space:join` is a no-op round trip: everything sent before has arrived. */
  async function barrier(...targets: Client[]): Promise<void> {
    for (const client of targets) await join(client);
  }

  async function tick(...receivers: Client[]): Promise<void> {
    timers.advance(TICK_MS);
    await barrier(...receivers);
  }

  function runtime(): SpaceRuntime {
    const loaded = world.store.get(space.id);
    if (loaded === undefined) throw new Error('the space runtime is not loaded');
    return loaded;
  }

  function place(user: TestUser, x: number, y: number = ROW): void {
    runtime().place(user.user.id, { x, y });
  }

  function move(client: Client, x: number, y: number, dir: Direction = 'right'): void {
    client.emit('player:move', { v: PROTOCOL_VERSION, x, y, dir });
  }

  function clearInboxes(): void {
    for (const box of inboxes.values()) {
      box.peers.length = 0;
      box.deltas.length = 0;
    }
  }

  /** Every `inConversation` change seen by a client, as `userId → value`, in order. */
  function conversationChanges(client: Client): [string, boolean][] {
    return inbox(client).deltas.flatMap((delta) => [
      ...delta.joined.map((p): [string, boolean] => [p.userId, p.inConversation]),
      ...delta.changed.flatMap((c): [string, boolean][] =>
        c.inConversation === undefined ? [] : [[c.userId, c.inConversation]],
      ),
    ]);
  }

  it('connects two people 3 tiles apart and tells each one, with the 💬 flag for everyone', async () => {
    const a = await enter(ana, { x: 5, y: ROW });
    const l = await enter(luis, { x: 8, y: ROW });
    const c = await enter(carla, { x: 30, y: ROW });
    await tick(a, l, c);

    expect(inbox(a).peers).toEqual([{ peers: [luis.user.id] }]);
    expect(inbox(l).peers).toEqual([{ peers: [ana.user.id] }]);
    // Carla just joined: she gets her (empty) list once, and nobody else's.
    expect(inbox(c).peers).toEqual([{ peers: [] }]);
    expect(runtime().get(ana.user.id)?.inConversation).toBe(true);
    expect(runtime().get(carla.user.id)?.inConversation).toBe(false);
    // Carla, far away, still sees the bubble over both of them.
    expect(conversationChanges(c)).toEqual(
      expect.arrayContaining([
        [ana.user.id, true],
        [luis.user.id, true],
      ]),
    );
    expect(world.hallwayPeers(space.id, ana.user.id)).toEqual([luis.user.id]);
  });

  it('keeps the conversation at 4 tiles (hysteresis) and ends it at 5', async () => {
    const a = await enter(ana, { x: 5, y: ROW });
    const l = await enter(luis, { x: 7, y: ROW });
    const c = await enter(carla, { x: 30, y: ROW });
    await tick(a, l, c);
    clearInboxes();

    // Luis walks away one step at a time: 3 and 4 tiles keep the conversation…
    move(l, 8, ROW);
    await barrier(l);
    await tick(a, l, c);
    move(l, 9, ROW);
    await barrier(l);
    await tick(a, l, c);
    expect(inbox(a).peers).toEqual([]);
    expect(inbox(l).peers).toEqual([]);

    // …5 tiles ends it: only Ana and Luis are told, Carla gets nothing.
    move(l, 10, ROW);
    await barrier(l);
    await tick(a, l, c);
    expect(inbox(a).peers).toEqual([{ peers: [] }]);
    expect(inbox(l).peers).toEqual([{ peers: [] }]);
    expect(inbox(c).peers).toEqual([]);
    expect(conversationChanges(c)).toEqual([
      [ana.user.id, false],
      [luis.user.id, false],
    ]);

    // Coming back to 4 tiles does not reconnect them (only 3 does).
    move(l, 9, ROW, 'left');
    await barrier(l);
    await tick(a, l, c);
    expect(inbox(a).peers).toEqual([{ peers: [] }]);
  });

  it('only tells the people whose peers changed', async () => {
    const a = await enter(ana, { x: 5, y: ROW });
    const l = await enter(luis, { x: 6, y: ROW });
    const e = await enter(eva, { x: 30, y: ROW });
    const c = await enter(carla, { x: 31, y: ROW });
    await tick(a, l, e, c);
    clearInboxes();

    // Eva walks one tile towards Ana and Luis (still far): nothing changes for anyone.
    move(e, 29, ROW, 'left');
    await barrier(e);
    await tick(a, l, e, c);
    expect([a, l, e, c].map((client) => inbox(client).peers)).toEqual([[], [], [], []]);

    // Eva joins Ana and Luis: the three of them are told, Carla (who lost Eva) too.
    place(eva, 7);
    await tick(a, l, e, c);
    expect(inbox(a).peers).toEqual([{ peers: [eva.user.id, luis.user.id].sort() }]);
    expect(inbox(l).peers).toEqual([{ peers: [ana.user.id, eva.user.id].sort() }]);
    expect(inbox(e).peers).toEqual([{ peers: [ana.user.id, luis.user.id].sort() }]);
    expect(inbox(c).peers).toEqual([{ peers: [] }]);
  });

  it('leaves out people who enter a meeting room (RN-03)', async () => {
    const a = await enter(ana, { x: 26, y: 7 });
    const l = await enter(luis, { x: 27, y: 7 });
    await tick(a, l);
    expect(inbox(a).peers).toEqual([{ peers: [luis.user.id] }]);
    clearInboxes();

    move(l, 28, 7);
    await barrier(l);
    await tick(a, l);

    expect(runtime().get(luis.user.id)?.roomId).not.toBeNull();
    expect(inbox(a).peers).toEqual([{ peers: [] }]);
    expect(inbox(l).peers).toEqual([{ peers: [] }]);
    expect(runtime().get(luis.user.id)?.inConversation).toBe(false);
  });

  it('leaves out busy people (RN-04): the status field is read from the player state', async () => {
    const a = await enter(ana, { x: 5, y: ROW });
    const l = await enter(luis, { x: 6, y: ROW });
    await tick(a, l);
    clearInboxes();

    // The status event is wired by E7; the proximity engine only reads the field.
    runtime().update(luis.user.id, { status: 'busy' });
    await tick(a, l);
    expect(inbox(a).peers).toEqual([{ peers: [] }]);
    expect(inbox(l).peers).toEqual([{ peers: [] }]);

    runtime().update(luis.user.id, { status: 'available' });
    await tick(a, l);
    expect(inbox(a).peers).toEqual([{ peers: [] }, { peers: [luis.user.id] }]);
  });

  it('ends the conversation of whoever stays when the other person leaves', async () => {
    const a = await enter(ana, { x: 5, y: ROW });
    const l = await enter(luis, { x: 6, y: ROW });
    await tick(a, l);
    clearInboxes();

    l.disconnect();
    await vi.waitFor(() => {
      expect(runtime().has(luis.user.id)).toBe(false);
    });
    await tick(a);

    expect(inbox(a).peers).toEqual([{ peers: [] }]);
    expect(inbox(a).deltas).toEqual([
      {
        moved: [],
        joined: [],
        left: [luis.user.id],
        changed: [{ userId: ana.user.id, inConversation: false }],
      },
    ]);
  });

  it('sends the current list again to a person who reconnects, even when it did not change', async () => {
    const a = await enter(ana, { x: 5, y: ROW });
    const first = await enter(luis, { x: 6, y: ROW });
    await tick(a, first);
    clearInboxes();

    // A second tab (new socket) takes over: it has never received the list.
    const second = await open(luis);
    await join(second);
    await tick(a, second);

    expect(inbox(second).peers).toEqual([{ peers: [ana.user.id] }]);
    expect(inbox(a).peers).toEqual([]);

    // A same-socket re-join (no new connection) does not resend it.
    await join(second);
    await tick(a, second);
    expect(inbox(second).peers).toEqual([{ peers: [ana.user.id] }]);
  });

  it('never gives peers to someone who stays far away', async () => {
    const a = await enter(ana, { x: 5, y: ROW });
    const l = await enter(luis, { x: 6, y: ROW });
    const c = await enter(carla, { x: 30, y: ROW });
    for (let x = 7; x <= 12; x++) {
      move(l, x, ROW);
      await barrier(l);
      await tick(a, l, c);
      move(a, x - 1, ROW);
      await barrier(a);
      await tick(a, l, c);
    }

    expect(inbox(c).peers).toEqual([{ peers: [] }]);
    expect(inbox(a).peers.at(-1)).toEqual({ peers: [luis.user.id] });
  });

  it('reports the media:peers sent per tick in /api/health', async () => {
    const a = await enter(ana, { x: 5, y: ROW });
    const l = await enter(luis, { x: 6, y: ROW });
    await tick(a, l);

    const health = HealthResponseSchema.parse(
      (await testApp.app.inject({ method: 'GET', url: API_PATHS.health })).json(),
    );

    expect(health.realtime.avgMediaPeersPerTick).toEqual(expect.any(Number));
    expect(health.realtime.avgMediaPeersPerTick).toBeGreaterThan(0);
  });
});
