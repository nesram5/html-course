import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../test/app.js';

describe('app platform plugins', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp({ env: { RATE_LIMIT_PER_MINUTE: '20' } });
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('serves only the public folders of @plaza/maps under /assets/maps', async () => {
    for (const url of [
      '/assets/maps/package.json',
      '/assets/maps/src/manifest.ts',
      '/assets/maps/../../package.json',
    ]) {
      const response = await testApp.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
    }
  });

  it('rate-limits HTTP requests with RATE_LIMITED', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const response = await testApp.app.inject({ method: 'GET', url: '/api/health' });
      statuses.push(response.statusCode);
    }
    const last = await testApp.app.inject({ method: 'GET', url: '/api/health' });

    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(last.statusCode).toBe(429);
    expect(last.json<{ error: { code: string } }>().error.code).toBe('RATE_LIMITED');
  });
});
