import {
  PROTOCOL_VERSION,
  type PublicPlayer,
  type ServerEventName,
  type ServerEventPayload,
  type SpaceSnapshot,
} from '@plaza/shared';

/** Stand-in for the parts of `RealtimeClient` the presence feature uses. */
export class FakeClient {
  readonly sent: { event: string; payload: unknown }[] = [];
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

  setAway(away: boolean): boolean {
    this.sent.push({ event: 'player:away', payload: { away } });
    return true;
  }

  setStatus(status: 'available' | 'busy'): boolean {
    this.sent.push({ event: 'player:status', payload: { status } });
    return true;
  }

  ring = (toUserId: string): Promise<void> => {
    this.sent.push({ event: 'ring:send', payload: { toUserId } });
    return Promise.resolve();
  };

  /** A validated server event reaches the listeners. */
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

export function player(overrides: Partial<PublicPlayer> = {}): PublicPlayer {
  return {
    userId: 'user-2',
    displayName: 'Luis',
    avatarId: 'avatar-02',
    x: 1,
    y: 3,
    dir: 'down',
    status: 'available',
    away: false,
    roomId: null,
    inConversation: false,
    reconnecting: false,
    ...overrides,
  };
}

/** Me (`user-1`, Ana) and Luis (`user-2`). */
export function snapshot(overrides: Partial<SpaceSnapshot> = {}): SpaceSnapshot {
  return {
    v: PROTOCOL_VERSION,
    spaceId: 'space-1',
    mapTemplateId: 'office-small@1',
    themeId: 'pixel',
    self: player({ userId: 'user-1', displayName: 'Ana', avatarId: 'avatar-04' }),
    players: [player()],
    rooms: [],
    desks: [],
    ...overrides,
  };
}
