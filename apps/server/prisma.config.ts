import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { defineConfig } from 'prisma/config';

// With a prisma.config.ts, Prisma does not load `.env` files: load the monorepo one explicitly.
const envFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
