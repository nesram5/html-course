import type { AddressInfo } from 'node:net';

import {
  API_PATHS,
  apiPath,
  HealthResponseSchema,
  PROTOCOL_VERSION,
  REALTIME_PATH,
  RECONNECT_GRACE_MS,
  SPACE_UNLOAD_DELAY_MS,
  SpaceResponseSchema,
  SpaceSnapshotSchema,
  TICK_MS,
  type Ack,
  type ClientToServerEvents,
  type Direction,
  type ErrorPayload,
  type ErrorResponse,
  type PlayerCorrect,
  type ServerToClientEvents,
  type SpaceDetailDto,
  type SpaceKicked,
  type SpaceSnapshot,
  type WorldDelta,
} from '@plaza/shared';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { signIn, type TestUser } from '../../../test/session.js';
import { modules } from '../../index.js';
import type { SpaceRuntime } from '../space-runtime.js';
import { createWorldModule, type WorldService } from '../index.js';
import { WorldRepository } from '../world.repository.js';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/** What a client received, in order. */
interface Inbox {
  deltas: WorldDelta[];
  corrections: PlayerCorrect[];
  errors: ErrorPayload[];
  kicked: SpaceKicked[];
  disconnects: string[];
}

// office-small@1 (see space-runtime.test.ts): spawns (11..14, 25); room "sala-reuniones" entered
// from (27,6) → (28,6); wall below (11,28); desk-01 has its spawn tile at (2,5).
const MAX_PLAYERS = 3;

