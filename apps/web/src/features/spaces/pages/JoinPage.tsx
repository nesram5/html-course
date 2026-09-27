import { apiPath, WEB_PATHS } from '@bululu/shared';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router';

import { LoginButtons, PageLoading, RequireAvatar, useSession } from '@/features/auth';
import { errorMessageKey, isApiError } from '@/shared/api';
import { markInviteOpened } from '@/shared/lib/join-timing';

import { useJoinPreview, useJoinSpace } from '../hooks/useSpaces';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';

function InvalidInvite() {
  const { t } = useTranslation('spaces');
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{t('join.invalid')}</h1>
      <p className="text-slate-600">{t('join.invalidHint')}</p>
      <Link to={WEB_PATHS.spaces} className="text-brand-700 underline">
        {t('join.goToSpaces')}
      </Link>
    </div>
  );
}

function Banned() {
  const { t } = useTranslation('spaces');
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{t('join.banned')}</h1>
      <p className="text-slate-600">{t('join.bannedHint')}</p>
      <Link to={WEB_PATHS.spaces} className="text-brand-700 underline">
        {t('join.goToSpaces')}
      </Link>
    </div>
  );
}

/** Signed in: joins once (idempotent), then the avatar prompt if needed, then the space. */
function AutoJoin({ token }: { token: string }) {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  const join = useJoinSpace();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    join.mutate(token);
  }, [join, token]);

  if (join.isError) {
    const code = isApiError(join.error) ? join.error.code : null;
    if (code === 'INVALID_INVITE') return <InvalidInvite />;
    if (code === 'BANNED_FROM_SPACE') return <Banned />;
    return <p role="alert">{tc(errorMessageKey(join.error))}</p>;
  }
  if (!join.isSuccess) return <p role="status">{t('join.joining')}</p>;
  return (
    <RequireAvatar>
      <Navigate to={apiPath(WEB_PATHS.space, { slug: join.data.space.slug })} replace />
    </RequireAvatar>
  );
}

/** `/join/:token`: space name + "Entrar con Google"; once signed in, joins automatically (E2-S5). */
export function JoinPage() {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  const { token = '' } = useParams();
  const session = useSession();
  const preview = useJoinPreview(token);
  useDocumentTitle(
    preview.data === undefined
      ? tc('docTitle.invite')
      : tc('docTitle.join', { name: preview.data.name }),
  );
  // O5 (E8-S7): the time to enter counts from here, through the sign-in, to the map.
  useEffect(() => {
    markInviteOpened();
  }, []);

  let content;
  if (preview.isPending || session.status === 'loading') content = <PageLoading />;
  else if (preview.isError) {
    const code = isApiError(preview.error) ? preview.error.code : null;
    // Only a refused token is an invalid invitation; a network or server failure is not a reason
    // to ask for a new link.
    content =
      code === 'INVALID_INVITE' || code === 'NOT_FOUND' ? (
        <InvalidInvite />
      ) : (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>{tc(errorMessageKey(preview.error))}</p>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1"
            onClick={() => {
              void preview.refetch();
            }}
          >
            {tc('errorBoundary.retry')}
          </button>
        </div>
      );
  } else if (session.status === 'authenticated') content = <AutoJoin token={token} />;
  else {
    content = (
      <>
        <h1 className="text-3xl font-bold">{t('join.title', { name: preview.data.name })}</h1>
        <p className="text-slate-600">
          {t('join.members', { count: preview.data.memberCount })} {t('join.signIn')}
        </p>
        <LoginButtons next={apiPath(WEB_PATHS.join, { token })} />
      </>
    );
  }

  return <main className="mx-auto flex max-w-lg flex-col gap-6 p-8">{content}</main>;
}
