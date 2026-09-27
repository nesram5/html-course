import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../test/db.js';
import { buildTestApp, type TestApp } from '../../test/app.js';

describe('database schema (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  async function createUser(email: string) {
    return testApp.container.db.user.create({
      data: { googleSub: `sub-${email}`, email, displayName: email },
    });
  }

  async function createSpace(ownerId: string) {
    return testApp.container.db.space.create({
      data: {
        name: 'Oficina Acme',
        slug: `acme-${ownerId}`,
        mapTemplateId: 'office-small@1',
        ownerId,
        inviteTokenHash: `hash-${ownerId}`,
        memberships: { create: { userId: ownerId, role: 'OWNER' } },
      },
    });
  }

  it('applies the migrations with the defaults of the data model', async () => {
    const user = await createUser('ana@acme.com');
    const space = await createSpace(user.id);

    expect(user.avatarId).toBe('avatar-01');
    expect(user.avatarChosenAt).toBeNull();
    expect(space.themeId).toBe('pixel');
    expect(space.inviteVersion).toBe(1);
    const membership = await testApp.container.db.membership.findUniqueOrThrow({
      where: { userId_spaceId: { userId: user.id, spaceId: space.id } },
    });
    expect(membership).toMatchObject({ role: 'OWNER', status: 'available', deskId: null });
  });

  it('deletes sessions, memberships and feedback in cascade and keeps messages anonymous', async () => {
    const owner = await createUser('owner@acme.com');
    const user = await createUser('luis@acme.com');
    const space = await createSpace(owner.id);
    const db = testApp.container.db;
    await db.session.create({ data: { id: 'hash', userId: user.id, expiresAt: new Date() } });
    await db.membership.create({ data: { userId: user.id, spaceId: space.id } });
    const message = await db.chatMessage.create({
      data: { spaceId: space.id, authorId: user.id, body: 'hola' },
    });
    await db.feedback.create({ data: { userId: user.id, spaceId: space.id, message: 'Genial' } });

    await db.user.delete({ where: { id: user.id } });

    expect(await db.session.count()).toBe(0);
    expect(await db.membership.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.feedback.count()).toBe(0);
    expect(
      (await db.chatMessage.findUniqueOrThrow({ where: { id: message.id } })).authorId,
    ).toBeNull();
  });

  it('allows one owner per desk and many members without desk', async () => {
    const db = testApp.container.db;
    const owner = await createUser('owner@acme.com');
    const a = await createUser('a@acme.com');
    const b = await createUser('b@acme.com');
    const space = await createSpace(owner.id);
    await db.membership.create({ data: { userId: a.id, spaceId: space.id } });
    await db.membership.create({ data: { userId: b.id, spaceId: space.id } });

    await db.membership.update({
      where: { userId_spaceId: { userId: a.id, spaceId: space.id } },
      data: { deskId: 'desk-1', deskDecor: { slots: ['plant', null, null] } },
    });
    const claimTaken = db.membership.update({
      where: { userId_spaceId: { userId: b.id, spaceId: space.id } },
      data: { deskId: 'desk-1' },
    });

    await expect(claimTaken).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(claimTaken).rejects.toMatchObject({ code: 'P2002' });
  });
});
