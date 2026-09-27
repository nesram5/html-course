import {
  deskSpawnTile,
  roomAt,
  validateStep,
  type Direction,
  type PlayerChanged,
  type PlayerMoved,
  type PlayerState,
  type StepRejection,
  type Tile,
  type WorldDelta,
  type WorldMap,
} from '@bululu/shared';

/** Who joins: everything but the position, which the runtime decides (E4-S1). */
export type NewPlayer = Omit<PlayerState, 'x' | 'y' | 'dir' | 'roomId' | 'reconnecting'>;

/** Non-positional fields that can change while connected (status, away, conversation…). */
export type PlayerFields = Partial<Omit<PlayerChanged, 'userId'>>;

export type MoveResult =
  | {
      ok: true;
      /** The meeting room changed: the new `roomId` (`null` = back in the hallway). */
      roomChanged?: { roomId: string | null };
    }
  | { ok: false; reason: StepRejection; x: number; y: number };

interface RuntimePlayer {
  state: PlayerState;
  /** Socket that controls the avatar; `null` while waiting for a reconnection (E4-S6). */
  socketId: string | null;
}

/**
 * Live state of one space (architecture §5.3): the parsed map, loaded once, and the people in
 * it. Positions live only here, never in the database. Every change is recorded and handed out
 * once per tick by {@link flush} as a `world:delta` (E4-S4). Pure: no sockets, no timers.
 */
export class SpaceRuntime {
  readonly #players = new Map<string, RuntimePlayer>();
  readonly #joined = new Set<string>();
  readonly #left = new Set<string>();
  readonly #moved = new Map<string, PlayerMoved>();
  readonly #changed = new Map<string, PlayerChanged>();
  #spawnCursor = 0;

  constructor(
    readonly spaceId: string,
    readonly mapTemplateId: string,
    readonly map: WorldMap,
  ) {}

  /** People in the space, including the ones waiting for a reconnection. */
  get size(): number {
    return this.#players.size;
  }

