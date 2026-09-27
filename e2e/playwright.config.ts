import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { defineConfig, devices } from '@playwright/test';

/** The root `.env` (the README's setup), read without touching `process.env`; `{}` when absent. */
function dotEnv(): Record<string, string | undefined> {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

// Not 5173/3000: a running `pnpm dev` would otherwise be reused, with its database and limits.
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  dotEnv().E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/bululu_e2e';

/**
 * E2E tests (standards §7): real server + Vite dev server, fake media devices and the
 * test-only login (`AUTH_TEST_LOGIN=true`). Run with `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // One browser group at a time: real media (LiveKit + fake devices) and the per-frame budgets
  // are timing-sensitive, and on a shared 4-core machine parallel workers make one key press walk
  // two tiles. `E2E_WORKERS` overrides it.
  workers: Number(process.env.E2E_WORKERS ?? 1),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
    trace: 'retain-on-failure',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'server',
      command:
        'pnpm --filter @bululu/server exec prisma migrate deploy && pnpm --filter @bululu/server exec tsx --conditions=@bululu/source src/main.ts',
      cwd: '..',
      url: `http://localhost:${String(API_PORT)}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        PORT: String(API_PORT),
        DATABASE_URL,
        SESSION_SECRET: 'e2e-session-secret-at-least-32-characters',
        PUBLIC_URL: `http://localhost:${String(WEB_PORT)}`,
        LIVEKIT_URL: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
        LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'devkey',
        LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'secret',
        AUTH_TEST_LOGIN: 'true',
        RATE_LIMIT_PER_MINUTE: '10000',
        // Every browser of the run connects from 127.0.0.1 (E8-S2 per-IP connection limit).
        REALTIME_CONNECTIONS_PER_MINUTE: '10000',
        // The metrics page (E8-S7) of `a11y.spec.ts` and `product.spec.ts`.
        ADMIN_EMAILS: 'producto@bululu.test',
      },
    },
    {
      name: 'web',
      command: `pnpm --filter @bululu/web exec vite --port ${String(WEB_PORT)} --strictPort`,
      cwd: '..',
      url: `http://localhost:${String(WEB_PORT)}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { BULULU_API_URL: `http://localhost:${String(API_PORT)}` },
    },
  ],
});
