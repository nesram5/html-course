import process from 'node:process';

import { loadConfig, type AppConfig } from '../platform/config.js';

/** Per-run test database (created and migrated by `global-setup.ts`). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/plaza_test';

export function testEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    PUBLIC_URL: 'http://localhost:5173',
    LIVEKIT_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'secret',
    AUTH_TEST_LOGIN: 'true',
    // Every test connects from 127.0.0.1: the per-IP limit is tested on its own.
    REALTIME_CONNECTIONS_PER_MINUTE: '100000',
    ...overrides,
  };
}

export function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig(testEnv(overrides));
}
