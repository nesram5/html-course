import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/shared/ui';
import { avatarsFixture, meFixture, spaceFixture } from '@/test/fixtures';
import { apiError, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDE';
const preview = {
  [`GET /api/join/${TOKEN}`]: {
    body: { space: { name: 'Oficina Acme', mapTemplateId: 'campus@1', memberCount: 3 } },
  },
};
const {
  rooms: _r,
  ownerId: _o,
  allowedDomain: _a,
  createdAt: _c,
  inviteUrl: _i,
  ...summary
} = spaceFixture({ role: 'MEMBER' });

describe('join page /join/:token (E2-S5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useToastStore.setState({ toasts: [] });
  });

  it('without a session, shows the space name and "Entrar con Google" back to the link', async () => {
    const api = mockApi({ ...preview, 'GET /api/me': apiError(401, 'UNAUTHORIZED') });

    renderApp({ route: `/join/${TOKEN}` });

    expect(
      await screen.findByRole('heading', { name: 'Te han invitado a Oficina Acme' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 personas ya están dentro/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar con Google' })).toHaveAttribute(
      'href',
      `/api/auth/google?next=%2Fjoin%2F${TOKEN}`,
    );
    expect(api.callsTo(`POST /api/join/${TOKEN}`)).toHaveLength(0);
  });

  it('once signed in, joins automatically and enters the space', async () => {
    const api = mockApi({
      ...preview,
      'GET /api/me': { body: { user: meFixture() } },
      [`POST /api/join/${TOKEN}`]: { body: { space: summary, alreadyMember: false } },
    });

    const { router } = renderApp({ route: `/join/${TOKEN}` });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/s/oficina-acme');
    });
    expect(api.callsTo(`POST /api/join/${TOKEN}`)).toHaveLength(1);
  });

  it('existing members simply enter (idempotent)', async () => {
    mockApi({
      ...preview,
      'GET /api/me': { body: { user: meFixture() } },
      [`POST /api/join/${TOKEN}`]: { body: { space: summary, alreadyMember: true } },
    });

    const { router } = renderApp({ route: `/join/${TOKEN}` });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/s/oficina-acme');
    });
  });

  it('asks new people for their avatar before entering the map', async () => {
    mockApi({
      ...preview,
      'GET /api/me': { body: { user: meFixture({ avatarChosen: false }) } },
      'GET /api/avatars': { body: { avatars: avatarsFixture } },
      'PATCH /api/me': { body: { user: meFixture({ avatarId: 'avatar-02' }) } },
      [`POST /api/join/${TOKEN}`]: { body: { space: summary, alreadyMember: false } },
    });
    const user = userEvent.setup();
    const { router } = renderApp({ route: `/join/${TOKEN}` });

    await user.click(await screen.findByRole('radio', { name: 'Avatar 2' }));
    expect(router.state.location.pathname).toBe(`/join/${TOKEN}`);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/s/oficina-acme');
    });
  });

  it('says "Esta invitación ya no es válida" for revoked links', async () => {
    mockApi({
      [`GET /api/join/${TOKEN}`]: apiError(404, 'INVALID_INVITE'),
      'GET /api/me': apiError(401, 'UNAUTHORIZED'),
    });

    renderApp({ route: `/join/${TOKEN}` });

    expect(
      await screen.findByRole('heading', { name: 'Esta invitación ya no es válida' }),
    ).toBeInTheDocument();
  });

  it('says so too when the link is revoked between the preview and the join', async () => {
    mockApi({
      ...preview,
      'GET /api/me': { body: { user: meFixture() } },
      [`POST /api/join/${TOKEN}`]: apiError(404, 'INVALID_INVITE'),
    });

    renderApp({ route: `/join/${TOKEN}` });

    expect(
      await screen.findByRole('heading', { name: 'Esta invitación ya no es válida' }),
    ).toBeInTheDocument();
  });

  it('tells people removed by the owner that they cannot join again (ban)', async () => {
    mockApi({
      ...preview,
      'GET /api/me': { body: { user: meFixture() } },
      [`POST /api/join/${TOKEN}`]: apiError(403, 'BANNED_FROM_SPACE'),
    });

    renderApp({ route: `/join/${TOKEN}` });

    expect(
      await screen.findByRole('heading', { name: 'Ya no puedes unirte a este espacio' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('La administración te expulsó. Si fue un error, pídele que te readmita.'),
    ).toBeInTheDocument();
  });
});
