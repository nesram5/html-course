import { WEB_PATHS } from '@plaza/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';

import { useSession } from '../hooks/useSession';

/** Full-page "Cargando…" while the session or a page loads. */
export function PageLoading() {
  const { t } = useTranslation('auth');
  return (
    <p role="status" className="p-8 text-center text-slate-600">
      {t('loading')}
    </p>
  );
}

/**
 * Protected routes (E1-S3): without a session, goes to the login page and comes back to the
 * original URL afterwards. Use as a layout route (renders `<Outlet />`) or wrap children.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.status === 'loading') return <PageLoading />;
  if (session.status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    const search = new URLSearchParams({ next }).toString();
    return <Navigate to={`${WEB_PATHS.login}?${search}`} replace />;
  }
  return children ?? <Outlet />;
}