  /** People with a live connection. */
  get connectedCount(): number {
    let count = 0;
    for (const player of this.#players.values()) if (player.socketId !== null) count++;
    return count;
  }

  /** `true` when something changed since the last {@link flush}. */
  get hasPendingChanges(): boolean {
    return (
      this.#joined.size > 0 || this.#left.size > 0 || this.#moved.size > 0 || this.#changed.size > 0
    );
  }

  has(userId: string): boolean {
    return this.#players.has(userId);
  }

  /** A copy of the state of the person, `undefined` when not in the space. */
  get(userId: string): PlayerState | undefined {
    const player = this.#players.get(userId);
    return player === undefined ? undefined : { ...player.state };
  }

  socketOf(userId: string): string | null {
    return this.#players.get(userId)?.socketId ?? null;
  }

  /** Copies of every player state (for `space:snapshot`). */
  players(): PlayerState[] {
    return [...this.#players.values()].map((player) => ({ ...player.state }));
  }

  /** userId and socket of every connected person (recipients of `world:delta`). */
  connections(): { userId: string; socketId: string }[] {
    const result: { userId: string; socketId: string }[] = [];
    for (const [userId, player] of this.#players) {
      if (player.socketId !== null) result.push({ userId, socketId: player.socketId });
    }
    return result;
  }

  /**
   * Where a person appears (decided by the server, E4-S1 / E9-S2): next to their desk when they
   * have one and it is reachable, otherwise the map spawns in turn.
   */
  spawnFor(deskId: string | null): Tile {
    const desk = deskId === null ? undefined : this.map.desks.find((d) => d.deskId === deskId);
    const nearDesk = desk === undefined ? null : deskSpawnTile(this.map, desk);
    if (nearDesk !== null) return nearDesk;
    const { spawns } = this.map;
    const spawn = spawns[this.#spawnCursor % spawns.length];
    if (spawn === undefined) throw new Error('The map has no spawn points');
    this.#spawnCursor++;
    return spawn;
  }

  /** Adds a person at `tile`; announced in `joined` on the next tick. */
  join(player: NewPlayer, tile: Tile, socketId: string): PlayerState {
    if (this.#players.has(player.userId)) {
      throw new Error(`Player ${player.userId} is already in space ${this.spaceId}`);
    }
    const state: PlayerState = {
      ...player,
      x: tile.x,
      y: tile.y,
      dir: 'down',
      roomId: roomAt(this.map, tile.x, tile.y),
      reconnecting: false,
    };
    this.#players.set(player.userId, { state, socketId });
    // Left and came back within the same tick: `joined` carries the whole state again (as the
    // last arrival, so whoever joined in between hears about it too).
    this.#left.delete(player.userId);
    this.#moved.delete(player.userId);
    this.#changed.delete(player.userId);
    this.#joined.delete(player.userId);
    this.#joined.add(player.userId);
    return { ...state };
  }

  /**
   * Validates one step (E4-S3, `validateStep` of `@bululu/shared`): same tile (turn) or an
   * adjacent walkable one. Other avatars are not obstacles (RN-10). Rejections leave the state
   * untouched and return the position the client must go back to (`player:correct`).
   */
  move(userId: string, to: { x: number; y: number; dir: Direction }): MoveResult {
    const player = this.#require(userId);
    const { state } = player;
    const step = validateStep(this.map, state, to);
    if (!step.ok) return { ok: false, reason: step.reason, x: state.x, y: state.y };
    return this.#setPosition(state, to, to.dir);
  }

  /**
   * Puts the avatar on a walkable tile without the adjacency rule (server decisions such as
   * "Mi escritorio", E9-S2). Throws on a blocked tile: callers pick tiles from the map.
   */
  place(userId: string, tile: Tile, dir: Direction = 'down'): MoveResult {
    const player = this.#require(userId);
    if (!validateStep(this.map, tile, tile).ok) {
      throw new Error(`Tile ${String(tile.x)},${String(tile.y)} is not walkable`);
    }
    return this.#setPosition(player.state, tile, dir);
  }

  /** Records non-positional changes (only the fields that actually change are sent). */
  update(userId: string, fields: PlayerFields): void {
    const { state } = this.#require(userId);
    const diff: PlayerFields = {};
    for (const key of Object.keys(fields) as (keyof PlayerFields)[]) {
      const value = fields[key];
      if (value === undefined || state[key] === value) continue;
      Object.assign(state, { [key]: value });
      Object.assign(diff, { [key]: value });
    }
    if (Object.keys(diff).length > 0) this.#recordChange(userId, diff);
  }

  /** Connection lost: the avatar stays, flagged `reconnecting` (drawn semi-transparent, E4-S6). */
  disconnect(userId: string): void {
    this.#require(userId).socketId = null;
    this.update(userId, { reconnecting: true });
  }

  /** The same person is back (reconnection or a newer tab): same avatar, same position. */
  reconnect(userId: string, socketId: string): void {
    this.#require(userId).socketId = socketId;
    this.update(userId, { reconnecting: false });
  }

  /**
   * Removes the person; announced in `left` on the next tick. No-op when absent. Also announced
   * when they arrived in this same tick: whoever joined after them has them in their snapshot
   * (a `left` for someone a client never saw is ignored).
   */
  leave(userId: string): void {
    if (!this.#players.delete(userId)) return;
    this.#moved.delete(userId);
    this.#changed.delete(userId);
    this.#joined.delete(userId);
    this.#left.add(userId);
  }

  /**
   * Everything that changed since the previous call, as one `world:delta`, or `null` when
   * nothing did (no message is sent on idle ticks, E4-S4). `joined` carries the latest state of
   * each arrival, in arrival order; `moved` and `changed` also list the steps and changes of
   * arrivals, for the people who got them in their snapshot instead (`deltaFor` trims them).
   */
  flush(): WorldDelta | null {
    if (!this.hasPendingChanges) return null;
    const joined: PlayerState[] = [];
    for (const userId of this.#joined) {
      const player = this.#players.get(userId);
      if (player !== undefined) joined.push({ ...player.state });
    }
    const delta: WorldDelta = {
      moved: [...this.#moved.values()],
      joined,
      left: [...this.#left],
      changed: [...this.#changed.values()],
    };
    this.#joined.clear();
    this.#left.clear();
    this.#moved.clear();
    this.#changed.clear();
    return delta;
  }

  #require(userId: string): RuntimePlayer {
    const player = this.#players.get(userId);
    if (player === undefined) throw new Error(`Player ${userId} is not in space ${this.spaceId}`);
    return player;
  }

  #setPosition(state: PlayerState, tile: Tile, dir: Direction): MoveResult & { ok: true } {
    state.x = tile.x;
    state.y = tile.y;
    state.dir = dir;
    this.#moved.set(state.userId, { userId: state.userId, x: tile.x, y: tile.y, dir });
    const roomId = roomAt(this.map, tile.x, tile.y);
    if (roomId === state.roomId) return { ok: true };
    this.update(state.userId, { roomId });
    return { ok: true, roomChanged: { roomId } };
  }

  #recordChange(userId: string, diff: PlayerFields): void {
    const previous = this.#changed.get(userId) ?? { userId };
    this.#changed.set(userId, { ...previous, ...diff });
  }
}
