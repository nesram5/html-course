import { apiPath, WEB_PATHS, type SpaceSummaryDto } from '@plaza/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { PageLoading, UserMenu } from '@/features/auth';
import { LoadError } from '@/shared/ui';

import { useMySpaces } from '../hooks/useSpaces';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';

const primaryLink = 'rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700';

function SpaceCard({ space }: { space: SpaceSummaryDto }) {
  const { t } = useTranslation('spaces');
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {space.thumbnailUrl !== null ? (
        <img
          src={space.thumbnailUrl}
          alt={t('list.thumbnailAlt', { name: space.name })}
          className="aspect-video w-full bg-slate-100 object-cover"
        />
      ) : (
        <div className="aspect-video w-full bg-slate-100" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">{space.name}</h2>
          <p className="text-sm text-slate-600">{t(`role.${space.role}`)}</p>
        </div>
        <div className="mt-auto flex items-center gap-3">
          <Link to={apiPath(WEB_PATHS.space, { slug: space.slug })} className={primaryLink}>
            {t('list.enter')}
          </Link>
          {space.role === 'OWNER' && (
            <Link
              to={apiPath(WEB_PATHS.spaceSettings, { spaceId: space.id })}
              className="text-sm text-brand-700 underline"
            >
              {t('list.settings')}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** `/spaces`: my spaces with thumbnail and "Entrar", or an empty state (E2-S3). */
export function SpacesPage() {
  const { t } = useTranslation('spaces');
  const { t: tc } = useTranslation();
  useDocumentTitle(tc('docTitle.spaces'));
  const spaces = useMySpaces();

  let content;
  if (spaces.isPending) content = <PageLoading />;
  else if (spaces.isError) {
    content = (
      <LoadError
        error={spaces.error}
        message={t('list.loadError')}
        onRetry={() => {
          void spaces.refetch();
        }}
      />
    );
  } else if (spaces.data.length === 0) {
    content = (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-slate-300 p-8">
        <h2 className="text-xl font-semibold">{t('list.emptyTitle')}</h2>
        <p className="text-slate-600">{t('list.emptyDescription')}</p>
        <Link to={WEB_PATHS.newSpace} className={primaryLink}>
          {t('list.create')}
        </Link>
      </div>
    );
  } else {
    content = (
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {spaces.data.map((space) => (
          <SpaceCard key={space.id} space={space} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <UserMenu />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t('list.title')}</h1>
          {spaces.isSuccess && spaces.data.length > 0 && (
            <Link to={WEB_PATHS.newSpace} className={primaryLink}>
              {t('list.create')}
            </Link>
          )}
        </div>
        {content}
      </main>
    </>
  );
}
