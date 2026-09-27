import type { AddressInfo } from 'node:net';

import {
  API_PATHS,
  apiPath,
  CLIENT_HEADER,
  DecorCatalogResponseSchema,
  deskSpawnTile,
  DeskResponseSchema,
  DesksResponseSchema,
  MembersResponseSchema,
  PROTOCOL_VERSION,
  REALTIME_PATH,
  SpaceResponseSchema,
  TICK_MS,
  type Ack,
  type ClientToServerEvents,
  type DeskState,
  type ErrorPayload,
  type ErrorResponse,
  type PlayerCorrect,
  type ServerToClientEvents,
  type SpaceDetailDto,
  type SpaceSnapshot,
  type SpaceTheme,
  type WorldDelta,
  type WorldMap,
} from '@bululu/shared';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';
import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { packageMapsCatalog } from '../../../test/maps-fixture.js';
import { signIn, type TestUser } from '../../../test/session.js';
import { modules } from '../../index.js';
import { facingDesk } from '../../world/desk-goto.js';
import { createWorldModule, type WorldService } from '../../world/index.js';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/** What a client received, in order. */
interface Inbox {
  desks: DeskState[];
  themes: SpaceTheme[];
  corrections: PlayerCorrect[];
  deltas: WorldDelta[];
  errors: ErrorPayload[];
}

