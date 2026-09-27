import { RING_COOLDOWN_MS } from '@plaza/shared';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface RingState {
  /** When each person can be rung again (epoch ms), RN-11. */
  readonly until: Readonly<Record<string, number>>;
  /** Starts the 30 s cooldown of a person. */
  started(userId: string, now?: number): void;
}

export type RingStore = StoreApi<RingState>;

export function createRingStore(): RingStore {
  return createStore<RingState>()((set, get) => ({
    until: {},
    started: (userId, now = Date.now()) => {
      set({ until: { ...get().until, [userId]: now + RING_COOLDOWN_MS } });
    },
  }));
}

/** The app-wide ring cooldowns (the server enforces them too). */
export const ringStore = createRingStore();

export function useRingStore<T>(
  selector: (state: RingState) => T,
  store: RingStore = ringStore,
): T {
  return useStore(store, selector);
}

/** Whole seconds left before `userId` can be rung again (0 when allowed). */
export function secondsLeft(until: number | undefined, now: number): number {
  if (until === undefined || until <= now) return 0;
  return Math.ceil((until - now) / 1000);
}
