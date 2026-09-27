import { useTranslation } from 'react-i18next';

import { presenceStore, usePresenceOf, type PresenceStore } from '../store/presence-store';
import { RingButton } from './RingButton';

export interface AwayCardProps {
  readonly userId: string;
  readonly store?: PresenceStore;
}

/**
 * "Ausente · Llamar" (E7-S1, E7-S5): shown by the media feature over the video tile of someone
 * who is away. Renders nothing while the person is here (or is the local person).
 */
export function AwayCard({ userId, store = presenceStore }: AwayCardProps) {
  const { t } = useTranslation('presence');
  const person = usePresenceOf(userId, store);
  if (person?.away !== true) return null;
  return (
    <div
      role="group"
      aria-label={t('awayCard.label', { name: person.displayName })}
      className="flex flex-col items-center justify-center gap-2 rounded-md bg-slate-800/90 p-3 text-center text-white"
    >
      <span className="text-sm font-semibold">{t('awayCard.title')}</span>
      {!person.isSelf && <RingButton userId={userId} displayName={person.displayName} />}
    </div>
  );
}
