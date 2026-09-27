import type { Direction, PublicPlayer, SpaceSnapshot, WorldDelta } from '@plaza/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { DEFAULT_ZOOM, nextZoom, type ZoomLevel } from '../game/constants';
import { mergeChanged } from '../game/remote/remote-players';

export interface LocalPlayerState {
  readonly x: number;
  readonly y: number;
  readonly dir: Direction;
  /** Meeting room under the avatar (`roomAt`), `null` in the hallway. */
  readonly roomId: string | null;
}

/** Loading state of the Phaser world (images and sprites). */
export type WorldLoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly progress: number }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly file: string };

export interface WorldState {
  readonly load: WorldLoadState;
  readonly zoom: ZoomLevel;
  readonly localPlayer: LocalPlayerState | null;
  /** userId of the local person, from the last snapshot; `null` before joining. */
  readonly selfId: string | null;
  /**
   * The other people of the space by userId, with their server state (tile, status,
   * `inConversation`…), kept up to date with every snapshot and delta (at most 15 times per
   * second). Positions are tiles: the smooth drawn position lives in the scene.
   */
  readonly players: ReadonlyMap<string, PublicPlayer>;
  setLoad(load: WorldLoadState): void;
  zoomIn(): void;
  zoomOut(): void;
  setLocalPlayer(player: LocalPlayerState): void;
  /** A `space:snapshot` (join, reconnection): replaces the people of the space. */
  applySnapshot(snapshot: SpaceSnapshot): void;
  /** A `world:delta`: arrivals, steps, changes and departures of the others. */
  applyDelta(delta: WorldDelta): void;
  /** Back to the initial state (leaving the space page); keeps the chosen zoom. */
  reset(): void;
}

export type WorldStore = StoreApi<WorldState>;

/** The people map after a `world:delta` (a new map only when something changed). */
export function applyDeltaToPlayers(
  players: ReadonlyMap<string, PublicPlayer>,
  delta: WorldDelta,
  selfId: string | null,
): ReadonlyMap<string, PublicPlayer> {
  if (delta.joined.length + delta.moved.length + delta.changed.length + delta.left.length === 0) {
    return players;
  }
  const next = new Map(players);
  for (const player of delta.joined) {
    if (player.userId !== selfId) next.set(player.userId, player);
  }
  for (const moved of delta.moved) {
    const player = next.get(moved.userId);
    if (player !== undefined) next.set(moved.userId, { ...player, ...moved });
  }
  for (const changed of delta.changed) {
    const player = next.get(changed.userId);
    if (player !== undefined) next.set(changed.userId, mergeChanged(player, changed));
  }
  for (const userId of delta.left) next.delete(userId);
  return next;
}

/** Live state of the world shared by React and Phaser (standards §5: one store per domain). */
export function createWorldStore(): WorldStore {
  return createStore<WorldState>()((set) => ({
    load: { kind: 'idle' },
    zoom: DEFAULT_ZOOM,
    localPlayer: null,
    selfId: null,
    players: new Map(),
    setLoad: (load) => {
      set({ load });
    },
    zoomIn: () => {
      set((state) => ({ zoom: nextZoom(state.zoom, 'in') }));
    },
    zoomOut: () => {
      set((state) => ({ zoom: nextZoom(state.zoom, 'out') }));
    },
    setLocalPlayer: (localPlayer) => {
      set({ localPlayer });
    },
    applySnapshot: (snapshot) => {
      const players = new Map<string, PublicPlayer>();
      for (const player of snapshot.players) {
        if (player.userId !== snapshot.self.userId) players.set(player.userId, player);
      }
      set({ selfId: snapshot.self.userId, players });
    },
    applyDelta: (delta) => {
      set((state) => ({ players: applyDeltaToPlayers(state.players, delta, state.selfId) }));
    },
    reset: () => {
      set({ load: { kind: 'idle' }, localPlayer: null, selfId: null, players: new Map() });
    },
  }));
}

/** The app-wide world store. */
export const worldStore = createWorldStore();

/** React binding of {@link worldStore} (or of another store, in tests). */
export function useWorldStore<T>(
  selector: (state: WorldState) => T,
  store: WorldStore = worldStore,
): T {
  return useStore(store, selector);
}
