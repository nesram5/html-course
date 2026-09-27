import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { hallwayNoticeSeen, markHallwayNoticeSeen, type PrefsStorage } from '../lib/media-prefs';

export interface HallwayNoticeProps {
  /** Where "already seen" is remembered (`localStorage` by default). */
  readonly storage?: PrefsStorage | null;
  /** Inside a meeting room the room card takes the top of the map: the notice waits. */
  readonly inRoom?: boolean;
}

/**
 * First-use notice (RN-12, E5-S6): the hallway is not private. Shown until the person
 * acknowledges it once in this browser.
 */
export function HallwayNotice({ storage, inRoom = false }: HallwayNoticeProps) {
  const { t } = useTranslation('media');
  const [visible, setVisible] = useState(
    () => !(storage === undefined ? hallwayNoticeSeen() : hallwayNoticeSeen(storage)),
  );
  if (!visible || inRoom) return null;
  return (
    <div
      role="note"
      data-testid="hallway-notice"
      className="absolute top-3 left-3 z-10 flex max-w-sm items-start gap-3 rounded-xl bg-white/95 p-3 text-sm text-slate-800 shadow-lg"
    >
      <span aria-hidden="true">💬</span>
      <p className="flex-1">{t('notice.hallway')}</p>
      <button
        type="button"
        onClick={() => {
          if (storage === undefined) markHallwayNoticeSeen();
          else markHallwayNoticeSeen(storage);
          setVisible(false);
        }}
        className="rounded-md bg-indigo-600 px-3 py-1 font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        {t('notice.dismiss')}
      </button>
    </div>
  );
}
