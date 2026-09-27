import type { ChatMessageDto, ReactionEmoji } from '@bululu/shared';

import type { EventBus, RealtimeClient } from '@/features/world';

import { ReactionThrottle } from '../lib/reaction-throttle';
import type { ChatStore } from '../store/chat-store';

export interface ChatSessionOptions {
  readonly client: Pick<RealtimeClient, 'on' | 'sendChat' | 'react'>;
  readonly events: EventBus;
  readonly store: ChatStore;
  /** `GET /api/spaces/:spaceId/messages`. */
  readonly fetchHistory: (signal: AbortSignal) => Promise<ChatMessageDto[]>;
  readonly throttle?: ReactionThrottle;
  /** A history request failed (the chat keeps what it has). */
  readonly onHistoryError?: (error: unknown) => void;
}

/**
 * Chat and reactions while in a space (E7-S3, E7-S4), framework-free:
 * - after every (re)join (`world:snapshot`) loads the stored history and merges it, so nothing
 *   sent during a reconnection is missing;
 * - `chat:message` from the others goes to the store (unread counter while closed);
 * - `reaction` goes to the scene (`avatar:reaction`), for everyone including oneself.
 */
export class ChatSession {
  private readonly cleanups: (() => void)[] = [];
  private readonly throttle: ReactionThrottle;
  private history: AbortController | null = null;

  constructor(private readonly options: ChatSessionOptions) {
    this.throttle = options.throttle ?? new ReactionThrottle();
  }

  start(): void {
    const { client, events, store } = this.options;
    this.cleanups.push(
      events.on('world:snapshot', () => {
        this.loadHistory();
      }),
      client.on('chat:message', (message) => {
        store.getState().receive(message, false);
      }),
      client.on('reaction', (reaction) => {
        events.emit('avatar:reaction', reaction);
      }),
    );
  }

  stop(): void {
    this.history?.abort();
    this.history = null;
    for (const dispose of this.cleanups.splice(0)) dispose();
    this.options.store.getState().reset();
  }

  /** Sends a message; rejects with a `RealtimeRequestError` (`RATE_LIMITED`...). */
  async send(body: string): Promise<void> {
    const message = await this.options.client.sendChat(body);
    this.options.store.getState().receive(message, true);
  }

  /** Sends a reaction; `false` when over 3 per second or disconnected. */
  react(emoji: ReactionEmoji): boolean {
    if (!this.throttle.tryTake()) return false;
    return this.options.client.react(emoji);
  }

  private loadHistory(): void {
    this.history?.abort();
    const controller = new AbortController();
    this.history = controller;
    this.options.fetchHistory(controller.signal).then(
      (messages) => {
        if (controller.signal.aborted) return;
        this.options.store.getState().mergeHistory(messages);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) this.options.onHistoryError?.(error);
      },
    );
  }
}
