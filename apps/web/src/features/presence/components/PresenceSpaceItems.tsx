import { sidePanelStore, useSidePanel, type SpaceSlotProps } from '@/features/world';

import { usePresenceSession } from '../hooks/usePresenceSession';
import { PeopleButton } from './PeopleButton';
import { PeoplePanel } from './PeoplePanel';
import { StatusMenu } from './StatusMenu';

/** Side panel id of "Personas" in the office (world `sidePanelStore`). */
export const PEOPLE_PANEL = 'people';
const PANEL_ID = 'space-people-panel';
const BUTTON_ID = 'space-people-button';

/**
 * Presence controls of the office bottom bar (E7-S1, E7-S2): the status menu and "Personas".
 * Mounted while inside the office, so it also runs the presence session (status, away
 * detection that emits `presence:self-away`, incoming rings).
 */
export function PresenceBarItems({ space }: SpaceSlotProps) {
  usePresenceSession(space.spaceId);
  const expanded = useSidePanel((state) => state.open === PEOPLE_PANEL);
  return (
    <>
      <StatusMenu />
      <PeopleButton
        id={BUTTON_ID}
        expanded={expanded}
        controls={PANEL_ID}
        onToggle={() => {
          sidePanelStore.getState().toggle(PEOPLE_PANEL);
        }}
      />
    </>
  );
}

/** The "Personas" side panel while it is open; closing it gives the focus back to its button. */
export function PresenceSidePanel({ space }: SpaceSlotProps) {
  const open = useSidePanel((state) => state.open === PEOPLE_PANEL);
  if (!open) return null;
  return (
    <div id={PANEL_ID} className="absolute top-3 right-3 bottom-20 z-20 max-w-[calc(100%-1.5rem)]">
      <PeoplePanel
        spaceId={space.spaceId}
        roomNames={space.roomNames}
        onClose={() => {
          sidePanelStore.getState().close();
          document.getElementById(BUTTON_ID)?.focus();
        }}
      />
    </div>
  );
}
