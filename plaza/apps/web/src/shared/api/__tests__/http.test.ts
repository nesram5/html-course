import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, errorMessageKey, http } from '../http';

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ItemSchema = z.object({ id: z.string() });

describe('http', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends credentials, the X-Plaza-Client header and a JSON body', async () => {
    const fetchMock = stubFetch(Response.json({ id: 'a' }, { status: 201 }));

    const item = await http('/api/items', ItemSchema, {
      method: 'POST',
      body: { name: 'x' },
      query: { next: '/s/acme', skip: undefined },
    });

    expect(item).toEqual({ id: 'a' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/items?next=%2Fs%2Facme');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"name":"x"}' });
    expect(init?.headers).toMatchObject({
      'x-plaza-client': 'web',
      'Content-Type': 'application/json',
    });
  });

  it('turns { error: { code } } bodies into ApiError', async () => {
    stubFetch(
      Response.json({ error: { code: 'UNKNOWN_MAP_TEMPLATE', message: 'nope' } }, { status: 400 }),
    );

    const error = await http('/api/spaces', ItemSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'UNKNOWN_MAP_TEMPLATE', message: 'nope' });
    expect(errorMessageKey(error)).toBe('errors.UNKNOWN_MAP_TEMPLATE');
  });

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    stubFetch(new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }));

    await expect(http('/api/x', ItemSchema)).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL',
    });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    await expect(http('/api/x', ItemSchema)).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('returns undefined for responses without body', async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(http('/api/auth/logout', null, { method: 'POST' })).resolves.toBeUndefined();
  });

  it('rejects responses that do not match the contract', async () => {
    stubFetch(Response.json({ unexpected: true }));

    await expect(http('/api/x', ItemSchema)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(errorMessageKey(new Error('x'))).toBe('errors.INTERNAL');
  });
});
