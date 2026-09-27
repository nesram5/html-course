import { CLIENT_HEADER, ErrorResponseSchema, type ErrorCode } from '@bululu/shared';
import type { z } from 'zod';

/** Code of an `ApiError`: a server error code or a client-side network failure. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

/** Error thrown by `http()`. `code` is translated with `t(\`errors.${code}\`)`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpOptions {
  method?: Method;
  /** Serialised as JSON. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Lets the request outlive the page (telemetry sent while leaving). */
  keepalive?: boolean;
}

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'INTERNAL';
  return 'VALIDATION_ERROR';
}

function withQuery(path: string, query: HttpOptions['query']): string {
  if (query === undefined) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search === '' ? path : `${path}?${search}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = ErrorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      return new ApiError(response.status, parsed.data.error.code, parsed.data.error.message);
    }
  } catch {
    // Not JSON (e.g. a proxy error page): fall back to the status.
  }
  return new ApiError(response.status, codeForStatus(response.status), response.statusText);
}

/**
 * Typed `fetch` for the Plaza API (same origin; Vite proxies `/api` in development).
 * Sends the session cookie and the `X-Bululu-Client` header (CSRF defence), validates the
 * response with the given zod schema and turns `{ error: { code } }` bodies into `ApiError`.
 */
export async function http<S extends z.ZodType>(
  path: string,
  schema: S,
  options?: HttpOptions,
): Promise<z.output<S>>;
/** Same, for responses without body (204). */
export async function http(path: string, schema: null, options?: HttpOptions): Promise<void>;
export async function http<S extends z.ZodType>(
  path: string,
  schema: S | null,
  options: HttpOptions = {},
): Promise<z.output<S> | undefined> {
  const headers: Record<string, string> = { Accept: 'application/json', [CLIENT_HEADER]: 'web' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(withQuery(path, options.query), {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
      ...(options.signal !== undefined && { signal: options.signal }),
      ...(options.keepalive === true && { keepalive: true }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }

  if (!response.ok) throw await toApiError(response);
  if (schema === null || response.status === 204) return undefined;

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(response.status, 'INTERNAL', `Unexpected response from ${path}`);
  }
  return parsed.data;
}

/** i18n key of an error, for `t()`: `errors.<CODE>` in the `common` namespace. */
export function errorMessageKey(error: unknown): `errors.${ApiErrorCode}` {
  if (isApiError(error)) return `errors.${error.code}`;
  return 'errors.INTERNAL';
}
