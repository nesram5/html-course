import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { TEST_DATABASE_URL } from './config.js';

/**
 * Integration tests run against their own database (`plaza_test` by default, override with
 * TEST_DATABASE_URL). This applies pending migrations (non-destructive `migrate deploy`, which
 * also creates the database when missing); each test file empties the tables with
 * `resetDatabase()`. If a migration was edited locally, drop the test database by hand.
 */
export default function setup(): void {
  const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
