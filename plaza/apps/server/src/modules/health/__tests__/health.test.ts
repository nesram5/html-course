import { HealthResponseSchema } from '@plaza/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../../../test/app.js';

describe('GET /api/health', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp();
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('responds 200 { status: "ok", version }', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(response.json());
    expect(body.status).toBe('ok');
    expect(body.version).toBe(testApp.container.config.version);
    expect(body.realtime).toEqual({ connectedBySpace: {}, avgTickMs: null });
  });

  it('reports connected people per space and the tick duration', async () => {
    testApp.container.metrics.setConnected('space-1', 2);
    testApp.container.metrics.recordTick(1.5);

    const response = await testApp.app.inject({ method: 'GET', url: '/api/health' });

    expect(response.json()).toMatchObject({
      realtime: { connectedBySpace: { 'space-1': 2 }, avgTickMs: 1.5 },
    });
  });

  it('sends security headers', async () => {
    const response = await testApp.app.inject({ method: 'GET', url: '/api/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain('ws://localhost:7880');
  });
});
