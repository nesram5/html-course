import type { MapTemplateDto, MemberDto } from '@plaza/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/shared/ui';
import { avatarsFixture, meFixture, spaceFixture } from '@/test/fixtures';
import { apiError, mockApi, type MockRoute } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const THEME_BASE = '/assets/maps/templates/campus/themes';

const TEMPLATE: MapTemplateDto = {
  id: 'campus@1',
  name: 'Campus',
  thumbnailUrl: `${THEME_BASE}/pixel/thumbnail.png`,
  mapUrl: '/assets/maps/templates/campus/map.tmj',
  width: 4,
  height: 3,
  roomCount: 0,
  deskCount: 2,
  themes: [
    ['pixel', 'Pixel'],
    ['night', 'Noche'],
    ['watercolor', 'Acuarela'],
  ].map(([id = '', name = '']) => ({
    id,
    name,
    thumbnailUrl: `${THEME_BASE}/${id}/thumbnail.png`,
    belowUrl: `${THEME_BASE}/${id}/below.png`,
    aboveUrl: `${THEME_BASE}/${id}/above.png`,
    baseThemeId: null,
    colorMatrix: null,
  })),
};

function deskObject(id: number, deskId: string, x: number) {
  return {
    id,
    x: x * 32,
    y: 32,
    width: 32,
    height: 32,
    properties: [{ name: 'deskId', type: 'string', value: deskId }],
  };
}

