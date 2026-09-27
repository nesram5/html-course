import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorReporter, noopErrorReporter } from '../error-reporter.js';

const sentry = vi.hoisted(() => {
  const scope = { setUser: vi.fn(), setTag: vi.fn() };
  return {
    scope,
    init: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn(() => Promise.resolve(true)),
    withScope: vi.fn((callback: (s: typeof scope) => void) => {
      callback(scope);
    }),
  };
});

vi.mock('@sentry/node', () => sentry);

const logger = pino({ level: 'silent' });

describe('createErrorReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op without SENTRY_DSN', async () => {
    const reporter = await createErrorReporter({ sentry: null, version: '1.0.0' }, logger);

    expect(reporter).toBe(noopErrorReporter);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('sends errors to Sentry with user, space and request tags but no PII', async () => {
    const dsn = 'https://key@o1.ingest.sentry.io/1';
    const reporter = await createErrorReporter(
      { sentry: { dsn, environment: 'staging' }, version: '1.2.3' },
      logger,
    );
    const error = new Error('boom');

    reporter.captureException(error, {
      userId: 'u1',
      spaceId: 's1',
      requestId: 'r1',
      event: 'chat:send',
    });
    await reporter.flush();

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn,
        environment: 'staging',
        release: 'bululu-server@1.2.3',
        sendDefaultPii: false,
      }),
    );
    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(sentry.scope.setUser).toHaveBeenCalledWith({ id: 'u1' });
    expect(sentry.scope.setTag).toHaveBeenCalledWith('spaceId', 's1');
    expect(sentry.scope.setTag).toHaveBeenCalledWith('requestId', 'r1');
    expect(sentry.scope.setTag).toHaveBeenCalledWith('event', 'chat:send');
    expect(sentry.flush).toHaveBeenCalled();
  });
});
