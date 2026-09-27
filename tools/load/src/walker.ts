import { DIRECTIONS, isWalkable, stepTowards, type Direction, type WorldMap } from '@bululu/shared';

export interface Step {
  x: number;
  y: number;
  dir: Direction;
}

/**
 * Random walk that respects collisions (the server would correct anything else): keeps going
 * the same way with probability `keep`, otherwise picks any walkable neighbour. `null` when the
 * bot is walled in.
 */
export function nextStep(
  map: WorldMap,
  from: { x: number; y: number },
  lastDir: Direction | null,
  random: () => number = Math.random,
  keep = 0.7,
): Step | null {
  const options = DIRECTIONS.map((dir) => ({ dir, ...stepTowards(from, dir) })).filter((step) =>
    isWalkable(map, step.x, step.y),
  );
  if (options.length === 0) return null;
  const straight = options.find((step) => step.dir === lastDir);
  if (straight !== undefined && random() < keep) return straight;
  return options[Math.floor(random() * options.length)] ?? null;
}
