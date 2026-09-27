import type { AddressInfo } from 'node:net';

import {
  PROTOCOL_VERSION,
  REALTIME_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@bululu/shared';
import * as Sentry from '@sentry/node';
import { pino } from 'pino';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { modules } from '../../modules/index.js';
import { buildTestApp, type TestApp } from '../../test/app.js';
import { resetDatabase } from '../../test/db.js';
import { signIn, type TestUser } from '../../test/session.js';
import { createErrorReporter, type ErrorReporter } from '../error-reporter.js';
import { safeHandler } from '../socket.js';

const CHAT_BODY = 'hola equipo, el presupuesto secreto es 42';
const GOOGLE_TOKEN = 'ya29.a0AfH6SMBxSecretAccessToken';
const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OCJ9.c2lnbmF0dXJlLXNpZw';

/**
 * E8-S1: what really leaves the process for Sentry (the serialized envelopes, through a capture
 * transport instead of HTTP) carries the release, the userId and the spaceId, and none of the
 * chat bodies, tokens, cookies or e-mails of the failing requests and socket events.
 */
describe('Sentry reports (E8-S1)', () => {
  const envelopes: string[] = [];
  let reporter: ErrorReporter;
  let testApp: TestApp;
  let ana: TestUser;
  let url: string;

  beforeAll(async () => {
    reporter = await createErrorReporter(
      {
        sentry: { dsn: 'https://public@o1.ingest.sentry.io/1', environment: 'test' },
        version: '9.8.7',
      },
      pino({ level: 'silent' }),
      {
        transport: (options) =>
          Sentry.createTransport(options, (request) => {
            envelopes.push(
              typeof request.body === 'string'
                ? request.body
                : new TextDecoder().decode(request.body),
            );
            return Promise.resolve({ statusCode: 200 });
          }),
      },
    );
    testApp = await buildTestApp({
      overrides: { reporter },
      modules: [
        // The chat module is replaced by a `chat:send` handler that fails.
        ...modules.filter((module) => module.name !== 'chat'),
        {
          name: 'failing-routes',
          register({ app, io, services, socketDeps }) {
            const { requireUser } = services.get('auth');
            app.post('/api/spaces/:spaceId/explode', { preHandler: requireUser }, () => {
              throw new Error(`Google refused ${GOOGLE_TOKEN} for ana@acme.com (${ID_TOKEN})`);
            });
            io.on('connection', (socket) => {
              socket.data.spaceId = 'space-from-socket';
              socket.on(
                'chat:send',
                safeHandler(socketDeps, socket, 'chat:send', () => {
                  throw new Error('chat store exploded');
                }),
              );
            });
          },
        },
      ],
    });
    await testApp.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = testApp.app.server.address() as AddressInfo;
    url = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await testApp.app.close();
    await Sentry.close(2000);
  });

  beforeEach(async () => {
    await resetDatabase(testApp.container.db);
    envelopes.length = 0;
    ana = await signIn(testApp.app, 'ana@acme.com');
  });

  function expectNoSecrets(sent: string): void {
    for (const secret of [
      CHAT_BODY,
      GOOGLE_TOKEN,
      ID_TOKEN,
      'ana@acme.com',
      ana.cookie.split('=')[1] ?? ana.cookie,
    ]) {
      expect(sent).not.toContain(secret);
    }
  }

  it('reports an HTTP error with version, userId and spaceId, scrubbed', async () => {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/spaces/space-42/explode?code=4/0AX4XfWjAbCdEfGhIj',
      headers: ana.headers,
      payload: { body: CHAT_BODY },
    });
    await reporter.flush();

    expect(response.statusCode).toBe(500);
    const sent = envelopes.join('\n');
    expect(envelopes).toHaveLength(1);
    expect(sent).toContain('"release":"bululu-server@9.8.7"');
    expect(sent).toContain(`"user":{"id":"${ana.user.id}"}`);
    expect(sent).toContain('"spaceId":"space-42"');
    expect(sent).toContain('Google refused [redacted] for [email]');
    expectNoSecrets(sent);
  });

  it('reports a failing socket event with userId, spaceId and event, never its payload', async () => {
    const client: ClientSocket<ServerToClientEvents, ClientToServerEvents> = connect(url, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie: ana.cookie },
    });
    try {
      await new Promise<void>((resolve) => client.on('connect', resolve));
      const ack = await client.emitWithAck('chat:send', { v: PROTOCOL_VERSION, body: CHAT_BODY });
      expect(ack).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
      await vi.waitFor(async () => {
        await reporter.flush();
        expect(envelopes).toHaveLength(1);
      });
    } finally {
      client.disconnect();
    }

    const sent = envelopes.join('\n');
    expect(sent).toContain('chat store exploded');
    expect(sent).toContain(`"user":{"id":"${ana.user.id}"}`);
    expect(sent).toContain('"spaceId":"space-from-socket"');
    expect(sent).toContain('"event":"chat:send"');
    expectNoSecrets(sent);
  });
});
