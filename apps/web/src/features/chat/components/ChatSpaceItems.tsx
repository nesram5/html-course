import { useMemo } from 'react';

import { usePresenceStore } from '@/features/presence';
import { useMembers } from '@/features/spaces';
import { sidePanelStore, useSidePanel, type SpaceSlotProps } from '@/features/world';

import { useChatSession } from '../hooks/useChatSession';
import { ChatButton } from './ChatButton';
import { ChatPanel } from './ChatPanel';
import { ReactionPicker } from './ReactionPicker';

/** Side panel id of the space chat in the office (world `sidePanelStore`). */
export const CHAT_PANEL = 'chat';
const PANEL_ID = 'space-chat-panel';
const BUTTON_ID = 'space-chat-button';

/**
 * Chat controls of the office bottom bar (E7-S3, E7-S4): reactions and "Chat" with the unread
 * counter. Mounted while inside the office, so it also runs the chat session.
 */
export function ChatBarItems({ space }: SpaceSlotProps) {
  useChatSession(space.spaceId);
  const expanded = useSidePanel((state) => state.open === CHAT_PANEL);
  return (
    <>
      <ReactionPicker />
      <ChatButton
        id={BUTTON_ID}
        expanded={expanded}
        controls={PANEL_ID}
        onToggle={() => {
          sidePanelStore.getState().toggle(CHAT_PANEL);
        }}
      />
    </>
  );
}

/** The chat side panel while it is open; closing it gives the focus back to its button. */
export function ChatSidePanel({ space }: SpaceSlotProps) {
  const open = useSidePanel((state) => state.open === CHAT_PANEL);
  if (!open) return null;
  return <OpenChatPanel spaceId={space.spaceId} />;
}

function OpenChatPanel({ spaceId }: { readonly spaceId: string }) {
  const people = usePresenceStore((state) => state.people);
  const selfId = usePresenceStore((state) => state.selfId);
  const members = useMembers(spaceId);
  // Authors by userId: the members, and the connected people (fresher names).
  const names = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const member of members.data ?? []) byId[member.userId] = member.displayName;
    for (const person of Object.values(people)) byId[person.userId] = person.displayName;
    return byId;
  }, [members.data, people]);
  return (
    <div id={PANEL_ID} className="absolute top-3 right-3 bottom-20 z-20 max-w-[calc(100%-1.5rem)]">
      <ChatPanel
        names={names}
        selfId={selfId}
        onClose={() => {
          sidePanelStore.getState().close();
          document.getElementById(BUTTON_ID)?.focus();
        }}
      />
    </div>
  );
}
