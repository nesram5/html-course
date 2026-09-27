import { WEB_PATHS } from '@plaza/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useServerHealth } from './useServerHealth';

export function HomePage() {
  const { t } = useTranslation();
  const health = useServerHealth();

  let status: string;
  if (health.isPending) status = t('home.serverStatus.checking');
  else if (health.isError) status = t('home.serverStatus.offline');
  else status = t('home.serverStatus.online', { version: health.data.version });

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight text-brand-700">{t('home.title')}</h1>
      <p className="text-xl text-slate-700">{t('home.tagline')}</p>
      {/* `/spaces` is protected: without a session it goes through the login page first. */}
      <Link
        to={WEB_PATHS.spaces}
        className="self-start rounded-md bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
      >
        {t('home.cta')}
      </Link>
      <p className="text-sm text-slate-600">
        <span>{t('home.serverStatus.label')}: </span>
        <span data-testid="server-status">{status}</span>
      </p>
    </main>
  );
}
