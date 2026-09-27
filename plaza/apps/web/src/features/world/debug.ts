import { worldEvents } from './bridge/event-bus';
import { liveGameCount, worldProbe, type AvatarProbe } from './game/game-registry';
import { realtimeClient } from './realtime/realtime-client';
import { sessionStore } from './realtime/space-session';
import { worldStore } from './store/world-store';

/** Read-only probes of the world, exposed in development builds for E2E tests and debugging. */
export interface WorldDebug {
  liveGames(): number;
  listenerCount(): number;
  localPlayer(): { x: number; y: number; dir: string; roomId: string | null } | null;
  /** Every avatar drawn by the scene (local first), with its tile, drawn position and opacity. */
  avatars(): AvatarProbe[];
  /** Who the camera follows: `null` for me, a userId during "Localizar" (E7-S2). */
  cameraTarget(): string | null;
  /** Frames per second of the Phaser loop (0 without a running scene). */
  fps(): number;
  /** Connection status and realtime session state. */
  realtime(): { connection: string; session: string };
  /** Stress mode (E4-S5): `count` fake people walking; `0` stops it. */
  stress(count: number): void;
  /** Closes the realtime transport like a network failure (E4-S6); it reconnects by itself. */
  dropConnection(): void;
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
    listenerCount: () => worldEvents.listenerCount() + realtimeClient.listenerCount(),
    localPlayer: () => worldStore.getState().localPlayer,
    avatars: () => worldProbe()?.avatars() ?? [],
    cameraTarget: () => worldProbe()?.cameraTarget() ?? null,
    fps: () => worldProbe()?.fps() ?? 0,
    realtime: () => ({
      connection: realtimeClient.store.getState().status,
      session: sessionStore.getState().session.kind,
    }),
    stress: (count) => {
      worldEvents.emit('debug:stress', { count });
    },
    dropConnection: () => {
      realtimeClient.simulateNetworkDrop();
    },
  };
}
