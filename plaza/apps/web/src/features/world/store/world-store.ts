import type { Direction } from '@plaza/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { DEFAULT_ZOOM, nextZoom, type ZoomLevel } from '../game/constants';

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
  setLoad(load: WorldLoadState): void;
  zoomIn(): void;
  zoomOut(): void;
  setLocalPlayer(player: LocalPlayerState): void;
  /** Back to the initial state (leaving the space page); keeps the chosen zoom. */
  reset(): void;
}

export type WorldStore = StoreApi<WorldState>;

/** Live state of the world shared by React and Phaser (standards §5: one store per domain). */
export function createWorldStore(): WorldStore {
  return createStore<WorldState>()((set) => ({
    load: { kind: 'idle' },
    zoom: DEFAULT_ZOOM,
    localPlayer: null,
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
    reset: () => {
      set({ load: { kind: 'idle' }, localPlayer: null });
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
