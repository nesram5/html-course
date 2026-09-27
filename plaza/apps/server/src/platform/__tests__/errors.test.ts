import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildTestApp, type TestApp } from '../../test/app.js';
import { AppError, normalizeError } from '../errors.js';

describe('HTTP error handling', () => {
  let testApp: TestApp;
  let app: FastifyInstance;

  beforeEach(async () => {
    testApp = await buildTestApp({
      modules: [
        {
          name: 'test-routes',
          register({ app: server }) {
            server.get('/api/test/app-error', () => {
              throw new AppError('UNKNOWN_MAP_TEMPLATE', 'No such template');
            });
            server.get('/api/test/zod-error', () => z.object({ name: z.string() }).parse({}));
            server.get('/api/test/boom', () => {
              throw new Error('database exploded');
            });
            server.post('/api/test/echo', (request) => ({ received: request.body }));
          },
        },
      ],
    });
    app = testApp.app;
  });

  afterEach(async () => {
    await app.close();
  });

  it('maps AppError to its status and code', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/test/app-error' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'UNKNOWN_MAP_TEMPLATE', message: 'No such template' },
    });
    expect(testApp.reporter.captured).toHaveLength(0);
  });

  it('maps zod errors to 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/test/zod-error' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 403 (not 500) to map asset paths that try to leave the allowed folders', async () => {
    // `inject` normalizes `..`, so send the raw path over a real socket like a scanner would.
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    for (const path of [
      '/assets/maps/templates/../manifest.json',
      '/assets/maps/avatars/../../package.json',
    ]) {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        request({ host: '127.0.0.1', port, path }, (response) => {
          response.resume();
          resolve(response.statusCode);
        })
          .on('error', reject)
          .end();
      });
      expect(status, path).toBe(403);
    }
    expect(testApp.reporter.captured).toHaveLength(0);
  });

  it('answers 500 INTERNAL without details and reports unhandled errors', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/test/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
    expect(testApp.reporter.captured).toHaveLength(1);
    expect(String(testApp.reporter.captured[0]?.error)).toContain('database exploded');
    expect(testApp.reporter.captured[0]?.context?.requestId).toEqual(expect.any(String));
  });

  it('answers 404 NOT_FOUND for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nope?secret=1' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/nope not found' },
    });
  });

  it('requires the X-Plaza-Client header on state-changing requests', async () => {
    const rejected = await app.inject({ method: 'POST', url: '/api/test/echo', payload: { a: 1 } });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN');

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      headers: { 'x-plaza-client': 'web' },
      payload: { a: 1 },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ received: { a: 1 } });
  });

  it('maps malformed JSON to 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      headers: { 'x-plaza-client': 'web', 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('normalizeError', () => {
  it('lets AppError override the default status', () => {
    expect(normalizeError(new AppError('CONFLICT', 'x', { httpStatus: 422 })).status).toBe(422);
    expect(normalizeError('a string').payload.code).toBe('INTERNAL');
  });
});
