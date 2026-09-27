import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { testEnv } from '../test/config.js';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Starts `src/main.ts` with exactly the given environment (no .env file). */
function start(env: Record<string, string | undefined>) {
  return spawnSync('pnpm', ['exec', 'tsx', '--conditions=@plaza/source', 'src/main.ts'], {
    cwd: serverDir,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('server startup', () => {
  it('does not start when a variable is missing and logs which one (E0-S3)', () => {
    const result = start(testEnv({ DATABASE_URL: undefined, LOG_LEVEL: 'info' }));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('DATABASE_URL: is missing');
  });

  it('does not start with AUTH_TEST_LOGIN=true and NODE_ENV=production', () => {
    const result = start(
      testEnv({
        NODE_ENV: 'production',
        AUTH_TEST_LOGIN: 'true',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'AUTH_TEST_LOGIN: must not be enabled when NODE_ENV=production',
    );
  });
});
