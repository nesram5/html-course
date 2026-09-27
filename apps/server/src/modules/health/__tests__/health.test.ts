import { HEALTH_TOKEN_HEADER, HealthResponseSchema } from '@bululu/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';

const TOKEN = 'health-token-0123456789abcdef';

describe('GET /api/health', () => {
  let testApp: TestApp | undefined;

  async function start(env: Record<string, string | undefined> = {}): Promise<TestApp> {
    testApp = await buildTestApp({ env });
    return testApp;
  }

  afterEach(async () => {
    await testApp?.app.close();
    testApp = undefined;
  });

  it('responds 200 { status: "ok", version } with the figures outside production', async () => {
    const { app, container } = await start();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = HealthResponseSchema.parse(response.json());
    expect(body.status).toBe('ok');
    expect(body.version).toBe(container.config.version);
    expect(body.realtime).toEqual({
      connectedBySpace: {},
      inConversationBySpace: {},
      avgTickMs: null,
      avgMediaPeersPerTick: null,
    });
    expect(body.process?.rssMb).toBeGreaterThan(0);
  });

  it('reports connected and in-conversation people per space, the tick and media:peers per tick', async () => {
    const { app, container } = await start();
    container.metrics.setConnected('space-1', 2);
    container.metrics.setInConversation('space-1', 2);
    container.metrics.recordTick(1.5);
    container.metrics.recordMediaPeers(2);
    container.metrics.recordMediaPeers(0);

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.json()).toMatchObject({
      realtime: {
        connectedBySpace: { 'space-1': 2 },
        inConversationBySpace: { 'space-1': 2 },
        avgTickMs: 1.5,
        avgMediaPeersPerTick: 1,
      },
    });
  });

  it('keeps the figures behind HEALTH_TOKEN and liveness public (E8-S1)', async () => {
    const { app, container } = await start({ HEALTH_TOKEN: TOKEN });
    container.metrics.setConnected('space-1', 3);

    const anonymous = await app.inject({ method: 'GET', url: '/api/health' });
    const wrong = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { [HEALTH_TOKEN_HEADER]: 'not-the-token-at-all' },
    });
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { [HEALTH_TOKEN_HEADER]: TOKEN },
    });

    for (const response of [anonymous, wrong]) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', version: container.config.version });
    }
    expect(allowed.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(allowed.json()).realtime?.connectedBySpace).toEqual({
      'space-1': 3,
    });
  });

  it('never shows the figures in production without a configured token', async () => {
    const { app } = await start({
      NODE_ENV: 'production',
      AUTH_TEST_LOGIN: 'false',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { [HEALTH_TOKEN_HEADER]: 'anything-long-enough' },
    });

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json<object>()).sort()).toEqual(['status', 'version']);
  });

  it('sends security headers', async () => {
    const { app } = await start();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain('ws://localhost:7880');
  });
});
