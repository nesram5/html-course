import { WEB_PATHS } from '@plaza/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';

import { useAvatars, useSession } from '@/features/auth';
import { DeskHud, MyDeskButton, useDecorCatalog } from '@/features/personalization';
import { useEnterSpace } from '@/features/spaces';
import { errorMessageKey, isApiError } from '@/shared/api';
import { toast } from '@/shared/ui';

import { avatarUrl, decorUrl, loadTheme, loadWorldAssets } from '../api/assets';
import { worldKeys } from '../api/space-api';
import { installWorldDebug } from '../debug';
import { useSpaceSession } from '../hooks/useSpaceSession';
import { useWorldStore } from '../store/world-store';
import { ConnectionBanner } from './ConnectionBanner';
import { SessionNotice, SpaceNotice, isFinalError } from './SpaceNotice';
import { WorldCanvas } from './WorldCanvas';
import { WorldToolbar } from './WorldToolbar';

/**
 * `/s/:slug`: the office of a space (E3, E4). Mounted inside `RequireAuth` + `RequireAvatar`, so
 * the session is there and the avatar is chosen. Entering by slug joins by allowed domain
 * (E2-S4); then the realtime session joins the space once the map is drawn.
 */
export function SpacePage() {
  const { t } = useTranslation('world');
  const { t: tc } = useTranslation();
  const { slug = '' } = useParams();
  const navigate = useNavigate();

  const space = useEnterSpace(slug);
  const { user } = useSession();
  const avatars = useAvatars();
  const detail = space.data?.space;
  // The style the office is first drawn with. Later changes (E9-S1) are applied live by the
  // scene, so a refetched space with another theme must not reload (and redraw) the office.
  const [firstTheme, setFirstTheme] = useState<{ spaceId: string; themeId: string } | null>(null);
  if (detail !== undefined && firstTheme?.spaceId !== detail.id) {
    setFirstTheme({ spaceId: detail.id, themeId: detail.themeId });
  }
  const mapTemplateId = detail?.mapTemplateId ?? '';
  const themeId = firstTheme?.spaceId === detail?.id ? (firstTheme?.themeId ?? '') : '';
  const assets = useQuery({
    queryKey: worldKeys.assets(mapTemplateId, themeId),
    queryFn: ({ signal }) => loadWorldAssets(mapTemplateId, themeId, signal),
    enabled: detail !== undefined && themeId !== '',
    staleTime: Number.POSITIVE_INFINITY,
  });
  const resolveTheme = useCallback(
    (nextThemeId: string) => loadTheme(mapTemplateId, nextThemeId),
    [mapTemplateId],
  );
  // Decoration sprites are looked up when drawn, so the catalog arriving later does not
  // recreate the game; until it does, the conventional path is used.
  const decor = useDecorCatalog();
  const decorUrls = useRef<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    decorUrls.current = new Map((decor.data ?? []).map((item) => [item.id, item.spriteUrl]));
  }, [decor.data]);
  const decorUrlOf = useCallback(
    (itemId: string) => decorUrls.current.get(itemId) ?? decorUrl(itemId),
    [],
  );
  const { session, connection, retry } = useSpaceSession(detail?.id);
  const roomId = useWorldStore((state) => state.localPlayer?.roomId ?? null);
  const avatarUrls = useMemo(
    () => Object.fromEntries((avatars.data ?? []).map((avatar) => [avatar.id, avatar.spriteUrl])),
    [avatars.data],
  );
  useEffect(installWorldDebug, []);

  const removed = session.kind === 'kicked' && session.reason !== 'SESSION_REPLACED';
  useEffect(() => {
    if (!removed) return;
    toast.info(
      t(session.reason === 'ACCOUNT_DELETED' ? 'session.accountDeleted' : 'session.removed'),
    );
    void navigate(WEB_PATHS.spaces, { replace: true });
  }, [removed, session, navigate, t]);

  const failed = [space, assets].find((query) => query.isError);
  if (failed !== undefined) {
    return (
      <SpaceNotice
        title={t('page.errorTitle')}
        message={tc(errorMessageKey(failed.error))}
        {...(!isFinalError(isApiError(failed.error) ? failed.error.code : undefined) && {
          actionLabel: t('page.retry'),
          onAction: () => {
            for (const query of [space, assets]) if (query.isError) void query.refetch();
          },
        })}
      />
    );
  }

  if (session.kind === 'failed' || (session.kind === 'kicked' && !removed)) {
    return <SessionNotice session={session} onRetry={retry} />;
  }

  // The avatar catalog only gives the sprite URL; if it fails, the conventional path is used.
  if (
    detail === undefined ||
    user === null ||
    assets.data === undefined ||
    avatars.isPending ||
    removed
  ) {
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
  const sprite = avatarUrls[user.avatarId] ?? avatarUrl(user.avatarId);

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
          avatarUrls={avatarUrls}
          resolveTheme={resolveTheme}
          decorUrlOf={decorUrlOf}
          label={t('canvas.label', { space: detail.name })}
        />
        <ConnectionBanner connection={connection} session={session} />
        <DeskHud spaceId={detail.id} map={map} selfUserId={user.id} />
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          <MyDeskButton selfUserId={user.id} />
          <WorldToolbar />
        </div>
      </div>
    </main>
  );
}
