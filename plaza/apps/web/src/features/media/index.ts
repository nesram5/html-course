import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `media` feature (E5): LiveKit: pre-join, `MediaController`, video strip and media controls. The ONLY feature allowed to import `livekit-client`.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const mediaRoutes: RouteObject[] = [];

/** i18n namespace `media` (texts in `./i18n/es.json`). */
export const mediaMessages = { es } as const;
