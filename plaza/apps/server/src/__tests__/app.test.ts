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

  it('does not let X-Forwarded-For pick the rate-limit key by default (E8-S2)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-forwarded-for': `198.51.100.${String(i)}` },
      });
      statuses.push(response.statusCode);
    }

    expect(statuses.at(-1)).toBe(429);
  });
});

describe('behind a trusted proxy (TRUST_PROXY=1)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp({ env: { RATE_LIMIT_PER_MINUTE: '3', TRUST_PROXY: '1' } });
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  async function statusFrom(forwardedFor: string): Promise<number> {
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-forwarded-for': forwardedFor },
    });
    return response.statusCode;
  }

  it('keys the rate limit by the address the proxy appended, whatever the client prepends', async () => {
    const spoofed: number[] = [];
    for (let i = 0; i < 4; i++) spoofed.push(await statusFrom(`10.0.0.${String(i)}, 198.51.100.7`));

    expect(spoofed).toEqual([200, 200, 200, 429]);
    // Another real client is not affected.
    expect(await statusFrom('198.51.100.8')).toBe(200);
  });
});
