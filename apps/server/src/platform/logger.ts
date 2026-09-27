import { scrubString } from '@plaza/shared';
import type { FastifyBaseLogger } from 'fastify';
import { pino, type LoggerOptions } from 'pino';

import type { AppConfig } from './config.js';

/** Logger type injected everywhere (pino-compatible). Never use `console.*` in the server. */
export type Logger = FastifyBaseLogger;

/**
 * Paths never written to logs: session cookies, auth headers and anything that may carry
 * Google/LiveKit tokens, OAuth codes or chat bodies (standards §4).
 */
export const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.token',
  '*.accessToken',
  '*.idToken',
  '*.refreshToken',
  '*.code',
  '*.body',
  '*.password',
];

/**
 * Strips the query string (OAuth callbacks carry one-time codes in it) and redacts secrets in
 * the path: invite links carry their long-lived token (`/api/join/<token>`, security review).
 */
export function loggedUrl(url: string | undefined): string | undefined {
  const path = url?.split('?')[0];
  return path === undefined ? undefined : scrubString(path);
}

export function loggerOptions(
  config: Pick<AppConfig, 'logLevel' | 'env' | 'version'>,
): LoggerOptions {
  return {
    level: config.logLevel,
    base: { service: 'plaza-server', version: config.version },
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    serializers: {
      req(req: { method?: string; url?: string; id?: string }) {
        return { id: req.id, method: req.method, url: loggedUrl(req.url) };
      },
    },
    ...(config.env === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss.l' } } }
      : {}),
  };
}

export function createLogger(config: Pick<AppConfig, 'logLevel' | 'env' | 'version'>): Logger {
  return pino(loggerOptions(config));
}
