import { WEB_PATHS } from '@plaza/shared';
import { createElement } from 'react';
import type { RouteObject } from 'react-router';

import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { RequireAuth } from './components/RequireAuth';
import es from './i18n/es.json';

/**
 * Public API of the `auth` feature (E1): Sign in with Google, session (`useSession`), `RequireAuth`, profile and avatar picker.
 * Other features and `app/` import ONLY from this file (standards §5).
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const authRoutes: RouteObject[] = [
  { path: WEB_PATHS.login, element: createElement(LoginPage) },
  {
    element: createElement(RequireAuth),
    children: [{ path: WEB_PATHS.profile, element: createElement(ProfilePage) }],
  },
];

/** i18n namespace `auth` (texts in `./i18n/es.json`). */
export const authMessages = { es } as const;

export { AvatarPicker } from './components/AvatarPicker';
export { AvatarSprite } from './components/AvatarSprite';
export { LoginButtons } from './components/LoginButtons';
export { PageLoading, RequireAuth } from './components/RequireAuth';
export { RequireAvatar } from './components/RequireAvatar';
export { UserMenu } from './components/UserMenu';
export { useAvatars, useLogout, useSession, type Session } from './hooks/useSession';
export { authKeys } from './api/auth-api';
