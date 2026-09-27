import { RoomsSetupResultSchema, WEB_PATHS } from '@plaza/shared';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';

import { PageLoading, UserMenu } from '@/features/auth';
import { errorMessageKey } from '@/shared/api';

import { AllowedDomainForm } from '../components/AllowedDomainForm';
import { InvitePanel } from '../components/InvitePanel';
import { MembersPanel } from '../components/MembersPanel';
import { RoomsSettings } from '../components/RoomsSettings';
import { useSpace } from '../hooks/useSpaces';

const RESULT_TONE = {
  created: 'border-green-300 bg-green-50',
  denied: 'border-amber-300 bg-amber-50',
  failed: 'border-amber-300 bg-amber-50',
} as const;

/** `/spaces/:spaceId/settings`: invite link, allowed domain, Meet rooms and members (E2-S4..S7). */
export function SpaceSettingsPage() {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  const { spaceId = '' } = useParams();
  const [params] = useSearchParams();
  const space = useSpace(spaceId);
  const roomsResult = RoomsSetupResultSchema.safeParse(params.get('rooms'));

  let content;
  if (space.isPending) content = <PageLoading />;
  else if (space.isError) content = <p role="alert">{tc(errorMessageKey(space.error))}</p>;
  else {
    const isOwner = space.data.role === 'OWNER';
    content = (
      <>
        <h1 className="text-3xl font-bold">{t('settings.title', { name: space.data.name })}</h1>
        {roomsResult.success && (
          <p role="status" className={`rounded-md border p-3 ${RESULT_TONE[roomsResult.data]}`}>
            {t(`settings.roomsResult.${roomsResult.data}`)}
          </p>
        )}
        {!isOwner && <p className="text-slate-600">{t('settings.ownersOnly')}</p>}
        {isOwner && space.data.inviteUrl !== null && (
          <InvitePanel spaceId={space.data.id} inviteUrl={space.data.inviteUrl} />
        )}
        {isOwner && (
          <AllowedDomainForm spaceId={space.data.id} allowedDomain={space.data.allowedDomain} />
        )}
        <RoomsSettings space={space.data} />
        {isOwner && <MembersPanel spaceId={space.data.id} />}
      </>
    );
  }

  return (
    <>
      <UserMenu />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
        <Link to={WEB_PATHS.spaces} className="text-sm text-brand-700 underline">
          {t('settings.back')}
        </Link>
        {content}
      </main>
    </>
  );
}
