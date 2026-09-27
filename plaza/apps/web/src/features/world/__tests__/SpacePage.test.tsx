import type { SpaceSnapshot } from '@plaza/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from '@/test/render';

import { worldEvents } from '../bridge/event-bus';
import type { WorldGameOptions } from '../game/create-game';
import { worldStore } from '../store/world-store';
import type { FakeSocket } from './fake-socket';
import { testSnapshot } from './fixtures';

const games: WorldGameOptions[] = [];

// The app-wide RealtimeClient creates its socket through `io()`: a FakeSocket plays the server.
const sockets = vi.hoisted(() => [] as FakeSocket[]);
vi.mock('socket.io-client', async () => {
  const { FakeSocket } = await import('./fake-socket');
  return {
    io: vi.fn(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }),
  };
});

vi.mock('../game/create-game', () => ({
  createWorldGame: vi.fn((options: WorldGameOptions) => {
    games.push(options);
    return { destroy: vi.fn() };
  }),
}));

const SPACE = {
  id: 'space-1',
  name: 'Acme',
  slug: 'acme',
  mapTemplateId: 'office-small@1',
  themeId: 'night',
  role: 'MEMBER',
  thumbnailUrl: null,
  ownerId: 'user-2',
  allowedDomain: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  rooms: [],
  inviteUrl: null,
};

const ME = {
  id: 'user-1',
  email: 'ana@acme.com',
  displayName: 'Ana',
  avatarId: 'avatar-04',
  avatarChosen: true,
  pictureUrl: null,
};

const AVATARS = [
  {
    id: 'avatar-04',
    name: 'Lavanda',
    spriteUrl: '/assets/maps/avatars/lavanda.png',
    frameWidth: 32,
    frameHeight: 32,
  },
];

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
      data: [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1],
    },
    {
      type: 'objectgroup',
      name: 'rooms',
      objects: [
        {
          id: 1,
          x: 64,
          y: 32,
          width: 32,
          height: 32,
          properties: [
            { name: 'areaId', type: 'string', value: 'cabina' },
            { name: 'name', type: 'string', value: 'Cabina' },
          ],
        },
      ],
    },
    { type: 'objectgroup', name: 'spawns', objects: [{ id: 2, x: 48, y: 48, point: true }] },
    { type: 'objectgroup', name: 'desks', objects: [] },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockServer(overrides: Record<string, () => Response> = {}) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    const override = Object.entries(overrides).find(([path]) => url.startsWith(path))?.[1];
    if (override !== undefined) return Promise.resolve(override());
    if (url === '/api/spaces/by-slug/acme/enter')
      return Promise.resolve(json({ space: SPACE, joined: false }));
    if (url === '/api/me') return Promise.resolve(json({ user: ME }));
    if (url === '/api/avatars') return Promise.resolve(json({ avatars: AVATARS }));
    if (url.endsWith('/map.tmj')) return Promise.resolve(json(TMJ));
    if (url.endsWith('/night/theme.json')) {
      return Promise.resolve(
        json({
          name: 'Noche',
          author: 'a',
          license: 'CC0-1.0',
          baseThemeId: 'pixel',
          colorMatrix: Array<number>(20).fill(0.5),
        }),
      );
    }
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  games.length = 0;
  vi.unstubAllGlobals();
  worldStore.getState().reset();
});

