import type { Direction } from '@plaza/shared';

/** One step (or a turn in place, when the tile does not change) of the local avatar. */
export interface LocalStep {
  readonly x: number;
  readonly y: number;
  readonly dir: Direction;
}

/**
 * Typed events between React and Phaser (architecture §6). Commands flow React → scene
 * (`camera:*`); facts flow scene → the rest of the app (`local:step`).
 */
export interface WorldEvents {
  /** The local controller moved or turned the avatar. E4 sends it to the server as `player:move`. */
  'local:step': LocalStep;
  /** "Centrar en mí": center the camera on the local avatar. */
  'camera:center': undefined;
}

export type WorldEventName = keyof WorldEvents;
type Listener<E extends WorldEventName> = (payload: WorldEvents[E]) => void;

/** Minimal typed event emitter. `on` returns the function that removes the listener. */
export class EventBus {
  private readonly listeners = new Map<WorldEventName, Set<(payload: never) => void>>();

  on<E extends WorldEventName>(event: E, listener: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      this.off(event, listener);
    };
  }

  off<E extends WorldEventName>(event: E, listener: Listener<E>): void {
    const set = this.listeners.get(event);
    set?.delete(listener);
    if (set?.size === 0) this.listeners.delete(event);
  }

  emit<E extends WorldEventName>(
    event: E,
    ...[payload]: WorldEvents[E] extends undefined ? [] : [WorldEvents[E]]
  ): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      (listener as Listener<E>)(payload as WorldEvents[E]);
    }
  }

  /** Listeners currently registered (all events, or one). Used to check for leaks. */
  listenerCount(event?: WorldEventName): number {
    if (event !== undefined) return this.listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

/** The app-wide world bus: React components, scenes and (from E4) the realtime client share it. */
export const worldEvents = new EventBus();
