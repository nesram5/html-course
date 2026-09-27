import {
  CHAT_HISTORY,
  PROTOCOL_VERSION,
  type ChatMessageDto,
  type SpaceSnapshot,
} from '@bululu/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBus } from '@/features/world';

import { ReactionThrottle } from '../lib/reaction-throttle';
import { ChatSession } from '../realtime/chat-session';
import { createChatStore, type ChatStore } from '../store/chat-store';
import { FakeChatClient, message } from './fixtures';

function snapshot(): SpaceSnapshot {
  return {
    v: PROTOCOL_VERSION,
    spaceId: 'space-1',
    mapTemplateId: 'office-small@1',
    themeId: 'pixel',
    self: {
      userId: 'user-1',
      displayName: 'Ana',
      avatarId: 'avatar-01',
      x: 1,
      y: 1,
      dir: 'down',
      status: 'available',
      away: false,
      roomId: null,
      inConversation: false,
      reconnecting: false,
    },
    players: [],
    rooms: [],
    desks: [],
  };
}

let client: FakeChatClient;
let events: EventBus;
let store: ChatStore;
let history: ChatMessageDto[];
let now: number;
let session: ChatSession;

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

beforeEach(() => {
  client = new FakeChatClient();
  events = new EventBus();
  store = createChatStore();
  history = [];
  now = 0;
  session = new ChatSession({
    client,
    events,
    store,
    fetchHistory: () => Promise.resolve(history),
    throttle: new ReactionThrottle(3, () => now),
  });
  session.start();
});

describe('ChatSession: messages (E7-S3)', () => {
  it('loads the history after every join and merges it with live messages', async () => {
    history = [message({ id: 'a', createdAt: '2026-09-27T09:00:00.000Z' })];
    events.emit('world:snapshot', snapshot());
    await flush();
    client.serverEmit('chat:message', message({ id: 'b' }));

    // Reconnection: the history now has a message sent meanwhile, and "b" again.
    history = [
      message({ id: 'a', createdAt: '2026-09-27T09:00:00.000Z' }),
      message({ id: 'b' }),
      message({ id: 'c', createdAt: '2026-09-27T10:05:00.000Z' }),
    ];
    events.emit('world:snapshot', snapshot());
    await flush();

    expect(store.getState().messages.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it(`keeps at most ${String(CHAT_HISTORY)} messages`, () => {
    for (let i = 0; i < CHAT_HISTORY + 3; i++) {
      const at = new Date(Date.UTC(2026, 8, 27, 10, 0, i)).toISOString();
      client.serverEmit('chat:message', message({ id: `m${String(i)}`, createdAt: at }));
    }

    const { messages } = store.getState();
    expect(messages).toHaveLength(CHAT_HISTORY);
    expect(messages[0]?.id).toBe('m3');
  });

  it('counts unread messages of others while the panel is closed', async () => {
    client.serverEmit('chat:message', message({ id: 'x' }));
    client.serverEmit('chat:message', message({ id: 'y' }));
    await session.send('mío');
    expect(store.getState().unread).toBe(2);

    store.getState().setOpen(true);
    client.serverEmit('chat:message', message({ id: 'z' }));
    expect(store.getState().unread).toBe(0);
  });

  it('adds my own message from the ack', async () => {
    await session.send('Hola equipo');

    expect(client.bodies).toEqual(['Hola equipo']);
    expect(store.getState().messages.map((m) => m.body)).toEqual(['Hola equipo']);
  });
});

describe('ChatSession: reactions (E7-S4)', () => {
  it('sends at most 3 reactions per second', () => {
    const sent = [
      session.react('❤️'),
      session.react('👍'),
      session.react('🎉'),
      session.react('😂'),
    ];
    now = 1000;
    sent.push(session.react('👋'));

    expect(sent).toEqual([true, true, true, false, true]);
    expect(client.reactions).toEqual(['❤️', '👍', '🎉', '👋']);
  });

  it('shows reactions of everyone (me included) over their avatar', () => {
    const shown = vi.fn();
    events.on('avatar:reaction', shown);

    client.serverEmit('reaction', { userId: 'user-1', emoji: '🎉' });

    expect(shown).toHaveBeenCalledWith({ userId: 'user-1', emoji: '🎉' });
  });

  it('removes its listeners and empties the chat on stop', () => {
    client.serverEmit('chat:message', message());

    session.stop();

    expect(client.listenerCount()).toBe(0);
    expect(events.listenerCount()).toBe(0);
    expect(store.getState().messages).toEqual([]);
  });
});