describe('desks and office styles (E9)', () => {
  const timers = new ManualTimers();
  let testApp: TestApp;
  let world: WorldService;
  let map: WorldMap;
  let url: string;
  let space: SpaceDetailDto;
  let ana: TestUser;
  let luis: TestUser;
  let eva: TestUser;
  const clients: Client[] = [];
  const inboxes = new Map<Client, Inbox>();

  beforeAll(async () => {
    testApp = await buildTestApp({
      modules: [
        // Swapped in place, so the modules after `world` (presence, chat) still find it; the
        // round trips re-join often: no join rate limit here.
        ...modules.map((module) =>
          module.name === 'world'
            ? createWorldModule({ timers, joinLimit: { burst: 1_000_000, windowMs: 1000 } })
            : module,
        ),
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
    map = await packageMapsCatalog().worldMap('office-small@1');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
    ana = await signIn(testApp.app, 'ana@acme.com', { displayName: 'Ana' });
    luis = await signIn(testApp.app, 'luis@acme.com', { displayName: 'Luis' });
    eva = await signIn(testApp.app, 'eva@acme.com', { displayName: 'Eva' });
    const created = await request(ana, 'POST', API_PATHS.spaces, {
      name: 'Oficina Acme',
      mapTemplateId: 'office-small@1',
    });
    space = SpaceResponseSchema.parse(created.json()).space;
    const token = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
    for (const member of [luis, eva]) {
      expect((await request(member, 'POST', apiPath(API_PATHS.join, { token }))).statusCode).toBe(
        200,
      );
    }
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
    inboxes.clear();
    world.close();
  });

  function request(user: TestUser | null, method: string, path: string, payload?: unknown) {
    return testApp.app.inject({
      method: method as 'GET',
      url: path,
      headers: user === null ? { [CLIENT_HEADER]: 'test' } : user.headers,
      ...(payload !== undefined && { payload: payload as Record<string, unknown> }),
    });
  }

  const deskUrl = (deskId: string) => apiPath(API_PATHS.desk, { spaceId: space.id, deskId });
  const decorUrl = (deskId: string) => apiPath(API_PATHS.deskDecor, { spaceId: space.id, deskId });
  const desksUrl = () => apiPath(API_PATHS.desks, { spaceId: space.id });

  async function heldDesks(user: TestUser = ana): Promise<DeskState[]> {
    return DesksResponseSchema.parse((await request(user, 'GET', desksUrl())).json()).desks;
  }

  async function enter(user: TestUser): Promise<{ client: Client; snapshot: SpaceSnapshot }> {
    const client: Client = connect(url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie: user.cookie },
    });
    clients.push(client);
    const inbox: Inbox = { desks: [], themes: [], corrections: [], deltas: [], errors: [] };
    inboxes.set(client, inbox);
    client.on('desk:updated', (desk) => inbox.desks.push(desk));
    client.on('space:theme', (theme) => inbox.themes.push(theme));
    client.on('player:correct', (tile) => inbox.corrections.push(tile));
    client.on('world:delta', (delta) => inbox.deltas.push(delta));
    client.on('error', (error) => inbox.errors.push(error));
    await new Promise<void>((resolve) => client.on('connect', resolve));
    const ack: Ack<SpaceSnapshot> = await client.emitWithAck('space:join', {
      v: PROTOCOL_VERSION,
      spaceId: space.id,
    });
    if (!ack.ok) throw new Error(`space:join failed: ${ack.error.code}`);
    return { client, snapshot: ack.data };
  }

  function inbox(client: Client): Inbox {
    const found = inboxes.get(client);
    if (found === undefined) throw new Error('unknown client');
    return found;
  }

  /** Round trip on each socket: everything the server sent before has arrived. */
  async function barrier(...targets: Client[]): Promise<void> {
    for (const client of targets) {
      const ack = await client.emitWithAck('space:join', {
        v: PROTOCOL_VERSION,
        spaceId: space.id,
      });
      expect(ack.ok).toBe(true);
    }
  }

  function spawnOf(deskId: string) {
    const desk = map.desks.find((d) => d.deskId === deskId);
    if (desk === undefined) throw new Error(`no ${deskId} in the map`);
    return deskSpawnTile(map, desk);
  }

  describe('office style (E9-S1)', () => {
    it('lets the owner change it: everyone connected gets space:theme and nobody moves', async () => {
      const anaIn = await enter(ana);
      const luisIn = await enter(luis);
      // Settle the first tick (the spawns are close: a hallway conversation starts, E5-S2).
      timers.advance(TICK_MS);
      await barrier(anaIn.client, luisIn.client);
      inbox(luisIn.client).deltas.length = 0;
      const before = world.store.get(space.id)?.players();

      const response = await request(
        ana,
        'PATCH',
        apiPath(API_PATHS.space, { spaceId: space.id }),
        {
          themeId: 'watercolor',
        },
      );
      await barrier(anaIn.client, luisIn.client);

      expect(response.statusCode).toBe(200);
      expect(SpaceResponseSchema.parse(response.json()).space).toMatchObject({
        themeId: 'watercolor',
        thumbnailUrl: '/assets/maps/templates/office-small/themes/watercolor/thumbnail.png',
      });
      expect(inbox(anaIn.client).themes).toEqual([{ themeId: 'watercolor' }]);
      expect(inbox(luisIn.client).themes).toEqual([{ themeId: 'watercolor' }]);
      timers.advance(TICK_MS);
      await barrier(anaIn.client, luisIn.client);
      expect(world.store.get(space.id)?.players()).toEqual(before);
      expect(inbox(luisIn.client).deltas).toEqual([]);

      // Whoever enters later loads the new style directly.
      const eveIn = await enter(eva);
      expect(eveIn.snapshot.themeId).toBe('watercolor');
    });

    it('answers 403 to members, 400 to themes of another template, and is quiet without a change', async () => {
      const luisIn = await enter(luis);
      const spaceUrl = apiPath(API_PATHS.space, { spaceId: space.id });

      const member = await request(luis, 'PATCH', spaceUrl, { themeId: 'night' });
      const unknown = await request(ana, 'PATCH', spaceUrl, { themeId: 'sepia' });
      const same = await request(ana, 'PATCH', spaceUrl, { themeId: 'pixel' });
      const rename = await request(ana, 'PATCH', spaceUrl, { name: 'Acme HQ' });
      await barrier(luisIn.client);

      expect(member.statusCode).toBe(403);
      expect(member.json<ErrorResponse>().error.code).toBe('FORBIDDEN');
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json<ErrorResponse>().error.code).toBe('UNKNOWN_THEME');
      expect(same.statusCode).toBe(200);
      expect(rename.statusCode).toBe(200);
      expect(inbox(luisIn.client).themes).toEqual([]);
    });

    it('ends with everyone on the stored style when changes cross', async () => {
      const luisIn = await enter(luis);
      const spaceUrl = apiPath(API_PATHS.space, { spaceId: space.id });
      const themes = ['night', 'watercolor', 'pixel', 'night', 'watercolor', 'night'];

      await Promise.all(themes.map((themeId) => request(ana, 'PATCH', spaceUrl, { themeId })));
      await barrier(luisIn.client);

      const stored = SpaceResponseSchema.parse((await request(ana, 'GET', spaceUrl)).json()).space;
      expect(inbox(luisIn.client).themes.at(-1)).toEqual({ themeId: stored.themeId });
    });
  });

  describe('desks (E9-S2)', () => {
    it('lets a member claim a free desk: everyone sees their name over it', async () => {
      const anaIn = await enter(ana);
      const luisIn = await enter(luis);

      const response = await request(luis, 'PUT', deskUrl('desk-03'), {});
      await barrier(anaIn.client, luisIn.client);

      const expected: DeskState = {
        deskId: 'desk-03',
        userId: luis.user.id,
        displayName: 'Luis',
        decor: null,
      };
      expect(response.statusCode).toBe(200);
      expect(DeskResponseSchema.parse(response.json()).desk).toEqual(expected);
      expect(inbox(anaIn.client).desks).toEqual([expected]);
      expect(inbox(luisIn.client).desks).toEqual([expected]);
      expect(await heldDesks()).toEqual([expected]);
      const members = MembersResponseSchema.parse(
        (await request(ana, 'GET', apiPath(API_PATHS.members, { spaceId: space.id }))).json(),
      ).members;
      expect(members.find((m) => m.userId === luis.user.id)?.deskId).toBe('desk-03');
    });

    it('frees the previous desk when claiming another one (RN-13)', async () => {
      const anaIn = await enter(ana);
      await request(luis, 'PUT', deskUrl('desk-03'), {});
      await barrier(anaIn.client);
      inbox(anaIn.client).desks.length = 0;

      const response = await request(luis, 'PUT', deskUrl('desk-05'), {});
      await barrier(anaIn.client);

      expect(response.statusCode).toBe(200);
      expect(inbox(anaIn.client).desks).toEqual([
        { deskId: 'desk-03', userId: null, displayName: null, decor: null },
        { deskId: 'desk-05', userId: luis.user.id, displayName: 'Luis', decor: null },
      ]);
      expect((await heldDesks()).map((d) => d.deskId)).toEqual(['desk-05']);
    });

    it('refuses taken, unknown and foreign desks', async () => {
      await request(luis, 'PUT', deskUrl('desk-03'), {});
      const zoe = await signIn(testApp.app, 'zoe@other.com');

      const taken = await request(eva, 'PUT', deskUrl('desk-03'), {});
      const again = await request(luis, 'PUT', deskUrl('desk-03'), {});
      const unknown = await request(eva, 'PUT', deskUrl('desk-99'), {});
      const stranger = await request(zoe, 'PUT', deskUrl('desk-04'), {});

      expect(taken.statusCode).toBe(409);
      expect(taken.json<ErrorResponse>().error.code).toBe('DESK_TAKEN');
      expect(again.statusCode).toBe(200);
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json<ErrorResponse>().error.code).toBe('UNKNOWN_DESK');
      expect(stranger.statusCode).toBe(404);
      expect((await heldDesks()).map((d) => [d.deskId, d.userId])).toEqual([
        ['desk-03', luis.user.id],
      ]);
    });

    it('keeps desks unique when two people claim the same one at once', async () => {
      const [first, second] = await Promise.all([
        request(luis, 'PUT', deskUrl('desk-07'), {}),
        request(eva, 'PUT', deskUrl('desk-07'), {}),
      ]);

      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
      expect(await heldDesks()).toHaveLength(1);
    });

    it('tells everyone the same desks the database holds when one person claims several at once', async () => {
      const anaIn = await enter(ana);
      await request(luis, 'PUT', deskUrl('desk-01'), {});
      const targets = ['desk-03', 'desk-04', 'desk-05', 'desk-06', 'desk-07'];

      const responses = await Promise.all(
        targets.map((deskId) => request(luis, 'PUT', deskUrl(deskId), {})),
      );
      // The owner assigns Luis yet another desk meanwhile.
      await Promise.all([
        request(ana, 'PUT', deskUrl('desk-08'), { userId: luis.user.id }),
        request(luis, 'PUT', deskUrl('desk-02'), {}),
      ]);
      await barrier(anaIn.client);

      expect(responses.every((response) => response.statusCode === 200)).toBe(true);
      // Replaying desk:updated in order gives exactly what is stored: one desk for Luis.
      const seen = new Map<string, string | null>();
      for (const desk of inbox(anaIn.client).desks) seen.set(desk.deskId, desk.userId);
      const shown = [...seen].filter(([, userId]) => userId !== null).map(([deskId]) => deskId);
      const held = (await heldDesks()).map((desk) => desk.deskId);
      expect(held).toHaveLength(1);
      expect(shown).toEqual(held);
    });

    it('lets owners assign and free the desks of others, live (RN-14)', async () => {
      const luisIn = await enter(luis);

      const assigned = await request(ana, 'PUT', deskUrl('desk-02'), { userId: eva.user.id });
      const byMember = await request(luis, 'PUT', deskUrl('desk-04'), { userId: eva.user.id });
      const toStranger = await request(ana, 'PUT', deskUrl('desk-04'), { userId: 'nobody' });
      await barrier(luisIn.client);

      expect(assigned.statusCode).toBe(200);
      expect(byMember.statusCode).toBe(403);
      expect(toStranger.statusCode).toBe(404);
      expect(inbox(luisIn.client).desks).toEqual([
        { deskId: 'desk-02', userId: eva.user.id, displayName: 'Eva', decor: null },
      ]);

      const freedByMember = await request(luis, 'DELETE', deskUrl('desk-02'));
      const freed = await request(ana, 'DELETE', deskUrl('desk-02'));
      const freeAgain = await request(ana, 'DELETE', deskUrl('desk-02'));
      await barrier(luisIn.client);

      expect(freedByMember.statusCode).toBe(403);
      expect(freed.statusCode).toBe(204);
      expect(freeAgain.statusCode).toBe(204);
      expect(inbox(luisIn.client).desks.at(-1)).toEqual({
        deskId: 'desk-02',
        userId: null,
        displayName: null,
        decor: null,
      });
      expect(await heldDesks()).toEqual([]);
    });

    it('lets people free their own desk', async () => {
      await request(luis, 'PUT', deskUrl('desk-03'), {});

      expect((await request(luis, 'DELETE', deskUrl('desk-03'))).statusCode).toBe(204);
      expect(await heldDesks()).toEqual([]);
    });

    it('makes people with a desk enter next to it instead of at a spawn', async () => {
      await request(luis, 'PUT', deskUrl('desk-06'), {});

      const { snapshot } = await enter(luis);

      expect(snapshot.self).toMatchObject(spawnOf('desk-06') ?? {});
      expect(snapshot.desks.map((d) => d.deskId)).toEqual(['desk-06']);
    });

    it('takes people back to their desk with desk:goto, validated like a spawn', async () => {
      const anaIn = await enter(ana);
      const luisIn = await enter(luis);
      await request(luis, 'PUT', deskUrl('desk-06'), {});
      const target = spawnOf('desk-06');
      const desk = map.desks.find((d) => d.deskId === 'desk-06');
      if (target === null || desk === undefined) throw new Error('desk-06 has no spawn tile');
      const dir = facingDesk(target, desk);
      timers.advance(TICK_MS);
      await barrier(anaIn.client, luisIn.client);
      inbox(anaIn.client).deltas.length = 0;

      luisIn.client.emit('desk:goto', { v: PROTOCOL_VERSION });
      await barrier(luisIn.client);
      timers.advance(TICK_MS);
      await barrier(anaIn.client);

      expect(inbox(luisIn.client).corrections).toEqual([target]);
      expect(world.store.get(space.id)?.get(luis.user.id)).toMatchObject({ ...target, dir });
      expect(inbox(anaIn.client).deltas.flatMap((d) => d.moved)).toEqual([
        { userId: luis.user.id, ...target, dir },
      ]);

      // Without a desk there is nowhere to go.
      anaIn.client.emit('desk:goto', { v: PROTOCOL_VERSION });
      await barrier(anaIn.client);
      expect(inbox(anaIn.client).errors).toEqual([
        { code: 'UNKNOWN_DESK', message: expect.any(String) as unknown },
      ]);
      expect(inbox(anaIn.client).corrections).toEqual([]);
    });

    it('rate-limits desk:goto per person, across connections (E8-S2)', async () => {
      await request(luis, 'PUT', deskUrl('desk-06'), {});
      const first = await enter(luis);
      for (let i = 0; i < 3; i++) first.client.emit('desk:goto', { v: PROTOCOL_VERSION });
      await barrier(first.client);
      expect(inbox(first.client).errors).toEqual([]);

      // A new connection (another tab, a reconnection) does not get a fresh allowance.
      const second = await enter(luis);
      second.client.emit('desk:goto', { v: PROTOCOL_VERSION });
      await barrier(second.client);

      expect(inbox(second.client).errors.map((error) => error.code)).toEqual(['RATE_LIMITED']);
    });

    it('frees the desk of someone removed from the space', async () => {
      const anaIn = await enter(ana);
      await request(luis, 'PUT', deskUrl('desk-03'), {});
      await barrier(anaIn.client);

      const removed = await request(
        ana,
        'DELETE',
        apiPath(API_PATHS.member, { spaceId: space.id, userId: luis.user.id }),
      );
      await barrier(anaIn.client);

      expect(removed.statusCode).toBe(204);
      expect(inbox(anaIn.client).desks.at(-1)).toEqual({
        deskId: 'desk-03',
        userId: null,
        displayName: null,
        decor: null,
      });
      expect(await heldDesks()).toEqual([]);
      expect((await request(eva, 'PUT', deskUrl('desk-03'), {})).statusCode).toBe(200);
    });

    it('frees the right desk when a member is removed while claiming desks (E8-S2)', async () => {
      const anaIn = await enter(ana);
      await request(luis, 'PUT', deskUrl('desk-01'), {});
      await barrier(anaIn.client);
      const memberUrl = apiPath(API_PATHS.member, { spaceId: space.id, userId: luis.user.id });

      // The removal goes through the same per-space queue as the claims: whatever order they
      // run in, the last desk:updated of every desk matches the database.
      const [claims, removed] = await Promise.all([
        Promise.all(
          ['desk-03', 'desk-04', 'desk-05'].map((deskId) =>
            request(luis, 'PUT', deskUrl(deskId), {}),
          ),
        ),
        request(ana, 'DELETE', memberUrl),
        request(ana, 'PUT', deskUrl('desk-06'), { userId: luis.user.id }),
      ]);
      await barrier(anaIn.client);

      expect(removed.statusCode).toBe(204);
      expect(claims.every((r) => r.statusCode === 200 || r.statusCode === 404)).toBe(true);
      const seen = new Map<string, string | null>();
      for (const desk of inbox(anaIn.client).desks) seen.set(desk.deskId, desk.userId);
      expect([...seen].filter(([, userId]) => userId !== null)).toEqual([]);
      expect(await heldDesks()).toEqual([]);
    });

    it('frees the desk of someone whose account is deleted', async () => {
      await request(luis, 'PUT', deskUrl('desk-03'), {});

      await testApp.container.db.user.delete({ where: { id: luis.user.id } });

      expect(await heldDesks()).toEqual([]);
      expect((await request(eva, 'PUT', deskUrl('desk-03'), {})).statusCode).toBe(200);
    });
  });

  describe('decoration (E9-S3)', () => {
    it('lists at least 12 catalog objects', async () => {
      const response = await request(luis, 'GET', API_PATHS.decorCatalog);

      const { items } = DecorCatalogResponseSchema.parse(response.json());
      expect(items.length).toBeGreaterThanOrEqual(12);
      expect(items).toContainEqual({
        id: 'plant',
        name: expect.any(String) as unknown,
        spriteUrl: '/assets/maps/decor/plant.png',
      });
      expect((await request(null, 'GET', API_PATHS.decorCatalog)).statusCode).toBe(401);
    });

    it('decorates my desk: everyone gets it at once and it persists', async () => {
      const anaIn = await enter(ana);
      await request(luis, 'PUT', deskUrl('desk-03'), {});
      await barrier(anaIn.client);

      const response = await request(luis, 'PATCH', decorUrl('desk-03'), {
        slots: ['plant', null, 'lamp'],
      });
      await barrier(anaIn.client);

      const expected: DeskState = {
        deskId: 'desk-03',
        userId: luis.user.id,
        displayName: 'Luis',
        decor: { slots: ['plant', null, 'lamp'] },
      };
      expect(response.statusCode).toBe(200);
      expect(DeskResponseSchema.parse(response.json()).desk).toEqual(expected);
      expect(inbox(anaIn.client).desks.at(-1)).toEqual(expected);
      expect(await heldDesks()).toEqual([expected]);

      // Still there after a style change, for whoever enters later.
      await request(ana, 'PATCH', apiPath(API_PATHS.space, { spaceId: space.id }), {
        themeId: 'night',
      });
      const { snapshot } = await enter(eva);
      expect(snapshot.desks).toEqual([expected]);

      // Shorter lists are padded; the decoration follows the person to another desk.
      await request(luis, 'PATCH', decorUrl('desk-03'), { slots: ['mug'] });
      const moved = await request(luis, 'PUT', deskUrl('desk-04'), {});
      expect(DeskResponseSchema.parse(moved.json()).desk.decor).toEqual({
        slots: ['mug', null, null],
      });
    });

    it('rejects unknown items and more than 3 objects with 400 (RN-15)', async () => {
      await request(luis, 'PUT', deskUrl('desk-03'), {});
      await request(luis, 'PATCH', decorUrl('desk-03'), { slots: ['plant', null, null] });

      const unknown = await request(luis, 'PATCH', decorUrl('desk-03'), {
        slots: ['plant', 'unicorn', null],
      });
      const tooMany = await request(luis, 'PATCH', decorUrl('desk-03'), {
        slots: ['plant', 'lamp', 'mug', 'cat'],
      });
      const malformed = await request(luis, 'PATCH', decorUrl('desk-03'), { slots: 'plant' });

      expect(unknown.statusCode).toBe(400);
      expect(unknown.json<ErrorResponse>().error.code).toBe('UNKNOWN_DECOR_ITEM');
      expect(tooMany.statusCode).toBe(400);
      expect(tooMany.json<ErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(malformed.statusCode).toBe(400);
      expect((await heldDesks())[0]?.decor).toEqual({ slots: ['plant', null, null] });
    });

    it('answers 403 when decorating a desk that is not mine, owners included', async () => {
      await request(luis, 'PUT', deskUrl('desk-03'), {});
      await request(ana, 'PUT', deskUrl('desk-04'), {});

      const other = await request(eva, 'PATCH', decorUrl('desk-03'), { slots: ['plant'] });
      const owner = await request(ana, 'PATCH', decorUrl('desk-03'), { slots: ['plant'] });
      const free = await request(eva, 'PATCH', decorUrl('desk-05'), { slots: ['plant'] });

      expect([other.statusCode, owner.statusCode, free.statusCode]).toEqual([403, 403, 403]);
      expect((await heldDesks()).every((desk) => desk.decor === null)).toBe(true);
    });
  });
});
