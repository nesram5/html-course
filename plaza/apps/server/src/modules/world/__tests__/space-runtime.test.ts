import type { WorldMap } from '@plaza/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import { packageMapsCatalog } from '../../../test/maps-fixture.js';
import { SpaceRuntime, type NewPlayer } from '../space-runtime.js';

// office-small@1: spawns (11..14, 25); meeting room "sala-reuniones" entered from (27,6) → (28,6);
// wall at (11,29); desk-01 at (3,5) with its spawn tile at (2,5).
let map: WorldMap;

beforeAll(async () => {
  map = await packageMapsCatalog().worldMap('office-small@1');
});

function newPlayer(userId: string): NewPlayer {
  return {
    userId,
    displayName: `Name ${userId}`,
    avatarId: 'avatar-01',
    status: 'available',
    away: false,
    inConversation: false,
  };
}

function runtimeWith(...userIds: string[]): SpaceRuntime {
  const runtime = new SpaceRuntime('space-1', 'office-small@1', map);
  for (const userId of userIds) {
    runtime.join(newPlayer(userId), runtime.spawnFor(null), `socket-${userId}`);
  }
  runtime.flush();
  return runtime;
}

describe('SpaceRuntime', () => {
  describe('spawn (E4-S1, E9-S2)', () => {
    it('hands out the map spawns in turn', () => {
      const runtime = new SpaceRuntime('space-1', 'office-small@1', map);

      const spawns = Array.from({ length: 5 }, () => runtime.spawnFor(null));

      expect(spawns).toEqual([
        { x: 11, y: 25 },
        { x: 12, y: 25 },
        { x: 13, y: 25 },
        { x: 14, y: 25 },
        { x: 11, y: 25 },
      ]);
    });

    it('spawns next to the desk of the person, and on a map spawn for unknown desks', () => {
      const runtime = new SpaceRuntime('space-1', 'office-small@1', map);

      expect(runtime.spawnFor('desk-01')).toEqual({ x: 2, y: 5 });
      expect(runtime.spawnFor('desk-99')).toEqual({ x: 11, y: 25 });
    });

    it('joins facing down, in the hallway, connected', () => {
      const runtime = new SpaceRuntime('space-1', 'office-small@1', map);

      const state = runtime.join(newPlayer('ana'), { x: 11, y: 25 }, 'socket-ana');

      expect(state).toMatchObject({ x: 11, y: 25, dir: 'down', roomId: null, reconnecting: false });
      expect(() => runtime.join(newPlayer('ana'), { x: 11, y: 25 }, 's')).toThrow(/already/);
      expect(runtime.size).toBe(1);
      expect(runtime.connectedCount).toBe(1);
    });
  });

  describe('movement (E4-S3)', () => {
    it('accepts a step to an adjacent walkable tile and turning in place', () => {
      const runtime = runtimeWith('ana');

      expect(runtime.move('ana', { x: 11, y: 26, dir: 'down' })).toEqual({ ok: true });
      expect(runtime.move('ana', { x: 11, y: 26, dir: 'left' })).toEqual({ ok: true });
      expect(runtime.get('ana')).toMatchObject({ x: 11, y: 26, dir: 'left' });
    });

    it('rejects teleports and walls, keeping the position to correct the client', () => {
      const runtime = runtimeWith('ana');

      expect(runtime.move('ana', { x: 13, y: 25, dir: 'right' })).toEqual({
        ok: false,
        reason: 'not-adjacent',
        x: 11,
        y: 25,
      });
      runtime.place('ana', { x: 11, y: 28 });
      expect(runtime.move('ana', { x: 11, y: 29, dir: 'down' })).toEqual({
        ok: false,
        reason: 'blocked',
        x: 11,
        y: 28,
      });
      expect(runtime.get('ana')).toMatchObject({ x: 11, y: 28 });
    });

    it('lets two avatars share a tile (RN-10)', () => {
      const runtime = runtimeWith('ana', 'luis');

      expect(runtime.move('luis', { x: 11, y: 25, dir: 'left' })).toEqual({ ok: true });
      expect(runtime.get('luis')).toMatchObject({ x: 11, y: 25 });
      expect(runtime.get('ana')).toMatchObject({ x: 11, y: 25 });
    });

    it('recomputes roomId when entering and leaving a meeting room', () => {
      const runtime = runtimeWith('ana');
      runtime.place('ana', { x: 27, y: 6 });
      runtime.flush();

      const entered = runtime.move('ana', { x: 28, y: 6, dir: 'right' });
      const inRoom = runtime.flush();
      const left = runtime.move('ana', { x: 27, y: 6, dir: 'left' });

      expect(entered).toEqual({ ok: true, roomChanged: { roomId: 'sala-reuniones' } });
      expect(inRoom?.changed).toEqual([{ userId: 'ana', roomId: 'sala-reuniones' }]);
      expect(left).toEqual({ ok: true, roomChanged: { roomId: null } });
      expect(runtime.get('ana')?.roomId).toBeNull();
    });

    it('refuses to place an avatar on a blocked tile', () => {
      const runtime = runtimeWith('ana');

      expect(() => runtime.place('ana', { x: 0, y: 0 })).toThrow(/not walkable/);
      expect(() => runtime.move('nobody', { x: 1, y: 1, dir: 'up' })).toThrow(/not in space/);
    });
  });

  describe('deltas (E4-S4)', () => {
    it('batches every change of a tick in one delta and returns null when idle', () => {
      const runtime = runtimeWith('ana', 'luis');

      runtime.move('ana', { x: 11, y: 26, dir: 'down' });
      runtime.move('ana', { x: 11, y: 27, dir: 'down' });
      runtime.move('luis', { x: 12, y: 24, dir: 'up' });
      runtime.update('luis', { status: 'busy' });
      runtime.update('luis', { away: true, status: 'busy' });

      expect(runtime.flush()).toEqual({
        moved: [
          { userId: 'ana', x: 11, y: 27, dir: 'down' },
          { userId: 'luis', x: 12, y: 24, dir: 'up' },
        ],
        joined: [],
        left: [],
        changed: [{ userId: 'luis', status: 'busy', away: true }],
      });
      expect(runtime.hasPendingChanges).toBe(false);
      expect(runtime.flush()).toBeNull();
    });

    it('does not report fields that did not change', () => {
      const runtime = runtimeWith('ana');

      runtime.update('ana', { status: 'available', away: false });

      expect(runtime.flush()).toBeNull();
    });

    it('announces arrivals whole (with their latest position) and departures', () => {
      const runtime = runtimeWith('ana');

      runtime.join(newPlayer('luis'), { x: 12, y: 25 }, 'socket-luis');
      runtime.move('luis', { x: 12, y: 24, dir: 'up' });
      runtime.update('luis', { status: 'busy' });
      runtime.leave('ana');
      const delta = runtime.flush();

      // Also as steps and changes, for whoever got Luis in a snapshot during the tick.
      expect(delta?.moved).toEqual([{ userId: 'luis', x: 12, y: 24, dir: 'up' }]);
      expect(delta?.changed).toEqual([{ userId: 'luis', status: 'busy' }]);
      expect(delta?.left).toEqual(['ana']);
      expect(delta?.joined).toEqual([
        expect.objectContaining({ userId: 'luis', x: 12, y: 24, dir: 'up', status: 'busy' }),
      ]);
      expect(runtime.players().map((p) => p.userId)).toEqual(['luis']);
    });

    it('announces in left someone who joined and left within the same tick', () => {
      const runtime = runtimeWith('ana');

      runtime.join(newPlayer('luis'), { x: 12, y: 25 }, 'socket-luis');
      // Eva's snapshot has Luis: she must hear that he left.
      runtime.join(newPlayer('eva'), { x: 13, y: 25 }, 'socket-eva');
      runtime.leave('luis');
      runtime.leave('nobody');
      const delta = runtime.flush();

      expect(delta?.joined.map((p) => p.userId)).toEqual(['eva']);
      expect(delta?.left).toEqual(['luis']);
    });

    it('re-announces whole someone who left and came back within the same tick', () => {
      const runtime = runtimeWith('ana', 'luis');

      runtime.leave('luis');
      runtime.join(newPlayer('eva'), { x: 12, y: 25 }, 'socket-eva');
      runtime.join(newPlayer('luis'), { x: 13, y: 25 }, 'socket-luis-2');
      const delta = runtime.flush();

      expect(delta?.left).toEqual([]);
      // Luis is the last arrival: Eva, whose snapshot missed him, gets him too.
      expect(delta?.joined.map((p) => [p.userId, p.x, p.y])).toEqual([
        ['eva', 12, 25],
        ['luis', 13, 25],
      ]);
    });
  });

  describe('reconnection (E4-S6)', () => {
    it('flags a lost connection as reconnecting and clears it when the person is back', () => {
      const runtime = runtimeWith('ana', 'luis');

      runtime.disconnect('luis');
      const lost = runtime.flush();
      const whileLost = { connected: runtime.connectedCount, socket: runtime.socketOf('luis') };
      runtime.reconnect('luis', 'socket-luis-2');
      const back = runtime.flush();

      expect(lost?.changed).toEqual([{ userId: 'luis', reconnecting: true }]);
      expect(whileLost).toEqual({ connected: 1, socket: null });
      expect(back?.changed).toEqual([{ userId: 'luis', reconnecting: false }]);
      expect(runtime.connections()).toEqual([
        { userId: 'ana', socketId: 'socket-ana' },
        { userId: 'luis', socketId: 'socket-luis-2' },
      ]);
    });
  });
});
