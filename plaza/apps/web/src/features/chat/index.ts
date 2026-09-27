import type { RouteObject } from 'react-router';

import es from './i18n/es.json';

/**
 * Public API of the `chat` feature (E7): Space chat and reactions.
 * Other features and `app/` import ONLY from this file (standards §5).
 *
 * Nothing here may use another feature at module load time (only inside functions): `world`
 * imports this feature for its space page, and this feature imports `world`.
 */

/** Routes of the feature, mounted by `app/routes.tsx` inside the root layout. */
export const chatRoutes: RouteObject[] = [];

/** i18n namespace `chat` (texts in `./i18n/es.json`). */
export const chatMessages = { es } as const;

export { ChatButton } from './components/ChatButton';
export { ChatPanel } from './components/ChatPanel';
export { ReactionPicker } from './components/ReactionPicker';
export { sendChatMessage, sendReaction, useChatSession } from './hooks/useChatSession';
export { chatStore, useChatStore, type ChatState } from './store/chat-store';
