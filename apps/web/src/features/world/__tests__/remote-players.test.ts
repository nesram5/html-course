import { TICK_MS } from '@plaza/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  RECONNECTING_ALPHA,
  REMOTE_FADE_MS,
  REMOTE_MOVE_MS,
  REMOTE_WALK_GRACE_MS,
  RemotePlayersModel,
  mergeChanged,
  type RemotePlayer,
  type RemotePlayersRenderer,
} from '../game/remote/remote-players';
import { StressDriver } from '../game/remote/stress';
import { ABOVE_DEPTH, AVATAR_BASE_DEPTH, avatarDepth, labelDepth } from '../game/sprites/depth';
import { testDelta, testMap, testPlayer } from './fixtures';

/** Records what a renderer would draw: the last rendered values per player. */
class FakeRenderer implements RemotePlayersRenderer {
  readonly created: string[] = [];
  readonly destroyed: string[] = [];
  readonly drawn = new Map<
    string,
    { x: number; y: number; alpha: number; moving: boolean; dir: string }
  >();

  create(player: RemotePlayer): void {
    this.created.push(player.userId);
  }

  render(player: RemotePlayer): void {
    this.drawn.set(player.userId, {
      x: player.x,
      y: player.y,
      alpha: player.alpha,
      moving: player.moving,
      dir: player.dir,
    });
  }

  destroy(player: RemotePlayer): void {
    this.destroyed.push(player.userId);
    this.drawn.delete(player.userId);
  }
}

const SELF = 'user-1';
let renderer: FakeRenderer;
let model: RemotePlayersModel;

function drawn(userId = 'user-2') {
  const value = renderer.drawn.get(userId);
  if (value === undefined) throw new Error(`${userId} is not drawn`);
  return value;
}

/** Luis at (1, 3), fully faded in at t = 1000. */
function withLuis(): void {
  model.reset([testPlayer()], 0, SELF);
  model.update(1000);
}

beforeEach(() => {
  renderer = new FakeRenderer();
  model = new RemotePlayersModel(renderer);
});

describe('RemotePlayersModel: snapshot and joins (E4-S1, E4-S5)', () => {
  it('draws everyone in the snapshot except me, fading in', () => {
    model.reset(
      [testPlayer(), testPlayer({ userId: SELF }), testPlayer({ userId: 'user-3' })],
      0,
      SELF,
    );

    expect(renderer.created).toEqual(['user-2', 'user-3']);
    model.update(0);
    expect(drawn().alpha).toBe(0);
    model.update(REMOTE_FADE_MS / 2);
    expect(drawn().alpha).toBeCloseTo(0.5);
    model.update(REMOTE_FADE_MS);
    expect(drawn()).toMatchObject({ x: 1, y: 3, alpha: 1, moving: false });
  });

  it('fades out who left and destroys the sprite at the end of the fade', () => {
    withLuis();

    model.applyDelta(testDelta({ left: ['user-2'] }), 1000);
    model.update(1000 + REMOTE_FADE_MS / 2);
    expect(drawn().alpha).toBeCloseTo(0.5);
    model.update(1000 + REMOTE_FADE_MS);

    expect(renderer.destroyed).toEqual(['user-2']);
    expect(model.size).toBe(0);
  });

  it('brings back someone who rejoins while fading out, without a new sprite', () => {
    withLuis();
    model.applyDelta(testDelta({ left: ['user-2'] }), 1000);
    model.update(1000 + REMOTE_FADE_MS / 2);

    model.applyDelta(testDelta({ joined: [testPlayer({ x: 2 })] }), 1000 + REMOTE_FADE_MS / 2);
    model.update(1000 + REMOTE_FADE_MS * 2);

    expect(renderer.created).toEqual(['user-2']);
    expect(renderer.destroyed).toEqual([]);
    expect(drawn()).toMatchObject({ x: 2, alpha: 1 });
  });

  it('ignores myself in joined and moved', () => {
    withLuis();

    model.applyDelta(
      testDelta({
        joined: [testPlayer({ userId: SELF })],
        moved: [{ userId: SELF, x: 2, y: 1, dir: 'right' }],
      }),
      1000,
    );

    expect(renderer.created).toEqual(['user-2']);
    expect(model.get(SELF)).toBeUndefined();
  });

  it('on a reconnection snapshot: new people fade in, missing ones out, the rest jump', () => {
    withLuis();
    model.reset([testPlayer({ x: 4, y: 3 }), testPlayer({ userId: 'user-3' })], 2000, SELF);
    model.update(2000);

    expect(drawn()).toMatchObject({ x: 4, y: 3, alpha: 1 });
    expect(drawn('user-3').alpha).toBe(0);

    model.reset([testPlayer({ userId: 'user-3' })], 3000, SELF);
    model.update(3000 + REMOTE_FADE_MS);
    expect(renderer.destroyed).toEqual(['user-2']);
  });
});

