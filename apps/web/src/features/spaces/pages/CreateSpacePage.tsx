import { apiPath, WEB_PATHS } from '@bululu/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { PageLoading, UserMenu } from '@/features/auth';
import { LoadError } from '@/shared/ui';

import { CreateSpaceForm } from '../components/CreateSpaceForm';
import { RoomsSettings } from '../components/RoomsSettings';
import { useSpace } from '../hooks/useSpaces';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';

function RoomsStep({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation('spaces');
  const space = useSpace(spaceId);
  if (space.isPending) return <PageLoading />;
  if (space.isError) {
    return (
      <LoadError
        error={space.error}
        onRetry={() => {
          void space.refetch();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">{t('wizard.roomsTitle')}</h2>
      <p className="text-slate-600">{t('wizard.roomsDescription')}</p>
      <RoomsSettings space={space.data} />
      <div className="flex items-center gap-4 border-t border-slate-200 pt-4">
        <Link
          to={apiPath(WEB_PATHS.space, { slug: space.data.slug })}
          className="rounded-md border border-slate-300 px-4 py-2"
        >
          {t(
            space.data.rooms.every((room) => room.meetUri !== null)
              ? 'wizard.enterSpace'
              : 'wizard.later',
          )}
        </Link>
      </div>
    </div>
  );
}

/** `/spaces/new`: two-step wizard — name and template, then "Crear salas de reunión" (E2-S3). */
export function CreateSpacePage() {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  useDocumentTitle(tc('docTitle.newSpace'));
  const [spaceId, setSpaceId] = useState<string | null>(null);

  return (
    <>
      <UserMenu />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
        <div>
          <p className="text-sm text-slate-600">
            {t('wizard.step', { current: spaceId === null ? 1 : 2, total: 2 })}
          </p>
          <h1 className="text-3xl font-bold">{t('wizard.title')}</h1>
        </div>
        {spaceId === null ? (
          <CreateSpaceForm
            onCreated={(space) => {
              setSpaceId(space.id);
            }}
          />
        ) : (
          <RoomsStep spaceId={spaceId} />
        )}
      </main>
    </>
  );
}
