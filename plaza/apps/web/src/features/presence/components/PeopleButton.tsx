import { useTranslation } from 'react-i18next';

import { presenceStore, usePresenceStore, type PresenceStore } from '../store/presence-store';

export interface PeopleButtonProps {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** id of the panel it opens. */
  readonly controls?: string;
  readonly id?: string;
  readonly store?: PresenceStore;
}

/** "Personas" button of the bottom bar (E7-S2), with the number of connected people. */
export function PeopleButton({
  expanded,
  onToggle,
  controls,
  id,
  store = presenceStore,
}: PeopleButtonProps) {
  const { t } = useTranslation('presence');
  const count = usePresenceStore((state) => Object.keys(state.people).length, store);
  return (
    <button
      id={id}
      type="button"
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      aria-label={t('people.buttonLabel', { count })}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-white hover:bg-white/10 aria-expanded:bg-white/15"
      onClick={onToggle}
    >
      <span aria-hidden="true">👥</span>
      {t('people.button')}
      <span className="rounded-full bg-white/20 px-1.5 text-xs">{count}</span>
    </button>
  );
}
