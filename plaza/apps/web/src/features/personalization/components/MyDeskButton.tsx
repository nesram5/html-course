import { useTranslation } from 'react-i18next';

import {
  deskOfUser,
  officeStore,
  realtimeClient,
  useOfficeStore,
  type OfficeStore,
} from '@/features/world';

export interface MyDeskButtonProps {
  readonly selfUserId: string;
  /** Sends `desk:goto`; the server moves the avatar next to the desk (E9-S2). */
  readonly gotoDesk?: () => void;
  readonly office?: OfficeStore;
}

/** "Mi escritorio" (E9-S2): back next to my desk. Only shown when I have one. */
export function MyDeskButton({
  selfUserId,
  gotoDesk = () => {
    realtimeClient.gotoDesk();
  },
  office = officeStore,
}: MyDeskButtonProps) {
  const { t } = useTranslation('personalization');
  const myDesk = useOfficeStore((state) => deskOfUser(state, selfUserId), office);
  if (myDesk === null) return null;
  return (
    <button
      type="button"
      className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      title={t('myDesk.title')}
      onClick={gotoDesk}
    >
      {t('myDesk.label')}
    </button>
  );
}
