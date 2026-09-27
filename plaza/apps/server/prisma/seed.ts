/**
 * Development seed: a demo user and a demo space. Idempotent (`pnpm db:seed`).
 * Sign in as this user with the test login (`AUTH_TEST_LOGIN=true`):
 *   POST /api/auth/test-login { "email": "dev@plaza.local" }
 */
import { createHash } from 'node:crypto';
import process from 'node:process';

import { PrismaClient } from '@prisma/client';

import { deriveInviteToken } from '../src/modules/spaces/invite-token.js';

const DEV_EMAIL = 'dev@plaza.local';
const SESSION_SECRET = process.env.SESSION_SECRET ?? '';
const PUBLIC_URL = (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  if (SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be set (see .env.example)');
  const user = await prisma.user.upsert({
    where: { googleSub: DEV_EMAIL },
    update: {},
    create: { googleSub: DEV_EMAIL, email: DEV_EMAIL, displayName: 'Dev' },
  });

  const space = await prisma.space.upsert({
    where: { slug: 'oficina-demo' },
    update: {},
    create: {
      name: 'Oficina demo',
      slug: 'oficina-demo',
      mapTemplateId: 'office-small@1',
      ownerId: user.id,
      // Replaced below by the token derived from the id (like SpacesService.create does).
      inviteTokenHash: createHash('sha256').update(`seed:${Date.now().toString()}`).digest('hex'),
    },
  });
  const token = deriveInviteToken(SESSION_SECRET, space.id, space.inviteVersion);
  await prisma.space.update({
    where: { id: space.id },
    data: { inviteTokenHash: createHash('sha256').update(token).digest('hex') },
  });

  await prisma.membership.upsert({
    where: { userId_spaceId: { userId: user.id, spaceId: space.id } },
    update: {},
    create: { userId: user.id, spaceId: space.id, role: 'OWNER' },
  });

  process.stdout.write(
    `Seeded user ${DEV_EMAIL} and space /s/${space.slug} (invite: ${PUBLIC_URL}/join/${token})\n`,
  );
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
