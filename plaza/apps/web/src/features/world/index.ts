import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `world` feature (E3, E4): Phaser integration: scenes, sprites, input, `EventBus`, `worldStore`, `RealtimeClient`. The ONLY feature allowed to import `phaser`.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const worldRoutes: RouteObject[] = [];

/** i18n namespace `world` (texts in `./i18n/es.json`). */
export const worldMessages = { es } as const;
