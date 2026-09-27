import type { WorldMap } from '@plaza/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ThemeAssets } from '../api/assets';
import { worldEvents, type EventBus } from '../bridge/event-bus';
import type { WorldGame } from '../game/create-game';
import { useWorldStore, worldStore, type WorldStore } from '../store/world-store';

export interface WorldCanvasProps {
  readonly map: WorldMap;
  readonly theme: ThemeAssets;
  readonly displayName: string;
  readonly avatarUrl: string;
  /** Accessible name of the canvas region. */
  readonly label: string;
  readonly events?: EventBus;
  readonly store?: WorldStore;
}

/**
 * Hosts the Phaser game (E3-S6): creates it on mount and destroys it on unmount or when its
 * inputs change, so leaving the page frees the canvas, textures and every listener. Phaser is
 * loaded lazily to keep it out of the main bundle. Shows loading progress and "Reintentar".
 */
export function WorldCanvas({
  map,
  theme,
  displayName,
  avatarUrl,
  label,
  events = worldEvents,
  store = worldStore,
}: WorldCanvasProps) {
  const { t } = useTranslation('world');
  const containerRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const load = useWorldStore((state) => state.load, store);
  const player = useWorldStore((state) => state.localPlayer, store);

  useEffect(() => {
    const parent = containerRef.current;
    if (parent === null) return undefined;
    let game: WorldGame | null = null;
    let cancelled = false;
    store.getState().setLoad({ kind: 'loading', progress: 0 });
    import('../game/create-game')
      .then(({ createWorldGame }) => {
        if (cancelled) return;
        game = createWorldGame({ parent, map, theme, displayName, avatarUrl, events, store });
      })
      .catch(() => {
        if (!cancelled) store.getState().setLoad({ kind: 'error', file: 'phaser' });
      });
    return () => {
      cancelled = true;
      game?.destroy();
      store.getState().reset();
    };
  }, [map, theme, displayName, avatarUrl, events, store, attempt]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1e2130]">
      <div
        ref={containerRef}
        // The map is a keyboard-driven widget: focusable so keyboard users land on it, and Tab
        // moves on to the UI (E3-S6). jsx-a11y does not treat role="application" as interactive.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="application"
        aria-label={label}
        data-testid="world-canvas"
        data-state={load.kind}
        data-tile-x={player?.x}
        data-tile-y={player?.y}
        data-dir={player?.dir}
        data-room={player?.roomId ?? ''}
        className="h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand-500"
      />
      {load.kind === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-slate-900/60">
          <div className="w-64 text-center text-sm text-white">
            <p id="world-loading">{t('canvas.loading')}</p>
            <div
              role="progressbar"
              aria-labelledby="world-loading"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(load.progress * 100)}
              className="mt-3 h-2 overflow-hidden rounded-full bg-white/20"
            >
              <div
                className="h-full bg-brand-500 transition-[width]"
                style={{ width: `${String(load.progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {load.kind === 'error' && (
        <div role="alert" className="absolute inset-0 grid place-items-center bg-slate-900/80 p-6">
          <div className="max-w-sm text-center text-white">
            <p>{t('canvas.loadError')}</p>
            <button
              type="button"
              className="mt-4 rounded-md bg-brand-600 px-4 py-2 font-medium hover:bg-brand-700"
              onClick={() => {
                setAttempt((n) => n + 1);
              }}
            >
              {t('canvas.retry')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
