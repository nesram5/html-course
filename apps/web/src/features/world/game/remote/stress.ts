import {
  isWalkable,
  stepTowards,
  type Direction,
  type PlayerMoved,
  type PublicPlayer,
  type WorldDelta,
  type WorldMap,
} from '@bululu/shared';

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];
/** A person walks one tile every ~120 ms and a tick lasts ~66 ms: a step in ~55 % of ticks. */
const STEP_CHANCE = 0.55;
const TURN_CHANCE = 0.1;
const AVATAR_COUNT = 8;

interface Walker {
  readonly player: PublicPlayer;
  x: number;
  y: number;
  dir: Direction;
}

/**
 * Development-only load generator (E4-S5 "60 fps with 50 avatars"): `count` fake people who
 * random-walk over walkable tiles, producing the same `world:delta` a server tick would. The
 * scene feeds them to the real `RemotePlayersSystem` (`window.__bululuWorld.stress(n)`).
 */
export class StressDriver {
  private readonly walkers: Walker[] = [];

  constructor(
    private readonly map: WorldMap,
    count: number,
    private readonly random: () => number = Math.random,
  ) {
    for (let i = 0; i < count; i++) {
      const tile = this.randomWalkableTile();
      const dir = this.randomDirection();
      this.walkers.push({
        player: {
          userId: `stress-${String(i)}`,
          displayName: `Prueba ${String(i + 1)}`,
          avatarId: `avatar-${String((i % AVATAR_COUNT) + 1).padStart(2, '0')}`,
          x: tile.x,
          y: tile.y,
          dir,
          status: 'available',
          away: false,
          roomId: null,
          inConversation: false,
          reconnecting: false,
        },
        x: tile.x,
        y: tile.y,
        dir,
      });
    }
  }

  /** The fake people as they would appear in `space:snapshot.players`. */
  players(): PublicPlayer[] {
    return this.walkers.map((walker) => ({
      ...walker.player,
      x: walker.x,
      y: walker.y,
      dir: walker.dir,
    }));
  }

  /** One server tick: the moves of the people who took a step. */
  tick(): WorldDelta {
    const moved: PlayerMoved[] = [];
    for (const walker of this.walkers) {
      if (this.random() >= STEP_CHANCE) continue;
      if (this.random() < TURN_CHANCE) walker.dir = this.randomDirection();
      let target = stepTowards(walker, walker.dir);
      if (!isWalkable(this.map, target.x, target.y)) {
        walker.dir = this.randomDirection();
        target = stepTowards(walker, walker.dir);
        if (!isWalkable(this.map, target.x, target.y)) target = { x: walker.x, y: walker.y };
      }
      walker.x = target.x;
      walker.y = target.y;
      moved.push({ userId: walker.player.userId, x: walker.x, y: walker.y, dir: walker.dir });
    }
    return { moved, joined: [], left: [], changed: [] };
  }

  private randomDirection(): Direction {
    return DIRECTIONS[Math.floor(this.random() * DIRECTIONS.length)] ?? 'down';
  }

  private randomWalkableTile(): { x: number; y: number } {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const x = Math.floor(this.random() * this.map.width);
      const y = Math.floor(this.random() * this.map.height);
      if (isWalkable(this.map, x, y)) return { x, y };
    }
    const spawn = this.map.spawns[0];
    if (spawn === undefined) throw new Error('the map has no walkable tile');
    return spawn;
  }
}
