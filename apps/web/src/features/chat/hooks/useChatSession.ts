import type { ReactionEmoji } from '@bululu/shared';
import { useEffect } from 'react';

import { realtimeClient, worldEvents } from '@/features/world';
import { isApiError } from '@/shared/api';
import { reportError } from '@/shared/lib/sentry';

import { fetchMessages } from '../api/chat-api';
import { ChatSession } from '../realtime/chat-session';
import { chatStore } from '../store/chat-store';

/** The running chat session, so the chat panel and the reaction picker can reach it. */
let current: ChatSession | null = null;

/** Sends a chat message of the local person (rejects outside a space). */
export function sendChatMessage(body: string): Promise<void> {
  if (current === null) return Promise.reject(new Error('Not in a space'));
  return current.send(body);
}

/** Sends a reaction; `false` when throttled (3/s) or outside a space. */
export function sendReaction(emoji: ReactionEmoji): boolean {
  return current?.react(emoji) ?? false;
}

/** Chat and reactions while the space page is mounted (E7-S3, E7-S4). */
export function useChatSession(spaceId: string): void {
  useEffect(() => {
    const session = new ChatSession({
      client: realtimeClient,
      events: worldEvents,
      store: chatStore,
      fetchHistory: (signal) => fetchMessages(spaceId, { signal }),
      onHistoryError: (error) => {
        // Network and API errors are expected (the next join retries); report the rest.
        if (!isApiError(error)) reportError(error);
      },
    });
    current = session;
    session.start();
    return () => {
      session.stop();
      if (current === session) current = null;
    };
  }, [spaceId]);
}