describe('RemotePlayersModel: movement (E4-S5)', () => {
  it('walks to the new tile over one tick, with the walk animation, facing the move', () => {
    withLuis();

    model.applyDelta(testDelta({ moved: [{ userId: 'user-2', x: 2, y: 3, dir: 'right' }] }), 1000);
    model.update(1000 + REMOTE_MOVE_MS / 2);
    expect(drawn()).toMatchObject({ y: 3, moving: true, dir: 'right' });
    expect(drawn().x).toBeCloseTo(1.5);

    model.update(1000 + REMOTE_MOVE_MS);
    expect(drawn()).toMatchObject({ x: 2, y: 3, moving: true });
    model.update(1000 + REMOTE_MOVE_MS + REMOTE_WALK_GRACE_MS);
    expect(drawn()).toMatchObject({ x: 2, y: 3, moving: false });
    expect(REMOTE_MOVE_MS).toBe(TICK_MS);
  });

  it('starts the next step from where the avatar is drawn (no jumps)', () => {
    withLuis();
    model.applyDelta(testDelta({ moved: [{ userId: 'user-2', x: 2, y: 3, dir: 'right' }] }), 1000);
    model.update(1000 + REMOTE_MOVE_MS / 2);

    model.applyDelta(
      testDelta({ moved: [{ userId: 'user-2', x: 3, y: 3, dir: 'right' }] }),
      1000 + REMOTE_MOVE_MS / 2,
    );
    model.update(1000 + REMOTE_MOVE_MS / 2);
    expect(drawn().x).toBeCloseTo(1.5);
    model.update(1000 + REMOTE_MOVE_MS * 1.5);
    expect(drawn().x).toBe(3);
  });

  it('turning in place changes the direction without walking', () => {
    withLuis();

    model.applyDelta(testDelta({ moved: [{ userId: 'user-2', x: 1, y: 3, dir: 'up' }] }), 1000);
    model.update(1000);

    expect(drawn()).toMatchObject({ x: 1, y: 3, dir: 'up', moving: false });
  });

  it('snaps on long moves (server-decided positions)', () => {
    withLuis();

    model.applyDelta(testDelta({ moved: [{ userId: 'user-2', x: 9, y: 9, dir: 'down' }] }), 1000);
    model.update(1000);

    expect(drawn()).toMatchObject({ x: 9, y: 9, moving: false });
  });

  it('sorts avatars by row and keeps names over the "above" art', () => {
    expect(avatarDepth(3)).toBeLessThan(avatarDepth(4));
    expect(avatarDepth(3.4)).toBe(avatarDepth(3));
    expect(avatarDepth(0)).toBeGreaterThanOrEqual(AVATAR_BASE_DEPTH);
    expect(avatarDepth(10_000)).toBeLessThan(ABOVE_DEPTH);
    expect(labelDepth(0)).toBeGreaterThan(ABOVE_DEPTH);
    expect(labelDepth(3)).toBeLessThan(labelDepth(4));
  });
});

describe('RemotePlayersModel: changes (E4-S6)', () => {
  it('draws a reconnecting person semi-transparent until they are back', () => {
    withLuis();

    model.applyDelta(testDelta({ changed: [{ userId: 'user-2', reconnecting: true }] }), 1000);
    model.update(1000);
    expect(drawn().alpha).toBe(RECONNECTING_ALPHA);

    model.applyDelta(testDelta({ changed: [{ userId: 'user-2', reconnecting: false }] }), 2000);
    model.update(2000);
    expect(drawn().alpha).toBe(1);
  });

  it('merges only the changed fields', () => {
    const merged = mergeChanged(testPlayer({ roomId: 'sala' }), {
      userId: 'user-2',
      displayName: 'Luis M.',
      roomId: null,
    });

    expect(merged).toEqual(testPlayer({ displayName: 'Luis M.', roomId: null }));
  });

  it('clear() destroys every sprite', () => {
    model.reset([testPlayer(), testPlayer({ userId: 'user-3' })], 0, SELF);

    model.clear();

    expect(renderer.destroyed.sort()).toEqual(['user-2', 'user-3']);
    expect(model.size).toBe(0);
  });
});

describe('StressDriver (development stress mode)', () => {
  it('creates people on walkable tiles who move one tile at a time', () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    const map = testMap();
    const driver = new StressDriver(map, 5, random);
    const players = driver.players();
    expect(players).toHaveLength(5);
    const walkable = (x: number, y: number) => map.collisionGrid[y * map.width + x] === 0;
    for (const player of players) expect(walkable(player.x, player.y)).toBe(true);

    const positions = new Map(players.map((player) => [player.userId, player]));
    for (let tick = 0; tick < 50; tick++) {
      for (const moved of driver.tick().moved) {
        const before = positions.get(moved.userId);
        if (before === undefined) throw new Error('unknown player');
        expect(Math.abs(moved.x - before.x) + Math.abs(moved.y - before.y)).toBeLessThanOrEqual(1);
        expect(walkable(moved.x, moved.y)).toBe(true);
        positions.set(moved.userId, { ...before, x: moved.x, y: moved.y });
      }
    }
  });
});
