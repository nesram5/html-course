import type { MemberDto } from '@bululu/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/shared/ui';
import { avatarsFixture, meFixture, spaceFixture } from '@/test/fixtures';
import { apiError, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

import { browser } from '../lib/browser';

const OLD_URL = 'http://localhost:5173/join/tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDE';
const NEW_URL = 'http://localhost:5173/join/tok_NEWdefghijklmnopqrstuvwxyz0123456789ABCDE';

function member(overrides: Partial<MemberDto>): MemberDto {
  return {
    userId: 'user-ana',
    displayName: 'Ana',
    avatarId: 'avatar-01',
    email: 'ana@acme.com',
    role: 'OWNER',
    status: 'available',
    deskId: null,
    joinedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function settingsApi(overrides: Parameters<typeof mockApi>[0] = {}) {
  let inviteUrl = OLD_URL;
  return mockApi({
    'GET /api/me': { body: { user: meFixture() } },
    'GET /api/avatars': { body: { avatars: avatarsFixture } },
    'GET /api/spaces/space-1': () => ({ body: { space: spaceFixture({ inviteUrl }) } }),
    'GET /api/spaces/space-1/members': {
      body: {
        members: [
          member({}),
          member({
            userId: 'user-luis',
            displayName: 'Luis',
            email: 'luis@acme.com',
            role: 'MEMBER',
          }),
        ],
      },
    },
    'GET /api/spaces/space-1/bans': { body: { bans: [] } },
    'GET /api/map-templates': { body: { templates: [] } },
    'POST /api/spaces/space-1/invite-link': () => {
      inviteUrl = NEW_URL;
      return { body: { url: NEW_URL } };
    },
    ...overrides,
  });
}

describe('space settings (E2-S4, E2-S6, E2-S7)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useToastStore.setState({ toasts: [] });
  });

  it('copies the /join/<token> invite link', async () => {
    settingsApi();
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    expect(await screen.findByLabelText('Enlace para compartir')).toHaveValue(OLD_URL);
    await user.click(screen.getByRole('button', { name: 'Copiar enlace' }));

    expect(await navigator.clipboard.readText()).toBe(OLD_URL);
    expect(await screen.findByText('Enlace copiado.')).toBeInTheDocument();
  });

  it('opened with #salas (the room card link), scrolls to the rooms and focuses their heading', async () => {
    settingsApi();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    renderApp({ route: '/spaces/space-1/settings#salas' });

    const heading = await screen.findByRole('heading', { name: 'Salas de reunión' });

    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(scrolled).toHaveBeenCalledOnce();
  });

  it('regenerates the link only after confirming', async () => {
    const api = settingsApi();
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    await user.click(await screen.findByRole('button', { name: 'Regenerar enlace' }));
    const confirm = screen.getByRole('group', {
      name: 'El enlace actual dejará de funcionar. ¿Quieres regenerarlo?',
    });
    expect(api.callsTo('POST /api/spaces/space-1/invite-link')).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Enlace para compartir')).toHaveValue(NEW_URL);
    });
    expect(api.callsTo('POST /api/spaces/space-1/invite-link')).toHaveLength(1);
  });

  it('saves and clears the allowed domain', async () => {
    const api = settingsApi({
      'PATCH /api/spaces/space-1': ({ body }) => ({
        body: { space: spaceFixture(body as { allowedDomain: string | null }) },
      }),
    });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    await user.type(await screen.findByLabelText('Dominio'), 'acme.com');
    await user.click(screen.getByRole('button', { name: 'Guardar dominio' }));
    await user.click(await screen.findByRole('button', { name: 'Quitar dominio' }));

    await waitFor(() => {
      expect(api.callsTo('PATCH /api/spaces/space-1').map((call) => call.body)).toEqual([
        { allowedDomain: 'acme.com' },
        { allowedDomain: null },
      ]);
    });
  });

  it('shows members with avatar, e-mail and role and kicks after confirming', async () => {
    const api = settingsApi({ 'DELETE /api/spaces/space-1/members/user-luis': { status: 204 } });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    const luis = (await screen.findByText('luis@acme.com')).closest('tr');
    if (luis === null) throw new Error('row not found');
    expect(within(luis).getByText('Miembro')).toBeInTheDocument();
    expect(within(luis).getByTestId('avatar-sprite')).toBeInTheDocument();
    const anaRow = screen.getByText('ana@acme.com').closest('tr');
    expect(anaRow).not.toBeNull();
    expect(within(anaRow as HTMLElement).queryByRole('button', { name: 'Expulsar' })).toBeNull();

    await user.click(within(luis).getByRole('button', { name: 'Expulsar' }));
    // The focus follows the question (RNF-07): on "Cancelar", then back on "Expulsar".
    expect(document.activeElement).toBe(within(luis).getByRole('button', { name: 'Cancelar' }));
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(within(luis).getByRole('button', { name: 'Expulsar' }));
    await user.keyboard('{Enter}');
    await user.click(within(luis).getByRole('button', { name: 'Confirmar' }));

    // The row goes away: the focus waits on the section heading, not on <body>.
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Miembros' }));
    expect(await screen.findByText('Luis ya no es miembro del espacio.')).toBeInTheDocument();
    expect(api.callsTo('DELETE /api/spaces/space-1/members/user-luis')).toHaveLength(1);
  });

  it('hands the administration to a member after confirming (E8-S6)', async () => {
    const api = settingsApi({ 'PATCH /api/spaces/space-1/members/user-luis': { status: 204 } });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    const luis = (await screen.findByText('luis@acme.com')).closest('tr');
    if (luis === null) throw new Error('row not found');
    await user.click(within(luis).getByRole('button', { name: 'Hacer administrador/a' }));
    await user.click(within(luis).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Luis ya administra el espacio.')).toBeInTheDocument();
    expect(api.callsTo('PATCH /api/spaces/space-1/members/user-luis')[0]?.body).toEqual({
      role: 'OWNER',
    });
  });

  it('says when the members could not be loaded, and retries', async () => {
    let fail = true;
    settingsApi({
      'GET /api/spaces/space-1/members': () =>
        fail ? apiError(500, 'INTERNAL') : { body: { members: [member({})] } },
    });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(screen.queryByRole('table')).toBeNull();
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('ana@acme.com')).toBeInTheDocument();
  });

  it('lists removed people and readmits them with "Readmitir"', async () => {
    let bans = [
      {
        userId: 'user-eva',
        displayName: 'Eva',
        avatarId: 'avatar-02',
        email: 'eva@acme.com',
        createdAt: '2026-09-20T10:00:00.000Z',
      },
    ];
    const api = settingsApi({
      'GET /api/spaces/space-1/bans': () => ({ body: { bans } }),
      'DELETE /api/spaces/space-1/bans/user-eva': () => {
        bans = [];
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    const panel = await screen.findByRole('region', { name: 'Personas expulsadas' });
    expect(within(panel).getByText('Eva')).toBeInTheDocument();
    expect(
      within(panel).getByText(/eva@acme\.com · Expulsada el 20 sept 2026/),
    ).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Readmitir a Eva' }));

    expect(await screen.findByText('Eva puede volver a unirse al espacio.')).toBeInTheDocument();
    expect(api.callsTo('DELETE /api/spaces/space-1/bans/user-eva')).toHaveLength(1);
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Personas expulsadas' })).not.toBeInTheDocument();
    });
  });

  it('hides the removed people panel when nobody was removed', async () => {
    settingsApi();
    renderApp({ route: '/spaces/space-1/settings' });

    expect(await screen.findByText('luis@acme.com')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Personas expulsadas' })).not.toBeInTheDocument();
  });

  it('lists each room with its Meet link and a "Probar" button', async () => {
    settingsApi();
    renderApp({ route: '/spaces/space-1/settings' });

    const tryLink = await screen.findByRole('link', {
      name: 'Probar el Meet de Sala Sur (se abre en otra pestaña)',
    });
    expect(tryLink).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
    expect(tryLink).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Sin enlace de Meet')).toBeInTheDocument();
  });

  it('validates pasted links and saves them with PUT', async () => {
    const api = settingsApi({
      'PUT /api/spaces/space-1/rooms/sala-norte': ({ body }) => ({
        body: {
          room: {
            areaId: 'sala-norte',
            name: 'Sala Norte',
            meetUri: (body as { meetUri: string }).meetUri,
            source: 'manual',
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    const [firstEdit] = await screen.findAllByRole('button', { name: 'Pegar enlace' });
    await user.click(firstEdit as HTMLElement);
    const input = screen.getByLabelText('Enlace de Meet de Sala Norte');
    await user.type(input, 'https://zoom.us/j/123');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'El enlace debe empezar por https://meet.google.com/.',
    );
    expect(api.callsTo('PUT /api/spaces/space-1/rooms/sala-norte')).toHaveLength(0);

    await user.clear(input);
    await user.type(input, 'https://meet.google.com/xyz-abcd-efg');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Enlace guardado.')).toBeInTheDocument();
    expect(api.callsTo('PUT /api/spaces/space-1/rooms/sala-norte')[0]?.body).toEqual({
      meetUri: 'https://meet.google.com/xyz-abcd-efg',
    });
  });

  it('after a denied or failed Google authorization, explains how to retry or paste links', async () => {
    settingsApi({
      'POST /api/spaces/space-1/rooms/authorize': {
        body: { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' },
      },
    });
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings?rooms=denied' });

    expect(
      await screen.findByText(
        'No se dio permiso a Google. Puedes reintentar o pegar los enlaces a mano.',
      ),
    ).toHaveAttribute('role', 'status');
    await user.click(screen.getByRole('button', { name: 'Reintentar con Google' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    });
  });

  it('confirms when the rooms were created', async () => {
    settingsApi();
    renderApp({ route: '/spaces/space-1/settings?rooms=created' });

    expect(
      await screen.findByText('Las salas de reunión ya tienen su Google Meet.'),
    ).toBeInTheDocument();
  });

  it('members only see the rooms, without owner settings', async () => {
    mockApi({
      'GET /api/me': { body: { user: meFixture({ id: 'user-luis' }) } },
      'GET /api/spaces/space-1': {
        body: { space: spaceFixture({ role: 'MEMBER', inviteUrl: null }) },
      },
    });
    renderApp({ route: '/spaces/space-1/settings' });

    expect(
      await screen.findByText('Solo la administración del espacio puede cambiar los ajustes.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Enlace para compartir')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pegar enlace' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Salas de reunión' })).toBeInTheDocument();
  });

  it('answers "not found" for spaces I do not belong to', async () => {
    mockApi({
      'GET /api/me': { body: { user: meFixture() } },
      'GET /api/spaces/space-9': apiError(404, 'NOT_A_MEMBER'),
    });
    renderApp({ route: '/spaces/space-9/settings' });

    expect(await screen.findByRole('alert')).toHaveTextContent('No eres miembro de este espacio.');
  });
});
