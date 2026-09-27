import { describe, expect, it } from 'vitest';

import type { LocalStep } from '../bridge/event-bus';
import { STEP_MS } from '../game/constants';
import { LocalPlayerController, pickSpawn } from '../game/controller/local-player-controller';
import { testMap } from './fixtures';

function setup(start = { x: 1, y: 3 }) {
  const steps: LocalStep[] = [];
  const controller = new LocalPlayerController({
    map: testMap(),
    start,
    onStep: (step) => steps.push(step),
  });
  return { controller, steps };
}

describe('LocalPlayerController', () => {
  it('walks one tile in ~120 ms, interpolating the drawn position', () => {
    const { controller, steps } = setup();

    controller.press('right');
    controller.update(0);

    expect(steps).toEqual([{ x: 2, y: 3, dir: 'right' }]);
    expect(controller.snapshot).toMatchObject({
      tile: { x: 2, y: 3 },
      moving: true,
      position: { x: 1, y: 3 },
    });

    controller.update(STEP_MS / 2);
    expect(controller.snapshot.position).toEqual({ x: 1.5, y: 3 });

    controller.release('right');
    controller.update(STEP_MS / 2);
    expect(controller.snapshot).toMatchObject({
      tile: { x: 2, y: 3 },
      moving: false,
      dir: 'right',
      position: { x: 2, y: 3 },
    });
    expect(steps).toHaveLength(1);
  });

  it('keeps walking while the key is held, one step per STEP_MS', () => {
    const { controller, steps } = setup();

    controller.press('right');
    for (let i = 0; i < 20; i++) controller.update(STEP_MS / 4); // 5 steps worth of time

    expect(steps.map((s) => s.x)).toEqual([2, 3, 4]);
    // Blocked by the wall at x = 5: stays on x = 4 without more steps.
    expect(controller.snapshot.tile).toEqual({ x: 4, y: 3 });
  });

  it('carries left-over time so continuous walking keeps an exact pace', () => {
    const { controller, steps } = setup();

    controller.press('right');
    controller.update(0);
    controller.update(STEP_MS * 1.5);

    expect(steps.map((s) => s.x)).toEqual([2, 3]);
    expect(controller.snapshot.position.x).toBeCloseTo(2.5);
  });

  it('stays idle facing the last direction after releasing the key', () => {
    const { controller } = setup();

    controller.press('up');
    controller.update(0);
    controller.release('up');
    controller.update(STEP_MS);
    controller.update(STEP_MS);

    expect(controller.snapshot).toMatchObject({ tile: { x: 1, y: 2 }, dir: 'up', moving: false });
  });

  it('turns but does not advance into a wall, emitting a same-tile step once', () => {
    const { controller, steps } = setup({ x: 1, y: 1 });

    controller.press('up');
    controller.update(16);
    controller.update(16);

    expect(controller.snapshot).toMatchObject({ tile: { x: 1, y: 1 }, dir: 'up', moving: false });
    expect(steps).toEqual([{ x: 1, y: 1, dir: 'up' }]);
  });

  it('does not emit anything when pushing a wall it already faces', () => {
    const { controller, steps } = setup({ x: 1, y: 3 });

    controller.press('down'); // wall below, already facing down
    controller.update(16);

    expect(steps).toEqual([]);
  });

  it('uses isWalkable for collisions: furniture blocks, rooms do not', () => {
    const { controller, steps } = setup({ x: 1, y: 2 });

    controller.press('right'); // (2,2) is blocked
    controller.update(16);
    expect(controller.snapshot.tile).toEqual({ x: 1, y: 2 });

    controller.release('right');
    controller.teleport({ x: 2, y: 1 });
    controller.press('right'); // (3,1) is inside the room
    controller.update(16);
    expect(steps.at(-1)).toEqual({ x: 3, y: 1, dir: 'right' });
  });

  it('honours a quick tap that happened between two frames', () => {
    const { controller, steps } = setup();

    controller.press('right');
    controller.release('right');
    controller.update(16);

    expect(steps).toEqual([{ x: 2, y: 3, dir: 'right' }]);
  });

  it('follows the most recently pressed direction and falls back when it is released', () => {
    const { controller, steps } = setup({ x: 3, y: 3 });

    controller.press('right');
    controller.press('up');
    controller.update(0);
    expect(steps.at(-1)?.dir).toBe('up');

    controller.release('up');
    controller.update(STEP_MS);
    expect(steps.at(-1)).toEqual({ x: 4, y: 2, dir: 'right' });
  });

  it('stops when every key is released at once (focus moved to a text field)', () => {
    const { controller, steps } = setup();

    controller.press('right');
    controller.update(0);
    controller.releaseAll();
    controller.update(STEP_MS * 3);

    expect(steps).toHaveLength(1);
    expect(controller.snapshot.moving).toBe(false);
  });

  it('teleports without emitting a step (server corrections)', () => {
    const { controller, steps } = setup();

    controller.teleport({ x: 4, y: 1 }, 'left');

    expect(controller.snapshot).toMatchObject({ tile: { x: 4, y: 1 }, dir: 'left', moving: false });
    expect(steps).toEqual([]);
  });
});

describe('pickSpawn', () => {
  it('returns one of the spawn points of the map', () => {
    const map = testMap();
    expect(pickSpawn(map, () => 0)).toEqual({ x: 1, y: 1 });
    expect(pickSpawn(map, () => 0.99)).toEqual({ x: 1, y: 3 });
  });

  it('fails clearly on a map without spawns', () => {
    expect(() => pickSpawn({ ...testMap(), spawns: [] })).toThrow(/no spawn points/);
  });
});
