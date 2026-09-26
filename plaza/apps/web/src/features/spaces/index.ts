import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `spaces` feature (E2): My spaces, creation wizard, invitations, join flow, members and space settings.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const spacesRoutes: RouteObject[] = [];

/** i18n namespace `spaces` (texts in `./i18n/es.json`). */
export const spacesMessages = { es } as const;
