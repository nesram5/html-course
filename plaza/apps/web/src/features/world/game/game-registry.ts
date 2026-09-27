/**
 * Counts the Phaser games alive, without importing Phaser, so React code and tests can check
 * that leaving the space page frees the game (E3-S6).
 */
let liveGames = 0;

export function registerGame(): () => void {
  liveGames++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    liveGames--;
  };
}

export function liveGameCount(): number {
  return liveGames;
}

/** A drawn avatar as seen by the debug probe. */
export interface AvatarProbe {
  /** `null` for the local avatar. */
  readonly userId: string | null;
  /** Logical tile (the destination while walking). */
  readonly tileX: number;
  readonly tileY: number;
  /** Drawn position in tiles. */
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
  readonly moving: boolean;
  /** Whether the name label is drawn over the `above` art layer. */
  readonly labelAboveArt: boolean;
  /** Color of the status dot (E7-S1). */
  readonly presence: 'available' | 'busy' | 'away';
  /** Emoji shown over the avatar right now (E7-S4), `null` when none. */
  readonly reaction: string | null;
  /** Whether the 💬 of a hallway conversation is drawn over the avatar (E5-S2). */
  readonly inConversation: boolean;
}

/** Read-only view of the running world scene, for E2E tests and the stress mode. */
export interface WorldProbe {
  /** Frames per second measured by Phaser's game loop. */
  fps(): number;
  avatars(): AvatarProbe[];
  /** Who the camera follows: `null` for the local avatar, a userId while locating (E7-S2). */
  cameraTarget(): string | null;
}

let probe: WorldProbe | null = null;

/** Registers the probe of the running scene; returns the function that removes it. */
export function setWorldProbe(next: WorldProbe): () => void {
  probe = next;
  return () => {
    if (probe === next) probe = null;
  };
}

export function worldProbe(): WorldProbe | null {
  return probe;
}
