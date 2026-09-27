import {
  TICK_MS,
  type Direction,
  type PlayerChanged,
  type PublicPlayer,
  type WorldDelta,
} from '@plaza/shared';

/** A remote step is animated over one server tick (architecture §9.3). */
export const REMOTE_MOVE_MS = TICK_MS;
/**
 * The walk animation keeps playing this long after a step ends, so consecutive steps (which
 * arrive every one or two ticks) look like one continuous walk instead of walk-stop-walk.
 */
export const REMOTE_WALK_GRACE_MS = TICK_MS;
/** Fade in on `joined`, fade out on `left` (E4-S5). */
export const REMOTE_FADE_MS = 250;
/** Opacity of an avatar whose connection dropped, during the grace period (E4-S6). */
export const RECONNECTING_ALPHA = 0.5;
/** A move longer than this (in tiles) is a teleport (desk, correction): no walk, it snaps. */
export const REMOTE_SNAP_DISTANCE = 2;

/**
 * A remote player: the server state plus the values drawn this frame. The model mutates these
 * objects in place every frame, so the renderer must read them, never keep them as values.
 */
export interface RemotePlayer {
  readonly userId: string;
  /** Last server state (`snapshot.players`, `joined`, `changed`); position = target tile. */
  state: PublicPlayer;
  /** Drawn position in tiles (fractional while walking). */
  x: number;
  y: number;
  dir: Direction;
  /** Whether the walk animation plays. */
  moving: boolean;
  /** 0..1, including fades and the reconnecting transparency. */
  alpha: number;
  /** Fading out after `left`; removed when the fade ends. */
  leaving: boolean;
}

/** What draws remote players (Phaser in the app, a fake in tests). */
export interface RemotePlayersRenderer {
  create(player: RemotePlayer): void;
  /** Called every frame for every player: must not allocate. */
  render(player: RemotePlayer): void;
  destroy(player: RemotePlayer): void;
}

interface Entry extends RemotePlayer {
  fromX: number;
  fromY: number;
  moveStart: number;
  fadeFrom: number;
  fadeTo: number;
  fadeStart: number;
}

