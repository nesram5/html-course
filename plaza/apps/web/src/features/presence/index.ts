import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `presence` feature (E7): Status, away detection, member list, locate and ring.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const presenceRoutes: RouteObject[] = [];

/** i18n namespace `presence` (texts in `./i18n/es.json`). */
export const presenceMessages = { es } as const;
