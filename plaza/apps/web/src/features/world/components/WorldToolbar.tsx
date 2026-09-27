import { useTranslation } from 'react-i18next';

import { worldEvents, type EventBus } from '../bridge/event-bus';
import { ZOOM_LEVELS } from '../game/constants';
import { useWorldStore, worldStore, type WorldStore } from '../store/world-store';

export interface WorldToolbarProps {
  readonly events?: EventBus;
  readonly store?: WorldStore;
}

const BUTTON =
  'rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow hover:bg-white disabled:opacity-40';

/** Map controls (E3-S5, E3-S6): "Centrar en mí" through the EventBus and zoom through the store. */
export function WorldToolbar({ events = worldEvents, store = worldStore }: WorldToolbarProps) {
  const { t } = useTranslation('world');
  const zoom = useWorldStore((state) => state.zoom, store);

  return (
    <div role="toolbar" aria-label={t('toolbar.label')} className="flex items-center gap-2">
      <button
        type="button"
        className={BUTTON}
        onClick={() => {
          events.emit('camera:center');
        }}
      >
        {t('toolbar.center')}
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-label={t('toolbar.zoomOut')}
        disabled={zoom === ZOOM_LEVELS[0]}
        onClick={() => {
          store.getState().zoomOut();
        }}
      >
        −
      </button>
      <output aria-live="polite" className="min-w-12 text-center text-sm font-medium text-white">
        {t('toolbar.zoom', { zoom: zoom.toLocaleString('es-ES') })}
      </output>
      <button
        type="button"
        className={BUTTON}
        aria-label={t('toolbar.zoomIn')}
        disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
        onClick={() => {
          store.getState().zoomIn();
        }}
      >
        +
      </button>
    </div>
  );
}
