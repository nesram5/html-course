import type { AccountDeletionPreview } from '@bululu/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/shared/ui';
import { avatarsFixture, meFixture } from '@/test/fixtures';
import { apiError, mockApi, type MockRoute } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const NOTHING: AccountDeletionPreview = { blockingSpaces: [], spacesDeleted: [] };

function profileApi(preview: AccountDeletionPreview, routes: Record<string, MockRoute> = {}) {
  return mockApi({
    'GET /api/me': { body: { user: meFixture() } },
    'GET /api/avatars': { body: { avatars: avatarsFixture } },
    'GET /api/me/deletion': { body: preview },
    ...routes,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.setState({ toasts: [] });
});

describe('"Borrar mi cuenta" in the profile (E8-S6)', () => {
  it('explains what is deleted and asks for confirmation in a dialog', async () => {
    const api = profileApi(
      { blockingSpaces: [], spacesDeleted: [{ id: 's9', name: 'Mi rincón' }] },
      { 'DELETE /api/me': { status: 204 } },
    );
    const user = userEvent.setup();
    const { router } = renderApp({ route: '/profile' });

    const section = await screen.findByRole('region', { name: 'Borrar mi cuenta' });
    expect(section).toHaveTextContent('«Usuario eliminado»');
    const open = within(section).getByRole('button', { name: 'Borrar mi cuenta…' });
    await waitFor(() => {
      expect(open).toBeEnabled();
    });
    await user.click(open);

    const dialog = screen.getByRole('alertdialog', { name: '¿Borrar tu cuenta para siempre?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Mi rincón');
    // The safe choice has the focus, and Escape closes without deleting.
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
    expect(api.calls.some((call) => call.method === 'DELETE')).toBe(false);

    await user.click(open);
    await user.click(screen.getByRole('button', { name: 'Sí, borrar mi cuenta' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(api.calls.filter((call) => call.method === 'DELETE').map((c) => c.path)).toEqual([
      '/api/me',
    ]);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
      'Tu cuenta se ha borrado. Gracias por probar Bululu.',
    );
  });

  it('blocks the only owner of a space with other members and says what to do', async () => {
    profileApi({ blockingSpaces: [{ id: 'space-1', name: 'Oficina Acme' }], spacesDeleted: [] });
    renderApp({ route: '/profile' });

    const section = await screen.findByRole('region', { name: 'Borrar mi cuenta' });
    expect(
      await within(section).findByText(/eres la única persona administradora de un espacio/),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('link', { name: 'Ajustes de «Oficina Acme»' }),
    ).toHaveAttribute('href', '/spaces/space-1/settings');
    expect(within(section).getByRole('button', { name: 'Borrar mi cuenta…' })).toBeDisabled();
  });

  it('shows the refusal when the person became the only owner meanwhile', async () => {
    profileApi(NOTHING, { 'DELETE /api/me': apiError(409, 'SOLE_OWNER') });
    const user = userEvent.setup();
    renderApp({ route: '/profile' });

    const open = await screen.findByRole('button', { name: 'Borrar mi cuenta…' });
    await waitFor(() => {
      expect(open).toBeEnabled();
    });
    await user.click(open);
    await user.click(screen.getByRole('button', { name: 'Sí, borrar mi cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ahora eres la única persona administradora',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('privacy page (E8-S6)', () => {
  it('is linked from the login page and the footer and says what is and is not stored', async () => {
    mockApi({ 'GET /api/me': apiError(401, 'UNAUTHORIZED') });
    const user = userEvent.setup();
    const { router } = renderApp({ route: '/login' });

    const footer = await screen.findByRole('navigation', { name: 'Pie de página' });
    expect(within(footer).getByRole('link', { name: 'Privacidad' })).toHaveAttribute(
      'href',
      '/privacidad',
    );
    await user.click(await screen.findByRole('link', { name: 'Qué datos guardamos' }));

    expect(router.state.location.pathname).toBe('/privacidad');
    expect(screen.getByRole('heading', { level: 1, name: 'Tus datos en Bululu' })).toBeVisible();
    const stored = screen.getByRole('region', { name: 'Qué guardamos' });
    expect(stored).toHaveTextContent('perfil básico de Google');
    expect(stored).toHaveTextContent('mensajes del chat');
    expect(stored).toHaveTextContent('Eventos de producto sin datos personales');
    const notStored = screen.getByRole('region', { name: 'Qué no guardamos nunca' });
    for (const text of ['Audio ni vídeo', 'posición en el mapa', 'Tokens de Google']) {
      expect(notStored).toHaveTextContent(text);
    }
    expect(
      screen.getByRole('region', { name: 'Las salas de reunión usan Google Meet' }),
    ).toBeVisible();
  });
});
