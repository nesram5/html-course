import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { toast } from '@/shared/ui';

import { useClaimDesk, useReleaseDesk } from '../hooks/useDesks';
import { deskLink } from '../hooks/useShowDeskFromUrl';
import { deskLabel } from '../lib/desk-label';

export interface MemberDeskControlsProps {
  readonly spaceId: string;
  /** `/s/<slug>` of the space, for "Ir a su escritorio". */
  readonly spacePath: string;
  readonly member: { readonly userId: string; readonly displayName: string };
  readonly deskId: string | null;
  /** Every desk of the map, in map order. */
  readonly deskIds: readonly string[];
  /** Desks held by someone. */
  readonly takenDeskIds: ReadonlySet<string>;
  /** A desk was assigned or freed (refresh the members list). */
  readonly onChanged: () => void;
}

const BUTTON = 'rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50';

/**
 * Desk of a member in "Miembros" (owners, E9-S2, RN-14): assign a free desk or free theirs,
 * and "Ir a su escritorio", which opens the office with the camera on it.
 */
export function MemberDeskControls({
  spaceId,
  spacePath,
  member,
  deskId,
  deskIds,
  takenDeskIds,
  onChanged,
}: MemberDeskControlsProps) {
  const { t } = useTranslation('personalization');
  const selectId = useId();
  const free = deskIds.filter((id) => !takenDeskIds.has(id));
  const [choice, setChoice] = useState('');
  const claim = useClaimDesk(spaceId);
  const release = useReleaseDesk(spaceId);
  const busy = claim.isPending || release.isPending;

  if (deskId !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span>{deskLabel(t, deskId)}</span>
        <Link
          to={deskLink(spacePath, deskId)}
          className="text-sm text-brand-700 underline"
          aria-label={t('members.gotoLabel', { name: member.displayName })}
        >
          {t('members.goto')}
        </Link>
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          aria-label={t('members.releaseLabel', { name: member.displayName })}
          onClick={() => {
            release.mutate(deskId, {
              onSuccess: () => {
                toast.info(t('members.released', { name: member.displayName }));
                onChanged();
              },
            });
          }}
        >
          {t('members.release')}
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice === '') return;
        claim.mutate(
          { deskId: choice, userId: member.userId },
          {
            onSuccess: () => {
              toast.success(t('members.assigned', { name: member.displayName }));
              setChoice('');
              onChanged();
            },
          },
        );
      }}
    >
      <label htmlFor={selectId} className="sr-only">
        {t('members.assignLabel', { name: member.displayName })}
      </label>
      <select
        id={selectId}
        value={choice}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        onChange={(event) => {
          setChoice(event.target.value);
        }}
      >
        <option value="">{t('members.none')}</option>
        {free.map((id) => (
          <option key={id} value={id}>
            {deskLabel(t, id)}
          </option>
        ))}
      </select>
      <button type="submit" className={BUTTON} disabled={busy || choice === ''}>
        {t('members.assign')}
      </button>
    </form>
  );
}
