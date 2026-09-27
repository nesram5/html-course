import type { RingReceived } from '@plaza/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { EventBus } from '@/features/world';

import { PresenceSession } from '../realtime/presence-session';
import { createPresenceStore, type PresenceStore } from '../store/presence-store';
import { FakeClient, player, snapshot } from './fixtures';

let client: FakeClient;
let events: EventBus;
let store: PresenceStore;
let joined: boolean;
let rings: RingReceived[];
let session: PresenceSession;
let selfAway: boolean[];

beforeEach(() => {
  client = new FakeClient();
  events = new EventBus();
  store = createPresenceStore();
  joined = true;
  rings = [];
  selfAway = [];
  events.on('presence:self-away', ({ away }) => selfAway.push(away));
  session = new PresenceSession({
    client,
    events,
    store,
    isJoined: () => joined,
    onRing: (ring) => rings.push(ring),
  });
  session.start();
});

describe('PresenceSession: roster (E7-S1, E7-S2)', () => {
  it('fills the store from the snapshot, restoring the chosen status', () => {
    events.emit(
      'world:snapshot',
      snapshot({ self: player({ userId: 'user-1', displayName: 'Ana', status: 'busy' }) }),
    );

    const state = store.getState();
    expect(state.selfId).toBe('user-1');
    expect(state.status).toBe('busy');
    expect(Object.keys(state.people).sort()).toEqual(['user-1', 'user-2']);
  });

  it('follows joined, changed and left, and ignores steps', () => {
    events.emit('world:snapshot', snapshot());
    const before = store.getState().people;

    events.emit('world:delta', {
      moved: [{ userId: 'user-2', x: 2, y: 3, dir: 'right' }],
      joined: [],
      left: [],
      changed: [],
    });
    expect(store.getState().people).toBe(before);

    events.emit('world:delta', {
      moved: [],
      joined: [player({ userId: 'user-3', displayName: 'Eva' })],
      left: ['user-2'],
      changed: [{ userId: 'user-1', away: true, roomId: 'sala' }],
    });
    const { people } = store.getState();
    expect(Object.keys(people).sort()).toEqual(['user-1', 'user-3']);
    expect(people['user-1']).toMatchObject({ away: true, roomId: 'sala', status: 'available' });
  });
});

describe('PresenceSession: status and away (E7-S1)', () => {
  it('sends the chosen status', () => {
    session.setStatus('busy');

    expect(store.getState().status).toBe('busy');
    expect(client.sent).toEqual([{ event: 'player:status', payload: { status: 'busy' } }]);
  });

  it('sends away changes once and tells the media feature (presence:self-away)', () => {
    session.setAway(true);
    session.setAway(true);
    session.setAway(false);

    expect(client.sent.map((sent) => sent.payload)).toEqual([{ away: true }, { away: false }]);
    expect(selfAway).toEqual([true, false]);
  });

  it('tells the media feature when the tab is hidden or shown (presence:self-hidden), once', () => {
    const hidden: boolean[] = [];
    events.on('presence:self-hidden', (event) => hidden.push(event.hidden));

    session.setHidden(true);
    session.setHidden(true);
    session.setHidden(false);

    expect(hidden).toEqual([true, false]);
    expect(client.sent).toEqual([]);
  });

  it('keeps changes made outside the space and sends them after the next snapshot', () => {
    joined = false;
    session.setAway(true);
    session.setStatus('busy');
    expect(client.sent).toEqual([]);
    // The media are muted at once, even while reconnecting.
    expect(selfAway).toEqual([true]);

    joined = true;
    events.emit('world:snapshot', snapshot());

    expect(client.sent).toEqual([
      { event: 'player:away', payload: { away: true } },
      { event: 'player:status', payload: { status: 'busy' } },
    ]);
    expect(store.getState().status).toBe('busy');
  });

  it('does not resend what the server already has', () => {
    session.setAway(true);
    client.sent.length = 0;

    events.emit(
      'world:snapshot',
      snapshot({ self: player({ userId: 'user-1', displayName: 'Ana', away: true }) }),
    );

    expect(client.sent).toEqual([]);
  });
});

describe('PresenceSession: ring (E7-S5) and cleanup', () => {
  it('hands incoming rings to onRing', () => {
    const ring = { fromUserId: 'user-2', fromDisplayName: 'Luis', silent: true };

    client.serverEmit('ring:received', ring);

    expect(rings).toEqual([ring]);
  });

  it('removes every listener and empties the store on stop', () => {
    events.emit('world:snapshot', snapshot());
    expect(client.listenerCount()).toBe(1);

    session.stop();
    client.serverEmit('ring:received', { fromUserId: 'x', fromDisplayName: 'X', silent: false });

    expect(rings).toEqual([]);
    expect(client.listenerCount()).toBe(0);
    expect(events.listenerCount('world:snapshot')).toBe(0);
    expect(store.getState().people).toEqual({});
  });
});
