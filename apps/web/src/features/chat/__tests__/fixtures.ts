import type {
  ChatMessageDto,
  ReactionEmoji,
  ServerEventName,
  ServerEventPayload,
} from '@bululu/shared';

/** Stand-in for the parts of `RealtimeClient` the chat feature uses. */
export class FakeChatClient {
  readonly reactions: ReactionEmoji[] = [];
  readonly bodies: string[] = [];
  sendChatImpl: (body: string) => Promise<ChatMessageDto> = (body) =>
    Promise.resolve(message({ id: `m-${String(this.bodies.length)}`, body }));
  private readonly listeners = new Map<string, Set<(payload: never) => void>>();

  on<E extends ServerEventName>(
    event: E,
    listener: (payload: ServerEventPayload<E>) => void,
  ): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  sendChat(body: string): Promise<ChatMessageDto> {
    this.bodies.push(body);
    return this.sendChatImpl(body);
  }

  react(emoji: ReactionEmoji): boolean {
    this.reactions.push(emoji);
    return true;
  }

  serverEmit<E extends ServerEventName>(event: E, payload: ServerEventPayload<E>): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      (listener as (payload: ServerEventPayload<E>) => void)(payload);
    }
  }

  listenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

export function message(overrides: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: 'm-1',
    authorId: 'user-2',
    body: 'Hola',
    createdAt: '2026-09-27T10:00:00.000Z',
    ...overrides,
  };
}
