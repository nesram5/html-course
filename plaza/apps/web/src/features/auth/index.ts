import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `auth` feature (E1): Sign in with Google, session (`useSession`), `RequireAuth`, profile and avatar picker.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const authRoutes: RouteObject[] = [];

/** i18n namespace `auth` (texts in `./i18n/es.json`). */
export const authMessages = { es } as const;
