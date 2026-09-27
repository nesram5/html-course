import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChatButton, ChatPanel, ReactionPicker, useChatSession } from '@/features/chat';
import {
  PeopleButton,
  PeoplePanel,
  StatusMenu,
  usePresenceSession,
  usePresenceStore,
} from '@/features/presence';
import { useMembers } from '@/features/spaces';

type Panel = 'people' | 'chat';

export interface SpaceHudProps {
  readonly spaceId: string;
  readonly displayName: string;
  /** Meeting room names by area id ("En Sala X"). */
  readonly roomNames: Readonly<Record<string, string>>;
}

/**
 * Everything over the map but the map controls (E7): the bottom bar (name, status menu,
 * "Personas", reactions, chat) and the side panel it opens. Starts the presence and chat
 * sessions of the page. The media controls of E5 join this bar.
 */
export function SpaceHud({ spaceId, displayName, roomNames }: SpaceHudProps) {
  const { t } = useTranslation('world');
  usePresenceSession(spaceId);
  useChatSession(spaceId);
  const [panel, setPanel] = useState<Panel | null>(null);
  const ids = { people: useId(), chat: useId(), peopleButton: useId(), chatButton: useId() };
  const people = usePresenceStore((state) => state.people);
  const selfId = usePresenceStore((state) => state.selfId);
  const members = useMembers(spaceId);
  const names = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const member of members.data ?? []) byId[member.userId] = member.displayName;
    for (const person of Object.values(people)) byId[person.userId] = person.displayName;
    return byId;
  }, [members.data, people]);

  const toggle = (next: Panel) => {
    setPanel((current) => (current === next ? null : next));
  };
  const close = (which: Panel) => {
    setPanel(null);
    document.getElementById(which === 'people' ? ids.peopleButton : ids.chatButton)?.focus();
  };

  return (
    <>
      <nav
        aria-label={t('hud.label')}
        className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-lg bg-slate-900/85 px-2 py-1 text-white shadow-lg"
      >
        <span className="max-w-40 truncate px-2 text-sm font-semibold">{displayName}</span>
        <StatusMenu />
        <PeopleButton
          id={ids.peopleButton}
          expanded={panel === 'people'}
          controls={ids.people}
          onToggle={() => {
            toggle('people');
          }}
        />
        <ReactionPicker />
        <ChatButton
          id={ids.chatButton}
          expanded={panel === 'chat'}
          controls={ids.chat}
          onToggle={() => {
            toggle('chat');
          }}
        />
      </nav>
      {panel !== null && (
        <div
          id={panel === 'people' ? ids.people : ids.chat}
          className="absolute top-3 right-3 bottom-16 z-10 max-w-[calc(100%-1.5rem)]"
        >
          {panel === 'people' ? (
            <PeoplePanel
              spaceId={spaceId}
              roomNames={roomNames}
              onClose={() => {
                close('people');
              }}
            />
          ) : (
            <ChatPanel
              names={names}
              selfId={selfId}
              onClose={() => {
                close('chat');
              }}
            />
          )}
        </div>
      )}
    </>
  );
}
