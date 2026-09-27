import { worldEvents } from './bridge/event-bus';
import { liveGameCount } from './game/game-registry';
import { worldStore } from './store/world-store';

/** Read-only probes of the world, exposed in development builds for E2E tests and debugging. */
export interface WorldDebug {
  liveGames(): number;
  listenerCount(): number;
  localPlayer(): { x: number; y: number; dir: string; roomId: string | null } | null;
}

declare global {
  interface Window {
    __plazaWorld?: WorldDebug;
  }
}

/** Installs `window.__plazaWorld` (development only; never in production builds). */
export function installWorldDebug(): void {
  if (!import.meta.env.DEV) return;
  window.__plazaWorld = {
    liveGames: liveGameCount,
    listenerCount: () => worldEvents.listenerCount(),
    localPlayer: () => worldStore.getState().localPlayer,
  };
}
