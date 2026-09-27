import { deskNear, type WorldMap } from '@plaza/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  deskOfUser,
  isTypingTarget,
  officeStore,
  useOfficeStore,
  useWorldStore,
  worldStore,
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
}

/** `X` without modifiers: the interaction key of the office (E9-S2). */
function isInteractKey(event: KeyboardEvent): boolean {
  return (
    (event.key === 'x' || event.key === 'X') &&
    !event.repeat &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !isTypingTarget(event.target)
  );
}

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

  // Walking away from the desk closes its menu.
  if (menuDeskId !== null && menuDeskId !== nearbyId) setMenuDeskId(null);

  useEffect(() => {
    if (nearbyId === null || panelOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isInteractKey(event)) return;
      event.preventDefault();
      setMenuDeskId(nearbyId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [nearbyId, panelOpen]);

  const closeMenu = () => {
    setMenuDeskId(null);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center gap-2 px-4">
      {nearbyId !== null && !panelOpen && (
        <button
          type="button"
          aria-keyshortcuts="x"
          aria-label={t('hint.deskLabel')}
          className="pointer-events-auto rounded-full bg-slate-900/85 px-4 py-1.5 text-sm text-white shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          onClick={() => {
            setMenuDeskId(nearbyId);
          }}
        >
          <kbd className="mr-2 rounded bg-white/20 px-1.5 font-mono">X</kbd>
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
