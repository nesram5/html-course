import { WEB_PATHS } from '@bululu/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';

import { useAvatars, useSession } from '@/features/auth';
import { useEnterSpace } from '@/features/spaces';
import { errorMessageKey, isApiError } from '@/shared/api';
import { toast } from '@/shared/ui';

import { avatarUrl, decorUrl, loadTheme, loadWorldAssets } from '../api/assets';
import { fetchTemplateThemeIds, worldKeys } from '../api/space-api';
import { installWorldDebug } from '../debug';
import { useSpaceExtensions, type SpaceInfo } from '../extensions';
import { useDecorCatalog } from '../hooks/useDecorCatalog';
import { useSpaceSession } from '../hooks/useSpaceSession';
import { sidePanelStore, useSidePanel } from '../store/side-panel-store';
import { useWorldStore } from '../store/world-store';
import { ConnectionBanner } from './ConnectionBanner';
import { SessionNotice, SpaceNotice, isFinalError } from './SpaceNotice';
import { SpaceBottomBar } from './SpaceBottomBar';
import { WorldCanvas } from './WorldCanvas';
import { WorldToolbar } from './WorldToolbar';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';

/**
 * `/s/:slug`: the office of a space (E3, E4). Mounted inside `RequireAuth` + `RequireAvatar`, so
 * the session is there and the avatar is chosen. Entering by slug joins by allowed domain
 * (E2-S4); the map loads while the gates of the extensions are shown (the media pre-join,
 * E5-S4), and the realtime session joins the space once they are done and the map is drawn.
 * Extensions also add overlays over the map, controls to the bottom bar and side panels
 * (presence and chat, E7).
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
  useDocumentTitle(detail?.name ?? null);
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
  const listThemes = useCallback(() => fetchTemplateThemeIds(mapTemplateId), [mapTemplateId]);
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
  const extensions = useSpaceExtensions();
  const gates = useMemo(() => extensions.flatMap(({ Gate }) => (Gate ? [Gate] : [])), [extensions]);
  // Gates passed on this visit (a new slug starts over).
  const [passed, setPassed] = useState({ slug, count: 0 });
  const gatesPassed = passed.slug === slug ? passed.count : 0;
  const entered = gatesPassed >= gates.length;
  const { session, connection, retry } = useSpaceSession(entered ? detail?.id : undefined);
  const roomId = useWorldStore((state) => state.localPlayer?.roomId ?? null);
  const sidePanelOpen = useSidePanel((state) => state.open !== null);
  const avatarUrls = useMemo(
    () => Object.fromEntries((avatars.data ?? []).map((avatar) => [avatar.id, avatar.spriteUrl])),
    [avatars.data],
  );
  useEffect(installWorldDebug, []);
  // A side panel left open does not come back on the next visit.
  useEffect(
    () => () => {
      sidePanelStore.getState().close();
    },
    [],
  );

  // Leaving the last gate (a dialog) puts the keyboard focus on the map, not on the page body.
  const mapArea = useRef<HTMLDivElement>(null);
  const hadGates = gates.length > 0;
  useEffect(() => {
    if (!entered || !hadGates) return;
    mapArea.current?.querySelector<HTMLElement>('[role="application"]')?.focus();
  }, [entered, hadGates]);

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
  const roomNames = Object.fromEntries(map.rooms.map((room) => [room.areaId, room.name]));
  const sprite = avatarUrls[user.avatarId] ?? avatarUrl(user.avatarId);
  const info: SpaceInfo = {
    spaceId: detail.id,
    spaceName: detail.name,
    userId: user.id,
    displayName: user.displayName,
    isOwner: detail.role === 'OWNER',
    roomNames,
    map,
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
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('page.leave')}
        </Link>
      </header>
      <div ref={mapArea} className="relative min-h-0 flex-1">
        <WorldCanvas
          map={map}
          theme={theme}
          displayName={user.displayName}
          avatarUrl={sprite}
          avatarUrls={avatarUrls}
          resolveTheme={resolveTheme}
          listThemes={listThemes}
          decorUrlOf={decorUrlOf}
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
            {/* With a side panel open (w-80 at right-3), the bar stays left of it on wide screens. */}
            <div
              className={`pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-end justify-between gap-3 ${sidePanelOpen ? 'right-3 md:right-[21.5rem]' : 'right-3'}`}
            >
              <div className="pointer-events-auto">
                <SpaceBottomBar space={info} avatar={avatar} extensions={extensions} />
              </div>
              <div className="pointer-events-auto">
                <WorldToolbar />
              </div>
            </div>
            {/* Last, so Tab goes canvas → overlays → bottom bar → map controls → side panel. */}
            {extensions.map(({ id, Panel }) =>
              Panel === undefined ? null : <Panel key={id} space={info} />,
            )}
          </>
        )}
      </div>
    </main>
  );
}
