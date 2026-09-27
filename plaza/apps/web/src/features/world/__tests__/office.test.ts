import type { DeskArea, DeskState } from '@plaza/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBus } from '../bridge/event-bus';
import { deskCenter, deskDrawings } from '../game/office/desk-drawings';
import { createConnectionStore } from '../realtime/connection-store';
import { RealtimeClient } from '../realtime/realtime-client';
import { SpaceSession, createSessionStore } from '../realtime/space-session';
import { createOfficeStore, deskOfUser, type OfficeStore } from '../store/office-store';
import { createWorldStore } from '../store/world-store';
import { FakeSocket } from './fake-socket';
import { testSnapshot } from './fixtures';

const LUIS_DESK: DeskState = {
  deskId: 'desk-01',
  userId: 'user-2',
  displayName: 'Luis',
  decor: { slots: ['plant', null, 'lamp'] },
};

const AREAS: DeskArea[] = [
  {
    deskId: 'desk-01',
    x: 2,
    y: 3,
    width: 2,
    height: 1,
    decorSlots: [
      { x: 80, y: 112 },
      { x: 96, y: 112 },
      { x: 112, y: 112 },
    ],
  },
  { deskId: 'desk-02', x: 6, y: 3, width: 1, height: 1, decorSlots: [] },
];

describe('office store (E9)', () => {
  let office: OfficeStore;

  beforeEach(() => {
    office = createOfficeStore();
  });

  it('keeps held desks by id and forgets freed ones', () => {
    office.getState().applySnapshot('night', [LUIS_DESK]);
    expect(office.getState()).toMatchObject({ themeId: 'night', desks: { 'desk-01': LUIS_DESK } });
    expect(deskOfUser(office.getState(), 'user-2')).toEqual(LUIS_DESK);

    office.getState().applyDesk({ ...LUIS_DESK, decor: null });
    expect(office.getState().desks['desk-01']?.decor).toBeNull();
    office
      .getState()
      .applyDesk({ deskId: 'desk-01', userId: null, displayName: null, decor: null });
    expect(office.getState().desks).toEqual({});
    expect(deskOfUser(office.getState(), 'user-2')).toBeNull();
  });
});

describe('office sync with the realtime session (E9)', () => {
  function start() {
    const socket = new FakeSocket();
    const client = new RealtimeClient({
      createSocket: () => socket.asSocket(),
      store: createConnectionStore(),
      onInvalidEvent: vi.fn(),
    });
    const world = createWorldStore();
    const office = createOfficeStore();
    const session = new SpaceSession({
      spaceId: 'space-1',
      client,
      events: new EventBus(),
      world,
      store: createSessionStore(),
      office,
    });
    session.start();
    socket.accept();
    world.getState().setLoad({ kind: 'ready' });
    return { socket, office, session };
  }

  it('takes the style and desks of the snapshot, then space:theme and desk:updated', async () => {
    const { socket, office, session } = start();
    socket
      .lastAck('space:join')
      .resolve({ ok: true, data: testSnapshot({ themeId: 'night', desks: [LUIS_DESK] }) });
    await vi.waitFor(() => {
      expect(office.getState().themeId).toBe('night');
    });
    expect(office.getState().desks).toEqual({ 'desk-01': LUIS_DESK });

    socket.serverEmit('space:theme', { themeId: 'watercolor' });
    socket.serverEmit('desk:updated', {
      deskId: 'desk-02',
      userId: 'user-1',
      displayName: 'Ana',
      decor: null,
    });
    socket.serverEmit('desk:updated', {
      deskId: 'desk-01',
      userId: null,
      displayName: null,
      decor: null,
    });

    expect(office.getState().themeId).toBe('watercolor');
    expect(Object.keys(office.getState().desks)).toEqual(['desk-02']);

    session.stop();
    expect(office.getState()).toMatchObject({ themeId: null, desks: {} });
  });
});

describe('meeting rooms in the office store (E6-S2)', () => {
  const SALA = {
    areaId: 'sala-1',
    name: 'Sala 1',
    meetUri: null,
    source: null,
  } as const;

  it('takes the rooms of the snapshot, then the Meet links of room:updated', async () => {
    const socket = new FakeSocket();
    const client = new RealtimeClient({
      createSocket: () => socket.asSocket(),
      store: createConnectionStore(),
      onInvalidEvent: vi.fn(),
    });
    const world = createWorldStore();
    const office = createOfficeStore();
    const session = new SpaceSession({
      spaceId: 'space-1',
      client,
      events: new EventBus(),
      world,
      store: createSessionStore(),
      office,
    });
    session.start();
    socket.accept();
    world.getState().setLoad({ kind: 'ready' });
    socket.lastAck('space:join').resolve({ ok: true, data: testSnapshot({ rooms: [SALA] }) });
    await vi.waitFor(() => {
      expect(office.getState().rooms).toEqual({ 'sala-1': SALA });
    });

    const withLink = {
      ...SALA,
      meetUri: 'https://meet.google.com/abc-defg-hij',
      source: 'manual',
    } as const;
    socket.serverEmit('room:updated', withLink);

    expect(office.getState().rooms['sala-1']).toEqual(withLink);
    session.stop();
    expect(office.getState().rooms).toEqual({});
  });
});

describe('deskDrawings (E9-S2, E9-S3)', () => {
  it('draws the name over held desks and their objects in the slots', () => {
    const drawings = deskDrawings(AREAS, { 'desk-01': LUIS_DESK }, null);

    expect(drawings).toEqual([
      {
        deskId: 'desk-01',
        label: 'Luis',
        labelX: 2 * 32 + 32,
        labelY: 3 * 32 - 2,
        items: [
          { slot: 0, itemId: 'plant', x: 80, y: 112 },
          { slot: 2, itemId: 'lamp', x: 112, y: 112 },
        ],
      },
    ]);
  });

  it('shows the decoration being chosen instead of the saved one', () => {
    const preview = { deskId: 'desk-01', decor: { slots: [null, 'cat', null] } };

    const [drawing] = deskDrawings(AREAS, { 'desk-01': LUIS_DESK }, preview);

    expect(drawing?.items).toEqual([{ slot: 1, itemId: 'cat', x: 96, y: 112 }]);
  });

  it('ignores desks that are not in the map and centers the camera on a desk', () => {
    expect(deskDrawings(AREAS, { 'desk-99': { ...LUIS_DESK, deskId: 'desk-99' } }, null)).toEqual(
      [],
    );
    expect(deskCenter(AREAS[0] as DeskArea)).toEqual({ x: 96, y: 112 });
  });
});