describe('SpacePage (/s/:slug)', () => {
  it('enters the space and starts the world with its map, style and my avatar', async () => {
    const fetchMock = mockServer();

    renderApp({ route: '/s/acme' });

    expect(await screen.findByText('Entrando en el espacio…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    await waitFor(() => {
      expect(games).toHaveLength(1);
    });
    const enter = fetchMock.mock.calls.find(([url]) => url === '/api/spaces/by-slug/acme/enter');
    expect(enter?.[1]).toMatchObject({ method: 'POST', headers: { 'x-plaza-client': 'web' } });
    const [options] = games;
    expect(options?.displayName).toBe('Ana');
    // The sprite comes from the avatar catalog (GET /api/avatars).
    expect(options?.avatarUrl).toBe('/assets/maps/avatars/lavanda.png');
    expect(options?.map).toMatchObject({ width: 4, height: 3, spawns: [{ x: 1, y: 1 }] });
    expect(options?.theme).toMatchObject({
      themeId: 'night',
      belowUrl: '/assets/maps/templates/office-small/themes/pixel/below.png',
      colorMatrix: Array<number>(20).fill(0.5),
    });
    expect(screen.getByRole('application', { name: /Mapa de Acme/ })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Controles del mapa' })).toBeInTheDocument();
  });

  it('shows where I am: hallway or the name of the room', async () => {
    mockServer();
    renderApp({ route: '/s/acme' });
    await waitFor(() => {
      expect(games).toHaveLength(1);
    });

    expect(screen.getByTestId('world-location')).toHaveTextContent('En el pasillo');
    act(() => {
      worldStore.getState().setLocalPlayer({ x: 2, y: 1, dir: 'right', roomId: 'cabina' });
    });
    expect(screen.getByTestId('world-location')).toHaveTextContent('En Cabina');
  });

  it('explains the error and offers to retry when the space cannot be opened', async () => {
    mockServer({
      '/api/spaces/by-slug/acme/enter': () =>
        json({ error: { code: 'NOT_FOUND', message: 'no' } }, 404),
    });

    renderApp({ route: '/s/acme' });

    expect(await screen.findByRole('alert')).toHaveTextContent('No lo encontramos.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mis espacios' })).toHaveAttribute(
      'href',
      '/spaces',
    );
    expect(games).toHaveLength(0);
  });

  it('explains a ban (removed by an owner) without offering a useless retry', async () => {
    mockServer({
      '/api/spaces/by-slug/acme/enter': () =>
        json({ error: { code: 'BANNED_FROM_SPACE', message: 'removed' } }, 403),
    });

    renderApp({ route: '/s/acme' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mis espacios' })).toBeInTheDocument();
    expect(games).toHaveLength(0);
  });

  it('sends people without a session to the login page and back to the space', async () => {
    mockServer({
      '/api/me': () => json({ error: { code: 'UNAUTHORIZED', message: 'no' } }, 401),
    });

    const { router } = renderApp({ route: '/s/acme' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toBe('?next=%2Fs%2Facme');
    expect(games).toHaveLength(0);
  });

  it('asks for an avatar the first time before drawing the office', async () => {
    mockServer({
      '/api/me': () => json({ user: { ...ME, avatarChosen: false } }),
    });

    renderApp({ route: '/s/acme' });

    expect(
      await screen.findByRole('heading', { name: 'Elige cómo te verán en el mapa' }),
    ).toBeInTheDocument();
    expect(games).toHaveLength(0);
  });

  it('falls back to the conventional sprite path when the avatar catalog fails', async () => {
    mockServer({
      '/api/avatars': () => json({ error: { code: 'INTERNAL', message: 'no' } }, 500),
    });

    renderApp({ route: '/s/acme' });

    await waitFor(() => {
      expect(games).toHaveLength(1);
    });
    expect(games[0]?.avatarUrl).toBe('/assets/maps/avatars/avatar-04.png');
  });
});

/** The single socket of the app-wide RealtimeClient (created on the first visit). */
function socket(): FakeSocket {
  const current = sockets[0];
  if (current === undefined) throw new Error('no socket yet');
  return current;
}

/** Opens the space, "draws" the map and accepts the connection: the page sends space:join. */
async function openOffice() {
  mockServer();
  const view = renderApp({ route: '/s/acme' });
  await waitFor(() => {
    expect(games).toHaveLength(1);
  });
  act(() => {
    worldStore.getState().setLoad({ kind: 'ready' });
    socket().accept();
  });
  return view;
}

async function answerJoin(answer: unknown): Promise<void> {
  await act(async () => {
    socket().lastAck('space:join').resolve(answer);
    await Promise.resolve();
  });
}

describe('SpacePage realtime (E4)', () => {
  it('joins the space once the map is drawn and hands the snapshot to the world', async () => {
    const snapshots: SpaceSnapshot[] = [];
    const off = worldEvents.on('world:snapshot', (snapshot) => snapshots.push(snapshot));
    await openOffice();

    expect(screen.getByTestId('connection-banner')).toHaveTextContent('Conectando…');
    expect(socket().lastAck('space:join').payload).toMatchObject({ spaceId: 'space-1' });
    await answerJoin({ ok: true, data: testSnapshot() });

    expect(snapshots).toEqual([testSnapshot()]);
    expect(screen.getByTestId('connection-banner')).toHaveTextContent('');
    expect(games[0]?.avatarUrls).toEqual({ 'avatar-04': '/assets/maps/avatars/lavanda.png' });
    off();
  });

  it('shows "Reconectando…" while the connection is down and re-joins when it is back', async () => {
    await openOffice();
    await answerJoin({ ok: true, data: testSnapshot() });
    const joins = socket().acks.filter((ack) => ack.event === 'space:join').length;

    act(() => {
      socket().drop();
    });
    expect(screen.getByTestId('connection-banner')).toHaveTextContent('Reconectando…');
    act(() => {
      socket().accept();
    });

    expect(socket().acks.filter((ack) => ack.event === 'space:join')).toHaveLength(joins + 1);
    await answerJoin({ ok: true, data: testSnapshot() });
    expect(screen.getByTestId('connection-banner')).toHaveTextContent('');
  });

  it('explains SESSION_REPLACED and takes the session back on request', async () => {
    const user = userEvent.setup();
    await openOffice();
    await answerJoin({ ok: true, data: testSnapshot() });
    const connects = socket().connectCalls;

    act(() => {
      socket().serverEmit('space:kicked', { reason: 'SESSION_REPLACED' });
      socket().closeFromServer();
    });

    expect(
      screen.getByRole('heading', { name: 'Abriste Plaza en otra pestaña' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar Plaza aquí' }));

    expect(socket().connectCalls).toBe(connects + 1);
    await waitFor(() => {
      expect(games).toHaveLength(2);
    });
  });

  it('goes back to "Mis espacios" with a message when removed from the space', async () => {
    const { router } = await openOffice();
    await answerJoin({ ok: true, data: testSnapshot() });

    act(() => {
      socket().serverEmit('space:kicked', { reason: 'REMOVED' });
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/spaces');
    });
    expect(await screen.findByText('Te han quitado de este espacio.')).toBeInTheDocument();
  });

  it('shows why the join was refused, with retry only when it can help', async () => {
    const user = userEvent.setup();
    await openOffice();

    await answerJoin({ ok: false, error: { code: 'SPACE_FULL', message: 'full' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El espacio está lleno (máximo 50 personas).',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => {
      expect(games).toHaveLength(2);
    });
    act(() => {
      worldStore.getState().setLoad({ kind: 'ready' });
    });

    await answerJoin({ ok: false, error: { code: 'NOT_A_MEMBER', message: 'banned' } });
    expect(screen.getByRole('alert')).toHaveTextContent('No eres miembro de este espacio.');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mis espacios' })).toBeInTheDocument();
  });
});
