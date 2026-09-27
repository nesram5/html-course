import * as Sentry from '@sentry/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initSentry, reportError, setErrorContext } from '../sentry';

const CHAT_BODY = 'hola equipo, nos vemos en la sala mar';
const INVITE = '/join/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const GOOGLE_TOKEN = 'ya29.a0AfH6SMBxSecretAccessToken';

/**
 * E8-S1: what the web app really sends to Sentry (serialized envelopes, captured by a test
 * transport) names the release, the person and the office, and nothing else about them.
 */
describe('web error reports (E8-S1)', () => {
  const envelopes: string[] = [];

  beforeAll(async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@o1.ingest.sentry.io/1');
    vi.stubEnv('VITE_APP_VERSION', '9.8.7');
    // Set before Sentry loads: applied once it is ready.
    setErrorContext({ userId: 'user-1' });
    await initSentry({
      transport: (options) =>
        Sentry.createTransport(options, (request) => {
          envelopes.push(
            typeof request.body === 'string'
              ? request.body
              : new TextDecoder().decode(request.body),
          );
          return Promise.resolve({ statusCode: 200 });
        }),
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await Sentry.close(2000);
  });

  beforeEach(() => {
    envelopes.length = 0;
  });

  /** Error events only (release-health session updates travel in their own envelopes). */
  function sentEvents(): string[] {
    return envelopes.filter((envelope) => envelope.includes('{"type":"event"}'));
  }

  it('sends the release, userId and spaceId and scrubs chat, tokens, invite links and e-mails', async () => {
    setErrorContext({ spaceId: 'space-1' });
    // A console line (it could hold anything) and a navigation to an invite link.
    // eslint-disable-next-line no-console -- the console breadcrumb must not be sent
    console.info(`chat: ${CHAT_BODY}`);
    Sentry.addBreadcrumb({ category: 'navigation', data: { from: '/spaces', to: INVITE } });

    reportError(new Error(`Could not open ${INVITE} for ana@acme.com with ${GOOGLE_TOKEN}`));
    await Sentry.flush(2000);

    const events = sentEvents();
    const sent = events.join('\n');
    expect(events).toHaveLength(1);
    expect(sent).toContain('"release":"bululu-web@9.8.7"');
    expect(sent).toContain('"user":{"id":"user-1"}');
    expect(sent).toContain('"spaceId":"space-1"');
    expect(sent).toContain('Could not open /join/[redacted] for [email] with [redacted]');
    for (const secret of [CHAT_BODY, INVITE, GOOGLE_TOKEN, 'ana@acme.com']) {
      expect(sent).not.toContain(secret);
    }
  });

  it('stops tagging the office once the person leaves it and forgets them on sign-out', async () => {
    setErrorContext({ spaceId: null });
    setErrorContext({ userId: null });

    reportError(new Error('later'));
    await Sentry.flush(2000);

    const sent = sentEvents().join('\n');
    expect(sent).toContain('later');
    expect(sent).not.toContain('space-1');
    expect(sent).not.toContain('user-1');
  });
});
