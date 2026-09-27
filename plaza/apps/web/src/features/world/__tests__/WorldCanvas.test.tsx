import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createI18n } from '@/shared/i18n';

import type { ThemeAssets } from '../api/assets';
import { EventBus } from '../bridge/event-bus';
import { WorldCanvas } from '../components/WorldCanvas';
import { WorldToolbar } from '../components/WorldToolbar';
import type { WorldGameOptions } from '../game/create-game';
import { createWorldStore, type WorldStore } from '../store/world-store';
import { testMap } from './fixtures';

const games: { options: WorldGameOptions; destroy: ReturnType<typeof vi.fn> }[] = [];

// Phaser does not run in jsdom: the game factory is replaced by a fake that records its calls.
vi.mock('../game/create-game', () => ({
  createWorldGame: vi.fn((options: WorldGameOptions) => {
    const game = { options, destroy: vi.fn() };
    games.push(game);
    return game;
  }),
}));

const theme: ThemeAssets = {
  themeId: 'pixel',
  belowUrl: '/below.png',
  aboveUrl: '/above.png',
  colorMatrix: null,
};

const resolveTheme = () => Promise.resolve(theme);

function renderCanvas(store: WorldStore, events: EventBus) {
  const map = testMap();
  return render(
    <I18nextProvider i18n={createI18n()}>
      <WorldCanvas
        map={map}
        theme={theme}
        displayName="Ana"
        avatarUrl="/avatar.png"
        resolveTheme={resolveTheme}
        label="Mapa de Acme"
        store={store}
        events={events}
      />
      <WorldToolbar store={store} events={events} />
    </I18nextProvider>,
  );
}

describe('WorldCanvas', () => {
  let store: WorldStore;
  let events: EventBus;

  beforeEach(() => {
    games.length = 0;
    store = createWorldStore();
    events = new EventBus();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates one game with the map, theme and player, and destroys it on unmount', async () => {
    const view = renderCanvas(store, events);

    await waitFor(() => {
      expect(games).toHaveLength(1);
    });
    const [game] = games;
    expect(game?.options).toMatchObject({
      displayName: 'Ana',
      avatarUrl: '/avatar.png',
      theme,
      store,
      events,
    });
    expect(game?.options.parent).toBe(screen.getByTestId('world-canvas'));

    view.unmount();

    expect(game?.destroy).toHaveBeenCalledTimes(1);
    expect(store.getState().load).toEqual({ kind: 'idle' });
    expect(events.listenerCount()).toBe(0);
  });

  it('does not create a game when unmounted before Phaser finished loading', async () => {
    const view = renderCanvas(store, events);
    view.unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(games).toHaveLength(0);
  });

  it('shows the loading progress published by the preload scene', async () => {
    renderCanvas(store, events);
    await waitFor(() => {
      expect(games).toHaveLength(1);
    });

    act(() => {
      store.getState().setLoad({ kind: 'loading', progress: 0.4 });
    });

    expect(screen.getByRole('progressbar', { name: 'Cargando la oficina…' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
  });

  it('offers "Reintentar" when an image fails, recreating the game', async () => {
    const user = userEvent.setup();
    renderCanvas(store, events);
    await waitFor(() => {
      expect(games).toHaveLength(1);
    });

    act(() => {
      store.getState().setLoad({ kind: 'error', file: '/below.png' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las imágenes de la oficina.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      expect(games).toHaveLength(2);
    });
    expect(games[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(games[1]?.destroy).not.toHaveBeenCalled();
  });

  it('exposes the local tile for tests and assistive tech once the scene reports it', () => {
    renderCanvas(store, events);

    act(() => {
      store.getState().setLoad({ kind: 'ready' });
      store.getState().setLocalPlayer({ x: 3, y: 1, dir: 'left', roomId: 'sala' });
    });

    const canvas = screen.getByRole('application', { name: 'Mapa de Acme' });
    expect(canvas).toHaveAttribute('data-state', 'ready');
    expect(canvas).toHaveAttribute('data-tile-x', '3');
    expect(canvas).toHaveAttribute('data-room', 'sala');
  });

  it('lets Tab move the focus from the canvas to the UI', async () => {
    const user = userEvent.setup();
    renderCanvas(store, events);
    act(() => {
      store.getState().setLoad({ kind: 'ready' });
    });

    screen.getByRole('application').focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'Centrar en mí' })).toHaveFocus();
  });
});

describe('WorldToolbar', () => {
  it('asks the scene to center the camera through the EventBus', async () => {
    const user = userEvent.setup();
    const store = createWorldStore();
    const events = new EventBus();
    const center = vi.fn();
    events.on('camera:center', center);
    renderCanvas(store, events);

    await user.click(screen.getByRole('button', { name: 'Centrar en mí' }));

    expect(center).toHaveBeenCalledTimes(1);
  });

  it('changes the zoom between 1×, 1,5× and 2×', async () => {
    const user = userEvent.setup();
    const store = createWorldStore();
    renderCanvas(store, new EventBus());

    expect(screen.getByText('1,5×')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acercar' }));
    expect(store.getState().zoom).toBe(2);
    expect(screen.getByRole('button', { name: 'Acercar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Alejar' }));
    await user.click(screen.getByRole('button', { name: 'Alejar' }));
    expect(screen.getByText('1×')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alejar' })).toBeDisabled();
  });
});
