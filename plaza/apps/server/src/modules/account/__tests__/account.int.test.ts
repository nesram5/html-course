import {
  AccountDeletionPreviewSchema,
  API_PATHS,
  apiPath,
  MessagesResponseSchema,
  SESSION_COOKIE_NAME,
  type SpaceDetailDto,
} from '@plaza/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../../test/db.js';
import { ManualTimers } from '../../../test/manual-timers.js';
import { RealtimeHarness } from '../../../test/realtime.js';
import type { TestUser } from '../../../test/session.js';

describe('"Borrar mi cuenta" (E8-S6)', () => {
  const timers = new ManualTimers();
  const harness = new RealtimeHarness({ timers });
  let ana: TestUser;
  let luis: TestUser;
  let eva: TestUser;
  let acme: SpaceDetailDto;

  beforeAll(async () => {
    await harness.start();
  });

  afterAll(async () => {
    await harness.stop();
  });

  beforeEach(async () => {
    await resetDatabase(harness.testApp.container.db);
    ana = await harness.signIn('ana@acme.com', 'Ana');
    luis = await harness.signIn('luis@acme.com', 'Luis');
    eva = await harness.signIn('eva@other.com', 'Eva');
    acme = await harness.createSpace(ana, [luis]);
  });

  afterEach(() => {
    harness.reset();
  });

  const db = () => harness.testApp.container.db;

  function preview(user: TestUser) {
    return harness.testApp.app.inject({
      method: 'GET',
      url: API_PATHS.meDeletion,
      headers: { cookie: user.cookie },
    });
  }

  function deleteAccount(user: TestUser, headers: Record<string, string> = user.headers) {
    return harness.testApp.app.inject({ method: 'DELETE', url: API_PATHS.me, headers });
  }

  it('says which spaces block the deletion and which go with the account', async () => {
    const alone = await harness.createSpace(eva, []);
    await db().space.update({ where: { id: alone.id }, data: { name: 'Solo Eva' } });

    expect(AccountDeletionPreviewSchema.parse((await preview(ana)).json())).toEqual({
      blockingSpaces: [{ id: acme.id, name: 'Oficina Acme' }],
      spacesDeleted: [],
    });
    expect(AccountDeletionPreviewSchema.parse((await preview(luis)).json())).toEqual({
      blockingSpaces: [],
      spacesDeleted: [],
    });
    expect(AccountDeletionPreviewSchema.parse((await preview(eva)).json())).toEqual({
      blockingSpaces: [],
      spacesDeleted: [{ id: alone.id, name: 'Solo Eva' }],
    });
    expect((await harness.testApp.app.inject({ url: API_PATHS.meDeletion })).statusCode).toBe(401);
  });

  it('blocks the only owner of a space with other members and deletes nothing', async () => {
    const response = await deleteAccount(ana);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'SOLE_OWNER' } });
    expect(await db().user.count({ where: { id: ana.user.id } })).toBe(1);
    expect(await db().space.count()).toBe(1);
  });

  it('needs a session and the client header', async () => {
    expect((await deleteAccount(luis, { cookie: luis.cookie })).statusCode).toBe(403);
    expect((await deleteAccount(luis, { 'x-plaza-client': 'test' })).statusCode).toBe(401);
    expect(await db().user.count({ where: { id: luis.user.id } })).toBe(1);
  });

  it('deletes my data, sessions, memberships, desk and bans; my messages stay anonymous', async () => {
    const { client: anaSocket } = await harness.enter(ana, acme.id);
    const { client: luisSocket } = await harness.enter(luis, acme.id);
    await db().membership.update({
      where: { userId_spaceId: { userId: luis.user.id, spaceId: acme.id } },
      data: { deskId: 'desk-01' },
    });
    await db().chatMessage.create({
      data: { spaceId: acme.id, authorId: luis.user.id, body: 'Hola equipo' },
    });
    await db().feedback.create({ data: { userId: luis.user.id, message: 'Genial' } });
    const evaSpace = await harness.createSpace(eva, []);
    await db().spaceBan.create({ data: { spaceId: evaSpace.id, userId: luis.user.id } });
    await harness.testApp.app.inject({
      method: 'POST',
      url: API_PATHS.authTestLogin,
      headers: { 'x-plaza-client': 'test' },
      payload: { email: 'luis@acme.com' },
    });
    expect(await db().session.count({ where: { userId: luis.user.id } })).toBe(2);

    const response = await deleteAccount(luis);

    expect(response.statusCode).toBe(204);
    const cleared = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
    expect(cleared?.value).toBe('');
    expect(await db().user.count({ where: { id: luis.user.id } })).toBe(0);
    expect(await db().session.count({ where: { userId: luis.user.id } })).toBe(0);
    expect(await db().membership.count({ where: { userId: luis.user.id } })).toBe(0);
    expect(await db().spaceBan.count({ where: { userId: luis.user.id } })).toBe(0);
    expect(await db().feedback.count()).toBe(0);
    const old = await harness.testApp.app.inject({
      url: API_PATHS.me,
      headers: { cookie: luis.cookie },
    });
    expect(old.statusCode).toBe(401);

    // The chat keeps the text without the author ("Usuario eliminado").
    const history = await harness.testApp.app.inject({
      url: apiPath(API_PATHS.messages, { spaceId: acme.id }),
      headers: { cookie: ana.cookie },
    });
    expect(MessagesResponseSchema.parse(history.json()).messages).toEqual([
      expect.objectContaining({ authorId: null, body: 'Hola equipo' }),
    ]);

    // Out of the office at once, and the desk is free for the others.
    await harness.tick(acme.id, anaSocket);
    expect(harness.inbox(luisSocket)['space:kicked']).toEqual([{ reason: 'ACCOUNT_DELETED' }]);
    expect(luisSocket.connected).toBe(false);
    expect(harness.inbox(anaSocket)['desk:updated']).toEqual([
      { deskId: 'desk-01', userId: null, displayName: null, decor: null },
    ]);
    expect(harness.inbox(anaSocket)['world:delta'].flatMap((delta) => delta.left)).toContain(
      luis.user.id,
    );
    expect(harness.testApp.media.removals).toContainEqual(
      expect.objectContaining({ identity: luis.user.id }),
    );
  });

  it('deletes the spaces where I was the only member', async () => {
    await deleteAccount(luis);

    expect((await deleteAccount(ana)).statusCode).toBe(204);
    expect(await db().space.count({ where: { id: acme.id } })).toBe(0);
    expect(await db().meetingRoom.count()).toBe(0);
    expect(await db().chatMessage.count()).toBe(0);
  });

  it('hands the space over to another owner when there is one', async () => {
    await db().membership.update({
      where: { userId_spaceId: { userId: luis.user.id, spaceId: acme.id } },
      data: { role: 'OWNER' },
    });

    expect((await deleteAccount(ana)).statusCode).toBe(204);
    const space = await db().space.findUniqueOrThrow({ where: { id: acme.id } });
    expect(space.ownerId).toBe(luis.user.id);
  });
});
