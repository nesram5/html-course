import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { avatarsFixture, meFixture } from '@/test/fixtures';
import { apiError, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';
import { useToastStore } from '@/shared/ui';

import { RequireAvatar } from '../components/RequireAvatar';

const anonymous = { 'GET /api/me': apiError(401, 'UNAUTHORIZED') };

describe('auth feature (E1-S3, E1-S4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useToastStore.setState({ toasts: [] });
  });

  describe('login and protected routes', () => {
    it('sends people without a session to the login page and keeps the original route', async () => {
      mockApi(anonymous);

      const { router } = renderApp({ route: '/profile?tab=avatar' });

      const google = await screen.findByRole('link', { name: 'Entrar con Google' });
      expect(router.state.location.pathname).toBe('/login');
      expect(router.state.location.search).toBe('?next=%2Fprofile%3Ftab%3Davatar');
      expect(google).toHaveAttribute('href', '/api/auth/google?next=%2Fprofile%3Ftab%3Davatar');
    });

    it('tells when the sign-in was cancelled and lets the person retry', async () => {
      mockApi(anonymous);

      renderApp({ route: '/login?error=cancelled&next=/spaces' });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Has cancelado el inicio de sesión con Google.',
      );
      expect(screen.getByRole('link', { name: 'Entrar con Google' })).toHaveAttribute(
        'href',
        '/api/auth/google?next=%2Fspaces',
      );
    });

    it('never builds an open redirect from next', async () => {
      mockApi(anonymous);

      renderApp({ route: '/login?next=//evil.example.com' });

      expect(await screen.findByRole('link', { name: 'Entrar con Google' })).toHaveAttribute(
        'href',
        '/api/auth/google?next=%2Fspaces',
      );
    });

    it('ignores a next path that the browser would turn into another origin', async () => {
      mockApi({ 'GET /api/me': { body: { user: meFixture() } } });

      // "/\t/evil.example.com" is "//evil.example.com" once the browser drops the tab.
      const { router } = renderApp({ route: '/login?next=%2F%09%2Fevil.example.com' });

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/spaces');
      });
    });

    it('goes straight to next when already signed in', async () => {
      mockApi({ 'GET /api/me': { body: { user: meFixture() } } });

      const { router } = renderApp({ route: '/login?next=/profile' });

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/profile');
      });
    });

    it('signs in with the test login in development builds', async () => {
      const api = mockApi({
        ...anonymous,
        'POST /api/auth/test-login': { body: { user: meFixture() } },
        'GET /api/avatars': { body: { avatars: avatarsFixture } },
      });
      const user = userEvent.setup();
      const { router } = renderApp({ route: '/login?next=/profile' });

      await user.type(await screen.findByLabelText('Email de prueba'), 'ana@acme.com');
      await user.click(screen.getByRole('button', { name: 'Entrar como prueba' }));

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/profile');
      });
      expect(api.callsTo('POST /api/auth/test-login')[0]?.body).toEqual({ email: 'ana@acme.com' });
    });

    it('sends the Workspace domain of the test login when given (allowedDomain tests)', async () => {
      const api = mockApi({
        ...anonymous,
        'POST /api/auth/test-login': { body: { user: meFixture() } },
        'GET /api/avatars': { body: { avatars: avatarsFixture } },
      });
      const user = userEvent.setup();
      renderApp({ route: '/login?next=/profile' });

      await user.type(await screen.findByLabelText('Email de prueba'), 'ana@acme.com');
      await user.type(screen.getByLabelText(/Dominio de Google Workspace/), 'acme.com');
      await user.click(screen.getByRole('button', { name: 'Entrar como prueba' }));

      await waitFor(() => {
        expect(api.callsTo('POST /api/auth/test-login')[0]?.body).toEqual({
          email: 'ana@acme.com',
          hostedDomain: 'acme.com',
        });
      });
    });

    it('logs out and goes back to the login page', async () => {
      const api = mockApi({
        'GET /api/me': { body: { user: meFixture() } },
        'GET /api/avatars': { body: { avatars: avatarsFixture } },
        'POST /api/auth/logout': { status: 204 },
      });
      const user = userEvent.setup();
      const { router } = renderApp({ route: '/profile' });

      await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/login');
      });
      expect(api.callsTo('POST /api/auth/logout')).toHaveLength(1);
    });
  });

  describe('profile', () => {
    it('shows at least 8 avatars with their walking animation', async () => {
      mockApi({
        'GET /api/me': { body: { user: meFixture() } },
        'GET /api/avatars': { body: { avatars: avatarsFixture } },
      });

      renderApp({ route: '/profile' });

      const picker = await screen.findByRole('radiogroup', { name: 'Elige tu avatar' });
      const options = within(picker).getAllByRole('radio');
      expect(options.length).toBeGreaterThanOrEqual(8);
      for (const sprite of within(picker).getAllByTestId('avatar-sprite')) {
        expect(sprite).toHaveClass('avatar-sprite--walking');
        expect(sprite.style.backgroundImage).toContain('/assets/maps/avatars/');
      }
      expect(within(picker).getByRole('radio', { name: 'Avatar 1' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('saves the chosen avatar and display name', async () => {
      const api = mockApi({
        'GET /api/me': { body: { user: meFixture() } },
        'GET /api/avatars': { body: { avatars: avatarsFixture } },
        'PATCH /api/me': ({ body }) => ({
          body: {
            user: meFixture({ displayName: 'Ana G.', avatarId: 'avatar-03', ...(body as object) }),
          },
        }),
      });
      const user = userEvent.setup();
      renderApp({ route: '/profile' });

      const name = await screen.findByLabelText('Nombre visible');
      await user.clear(name);
      await user.type(name, 'Ana G.');
      await user.click(await screen.findByRole('radio', { name: 'Avatar 3' }));
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(await screen.findByText('Perfil guardado.')).toBeInTheDocument();
      expect(api.callsTo('PATCH /api/me')[0]?.body).toEqual({
        displayName: 'Ana G.',
        avatarId: 'avatar-03',
      });
      expect(screen.getByRole('radio', { name: 'Avatar 3' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('shows the server error for an unknown avatar', async () => {
      mockApi({
        'GET /api/me': { body: { user: meFixture() } },
        'GET /api/avatars': { body: { avatars: avatarsFixture } },
        'PATCH /api/me': apiError(400, 'UNKNOWN_AVATAR'),
      });
      const user = userEvent.setup();
      renderApp({ route: '/profile' });

      await user.click(await screen.findByRole('radio', { name: 'Avatar 2' }));
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(await screen.findByText('Ese avatar no existe.')).toBeInTheDocument();
    });
  });

  describe('first-time avatar prompt', () => {
    const gatedRoutes = [
      {
        path: '/s/:slug',
        element: (
          <RequireAvatar>
            <p>El mapa</p>
          </RequireAvatar>
        ),
      },
    ];

    it('asks for an avatar before showing the map', async () => {
      const api = mockApi({
        'GET /api/me': { body: { user: meFixture({ avatarChosen: false }) } },
        'GET /api/avatars': { body: { avatars: avatarsFixture } },
        'PATCH /api/me': {
          body: { user: meFixture({ avatarId: 'avatar-04', avatarChosen: true }) },
        },
      });
      const user = userEvent.setup();
      renderApp({ route: '/s/acme', routes: gatedRoutes });

      expect(
        await screen.findByRole('heading', { name: 'Elige cómo te verán en el mapa' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('El mapa')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();

      await user.click(screen.getByRole('radio', { name: 'Avatar 4' }));
      await user.click(screen.getByRole('button', { name: 'Continuar' }));

      expect(await screen.findByText('El mapa')).toBeInTheDocument();
      expect(api.callsTo('PATCH /api/me')[0]?.body).toEqual({
        displayName: 'Ana',
        avatarId: 'avatar-04',
      });
    });

    it('goes straight to the map when the avatar was already chosen or there is no catalog', async () => {
      mockApi({
        'GET /api/me': { body: { user: meFixture({ avatarChosen: false }) } },
        'GET /api/avatars': { body: { avatars: [] } },
      });

      renderApp({ route: '/s/acme', routes: gatedRoutes });

      expect(await screen.findByText('El mapa')).toBeInTheDocument();
    });
  });
});
