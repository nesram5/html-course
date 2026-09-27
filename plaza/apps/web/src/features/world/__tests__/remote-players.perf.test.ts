import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { MAX_PLAYERS_PER_SPACE, TICK_MS } from '@plaza/shared';
import { describe, expect, it } from 'vitest';

import {
  RemotePlayersModel,
  type RemotePlayer,
  type RemotePlayersRenderer,
} from '../game/remote/remote-players';
import { StressDriver } from '../game/remote/stress';
import { testMap } from './fixtures';

/**
 * E4-S5 "60 fps with 50 avatars": the per-frame work of the remote players must not allocate,
 * so the garbage collector never interrupts the frame loop. The model is driven like in the
 * scene (a `world:delta` per tick, `update()` every frame) with 50 walking people.
 */

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

/** A renderer that reads every field, like the Phaser one, without allocating. */
class CountingRenderer implements RemotePlayersRenderer {
  checksum = 0;
  readonly seen = new Set<RemotePlayer>();

  create(player: RemotePlayer): void {
    this.seen.add(player);
  }

  render(player: RemotePlayer): void {
    this.checksum += player.x + player.y + player.alpha + (player.moving ? 1 : 0);
  }

  destroy(): void {
    // Nothing to free.
  }
}

/** Negative control: keeps one small object per rendered avatar, as a careless renderer would. */
class LeakyRenderer extends CountingRenderer {
  readonly kept: { x: number; y: number }[] = [];

  override render(player: RemotePlayer): void {
    this.kept.push({ x: player.x, y: player.y });
  }
}

const FRAME_MS = 1000 / 60;
const FRAMES = 1000;

function openMap() {
  // 40×30 open floor surrounded by walls.
  const width = 40;
  const height = 30;
  const grid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) grid[y * width + x] = 1;
    }
  }
  return { ...testMap(), width, height, collisionGrid: grid, rooms: [] };
}

/**
 * Runs 50 walking avatars, then measures `FRAMES` frames: heap growth (after a full GC) and
 * time per frame. A new tick of moves arrives every 4 frames, pre-computed so that only the
 * per-frame path runs in the measured loop.
 */
function measure(renderer: CountingRenderer) {
  const model = new RemotePlayersModel(renderer);
  const driver = new StressDriver(openMap(), MAX_PLAYERS_PER_SPACE);
  model.reset(driver.players(), 0, 'me');
  const deltas = Array.from({ length: FRAMES / 4 + 100 }, () => driver.tick());
  let now = 0;
  // Warm up: let the JIT optimise update() and settle every entry's fields.
  for (const delta of deltas.slice(0, 100)) {
    model.applyDelta(delta, now);
    for (let frame = 0; frame < 4; frame++) model.update((now += FRAME_MS));
  }
  gc();
  let grownBytes = 0;
  let frameTime = 0;
  for (const tick of deltas.slice(100)) {
    // Ticks are the network path (15 Hz, may allocate): applied outside the measurement.
    model.applyDelta(tick, now);
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    for (let frame = 0; frame < 4; frame++) model.update((now += TICK_MS / 4));
    frameTime += performance.now() - started;
    grownBytes += process.memoryUsage().heapUsed - heapBefore;
    // Same two probes around nothing: what measuring itself allocates.
    const idleBefore = process.memoryUsage().heapUsed;
    grownBytes -= process.memoryUsage().heapUsed - idleBefore;
  }
  return { model, grownBytes, msPerFrame: frameTime / FRAMES };
}

describe('RemotePlayersModel performance (E4-S5)', () => {
  it('updates 50 walking avatars every frame without allocating', () => {
    const renderer = new CountingRenderer();
    const { model, grownBytes, msPerFrame } = measure(renderer);

    expect(model.size).toBe(MAX_PLAYERS_PER_SPACE);
    expect(renderer.seen.size).toBe(MAX_PLAYERS_PER_SPACE);
    expect(renderer.checksum).toBeGreaterThan(0);
    // The frame loop allocates nothing: measured 20-50 KB of V8 bookkeeping over 1000 frames
    // × 50 avatars (< 1 byte per avatar and frame). One object per avatar per frame is > 1.5 MB.
    expect(grownBytes).toBeLessThan(128 * 1024);
    // A tiny share of the 16.7 ms frame budget (generous bound for slow CI machines).
    expect(msPerFrame).toBeLessThan(1);
  });

  it('detects a renderer that allocates per frame (control for the measurement)', () => {
    const { grownBytes } = measure(new LeakyRenderer());

    expect(grownBytes).toBeGreaterThan(1024 * 1024);
  });

  it('keeps the same player objects across ticks (reused, never re-created)', () => {
    const renderer = new CountingRenderer();
    const model = new RemotePlayersModel(renderer);
    const driver = new StressDriver(openMap(), MAX_PLAYERS_PER_SPACE);
    model.reset(driver.players(), 0, 'me');
    const first = [...model.players()];

    let now = 0;
    for (let tick = 0; tick < 100; tick++) {
      model.applyDelta(driver.tick(), now);
      for (let frame = 0; frame < 4; frame++) model.update((now += TICK_MS / 4));
    }

    expect(renderer.seen.size).toBe(MAX_PLAYERS_PER_SPACE);
    expect(new Set(model.players())).toEqual(new Set(first));
  });
});
