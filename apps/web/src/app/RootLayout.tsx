import { WEB_PATHS } from '@bululu/shared';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useMatch } from 'react-router';

/** Footer of every page but the office, which fills the screen (E8-S6). */
function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-slate-200 px-6 py-4 text-sm text-slate-600">
      <nav aria-label={t('footer.label')} className="mx-auto flex max-w-4xl flex-wrap gap-4">
        <span>{t('appName')}</span>
        <Link to={WEB_PATHS.privacy} className="underline hover:text-slate-900">
          {t('footer.privacy')}
        </Link>
        <Link to={WEB_PATHS.feedback} className="underline hover:text-slate-900">
          {t('footer.feedback')}
        </Link>
      </nav>
    </footer>
  );
}

/** Shell shared by every page. */
export function RootLayout() {
  const inOffice = useMatch(WEB_PATHS.space) !== null;
  if (inOffice) return <Outlet />;
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
