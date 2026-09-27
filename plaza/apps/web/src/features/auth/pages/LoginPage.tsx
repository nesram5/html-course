import { LoginErrorReasonSchema, WEB_PATHS } from '@plaza/shared';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';

import { safeNext } from '../api/auth-api';
import { LoginButtons } from '../components/LoginButtons';
import { PageLoading } from '../components/RequireAuth';
import { useSession } from '../hooks/useSession';

/** `/login?next=…&error=cancelled|failed` (E1-S3). */
export function LoginPage() {
  const { t } = useTranslation('auth');
  const [params] = useSearchParams();
  const session = useSession();
  const next = safeNext(params.get('next'));
  const error = LoginErrorReasonSchema.safeParse(params.get('error'));

  if (session.status === 'loading') return <PageLoading />;
  if (session.status === 'authenticated') return <Navigate to={next} replace />;

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight text-brand-700">{t('login.title')}</h1>
      <p className="text-lg text-slate-700">{t('login.subtitle')}</p>
      {error.success && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="font-medium">{t(`login.${error.data}`)}</p>
          <p className="text-sm text-slate-600">{t('login.retryHint')}</p>
        </div>
      )}
      <LoginButtons next={next} />
      <p className="text-sm text-slate-600">
        <Link to={WEB_PATHS.privacy} className="text-brand-700 underline">
          {t('login.privacy')}
        </Link>
      </p>
    </main>
  );
}