/** A 4×3 map with two desks (desk-01, desk-02) on the middle row. */
const TMJ = {
  type: 'map',
  orientation: 'orthogonal',
  width: 4,
  height: 3,
  tilewidth: 32,
  tileheight: 32,
  layers: [
    { type: 'tilelayer', name: 'floor', width: 4, height: 3, data: Array<number>(12).fill(1) },
    {
      type: 'tilelayer',
      name: 'collision',
      width: 4,
      height: 3,
      data: [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
    },
    { type: 'objectgroup', name: 'rooms', objects: [] },
    { type: 'objectgroup', name: 'spawns', objects: [{ id: 1, x: 16, y: 16, point: true }] },
    {
      type: 'objectgroup',
      name: 'desks',
      objects: [deskObject(2, 'desk-01', 1), deskObject(3, 'desk-02', 2)],
    },
  ],
};

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

function settingsApi(role: 'OWNER' | 'MEMBER', overrides: Record<string, MockRoute> = {}) {
  let luisDesk: string | null = 'desk-02';
  return mockApi({
    'GET /api/me': { body: { user: meFixture() } },
    'GET /api/avatars': { body: { avatars: avatarsFixture } },
    'GET /api/map-templates': { body: { templates: [TEMPLATE] } },
    'GET /assets/maps/templates/campus/map.tmj': { body: TMJ },
    'GET /api/spaces/space-1': {
      body: { space: spaceFixture(role === 'OWNER' ? {} : { role, inviteUrl: null }) },
    },
    'GET /api/spaces/space-1/members': () => ({
      body: {
        members: [
          member({}),
          member({
            userId: 'user-luis',
            displayName: 'Luis',
            email: 'luis@acme.com',
            role: 'MEMBER',
            deskId: luisDesk,
          }),
        ],
      },
    }),
    'GET /api/spaces/space-1/bans': { body: { bans: [] } },
    'DELETE /api/spaces/space-1/desks/desk-02': () => {
      luisDesk = null;
      return { status: 204 };
    },
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.setState({ toasts: [] });
});

describe('office style settings, "Estilo" (E9-S1)', () => {
  it('shows the thumbnails of the template styles and lets the owner apply one', async () => {
    const api = settingsApi('OWNER', {
      'PATCH /api/spaces/space-1': ({ body }) => ({
        body: { space: spaceFixture(body as { themeId: string }) },
      }),
    });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    const section = await screen.findByRole('region', { name: 'Estilo' });
    expect(
      await within(section).findByRole('img', { name: 'Miniatura del estilo Acuarela' }),
    ).toHaveAttribute('src', `${THEME_BASE}/watercolor/thumbnail.png`);
    expect(within(section).getAllByRole('radio')).toHaveLength(3);
    expect(within(section).getByRole('radio', { name: /Pixel/ })).toBeChecked();
    const apply = within(section).getByRole('button', { name: 'Aplicar estilo' });
    expect(apply).toBeDisabled();

    await user.click(within(section).getByRole('radio', { name: /Acuarela/ }));
    await user.click(apply);

    await waitFor(() => {
      expect(api.callsTo('PATCH /api/spaces/space-1').map((call) => call.body)).toEqual([
        { themeId: 'watercolor' },
      ]);
    });
    expect(await screen.findByText('Estilo «Acuarela» aplicado.')).toBeInTheDocument();
  });

  it('shows members the current style without letting them change it', async () => {
    settingsApi('MEMBER');
    renderApp({ route: '/spaces/space-1/settings' });

    const section = await screen.findByRole('region', { name: 'Estilo' });
    await within(section).findByRole('img', { name: 'Miniatura del estilo Noche' });

    expect(
      within(section).getByText(
        'Este es el estilo de la oficina. Solo la administración del espacio puede cambiarlo.',
      ),
    ).toBeInTheDocument();
    for (const radio of within(section).getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(within(section).getByRole('radio', { name: /Pixel/ })).toBeChecked();
    expect(within(section).queryByRole('button', { name: 'Aplicar estilo' })).toBeNull();
  });

  it('explains a refused change (403)', async () => {
    settingsApi('OWNER', { 'PATCH /api/spaces/space-1': apiError(403, 'FORBIDDEN') });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    const section = await screen.findByRole('region', { name: 'Estilo' });
    await user.click(await within(section).findByRole('radio', { name: /Noche/ }));
    await user.click(within(section).getByRole('button', { name: 'Aplicar estilo' }));

    expect(await screen.findByText('No tienes permiso para hacer esto.')).toBeInTheDocument();
    expect(within(section).getByRole('radio', { name: /Pixel/ })).not.toBeDisabled();
  });
});

describe('desks in "Miembros" (E9-S2)', () => {
  it('assigns a free desk to a member and frees the desk of another, live', async () => {
    const api = settingsApi('OWNER', {
      'PUT /api/spaces/space-1/desks/desk-01': ({ body }) => ({
        body: {
          desk: {
            deskId: 'desk-01',
            userId: (body as { userId: string }).userId,
            displayName: 'Ana',
            decor: null,
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderApp({ route: '/spaces/space-1/settings' });

    const select = await screen.findByRole('combobox', { name: 'Escritorio para Ana' });
    // Luis holds desk-02: only desk-01 is offered.
    await waitFor(() => {
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Sin escritorio', 'Escritorio 1']);
    });
    await user.selectOptions(select, 'desk-01');
    await user.click(screen.getByRole('button', { name: 'Asignar' }));

    await waitFor(() => {
      expect(api.callsTo('PUT /api/spaces/space-1/desks/desk-01').map((c) => c.body)).toEqual([
        { userId: 'user-ana' },
      ]);
    });

    await user.click(screen.getByRole('button', { name: 'Liberar el escritorio de Luis' }));
    await waitFor(() => {
      expect(api.callsTo('DELETE /api/spaces/space-1/desks/desk-02')).toHaveLength(1);
    });
    expect(await screen.findByText('El escritorio de Luis está libre.')).toBeInTheDocument();
  });

  it('links "Ir a su escritorio" to the office with the camera on the desk', async () => {
    settingsApi('OWNER');
    renderApp({ route: '/spaces/space-1/settings' });

    const link = await screen.findByRole('link', { name: 'Ir al escritorio de Luis' });

    expect(link).toHaveAttribute('href', '/s/oficina-acme?desk=desk-02');
    expect(link).toHaveTextContent('Ir a su escritorio');
  });
});
