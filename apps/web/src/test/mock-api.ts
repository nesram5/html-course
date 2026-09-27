import type { ErrorCode } from '@plaza/shared';
import { vi } from 'vitest';

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
}

export type MockRoute = MockResponse | ((request: MockRequest) => MockResponse);

/** `{ error: { code } }` response of the API. */
export function apiError(status: number, code: ErrorCode): MockResponse {
  return { status, body: { error: { code, message: code } } };
}

/**
 * Replaces `fetch` with an in-memory API. Routes are keyed by `"<METHOD> <path>"`, e.g.
 * `"GET /api/me"`; unknown routes answer 404. `calls` records every request (with its JSON body).
 * Routes can be changed during the test (`api.routes['GET /api/me'] = ...`).
 */
export function mockApi(initial: Record<string, MockRoute>) {
  const routes: Record<string, MockRoute> = { ...initial };
  const calls: MockRequest[] = [];
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      'http://localhost',
    );
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const request: MockRequest = { method, path: url.pathname, query: url.searchParams, body };
    calls.push(request);
    const route = routes[`${method} ${url.pathname}`];
    const response: MockResponse =
      route === undefined
        ? apiError(404, 'NOT_FOUND')
        : typeof route === 'function'
          ? route(request)
          : route;
    const status = response.status ?? 200;
    return Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(response.body ?? {}), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    routes,
    calls,
    /** Requests sent to `"<METHOD> <path>"`. */
    callsTo: (key: string) => calls.filter((call) => `${call.method} ${call.path}` === key),
  };
}
