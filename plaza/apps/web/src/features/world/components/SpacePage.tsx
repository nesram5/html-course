import { WEB_PATHS } from '@plaza/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { useAvatars, useSession } from '@/features/auth';
import { useEnterSpace } from '@/features/spaces';
import { errorMessageKey } from '@/shared/api';

import { avatarUrl, loadWorldAssets } from '../api/assets';
import { worldKeys } from '../api/space-api';
import { installWorldDebug } from '../debug';
import { useWorldStore } from '../store/world-store';
import { WorldCanvas } from './WorldCanvas';
import { WorldToolbar } from './WorldToolbar';

/**
 * `/s/:slug`: the office of a space (E3). Mounted inside `RequireAuth` + `RequireAvatar`, so the
 * session is there and the avatar is chosen. Entering by slug joins by allowed domain (E2-S4).
 */
export function SpacePage() {
  const { t } = useTranslation('world');
  const { t: tc } = useTranslation();
  const { slug = '' } = useParams();

  const space = useEnterSpace(slug);
  const { user } = useSession();
  const avatars = useAvatars();
  const detail = space.data?.space;
  const assets = useQuery({
    queryKey: worldKeys.assets(detail?.mapTemplateId ?? '', detail?.themeId ?? ''),
    queryFn: ({ signal }) =>
      loadWorldAssets(detail?.mapTemplateId ?? '', detail?.themeId ?? '', signal),
    enabled: detail !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const roomId = useWorldStore((state) => state.localPlayer?.roomId ?? null);
  useEffect(installWorldDebug, []);

  const failed = [space, assets].find((query) => query.isError);
  if (failed !== undefined) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">{t('page.errorTitle')}</h1>
        <p role="alert" className="text-slate-600">
          {tc(errorMessageKey(failed.error))}
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
            onClick={() => {
              for (const query of [space, assets]) if (query.isError) void query.refetch();
            }}
          >
            {t('page.retry')}
          </button>
          <Link
            to={WEB_PATHS.spaces}
            className="rounded-md px-4 py-2 font-medium text-brand-700 hover:bg-brand-50"
          >
            {t('page.backToSpaces')}
          </Link>
        </div>
      </main>
    );
  }

  // The avatar catalog only gives the sprite URL; if it fails, the conventional path is used.
  if (detail === undefined || user === null || assets.data === undefined || avatars.isPending) {
    return (
      <main className="grid min-h-full place-items-center p-8">
        <p role="status" className="text-slate-600">
          {t('page.loading')}
        </p>
      </main>
    );
  }

  const { map, theme } = assets.data;
  const roomName = map.rooms.find((room) => room.areaId === roomId)?.name;
  const sprite =
    avatars.data?.find((avatar) => avatar.id === user.avatarId)?.spriteUrl ??
    avatarUrl(user.avatarId);

  return (
    <main className="flex h-screen flex-col bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-white">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">{detail.name}</h1>
          <p className="text-sm text-slate-300" data-testid="world-location">
            {roomName === undefined ? t('page.hallway') : t('page.inRoom', { name: roomName })}
          </p>
        </div>
        <Link
          to={WEB_PATHS.spaces}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10"
        >
          {t('page.leave')}
        </Link>
      </header>
      <div className="relative min-h-0 flex-1">
        <WorldCanvas
          map={map}
          theme={theme}
          displayName={user.displayName}
          avatarUrl={sprite}
          label={t('canvas.label', { space: detail.name })}
        />
        <div className="absolute right-3 bottom-3">
          <WorldToolbar />
        </div>
      </div>
    </main>
  );
}
