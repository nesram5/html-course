import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `chat` feature (E7): Space chat and reactions.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const chatRoutes: RouteObject[] = [];

/** i18n namespace `chat` (texts in `./i18n/es.json`). */
export const chatMessages = { es } as const;
