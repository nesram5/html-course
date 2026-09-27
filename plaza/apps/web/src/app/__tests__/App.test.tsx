import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from '@/test/render';

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('App shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the home page with texts from es.json and the server status', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        status: 'ok',
        version: '0.1.0',
        realtime: { connectedBySpace: {}, avgTickMs: null },
      }),
    );

    renderApp({ route: '/' });

    expect(screen.getByRole('heading', { level: 1, name: 'Plaza' })).toBeInTheDocument();
    expect(screen.getByText(/La oficina virtual de tu equipo/)).toBeInTheDocument();
    expect(await screen.findByText('Conectado (versión 0.1.0)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar a mis espacios' })).toHaveAttribute(
      'href',
      '/spaces',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('tells when the server is not available', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    renderApp({ route: '/' });

    expect(await screen.findByText('No disponible')).toBeInTheDocument();
  });

  it('shows a 404 page for unknown routes with a way back home', async () => {
    mockFetch(
      jsonResponse({
        status: 'ok',
        version: '0.1.0',
        realtime: { connectedBySpace: {}, avgTickMs: null },
      }),
    );
    const user = userEvent.setup();

    const { router } = renderApp({ route: '/no-existe' });

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Volver al inicio' }));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Plaza' })).toBeInTheDocument();
  });
});
