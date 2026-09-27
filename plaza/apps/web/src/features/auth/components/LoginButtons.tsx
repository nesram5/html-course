import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { googleLoginHref } from '../api/auth-api';
import { useTestLogin } from '../hooks/useSession';

/** Dev builds only: sign in with the server test login (`AUTH_TEST_LOGIN=true`). */
function TestLoginForm() {
  const { t } = useTranslation('auth');
  const emailId = useId();
  const [email, setEmail] = useState('');
  const login = useTestLogin();

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    login.mutate(email.trim());
  };

  return (
    <form
      onSubmit={submit}
      aria-label={t('testLogin.title')}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-4"
    >
      <p className="text-sm font-medium text-slate-600">{t('testLogin.title')}</p>
      <label htmlFor={emailId} className="text-sm">
        {t('testLogin.email')}
      </label>
      <input
        id={emailId}
        type="email"
        required
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
        className="rounded-md border border-slate-300 px-3 py-2"
      />
      <button
        type="submit"
        disabled={login.isPending}
        className="self-start rounded-md border border-slate-400 px-3 py-1 text-sm"
      >
        {t('testLogin.submit')}
      </button>
    </form>
  );
}

/**
 * "Entrar con Google" (a full navigation to `/api/auth/google?next=…`, E1-S3), plus the test
 * login form in development builds.
 */
export function LoginButtons({ next }: { next: string }) {
  const { t } = useTranslation('auth');
  return (
    <div className="flex flex-col gap-6">
      <a
        href={googleLoginHref(next)}
        className="inline-flex items-center justify-center gap-2 self-start rounded-md bg-brand-600 px-5 py-3 text-lg font-medium text-white hover:bg-brand-700"
      >
        {t('login.google')}
      </a>
      {import.meta.env.DEV && <TestLoginForm />}
    </div>
  );
}
