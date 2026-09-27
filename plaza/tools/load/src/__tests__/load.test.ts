import { isWalkable, type WorldMap } from '@plaza/shared';
import { describe, expect, it } from 'vitest';

import { LatencyTracker, percentile, summarize } from '../stats.js';
import { nextStep } from '../walker.js';

/** 4x3 map: a wall column at x = 2 except the middle row. */
function smallMap(): WorldMap {
  // prettier-ignore
  const grid = [
    0, 0, 1, 0,
    0, 0, 0, 0,
    0, 0, 1, 0,
  ];
  return {
    width: 4,
    height: 3,
    collisionGrid: Uint8Array.from(grid),
    rooms: [],
    spawns: [{ x: 0, y: 0 }],
    desks: [],
  };
}

function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('percentile / summarize', () => {
  it('uses the nearest rank and handles empty samples', () => {
    const samples = [50, 10, 40, 20, 30, 60, 70, 80, 90, 100];
    expect(percentile(samples, 50)).toBe(50);
    expect(percentile(samples, 95)).toBe(100);
    expect(percentile(samples, 0)).toBe(10);
    expect(percentile([], 50)).toBeNull();
    expect(summarize([])).toEqual({ samples: 0, p50: null, p95: null, p99: null, max: null });
    expect(summarize([3, 1, 2])).toMatchObject({ samples: 3, p50: 2, max: 3 });
    const many = Array.from({ length: 500_000 }, (_, i) => i % 1000);
    expect(summarize(many)).toMatchObject({ samples: 500_000, p95: 949, max: 999 });
  });
});

describe('LatencyTracker', () => {
  it('matches a received position with the latest step sent to it', () => {
    const tracker = new LatencyTracker();
    tracker.sent('ana', 1, 1, 100);
    tracker.sent('ana', 2, 1, 200);
    tracker.sent('ana', 1, 1, 300);

    expect(tracker.received('ana', 1, 1, 350)).toBe(50);
    expect(tracker.received('ana', 2, 1, 260)).toBe(60);
    expect(tracker.received('ana', 9, 9, 400)).toBeNull();
    expect(tracker.received('luis', 1, 1, 400)).toBeNull();
    expect(tracker.samples).toEqual([50, 60]);
  });
});

describe('nextStep (random walk)', () => {
  it('only steps on walkable neighbours', () => {
    const map = smallMap();
    let position = { x: 0, y: 0 };
    let dir = null;
    for (let i = 0; i < 200; i++) {
      const step = nextStep(map, position, dir);
      expect(step).not.toBeNull();
      if (step === null) break;
      expect(Math.abs(step.x - position.x) + Math.abs(step.y - position.y)).toBe(1);
      expect(isWalkable(map, step.x, step.y)).toBe(true);
      position = step;
      dir = step.dir;
    }
  });

  it('keeps its direction when it can and the dice say so', () => {
    const map = smallMap();

    expect(nextStep(map, { x: 0, y: 1 }, 'right', sequence(0.1))).toEqual({
      x: 1,
      y: 1,
      dir: 'right',
    });
    // Blocked straight ahead (the wall at 2,0): picks among the walkable neighbours.
    expect(nextStep(map, { x: 1, y: 0 }, 'right', sequence(0.1, 0))?.dir).toBe('down');
  });

  it('returns null when walled in', () => {
    const map: WorldMap = {
      ...smallMap(),
      collisionGrid: Uint8Array.from([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    };

    expect(nextStep(map, { x: 0, y: 0 }, null)).toBeNull();
  });
});
