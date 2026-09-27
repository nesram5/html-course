import { effectivePresence, type PresenceStatus } from '@plaza/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { setPresenceStatus } from '../hooks/usePresenceSession';
import { usePresenceStore, type PresenceStore, presenceStore } from '../store/presence-store';
import { StatusDot } from './StatusDot';

const OPTIONS: readonly PresenceStatus[] = ['available', 'busy'];

export interface StatusMenuProps {
  readonly store?: PresenceStore;
  readonly onSelect?: (status: PresenceStatus) => void;
}

/**
 * Status menu of the bottom bar (E7-S1): Disponible / Ocupado. The button shows what the others
 * see (Ausente while the tab is hidden or idle). Keyboard: arrows move between options, Escape
 * closes and gives the focus back to the button.
 */
export function StatusMenu({
  store = presenceStore,
  onSelect = setPresenceStatus,
}: StatusMenuProps) {
  const { t } = useTranslation('presence');
  const status = usePresenceStore((state) => state.status, store);
  const away = usePresenceStore((state) => state.away, store);
  const [open, setOpen] = useState(false);
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
      itemsRef.current[(index + step + OPTIONS.length) % OPTIONS.length]?.focus();
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
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-white hover:bg-white/10"
        onClick={() => {
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
                  <span className="text-xs text-slate-500">{t(`statusMenu.${option}Hint`)}</span>
                </span>
              </button>
            </li>
          ))}
          {away && (
            <li role="none" className="px-3 py-2 text-xs text-slate-500">
              {t('statusMenu.awayNote')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
