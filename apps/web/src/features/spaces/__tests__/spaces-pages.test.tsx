import type { MapTemplateDto } from '@plaza/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/shared/ui';
import { meFixture, spaceFixture } from '@/test/fixtures';
import { apiError, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

import { browser } from '../lib/browser';

const signedIn = { 'GET /api/me': { body: { user: meFixture() } } };

function template(id: string, name: string, roomCount: number): MapTemplateDto {
  const dir = id.split('@')[0] ?? id;
  const theme = `/assets/maps/templates/${dir}/themes/pixel`;
  return {
    id,
    name,
    thumbnailUrl: `${theme}/thumbnail.png`,
    mapUrl: `/assets/maps/templates/${dir}/map.tmj`,
    width: 40,
    height: 30,
    roomCount,
    deskCount: 0,
    themes: [
      {
        id: 'pixel',
        name: 'Píxel',
        thumbnailUrl: `${theme}/thumbnail.png`,
        belowUrl: `${theme}/below.png`,
        aboveUrl: `${theme}/above.png`,
        baseThemeId: null,
        colorMatrix: null,
      },
    ],
  };
}

describe('spaces feature: my spaces and creation wizard (E2-S3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useToastStore.setState({ toasts: [] });
  });

  it('shows an empty state that invites to create a space', async () => {
    mockApi({ ...signedIn, 'GET /api/spaces': { body: { spaces: [] } } });

    renderApp({ route: '/spaces' });

    expect(
      await screen.findByRole('heading', { name: 'Todavía no tienes ningún espacio' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear espacio' })).toHaveAttribute(
      'href',
      '/spaces/new',
    );
  });

  it('lists my spaces with thumbnail, "Entrar" and settings for owners', async () => {
    const {
      rooms: _r,
      ownerId: _o,
      allowedDomain: _a,
      createdAt: _c,
      inviteUrl: _i,
      ...owned
    } = spaceFixture();
    mockApi({
      ...signedIn,
      'GET /api/spaces': {
        body: {
          spaces: [
            owned,
            { ...owned, id: 'space-2', name: 'Casa de Luis', slug: 'casa-de-luis', role: 'MEMBER' },
          ],
        },
      },
    });

    renderApp({ route: '/spaces' });

    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(2);
    const [acme, luis] = cards as [HTMLElement, HTMLElement];
    expect(within(acme).getByRole('img', { name: 'Miniatura de Oficina Acme' })).toHaveAttribute(
      'src',
      '/assets/maps/templates/campus/themes/pixel/thumbnail.png',
    );
    expect(within(acme).getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/s/oficina-acme',
    );
    expect(within(acme).getByRole('link', { name: 'Ajustes' })).toHaveAttribute(
      'href',
      '/spaces/space-1/settings',
    );
    expect(within(luis).getByText('Miembro')).toBeInTheDocument();
    expect(within(luis).queryByRole('link', { name: 'Ajustes' })).not.toBeInTheDocument();
  });

  it('creates a space with a name and a template, then offers to create the meeting rooms', async () => {
    const space = spaceFixture({
      rooms: spaceFixture().rooms.map((r) => ({ ...r, meetUri: null, source: null })),
    });
    const api = mockApi({
      ...signedIn,
      'GET /api/map-templates': {
        body: {
          templates: [
            template('office-small@1', 'Oficina pequeña', 1),
            template('campus@1', 'Campus', 3),
          ],
        },
      },
      'POST /api/spaces': { status: 201, body: { space } },
      'GET /api/spaces/space-1': { body: { space } },
      'GET /api/spaces': { body: { spaces: [] } },
      'POST /api/spaces/space-1/rooms/authorize': {
        body: { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' },
      },
    });
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderApp({ route: '/spaces/new' });

    expect(await screen.findByText('Paso 1 de 2')).toBeInTheDocument();
    expect(await screen.findByText('1 sala de reunión')).toBeInTheDocument();
    expect(screen.getByText('3 salas de reunión')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre del espacio'), 'Oficina Acme');
    await user.click(screen.getByRole('radio', { name: /Campus/ }));
    await user.click(screen.getByRole('button', { name: 'Crear espacio' }));

    expect(await screen.findByText('Paso 2 de 2')).toBeInTheDocument();
    expect(api.callsTo('POST /api/spaces')[0]?.body).toEqual({
      name: 'Oficina Acme',
      mapTemplateId: 'campus@1',
    });
    expect(screen.getByRole('link', { name: 'Lo haré más tarde' })).toHaveAttribute(
      'href',
      '/s/oficina-acme',
    );

    await user.click(screen.getByRole('button', { name: 'Crear salas de reunión' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=abc');
    });
  });

  it('shows why a space could not be created', async () => {
    mockApi({
      ...signedIn,
      'GET /api/map-templates': { body: { templates: [template('campus@1', 'Campus', 3)] } },
      'POST /api/spaces': apiError(400, 'UNKNOWN_MAP_TEMPLATE'),
    });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/new' });

    await user.type(await screen.findByLabelText('Nombre del espacio'), 'Oficina');
    await user.click(screen.getByRole('button', { name: 'Crear espacio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa plantilla de oficina no existe.',
    );
  });
});
