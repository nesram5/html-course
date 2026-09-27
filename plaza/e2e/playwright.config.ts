import process from 'node:process';

import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/plaza_e2e';

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
        'pnpm --filter @plaza/server exec prisma migrate deploy && pnpm --filter @plaza/server exec tsx --conditions=@plaza/source src/main.ts',
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
      },
    },
    {
      name: 'web',
      command: `pnpm --filter @plaza/web exec vite --port ${String(WEB_PORT)} --strictPort`,
      cwd: '..',
      url: `http://localhost:${String(WEB_PORT)}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { PLAZA_API_URL: `http://localhost:${String(API_PORT)}` },
    },
  ],
});
