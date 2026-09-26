import type { AppConfig } from './config.js';
import type { Logger } from './logger.js';

/** Context attached to reported errors. Never put tokens or chat bodies here. */
export interface ErrorContext {
  requestId?: string;
  userId?: string;
  spaceId?: string;
  event?: string;
}

/** Destination of unexpected errors (Sentry in deployed environments). */
export interface ErrorReporter {
  captureException(error: unknown, context?: ErrorContext): void;
  flush(): Promise<void>;
}

export const noopErrorReporter: ErrorReporter = {
  captureException: () => undefined,
  flush: () => Promise.resolve(),
};

/** Sentry reporter when `SENTRY_DSN` is set; otherwise a no-op. */
export async function createErrorReporter(
  config: Pick<AppConfig, 'sentry' | 'version'>,
  logger: Logger,
): Promise<ErrorReporter> {
  if (config.sentry === null) return noopErrorReporter;

  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: `plaza-server@${config.version}`,
    sendDefaultPii: false,
    defaultIntegrations: false,
  });
  logger.info('Sentry error reporting enabled');

  return {
    captureException(error, context) {
      Sentry.withScope((scope) => {
        if (context?.userId !== undefined) scope.setUser({ id: context.userId });
        if (context?.spaceId !== undefined) scope.setTag('spaceId', context.spaceId);
        if (context?.requestId !== undefined) scope.setTag('requestId', context.requestId);
        if (context?.event !== undefined) scope.setTag('event', context.event);
        Sentry.captureException(error);
      });
    },
    async flush() {
      await Sentry.flush(2000);
    },
  };
}
