import { WEB_PATHS } from '@plaza/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';

import { useAvatars, useSession } from '@/features/auth';
import { useEnterSpace } from '@/features/spaces';
import { errorMessageKey, isApiError } from '@/shared/api';
import { toast } from '@/shared/ui';

import { avatarUrl, loadWorldAssets } from '../api/assets';
import { worldKeys } from '../api/space-api';
import { installWorldDebug } from '../debug';
import { useSpaceExtensions, type SpaceInfo } from '../extensions';
import { useSpaceSession } from '../hooks/useSpaceSession';
import { useWorldStore } from '../store/world-store';
import { ConnectionBanner } from './ConnectionBanner';
import { SessionNotice, SpaceNotice, isFinalError } from './SpaceNotice';
import { SpaceBottomBar } from './SpaceBottomBar';
import { WorldCanvas } from './WorldCanvas';
import { WorldToolbar } from './WorldToolbar';

/**
 * `/s/:slug`: the office of a space (E3, E4). Mounted inside `RequireAuth` + `RequireAvatar`, so
 * the session is there and the avatar is chosen. Entering by slug joins by allowed domain
 * (E2-S4); the map loads while the gates of the extensions are shown (the media pre-join,
 * E5-S4), and the realtime session joins the space once they are done and the map is drawn.
 * Extensions also add overlays over the map and controls to the bottom bar.
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
  const assets = useQuery({
    queryKey: worldKeys.assets(detail?.mapTemplateId ?? '', detail?.themeId ?? ''),
    queryFn: ({ signal }) =>
      loadWorldAssets(detail?.mapTemplateId ?? '', detail?.themeId ?? '', signal),
    enabled: detail !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const extensions = useSpaceExtensions();
  const gates = useMemo(() => extensions.flatMap(({ Gate }) => (Gate ? [Gate] : [])), [extensions]);
  // Gates passed on this visit (a new slug starts over).
  const [passed, setPassed] = useState({ slug, count: 0 });
  const gatesPassed = passed.slug === slug ? passed.count : 0;
  const entered = gatesPassed >= gates.length;
  const { session, connection, retry } = useSpaceSession(entered ? detail?.id : undefined);
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
  const info: SpaceInfo = {
    spaceId: detail.id,
    spaceName: detail.name,
    userId: user.id,
    displayName: user.displayName,
  };
  const Gate = gates[gatesPassed];
  const avatar = avatars.data?.find((entry) => entry.id === user.avatarId);

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
          label={t('canvas.label', { space: detail.name })}
        />
        {Gate !== undefined ? (
          <Gate
            space={info}
            onDone={() => {
              setPassed({ slug, count: gatesPassed + 1 });
            }}
          />
        ) : (
          <>
            <ConnectionBanner connection={connection} session={session} />
            {extensions.map(({ id, Overlay }) =>
              Overlay === undefined ? null : <Overlay key={id} space={info} />,
            )}
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-3">
              <div className="pointer-events-auto">
                <SpaceBottomBar space={info} avatar={avatar} extensions={extensions} />
              </div>
              <div className="pointer-events-auto">
                <WorldToolbar />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
