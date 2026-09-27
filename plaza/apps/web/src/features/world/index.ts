import type { RouteObject } from 'react-router';

import { SpacePage } from './components/SpacePage';
import es from './i18n/es.json';

/**
 * Public API of the `world` feature (E3, E4): Phaser integration: scenes, sprites, input, `EventBus`, `worldStore`, `RealtimeClient`. The ONLY feature allowed to import `phaser`.
 * Other features and `app/` import ONLY from this file (standards §5).
 * The React ⇄ Phaser pattern is documented in `./README.md`.
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const worldRoutes: RouteObject[] = [{ path: 's/:slug', Component: SpacePage }];

/** i18n namespace `world` (texts in `./i18n/es.json`). */
export const worldMessages = { es } as const;

export { worldEvents, type EventBus, type LocalStep, type WorldEvents } from './bridge/event-bus';
export {
  useWorldStore,
  worldStore,
  type LocalPlayerState,
  type WorldState,
} from './store/world-store';
export { ZOOM_LEVELS, type ZoomLevel } from './game/constants';
