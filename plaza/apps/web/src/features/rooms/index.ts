import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `rooms` feature (E6): Meeting room card and "Unirse a la reunión".
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const roomsRoutes: RouteObject[] = [];

/** i18n namespace `rooms` (texts in `./i18n/es.json`). */
export const roomsMessages = { es } as const;
