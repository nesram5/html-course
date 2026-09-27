import { WEB_PATHS } from '@plaza/shared';
import { createElement } from 'react';
import type { RouteObject } from 'react-router';

import { RequireAuth } from '@/features/auth';

import es from './i18n/es.json';
import { CreateSpacePage } from './pages/CreateSpacePage';
import { JoinPage } from './pages/JoinPage';
import { SpaceSettingsPage } from './pages/SpaceSettingsPage';
import { SpacesPage } from './pages/SpacesPage';

/**
 * Public API of the `spaces` feature (E2): My spaces, creation wizard, invitations, join flow, members and space settings.
 * Other features and `app/` import ONLY from this file (standards §5).
 * The office itself (`/s/:slug`) belongs to the `world` feature.
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const spacesRoutes: RouteObject[] = [
  // Public: shows the invitation before signing in, then joins automatically.
  { path: WEB_PATHS.join, element: createElement(JoinPage) },
  {
    element: createElement(RequireAuth),
    children: [
      { path: WEB_PATHS.spaces, element: createElement(SpacesPage) },
      { path: WEB_PATHS.newSpace, element: createElement(CreateSpacePage) },
      { path: WEB_PATHS.spaceSettings, element: createElement(SpaceSettingsPage) },
    ],
  },
];

/** i18n namespace `spaces` (texts in `./i18n/es.json`). */
export const spacesMessages = { es } as const;

export { spacesKeys } from './api/spaces-api';
export { useEnterSpace, useMembers } from './hooks/useSpaces';
