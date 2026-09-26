import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `personalization` feature (E9): Office style, my desk and desk decoration.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const personalizationRoutes: RouteObject[] = [];

/** i18n namespace `personalization` (texts in `./i18n/es.json`). */
export const personalizationMessages = { es } as const;
