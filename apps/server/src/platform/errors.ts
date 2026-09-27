import {
  ERROR_HTTP_STATUS,
  type ErrorCode,
  type ErrorPayload,
  type ErrorResponse,
} from '@plaza/shared';
import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError, prettifyError } from 'zod';

import type { ErrorContext, ErrorReporter } from './error-reporter.js';

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  VALIDATION_ERROR: 'Invalid request',
  RATE_LIMITED: 'Too many requests',
  INTERNAL: 'Internal server error',
};

/** Expected error of a use case. Services throw it; the central handlers map it (§11.2). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(
    code: ErrorCode,
    message?: string,
    options: { httpStatus?: number; cause?: unknown } = {},
  ) {
    super(message ?? DEFAULT_MESSAGES[code] ?? code, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = options.httpStatus ?? ERROR_HTTP_STATUS[code];
  }
}

export interface NormalizedError {
  status: number;
  payload: ErrorPayload;
  /** `true` for bugs and infrastructure failures: logged as errors and reported to Sentry. */
  unexpected: boolean;
}

/**
 * Errors of Fastify and its plugins that carry an HTTP status. Some plugins (e.g. the
 * `@fastify/static` "Forbidden" for `..` in a path) set `statusCode` without a `code`.
 */
function isHttpError(error: unknown): error is Pick<FastifyError, 'message' | 'statusCode'> {
  return error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number';
}

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  return 'VALIDATION_ERROR';
}

/** Maps any thrown value to the `{ error: { code, message } }` contract. */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      payload: { code: error.code, message: error.message },
      unexpected: error.httpStatus >= 500,
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      payload: { code: 'VALIDATION_ERROR', message: prettifyError(error) },
      unexpected: false,
    };
  }
  if (isHttpError(error) && error.statusCode !== undefined && error.statusCode < 500) {
    return {
      status: error.statusCode,
      payload: { code: codeForStatus(error.statusCode), message: error.message },
      unexpected: false,
    };
  }
  return {
    status: 500,
    payload: { code: 'INTERNAL', message: 'Internal server error' },
    unexpected: true,
  };
}

/**
 * What an HTTP error report says about its request (E8-S1): the request id, the person (set by
 * `requireUser` as `request.auth`) and the space of `/api/spaces/:spaceId/...` routes. Read
 * structurally: the platform does not depend on the auth module.
 */
export function requestErrorContext(request: FastifyRequest): ErrorContext {
  const { auth } = request as { auth?: { userId?: unknown } | null };
  const params = request.params as { spaceId?: unknown } | undefined;
  return {
    requestId: request.id,
    ...(typeof auth?.userId === 'string' && { userId: auth.userId }),
    ...(typeof params?.spaceId === 'string' && { spaceId: params.spaceId }),
  };
}

/** Central HTTP error and 404 handlers (E0-S3). Register before any route. */
export function registerErrorHandling(app: FastifyInstance, reporter: ErrorReporter): void {
  app.setErrorHandler((error, request, reply) => {
    const { status, payload, unexpected } = normalizeError(error);
    if (unexpected) {
      request.log.error({ err: error }, 'Unhandled error');
      reporter.captureException(error, requestErrorContext(request));
    } else {
      request.log.info({ code: payload.code, status }, 'Request failed');
    }
    const body: ErrorResponse = { error: payload };
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url.split('?')[0] ?? ''} not found`,
      },
    };
    return reply.status(404).send(body);
  });
}
