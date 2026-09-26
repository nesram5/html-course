import { useTranslation } from 'react-i18next';

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
      <p className="text-slate-600">{t('home.comingSoon')}</p>
      <p className="text-sm text-slate-500">
        <span>{t('home.serverStatus.label')}: </span>
        <span data-testid="server-status">{status}</span>
      </p>
    </main>
  );
}
