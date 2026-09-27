import type { AdminMetricsResponse } from '@bululu/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { meFixture } from '@/test/fixtures';
import { apiError, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

import { metricStatuses } from '../lib/metric-status';

function metricsFixture(overrides: Partial<AdminMetricsResponse> = {}): AdminMetricsResponse {
  return {
    from: '2026-08-31T00:00:00.000Z',
    to: '2026-09-27T12:00:00.000Z',
    days: 28,
    o1: { conversations: 42, activeUserDays: 12, perActiveUserPerDay: 3.5 },
    o2: {
      weeks: 4,
      spaces: [
        {
          spaceId: 's1',
          name: 'Oficina Acme',
          daysPerWeek: [4, 3, 5, 3],
          avgDaysPerWeek: 3.75,
          atTarget: true,
        },
        {
          spaceId: 's2',
          name: null,
          daysPerWeek: [1, 0, 2, 0],
          avgDaysPerWeek: 0.75,
          atTarget: false,
        },
      ],
      spacesAtTarget: 1,
    },
    o3: { samples: 40, p50Ms: 600, p95Ms: 1200 },
    o4: { sessions: 100, sessionsWithErrors: 1, rate: 0.99 },
    o5: { samples: 0, p50Ms: null, p95Ms: null },
    o6: { roomEntries: 10, meetOpened: 5, rate: 0.5 },
    feedback: [
      {
        id: 'f1',
        message: 'Falta el modo oscuro',
        rating: 4,
        createdAt: '2026-09-26T09:30:00.000Z',
        authorName: 'Luis',
        authorEmail: 'luis@acme.com',
        spaceName: 'Oficina Acme',
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('in-app feedback (E8-S7)', () => {
  it('is reachable from the user menu and sends the message with an optional rating', async () => {
    const api = mockApi({
      'GET /api/me': { body: { user: meFixture() } },
      'GET /api/spaces': { body: { spaces: [] } },
      'POST /api/feedback': { status: 204 },
    });
    const user = userEvent.setup();
    const { router } = renderApp({ route: '/spaces' });

    const menu = await screen.findByRole('navigation', { name: 'Menú de la cuenta' });
    expect(within(menu).queryByRole('link', { name: 'Métricas' })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('link', { name: 'Enviar comentarios' }));
    expect(router.state.location.pathname).toBe('/comentarios');

    const send = screen.getByRole('button', { name: 'Enviar' });
    expect(send).toBeDisabled();
    await user.type(
      screen.getByLabelText('¿Qué te gustaría contarnos?'),
      '  Me encanta el pasillo ',
    );
    await user.click(screen.getByRole('radio', { name: '4 · Bien' }));
    await user.click(send);

    expect(await screen.findByText('¡Gracias! Hemos recibido tus comentarios.')).toHaveFocus();
    expect(api.calls.find((call) => call.method === 'POST')?.body).toEqual({
      message: 'Me encanta el pasillo',
      rating: 4,
    });
    expect(screen.getByLabelText('¿Qué te gustaría contarnos?')).toHaveValue('');
  });
});

describe('admin metrics page (E8-S7)', () => {
  it('links the page for admins and shows O1–O6 with their target', async () => {
    const api = mockApi({
      'GET /api/me': { body: { user: meFixture({ isAdmin: true }) } },
      'GET /api/admin/metrics': { body: metricsFixture() },
    });
    const user = userEvent.setup();
    renderApp({ route: '/comentarios' });

    const menu = await screen.findByRole('navigation', { name: 'Menú de la cuenta' });
    await user.click(within(menu).getByRole('link', { name: 'Métricas' }));

    const o1 = await screen.findByRole('region', { name: 'O1 · Conversaciones espontáneas' });
    expect(o1).toHaveTextContent('3,5');
    expect(o1).toHaveTextContent('Cumple el objetivo');
    const o3 = screen.getByRole('region', { name: 'O3 · Latencia de audio y vídeo (p95)' });
    expect(o3).toHaveTextContent('1,2 s');
    expect(
      screen.getByRole('region', { name: 'O4 · Sesiones sin errores críticos' }),
    ).toHaveTextContent('99 %');
    expect(screen.getByRole('region', { name: 'O5 · Tiempo de entrada (p95)' })).toHaveTextContent(
      'Sin datos suficientes',
    );
    expect(
      screen.getByRole('region', { name: 'O6 · Entradas a sala que abren Meet' }),
    ).toHaveTextContent('No cumple el objetivo');
    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'Oficina Acme' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Espacio borrado' })).toBeInTheDocument();
    expect(screen.getByText('Falta el modo oscuro')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Periodo'), '7');
    await waitFor(() => {
      expect(api.calls.at(-1)?.query.get('days')).toBe('7');
    });
  });

  it('tells everyone else that the page is not for them', async () => {
    mockApi({
      'GET /api/me': { body: { user: meFixture() } },
      'GET /api/admin/metrics': apiError(404, 'NOT_FOUND'),
    });
    renderApp({ route: '/admin/metricas' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta página solo está disponible para el equipo de producto.',
    );
  });

  it('judges each objective against the brief targets', () => {
    expect(metricStatuses(metricsFixture())).toEqual({
      o1: 'met',
      o2: 'notMet',
      o3: 'met',
      o4: 'met',
      o5: 'noData',
      o6: 'notMet',
    });
  });
});
