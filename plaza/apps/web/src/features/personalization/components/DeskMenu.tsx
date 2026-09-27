import type { DeskState } from '@plaza/shared';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDialog } from '@/shared/ui';

export interface DeskMenuProps {
  readonly deskId: string;
  /** Who holds the desk, `null` when it is free. */
  readonly holder: DeskState | null;
  /** My current desk, if I have one. */
  readonly myDeskId: string | null;
  readonly busy: boolean;
  readonly onClaim: () => void;
  readonly onRelease: () => void;
  readonly onDecorate: () => void;
  readonly onClose: () => void;
}

const ACTION =
  'rounded-md px-3 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';
const PRIMARY = `${ACTION} bg-brand-600 text-white hover:bg-brand-700`;
const SECONDARY = `${ACTION} border border-slate-300 hover:bg-slate-50`;

/**
 * What `X` opens next to a desk (E9-S2, E9-S3): "Reclamar este escritorio" on a free desk (with
 * a confirmation when it replaces my current one, RN-13), "Decorar" and "Liberar" on mine, and
 * just the owner's name on someone else's (no "Decorar" there).
 */
export function DeskMenu({
  deskId,
  holder,
  myDeskId,
  busy,
  onClaim,
  onRelease,
  onDecorate,
  onClose,
}: DeskMenuProps) {
  const { t } = useTranslation('personalization');
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const mine = holder !== null && holder.deskId === myDeskId;
  useEffect(() => {
    // The question replaces the button that asked it: keep the focus in the dialog.
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [confirming, dialogRef]);

  let title: string;
  let body;
  if (holder === null && confirming) {
    title = t('menu.changeTitle');
    body = (
      <>
        <p className="text-sm text-slate-600">{t('menu.changeQuestion')}</p>
        <button
          type="button"
          data-autofocus
          className={PRIMARY}
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) onClaim();
          }}
        >
          {t('menu.changeConfirm')}
        </button>
        <button
          type="button"
          className={SECONDARY}
          onClick={() => {
            setConfirming(false);
          }}
        >
          {t('menu.cancel')}
        </button>
      </>
    );
  } else if (holder === null) {
    title = t('menu.freeTitle');
    body = (
      <button
        type="button"
        data-autofocus
        className={PRIMARY}
        aria-disabled={busy || undefined}
        onClick={() => {
          if (busy) return;
          if (myDeskId === null) onClaim();
          else setConfirming(true);
        }}
      >
        {t('menu.claim')}
      </button>
    );
  } else if (mine) {
    title = t('menu.mineTitle');
    body = (
      <>
        <button type="button" data-autofocus className={PRIMARY} onClick={onDecorate}>
          {t('menu.decorate')}
        </button>
        <button
          type="button"
          className={SECONDARY}
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) onRelease();
          }}
        >
          {t('menu.release')}
        </button>
      </>
    );
  } else {
    title = t('menu.takenTitle', { name: holder.displayName ?? '' });
    body = <p className="text-sm text-slate-600">{t('menu.taken')}</p>;
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-desk={deskId}
      className="flex w-72 flex-col gap-2 rounded-xl bg-white p-4 text-slate-900 shadow-xl"
    >
      <h2 id={titleId} className="font-semibold">
        {title}
      </h2>
      {body}
      <button type="button" className={`${ACTION} text-slate-600`} onClick={onClose}>
        {t('menu.close')}
      </button>
    </div>
  );
}
