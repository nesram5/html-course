import { effectivePresence, type PresenceStatus } from '@bululu/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { setPresenceStatus } from '../hooks/usePresenceSession';
import { canAskNotificationPermission, requestNotificationPermissionOnce } from '../lib/ring-alert';
import { usePresenceStore, type PresenceStore, presenceStore } from '../store/presence-store';
import { StatusDot } from './StatusDot';

const OPTIONS: readonly PresenceStatus[] = ['available', 'busy'];

export interface StatusMenuProps {
  readonly store?: PresenceStore;
  readonly onSelect?: (status: PresenceStatus) => void;
  /** Whether the notification permission can still be asked (browser `Notification`). */
  readonly canAskNotifications?: () => boolean;
  readonly askNotifications?: () => void;
}

/**
 * Status menu of the bottom bar (E7-S1): Disponible / Ocupado. The button shows what the others
 * see (Ausente while the tab is hidden or idle). While the browser has not been asked yet, it
 * also offers "Activar avisos de llamadas" (E7-S5): whoever is rung gets a notification only
 * with that permission. Keyboard: arrows move between items, Escape closes and gives the focus
 * back to the button.
 */
export function StatusMenu({
  store = presenceStore,
  onSelect = setPresenceStatus,
  canAskNotifications = canAskNotificationPermission,
  askNotifications = requestNotificationPermissionOnce,
}: StatusMenuProps) {
  const { t } = useTranslation('presence');
  const status = usePresenceStore((state) => state.status, store);
  const away = usePresenceStore((state) => state.away, store);
  const [open, setOpen] = useState(false);
  // Read when the menu opens: the answer can change in the browser at any time.
  const [offerNotifications, setOfferNotifications] = useState(false);
  const itemCount = OPTIONS.length + (offerNotifications ? 1 : 0);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const shown = effectivePresence({ status, away });

  useEffect(() => {
    if (!open) return undefined;
    itemsRef.current[OPTIONS.indexOf(status)]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        containerRef.current?.contains(event.target) !== true
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
    // Focus the checked option only when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = itemsRef.current.findIndex((item) => item === document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      itemsRef.current[(index + step + itemCount) % itemCount]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={() => {
          if (!open) setOfferNotifications(canAskNotifications());
          setOpen((value) => !value);
        }}
      >
        <StatusDot presence={shown} />
        {t('statusMenu.button', { status: t(`status.${shown}`) })}
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={t('statusMenu.label')}
          onKeyDown={onMenuKeyDown}
          className="absolute bottom-full left-0 mb-2 w-64 rounded-md bg-white p-1 text-slate-800 shadow-lg"
        >
          {OPTIONS.map((option, index) => (
            <li key={option} role="none">
              <button
                ref={(element) => {
                  itemsRef.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={status === option}
                className="flex w-full items-start gap-2 rounded px-3 py-2 text-left hover:bg-slate-100 focus-visible:bg-slate-100"
                onClick={() => {
                  onSelect(option);
                  close();
                }}
              >
                <StatusDot presence={option} className="mt-1.5" />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{t(`status.${option}`)}</span>
                  <span className="text-xs text-slate-600">{t(`statusMenu.${option}Hint`)}</span>
                </span>
              </button>
            </li>
          ))}
          {offerNotifications && (
            <li role="none" className="border-t border-slate-200 pt-1">
              <button
                ref={(element) => {
                  itemsRef.current[OPTIONS.length] = element;
                }}
                type="button"
                role="menuitem"
                className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-slate-100 focus-visible:bg-slate-100"
                onClick={() => {
                  askNotifications();
                  close();
                }}
              >
                <span className="text-sm font-medium">{t('notifications.enable')}</span>
                <span className="text-xs text-slate-600">{t('notifications.enableHint')}</span>
              </button>
            </li>
          )}
          {away && (
            <li role="none" className="px-3 py-2 text-xs text-slate-600">
              {t('statusMenu.awayNote')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
