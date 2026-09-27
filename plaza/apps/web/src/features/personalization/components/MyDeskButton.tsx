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

/** "Mi escritorio" (E9-S2), in the office bottom bar: back next to my desk. Only shown when I have one. */
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
      className="rounded-md px-2 py-1.5 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      title={t('myDesk.title')}
      onClick={gotoDesk}
    >
      {t('myDesk.label')}
    </button>
  );
}