/** Applies a `world:delta.changed` entry: only the fields it carries. */
export function mergeChanged(state: PublicPlayer, changed: PlayerChanged): PublicPlayer {
  return {
    ...state,
    displayName: changed.displayName ?? state.displayName,
    avatarId: changed.avatarId ?? state.avatarId,
    status: changed.status ?? state.status,
    away: changed.away ?? state.away,
    roomId: changed.roomId === undefined ? state.roomId : changed.roomId,
    inConversation: changed.inConversation ?? state.inConversation,
    reconnecting: changed.reconnecting ?? state.reconnecting,
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Remote players of the space (E4-S5), framework-free: applies `space:snapshot` and
 * `world:delta`, and computes every frame where each avatar is drawn (one-tick walk towards the
 * new tile), its opacity (fades, reconnecting) and whether it walks.
 *
 * `update()` runs every frame for up to 50 avatars (RN-06), so it allocates nothing: players
 * live in a dense array iterated by index and are mutated in place.
 */
export class RemotePlayersModel {
  private readonly list: Entry[] = [];
  private readonly byId = new Map<string, Entry>();
  private selfId: string | null = null;

  constructor(private readonly renderer: RemotePlayersRenderer) {}

  get size(): number {
    return this.list.length;
  }

  get(userId: string): RemotePlayer | undefined {
    return this.byId.get(userId);
  }

  /** Players currently drawn (including the ones fading out). */
  players(): readonly RemotePlayer[] {
    return this.list;
  }

  /**
   * Applies a full `space:snapshot` (join and every reconnection): new players fade in,
   * missing ones fade out, the rest jump to the server position.
   */
  reset(players: readonly PublicPlayer[], now: number, selfId: string): void {
    this.selfId = selfId;
    const present = new Set<string>();
    for (const player of players) {
      if (player.userId === selfId) continue;
      present.add(player.userId);
      const entry = this.byId.get(player.userId);
      if (entry === undefined) {
        this.add(player, now);
      } else {
        entry.state = player;
        this.snap(entry, player.x, player.y, player.dir);
        if (entry.leaving) this.fade(entry, 1, now);
      }
    }
    const self = this.byId.get(selfId);
    if (self !== undefined) this.remove(self);
    for (const entry of this.list) {
      if (!present.has(entry.userId) && !entry.leaving) this.leave(entry, now);
    }
  }

  /** Applies a `world:delta` (E4-S4): joined, moved, changed, left — in that order. */
  applyDelta(delta: WorldDelta, now: number): void {
    for (const player of delta.joined) {
      if (player.userId === this.selfId) continue;
      const entry = this.byId.get(player.userId);
      if (entry === undefined) {
        this.add(player, now);
      } else {
        // Came back during its fade out, or a duplicate join: revive at the new state.
        entry.state = player;
        this.snap(entry, player.x, player.y, player.dir);
        this.fade(entry, 1, now);
      }
    }
    for (const moved of delta.moved) {
      const entry = this.byId.get(moved.userId);
      if (entry === undefined || entry.leaving) continue;
      const turnOnly = moved.x === entry.state.x && moved.y === entry.state.y;
      entry.state = { ...entry.state, x: moved.x, y: moved.y, dir: moved.dir };
      const distance = Math.abs(moved.x - entry.x) + Math.abs(moved.y - entry.y);
      if (turnOnly) {
        entry.dir = moved.dir;
      } else if (distance > REMOTE_SNAP_DISTANCE) {
        this.snap(entry, moved.x, moved.y, moved.dir);
      } else {
        entry.fromX = entry.x;
        entry.fromY = entry.y;
        entry.dir = moved.dir;
        entry.moveStart = now;
      }
    }
    for (const changed of delta.changed) {
      const entry = this.byId.get(changed.userId);
      if (entry === undefined) continue;
      entry.state = mergeChanged(entry.state, changed);
    }
    for (const userId of delta.left) {
      const entry = this.byId.get(userId);
      if (entry !== undefined && !entry.leaving) this.leave(entry, now);
    }
  }

  /** Advances every avatar to `now` and renders it. Allocation-free. */
  update(now: number): void {
    let index = 0;
    while (index < this.list.length) {
      const entry = this.list[index];
      if (entry === undefined) break;
      const { state } = entry;
      const t = clamp01((now - entry.moveStart) / REMOTE_MOVE_MS);
      entry.x = entry.fromX + (state.x - entry.fromX) * t;
      entry.y = entry.fromY + (state.y - entry.fromY) * t;
      entry.moving = now - entry.moveStart < REMOTE_MOVE_MS + REMOTE_WALK_GRACE_MS;
      const fade = clamp01((now - entry.fadeStart) / REMOTE_FADE_MS);
      const visibility = entry.fadeFrom + (entry.fadeTo - entry.fadeFrom) * fade;
      entry.alpha = visibility * (state.reconnecting ? RECONNECTING_ALPHA : 1);
      if (entry.leaving && fade >= 1) {
        this.remove(entry);
        continue; // The last entry moved into this index.
      }
      this.renderer.render(entry);
      index++;
    }
  }

  /** Removes every player at once (leaving the page). */
  clear(): void {
    while (this.list.length > 0) {
      const entry = this.list[this.list.length - 1];
      if (entry === undefined) break;
      this.remove(entry);
    }
  }

  private add(player: PublicPlayer, now: number): void {
    const entry: Entry = {
      userId: player.userId,
      state: player,
      x: player.x,
      y: player.y,
      dir: player.dir,
      moving: false,
      alpha: 0,
      leaving: false,
      fromX: player.x,
      fromY: player.y,
      moveStart: Number.NEGATIVE_INFINITY,
      fadeFrom: 0,
      fadeTo: 1,
      fadeStart: now,
    };
    this.list.push(entry);
    this.byId.set(entry.userId, entry);
    this.renderer.create(entry);
  }

  private snap(entry: Entry, x: number, y: number, dir: Direction): void {
    entry.fromX = x;
    entry.fromY = y;
    entry.x = x;
    entry.y = y;
    entry.dir = dir;
    entry.moveStart = Number.NEGATIVE_INFINITY;
  }

  private leave(entry: Entry, now: number): void {
    entry.leaving = true;
    this.fade(entry, 0, now);
  }

  private fade(entry: Entry, to: number, now: number): void {
    const current = clamp01((now - entry.fadeStart) / REMOTE_FADE_MS);
    entry.fadeFrom = entry.fadeFrom + (entry.fadeTo - entry.fadeFrom) * current;
    entry.fadeTo = to;
    entry.fadeStart = now;
    entry.leaving = to === 0;
  }

  private remove(entry: Entry): void {
    const index = this.list.indexOf(entry);
    if (index === -1) return;
    const last = this.list.pop();
    if (last !== undefined && last !== entry) this.list[index] = last;
    this.byId.delete(entry.userId);
    this.renderer.destroy(entry);
  }
}
