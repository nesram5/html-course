import { WEB_PATHS } from '@plaza/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { useLogout, useSession } from '../hooks/useSession';

/** Top bar of the signed-in pages: my name and photo, "Mis espacios", "Mi perfil", logout. */
export function UserMenu() {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation();
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <Link to={WEB_PATHS.spaces} className="text-xl font-bold text-brand-700">
        {tc('appName')}
      </Link>
      <nav aria-label={t('menu.label')} className="flex items-center gap-4 text-sm">
        <Link to={WEB_PATHS.spaces} className="hover:underline">
          {t('menu.spaces')}
        </Link>
        <Link to={WEB_PATHS.profile} className="flex items-center gap-2 hover:underline">
          {session.user !== null && session.user.pictureUrl !== null && (
            <img
              src={session.user.pictureUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-full"
            />
          )}
          <span>{session.user?.displayName ?? t('menu.profile')}</span>
        </Link>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50"
          disabled={logout.isPending}
          onClick={() => {
            logout.mutate(undefined, {
              onSuccess: () => void navigate(WEB_PATHS.login, { replace: true }),
            });
          }}
        >
          {t('menu.logout')}
        </button>
      </nav>
    </header>
  );
}
