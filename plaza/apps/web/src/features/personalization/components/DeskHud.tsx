import { deskNear, type WorldMap } from '@plaza/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  deskOfUser,
  interactionKeys,
  officeStore,
  useInteraction,
  useOfficeStore,
  useWorldStore,
  worldStore,
  type InteractionKeys,
  type OfficeStore,
  type WorldStore,
} from '@/features/world';
import { toast } from '@/shared/ui';

import { useClaimDesk, useDecorCatalog, useReleaseDesk, useSaveDeskDecor } from '../hooks/useDesks';
import { useShowDeskFromUrl } from '../hooks/useShowDeskFromUrl';
import { DeskDecorPanel } from './DeskDecorPanel';
import { DeskMenu } from './DeskMenu';

export interface DeskHudProps {
  readonly spaceId: string;
  readonly map: WorldMap;
  readonly selfUserId: string;
  readonly world?: WorldStore;
  readonly office?: OfficeStore;
  /** The interaction key dispatcher (`X`); the app-wide one by default. */
  readonly keys?: InteractionKeys;
}

/** Priority of the desk menu on the interaction key: a meeting room (20) wins over it. */
const DESK_INTERACTION_PRIORITY = 10;

/**
 * Desks in the office (E9-S2, E9-S3): next to a desk, a hint says `X` opens its menu (claim,
 * decorate, free); "Decorar" opens the decoration panel. Everything else (names over desks,
 * objects) is drawn by the world scene from the office store.
 */
export function DeskHud({
  spaceId,
  map,
  selfUserId,
  world = worldStore,
  office = officeStore,
  keys = interactionKeys,
}: DeskHudProps) {
  const { t } = useTranslation('personalization');
  const tile = useWorldStore((state) => state.localPlayer, world);
  const desks = useOfficeStore((state) => state.desks, office);
  const [menuDeskId, setMenuDeskId] = useState<string | null>(null);
  const [decorating, setDecorating] = useState<string | null>(null);
  const catalog = useDecorCatalog();
  const claim = useClaimDesk(spaceId);
  const release = useReleaseDesk(spaceId);
  const save = useSaveDeskDecor(spaceId);
  useShowDeskFromUrl();

  const nearby = tile === null ? null : deskNear(map.desks, tile);
  const nearbyId = nearby?.deskId ?? null;
  const myDesk = deskOfUser({ desks }, selfUserId);
  const panelOpen = menuDeskId !== null || decorating !== null;
  // Opened with the on-map hint button: it unmounts while the panel is open, so the dialog
  // cannot give the focus back to it. Do it here once every panel is closed (or to the map).
  const hintRef = useRef<HTMLButtonElement>(null);
  const refocusHint = useRef(false);
  useEffect(() => {
    if (panelOpen || !refocusHint.current) return;
    refocusHint.current = false;
    (hintRef.current ?? document.querySelector<HTMLElement>('[role="application"]'))?.focus();
  }, [panelOpen]);

  // Walking away from the desk closes its menu.
  if (menuDeskId !== null && menuDeskId !== nearbyId) setMenuDeskId(null);

  // `X` opens the menu of the desk next to the person, through the single office dispatcher.
  const xOpensMenu = useInteraction(
    'desk',
    DESK_INTERACTION_PRIORITY,
    nearbyId === null || panelOpen
      ? null
      : () => {
          setMenuDeskId(nearbyId);
        },
    keys,
  );

  const closeMenu = () => {
    setMenuDeskId(null);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 flex flex-col items-center gap-2 px-4">
      {nearbyId !== null && !panelOpen && (
        <button
          ref={hintRef}
          type="button"
          aria-keyshortcuts={xOpensMenu ? 'x' : undefined}
          aria-label={xOpensMenu ? t('hint.deskLabel') : t('hint.deskLabelNoKey')}
          className="pointer-events-auto rounded-full bg-slate-900/85 px-4 py-1.5 text-sm text-white shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          onClick={() => {
            refocusHint.current = true;
            setMenuDeskId(nearbyId);
          }}
        >
          {xOpensMenu && <kbd className="mr-2 rounded bg-white/20 px-1.5 font-mono">X</kbd>}
          {t('hint.desk')}
        </button>
      )}
      {menuDeskId !== null && (
        <div className="pointer-events-auto">
          <DeskMenu
            deskId={menuDeskId}
            holder={desks[menuDeskId] ?? null}
            myDeskId={myDesk?.deskId ?? null}
            busy={claim.isPending || release.isPending}
            onClose={closeMenu}
            onClaim={() => {
              claim.mutate(
                { deskId: menuDeskId },
                {
                  onSuccess: () => {
                    toast.success(t('menu.claimed'));
                    closeMenu();
                  },
                },
              );
            }}
            onRelease={() => {
              release.mutate(menuDeskId, {
                onSuccess: () => {
                  toast.info(t('menu.released'));
                  closeMenu();
                },
              });
            }}
            onDecorate={() => {
              setDecorating(menuDeskId);
              closeMenu();
            }}
          />
        </div>
      )}
      {decorating !== null && (
        <div className="pointer-events-auto">
          <DeskDecorPanel
            deskId={decorating}
            decor={desks[decorating]?.decor ?? null}
            catalog={catalog.data ?? []}
            catalogState={catalog.isPending ? 'loading' : catalog.isError ? 'error' : 'ready'}
            onRetryCatalog={() => {
              void catalog.refetch();
            }}
            saving={save.isPending}
            office={office}
            onClose={() => {
              setDecorating(null);
            }}
            onSave={(decor) => {
              save.mutate(
                { deskId: decorating, decor },
                {
                  onSuccess: () => {
                    toast.success(t('decor.saved'));
                    setDecorating(null);
                  },
                },
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
