/**
 * Development seed: a demo user and a demo space. Idempotent (`pnpm db:seed`).
 * Sign in as this user with the test login (`AUTH_TEST_LOGIN=true`):
 *   POST /api/auth/test-login { "email": "dev@plaza.local" }
 */
import { createHash } from 'node:crypto';
import process from 'node:process';

import { PrismaClient } from '@prisma/client';

const DEV_EMAIL = 'dev@plaza.local';
/** Dev-only invite token: /join/dev-invite-token-000000 */
const DEV_INVITE_TOKEN = 'dev-invite-token-000000';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
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
      inviteTokenHash: createHash('sha256').update(DEV_INVITE_TOKEN).digest('hex'),
    },
  });

  await prisma.membership.upsert({
    where: { userId_spaceId: { userId: user.id, spaceId: space.id } },
    update: {},
    create: { userId: user.id, spaceId: space.id, role: 'OWNER' },
  });

  process.stdout.write(`Seeded user ${DEV_EMAIL} and space /s/${space.slug}\n`);
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