describe('world module: realtime multiplayer (E4)', () => {
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
      env: { MAX_PLAYERS_PER_SPACE: String(MAX_PLAYERS) },
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
    testApp.media.mutes.length = 0;
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
    for (const member of [luis, eva, carla]) {
      const joined = await joinByInvite(member);
      expect(joined.statusCode).toBe(200);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const client of clients.splice(0)) client.close();
    inboxes.clear();
    // Drops every runtime and pending timer of the test.
    world.close();
  });

  function joinByInvite(user: TestUser) {
    const token = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
    return testApp.app.inject({
      method: 'POST',
      url: apiPath(API_PATHS.join, { token }),
      headers: user.headers,
    });
  }

  async function open(user: TestUser): Promise<Client> {
    const client: Client = connect(url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie: user.cookie },
    });
    clients.push(client);
    const inbox: Inbox = { deltas: [], corrections: [], errors: [], kicked: [], disconnects: [] };
    inboxes.set(client, inbox);
    client.on('world:delta', (delta) => inbox.deltas.push(delta));
    client.on('player:correct', (correct) => inbox.corrections.push(correct));
    client.on('error', (error) => inbox.errors.push(error));
    client.on('space:kicked', (kicked) => inbox.kicked.push(kicked));
    client.on('disconnect', (reason) => inbox.disconnects.push(reason));
    await new Promise<void>((resolve) => client.on('connect', resolve));
    return client;
  }

  function inbox(client: Client): Inbox {
    const found = inboxes.get(client);
    if (found === undefined) throw new Error('unknown client');
    return found;
  }

  function join(
    client: Client,
    spaceId: string = space.id,
    v: number = PROTOCOL_VERSION,
  ): Promise<Ack<SpaceSnapshot>> {
    return client.emitWithAck('space:join', { v, spaceId });
  }

  async function enter(user: TestUser): Promise<{ client: Client; snapshot: SpaceSnapshot }> {
    const client = await open(user);
    const ack = await join(client);
    if (!ack.ok) throw new Error(`space:join failed: ${ack.error.code}`);
    return { client, snapshot: ack.data };
  }

  /**
   * Waits until the server handled every event this client sent before, and this client got
   * every message the server sent it before: `space:join` again on the same socket is a no-op
   * round trip, and a single connection keeps its order in both directions.
   */
  async function barrier(...targets: Client[]): Promise<void> {
    for (const client of targets) {
      const ack = await join(client);
      expect(ack.ok).toBe(true);
    }
  }

  /** A network cut: the transport closes without the client saying goodbye. */
  function cut(client: Client): void {
    client.io.engine.close();
  }

  function move(client: Client, x: number, y: number, dir: Direction = 'down'): void {
    client.emit('player:move', { v: PROTOCOL_VERSION, x, y, dir });
  }

  function runtime(): SpaceRuntime {
    const loaded = world.store.get(space.id);
    if (loaded === undefined) throw new Error('the space runtime is not loaded');
    return loaded;
  }

  /** One server tick, then lets the given clients receive what it sent. */
  async function tick(...receivers: Client[]): Promise<void> {
    timers.advance(TICK_MS);
    await barrier(...receivers);
  }

  describe('space:join (E4-S1)', () => {
    it('answers with the snapshot: self at a spawn, the others, the rooms and the occupied desks', async () => {
      await testApp.container.db.membership.update({
        where: { userId_spaceId: { userId: eva.user.id, spaceId: space.id } },
        data: { deskId: 'desk-01', deskDecor: { slots: ['plant', null, null] } },
      });

      const first = await enter(ana);
      const second = await enter(eva);

      expect(SpaceSnapshotSchema.parse(first.snapshot)).toEqual({
        v: PROTOCOL_VERSION,
        spaceId: space.id,
        mapTemplateId: 'office-small@1',
        themeId: 'pixel',
        self: {
          userId: ana.user.id,
          displayName: 'Ana',
          avatarId: 'avatar-01',
          x: 11,
          y: 25,
          dir: 'down',
          status: 'available',
          away: false,
          roomId: null,
          inConversation: false,
          reconnecting: false,
        },
        players: [],
        rooms: [
          { areaId: 'sala-reuniones', name: 'Sala de reuniones', meetUri: null, source: null },
        ],
        desks: [
          {
            deskId: 'desk-01',
            userId: eva.user.id,
            displayName: 'Eva',
            decor: { slots: ['plant', null, null] },
          },
        ],
      });
      // The server decides the spawn: next to Eva's desk.
      expect(second.snapshot.self).toMatchObject({ userId: eva.user.id, x: 2, y: 5 });
      expect(second.snapshot.players.map((p) => [p.userId, p.x, p.y])).toEqual([
        [ana.user.id, 11, 25],
      ]);
    });

    it('refuses people who are not members with NOT_A_MEMBER', async () => {
      const zoe = await signIn(testApp.app, 'zoe@other.com');
      const client = await open(zoe);

      const foreign = await join(client);
      const unknown = await join(client, 'no-such-space');

      expect(foreign).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
      expect(unknown).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
      expect(world.store.get(space.id)).toBeUndefined();
    });

    it('refuses other protocol versions with PROTOCOL_MISMATCH', async () => {
      const client = await open(ana);

      const ack = await join(client, space.id, PROTOCOL_VERSION + 1);

      expect(ack).toMatchObject({ ok: false, error: { code: 'PROTOCOL_MISMATCH' } });
    });

    it(`refuses a person beyond the cap with SPACE_FULL (MAX_PLAYERS_PER_SPACE=${String(MAX_PLAYERS)})`, async () => {
      await enter(ana);
      await enter(luis);
      await enter(eva);
      const client = await open(carla);

      const full = await join(client);
      // A second tab of someone inside replaces their avatar: it does not count twice.
      const secondTab = await join(await open(ana));

      expect(full).toMatchObject({ ok: false, error: { code: 'SPACE_FULL' } });
      expect(secondTab.ok).toBe(true);
      expect(runtime().size).toBe(MAX_PLAYERS);
    });

    it('a second tab replaces the first one with space:kicked SESSION_REPLACED, keeping the avatar', async () => {
      const first = await enter(ana);
      const other = await enter(luis);
      move(first.client, 11, 24, 'up');
      await barrier(first.client);
      await tick(first.client, other.client);
      inbox(other.client).deltas.length = 0;

      const second = await enter(ana);
      await vi.waitFor(() => {
        expect(inbox(first.client).disconnects).toEqual(['io server disconnect']);
      });
      await tick(other.client);

      expect(inbox(first.client).kicked).toEqual([{ reason: 'SESSION_REPLACED' }]);
      expect(second.snapshot.self).toMatchObject({ x: 11, y: 24, dir: 'up', reconnecting: false });
      // Same avatar for the others: nobody left or joined.
      expect(inbox(other.client).deltas).toEqual([]);
      expect(runtime().socketOf(ana.user.id)).toBe(second.client.id);
    });

    it('answers player:move before space:join with NOT_IN_SPACE', async () => {
      const client = await open(ana);

      move(client, 11, 25);
      await vi.waitFor(() => {
        expect(inbox(client).errors).toEqual([
          { code: 'NOT_IN_SPACE', message: 'Join the space first' },
        ]);
      });
    });
  });

  describe('player:move (E4-S3)', () => {
    it('accepts adjacent walkable steps: the others see them, the mover gets no echo', async () => {
      const mover = await enter(ana);
      const watcher = await enter(luis);
      await tick(mover.client, watcher.client);
      inbox(mover.client).deltas.length = 0;
      inbox(watcher.client).deltas.length = 0;

      move(mover.client, 11, 26, 'down');
      await barrier(mover.client);
      await tick(mover.client, watcher.client);

      expect(inbox(watcher.client).deltas).toEqual([
        {
          moved: [{ userId: ana.user.id, x: 11, y: 26, dir: 'down' }],
          joined: [],
          left: [],
          changed: [],
        },
      ]);
      expect(inbox(mover.client).deltas).toEqual([]);
      expect(inbox(mover.client).corrections).toEqual([]);
    });

    it('answers teleports and walls with player:correct at the kept position', async () => {
      const mover = await enter(ana);

      move(mover.client, 13, 25, 'right'); // not adjacent
      await barrier(mover.client);
      runtime().place(ana.user.id, { x: 11, y: 28 });
      move(mover.client, 11, 29, 'down'); // wall
      await barrier(mover.client);

      expect(inbox(mover.client).corrections).toEqual([
        { x: 11, y: 25 },
        { x: 11, y: 28 },
      ]);
      expect(runtime().get(ana.user.id)).toMatchObject({ x: 11, y: 28 });
    });

    it('drops the steps beyond 10 per second (token bucket) with player:correct', async () => {
      const mover = await enter(ana);

      for (let i = 0; i < 15; i++) move(mover.client, 11, i % 2 === 0 ? 26 : 25);
      await barrier(mover.client);
      const corrected = inbox(mover.client).corrections.length;
      timers.advance(1000);
      move(mover.client, 11, 26);
      await barrier(mover.client);

      // 10 steps taken: the avatar ends on (11,25); the 5 extra ones are corrected there.
      expect(corrected).toBe(5);
      expect(inbox(mover.client).corrections.slice(0, 5)).toEqual(
        Array.from({ length: 5 }, () => ({ x: 11, y: 25 })),
      );
      // One second later the bucket is full again.
      expect(inbox(mover.client).corrections).toHaveLength(5);
      expect(runtime().get(ana.user.id)).toMatchObject({ x: 11, y: 26 });
    });

    it('lets two avatars share a tile (RN-10)', async () => {
      const first = await enter(ana);
      await enter(luis); // spawns on (12,25)

      move(first.client, 12, 25, 'right');
      await barrier(first.client);

      expect(inbox(first.client).corrections).toEqual([]);
      expect(runtime().get(ana.user.id)).toMatchObject({ x: 12, y: 25 });
    });

    it('recomputes roomId on entering a meeting room and mutes the hallway media (E6-S3)', async () => {
      const mover = await enter(ana);
      const watcher = await enter(luis);
      runtime().place(ana.user.id, { x: 27, y: 6 });
      await tick(watcher.client);
      inbox(watcher.client).deltas.length = 0;

      move(mover.client, 28, 6, 'right');
      await barrier(mover.client);
      await tick(watcher.client);

      expect(runtime().get(ana.user.id)?.roomId).toBe('sala-reuniones');
      expect(inbox(watcher.client).deltas).toEqual([
        {
          moved: [{ userId: ana.user.id, x: 28, y: 6, dir: 'right' }],
          joined: [],
          left: [],
          changed: [{ userId: ana.user.id, roomId: 'sala-reuniones' }],
        },
      ]);
      await vi.waitFor(() => {
        expect(testApp.media.mutes).toEqual([
          { roomName: `space_${space.id}`, identity: ana.user.id },
        ]);
      });
    });
  });

  describe('tick and broadcast (E4-S4)', () => {
    it('sends ONE world:delta per tick with the last position, and nothing on idle ticks', async () => {
      const mover = await enter(ana);
      const watcher = await enter(luis);
      await tick(mover.client, watcher.client);
      inbox(watcher.client).deltas.length = 0;

      move(mover.client, 11, 24, 'up');
      move(mover.client, 11, 23, 'up');
      move(mover.client, 12, 23, 'right');
      await barrier(mover.client);
      await tick(watcher.client);
      for (let i = 0; i < 10; i++) timers.advance(TICK_MS);
      await barrier(watcher.client);

      expect(inbox(watcher.client).deltas).toEqual([
        {
          moved: [{ userId: ana.user.id, x: 12, y: 23, dir: 'right' }],
          joined: [],
          left: [],
          changed: [],
        },
      ]);
    });

    it('announces arrivals in joined, once', async () => {
      const first = await enter(ana);
      const second = await enter(luis);
      const third = await enter(eva);

      await tick(first.client, second.client, third.client);

      expect(inbox(first.client).deltas).toEqual([
        { moved: [], joined: [second.snapshot.self, third.snapshot.self], left: [], changed: [] },
      ]);
      // Arrivals of the same tick: each one hears only about the people missing in its snapshot.
      expect(inbox(second.client).deltas).toEqual([
        { moved: [], joined: [third.snapshot.self], left: [], changed: [] },
      ]);
      expect(inbox(third.client).deltas).toEqual([]);
      expect(third.snapshot.players.map((p) => p.userId)).toEqual([ana.user.id, luis.user.id]);
    });

    it('keeps a later arrival of the same tick up to date with an earlier one', async () => {
      const first = await enter(ana);
      const second = await enter(luis); // same tick: his snapshot has Ana on (11,25)
      move(first.client, 11, 24, 'up');
      await barrier(first.client);
      const third = await enter(eva); // her snapshot has Ana on (11,24)

      await tick(first.client, second.client, third.client);

      // Ana's step reaches Luis as a step (he has no joined entry for her)…
      expect(inbox(second.client).deltas).toEqual([
        {
          moved: [{ userId: ana.user.id, x: 11, y: 24, dir: 'up' }],
          joined: [third.snapshot.self],
          left: [],
          changed: [],
        },
      ]);
      // …and Eva gets it too (harmless: same tile as in her snapshot).
      expect(inbox(third.client).deltas).toEqual([
        {
          moved: [{ userId: ana.user.id, x: 11, y: 24, dir: 'up' }],
          joined: [],
          left: [],
          changed: [],
        },
      ]);
      expect(inbox(first.client).deltas).toEqual([
        { moved: [], joined: [second.snapshot.self, third.snapshot.self], left: [], changed: [] },
      ]);
    });

    it('announces in left someone who leaves in the tick they arrived, to those who saw them', async () => {
      const first = await enter(ana);
      const second = await enter(luis); // same tick: his snapshot has Ana

      first.client.disconnect();
      await vi.waitFor(() => {
        expect(runtime().has(ana.user.id)).toBe(false);
      });
      await tick(second.client);

      expect(second.snapshot.players.map((p) => p.userId)).toEqual([ana.user.id]);
      expect(inbox(second.client).deltas).toEqual([
        { moved: [], joined: [], left: [ana.user.id], changed: [] },
      ]);
    });

    it('reports connected people per space and the average tick in /api/health (E8-S1)', async () => {
      const first = await enter(ana);
      await enter(luis);
      await tick(first.client);

      const health = HealthResponseSchema.parse(
        (await testApp.app.inject({ method: 'GET', url: API_PATHS.health })).json(),
      );

      expect(health.realtime.connectedBySpace).toEqual({ [space.id]: 2 });
      expect(health.realtime.avgTickMs).toEqual(expect.any(Number));
    });
  });

  describe('reconnection (E4-S6)', () => {
    it('keeps a disconnected avatar semi-transparent for 30 s, then announces it in left', async () => {
      const staying = await enter(ana);
      const leaving = await enter(luis);
      await tick(staying.client);
      inbox(staying.client).deltas.length = 0;

      cut(leaving.client);
      await vi.waitFor(() => {
        expect(runtime().get(luis.user.id)?.reconnecting).toBe(true);
      });
      await tick(staying.client);
      timers.advance(RECONNECT_GRACE_MS - TICK_MS - 1);
      await barrier(staying.client);
      const beforeGrace = [...inbox(staying.client).deltas];
      timers.advance(1);
      await tick(staying.client);

      expect(beforeGrace).toEqual([
        {
          moved: [],
          joined: [],
          left: [],
          changed: [{ userId: luis.user.id, reconnecting: true }],
        },
      ]);
      expect(inbox(staying.client).deltas.slice(1)).toEqual([
        { moved: [], joined: [], left: [luis.user.id], changed: [] },
      ]);
      expect(runtime().has(luis.user.id)).toBe(false);
    });

    it('announces a deliberate leave in left at once, with no reconnection grace', async () => {
      const staying = await enter(ana);
      const leaving = await enter(luis);
      await tick(staying.client);
      inbox(staying.client).deltas.length = 0;

      leaving.client.disconnect();
      await vi.waitFor(() => {
        expect(runtime().has(luis.user.id)).toBe(false);
      });
      await tick(staying.client);

      expect(inbox(staying.client).deltas).toEqual([
        { moved: [], joined: [], left: [luis.user.id], changed: [] },
      ]);
      expect(testApp.container.metrics.connectedBySpace()).toEqual({ [space.id]: 1 });
    });

    it('takes the avatar out at once when the person logs out (from any tab)', async () => {
      const staying = await enter(ana);
      const leaving = await enter(luis);
      await tick(staying.client);
      inbox(staying.client).deltas.length = 0;

      await testApp.app.inject({ method: 'POST', url: '/api/auth/logout', headers: luis.headers });
      await vi.waitFor(() => {
        expect(inbox(leaving.client).disconnects).toEqual(['io server disconnect']);
      });
      await tick(staying.client);

      expect(inbox(staying.client).deltas).toEqual([
        { moved: [], joined: [], left: [luis.user.id], changed: [] },
      ]);
    });

    it('gives the avatar back where it was when the person reconnects within 30 s', async () => {
      const staying = await enter(ana);
      const leaving = await enter(luis);
      move(leaving.client, 12, 24, 'up');
      await barrier(leaving.client);
      cut(leaving.client);
      await vi.waitFor(() => {
        expect(runtime().get(luis.user.id)?.reconnecting).toBe(true);
      });
      await tick(staying.client);
      inbox(staying.client).deltas.length = 0;
      timers.advance(RECONNECT_GRACE_MS - 1000);

      const back = await enter(luis);
      await tick(staying.client);
      timers.advance(RECONNECT_GRACE_MS);
      await barrier(staying.client);

      expect(back.snapshot.self).toMatchObject({ x: 12, y: 24, dir: 'up', reconnecting: false });
      expect(inbox(staying.client).deltas).toEqual([
        {
          moved: [],
          joined: [],
          left: [],
          changed: [{ userId: luis.user.id, reconnecting: false }],
        },
      ]);
    });
  });

  describe('runtime lifecycle (E4-S2)', () => {
    it('leaves no runtime, timer, metric or room behind, however people leave', async () => {
      const first = await enter(ana);
      const cutOff = await enter(luis);
      const leaving = await enter(eva);
      const replacing = await enter(ana); // second tab
      await vi.waitFor(() => {
        expect(inbox(first.client).disconnects).toEqual(['io server disconnect']);
      });
      cut(cutOff.client); // waiting for a reconnection…
      await vi.waitFor(() => {
        expect(runtime().get(luis.user.id)?.reconnecting).toBe(true);
      });
      const kick = await testApp.app.inject({
        method: 'DELETE',
        url: apiPath(API_PATHS.member, { spaceId: space.id, userId: luis.user.id }),
        headers: ana.headers,
      }); // …and removed meanwhile
      leaving.client.disconnect();
      replacing.client.disconnect();
      await vi.waitFor(() => {
        expect(runtime().size).toBe(0);
      });

      timers.advance(SPACE_UNLOAD_DELAY_MS);

      expect(kick.statusCode).toBe(204);
      expect(world.store.runtimes()).toEqual([]);
      expect(timers.pending).toBe(0);
      expect(testApp.container.metrics.connectedBySpace()).toEqual({});
      expect(
        [...testApp.app.io.of('/').adapter.rooms.keys()].filter((r) => r.startsWith('space:')),
      ).toEqual([]);
    });

    it('releases the runtime when a join fails after loading it', async () => {
      vi.spyOn(WorldRepository.prototype, 'occupiedDesks').mockRejectedValueOnce(
        new Error('database down'),
      );
      const client = await open(ana);

      const ack = await join(client);
      await vi.waitFor(() => {
        expect(world.store.get(space.id)).toBeDefined();
      });
      const loaded = runtime();
      timers.advance(SPACE_UNLOAD_DELAY_MS);

      expect(ack).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
      expect(loaded.size).toBe(0);
      expect(world.store.get(space.id)).toBeUndefined();
      expect(timers.pending).toBe(0);
    });

    it('shares one runtime while occupied and releases it 60 s after the last person leaves', async () => {
      const first = await enter(ana);
      const loaded = runtime();
      const second = await enter(luis);
      expect(runtime()).toBe(loaded);

      cut(first.client);
      cut(second.client);
      await vi.waitFor(() => {
        expect(loaded.connectedCount).toBe(0);
      });
      timers.advance(RECONNECT_GRACE_MS);
      expect(loaded.size).toBe(0);
      timers.advance(SPACE_UNLOAD_DELAY_MS - 1);
      const beforeRelease = world.store.get(space.id);
      timers.advance(1);

      expect(beforeRelease).toBe(loaded);
      expect(world.store.get(space.id)).toBeUndefined();
      expect(testApp.container.metrics.connectedBySpace()).toEqual({});
      await enter(ana);
      expect(runtime()).not.toBe(loaded);
    });
  });

  describe('kick (E2-S6 + E4-S2)', () => {
    it('a kick while the person is still joining keeps them out (no avatar sneaks in)', async () => {
      const owner = await enter(ana);
      await tick(owner.client);
      inbox(owner.client).deltas.length = 0;
      // Luis's space:join passed the membership check and is still loading the desks…
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const occupiedDesks = WorldRepository.prototype.occupiedDesks;
      const loading = vi
        .spyOn(WorldRepository.prototype, 'occupiedDesks')
        .mockImplementationOnce(async function (this: WorldRepository, spaceId: string) {
          await gate;
          return occupiedDesks.call(this, spaceId);
        });
      const client = await open(luis);
      // Disconnected before the answer: the client drops the pending ack.
      const joining = join(client).catch((error: unknown) => error);
      await vi.waitFor(() => {
        expect(loading).toHaveBeenCalled();
      });

      // …when the owner removes him: his socket is not in the space yet, so nothing kicks it.
      const response = await testApp.app.inject({
        method: 'DELETE',
        url: apiPath(API_PATHS.member, { spaceId: space.id, userId: luis.user.id }),
        headers: ana.headers,
      });
      release();
      await vi.waitFor(() => {
        expect(inbox(client).disconnects).toEqual(['io server disconnect']);
      });
      await tick(owner.client);

      expect(response.statusCode).toBe(204);
      expect(inbox(client).kicked).toEqual([{ reason: 'REMOVED' }]);
      expect(await joining).toBeInstanceOf(Error);
      expect(runtime().has(luis.user.id)).toBe(false);
      expect(inbox(owner.client).deltas).toEqual([]);
      expect(testApp.container.metrics.connectedBySpace()).toEqual({ [space.id]: 1 });
    });

    it('kicked people get space:kicked, are disconnected, leave at once and stay banned', async () => {
      const owner = await enter(ana);
      const kicked = await enter(luis);
      await tick(owner.client);
      inbox(owner.client).deltas.length = 0;

      const response = await testApp.app.inject({
        method: 'DELETE',
        url: apiPath(API_PATHS.member, { spaceId: space.id, userId: luis.user.id }),
        headers: ana.headers,
      });
      await vi.waitFor(() => {
        expect(inbox(kicked.client).disconnects).toEqual(['io server disconnect']);
      });
      await tick(owner.client);

      expect(response.statusCode).toBe(204);
      expect(inbox(kicked.client).kicked).toEqual([{ reason: 'REMOVED' }]);
      // No reconnection grace for a kick.
      expect(inbox(owner.client).deltas).toEqual([
        { moved: [], joined: [], left: [luis.user.id], changed: [] },
      ]);
      await vi.waitFor(() => {
        expect(testApp.media.removals).toEqual([
          { roomName: `space_${space.id}`, identity: luis.user.id },
        ]);
      });
      const rejoin = await join(await open(luis));
      const invite = await joinByInvite(luis);
      expect(rejoin).toMatchObject({ ok: false, error: { code: 'NOT_A_MEMBER' } });
      expect(invite.statusCode).toBe(403);
      expect(invite.json<ErrorResponse>().error.code).toBe('BANNED_FROM_SPACE');
    });
  });
});
