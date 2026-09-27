import type { RouteObject } from 'react-router';

import type { SpaceExtension } from '@/features/world';

import { ChatBarItems, ChatSidePanel } from './components/ChatSpaceItems';
import es from './i18n/es.json';

/**
 * Public API of the `chat` feature (E7): Space chat and reactions.
 * Other features and `app/` import ONLY from this file (standards §5).
 *
 * The office page gets it through {@link chatSpaceExtension} (listed in `app/`), so `world`
 * never imports this feature.
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const chatRoutes: RouteObject[] = [];

/** i18n namespace `chat` (texts in `./i18n/es.json`). */
export const chatMessages = { es } as const;

/**
 * Chat and reactions in the office page (E7-S3, E7-S4): reactions and "Chat" in the bottom bar,
 * the chat side panel, and the chat session.
 */
export const chatSpaceExtension: SpaceExtension = {
  id: 'chat',
  BarItems: ChatBarItems,
  Panel: ChatSidePanel,
};

export { ChatButton } from './components/ChatButton';
export { ChatPanel } from './components/ChatPanel';
export { ReactionPicker } from './components/ReactionPicker';
export { sendChatMessage, sendReaction, useChatSession } from './hooks/useChatSession';
export { chatStore, useChatStore, type ChatState } from './store/chat-store';
