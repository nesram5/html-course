import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { isTypingTarget } from '../game/controller/keyboard-input';

/** Something the interaction key (`X`) can do right now, offered by a feature. */
export interface Interaction {
  /** Stable id (e.g. `desk`, `meeting-room`): tells a feature whether `X` is theirs. */
  readonly id: string;
  /** When several are available at once the highest wins (a meeting room over a desk). */
  readonly priority: number;
  run(): void;
}

interface InteractionState {
  /** Id of the interaction `X` runs now, `null` when none. */
  readonly active: string | null;
}

type KeyTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/** `X` without modifiers, outside text fields: the interaction key of the office. */
export function isInteractKey(event: KeyboardEvent): boolean {
  return (
    (event.key === 'x' || event.key === 'X') &&
    !event.repeat &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !isTypingTarget(event.target)
  );
}

/**
 * The single dispatcher of the interaction key (E6, E9-S2). Features register what `X` does
 * while it makes sense (next to a desk, inside a meeting room) and ONE `keydown` listener runs
 * the interaction with the highest priority, so a key press is never handled twice. The
 * listener is attached while something is registered.
 */
export class InteractionKeys {
  readonly store: StoreApi<InteractionState> = createStore<InteractionState>()(() => ({
    active: null,
  }));
  readonly #entries: Interaction[] = [];
  readonly #target: () => KeyTarget;
  #attached: KeyTarget | null = null;

  constructor(target: () => KeyTarget = () => window) {
    this.#target = target;
  }

  /** Offers an interaction; returns the function that withdraws it. */
  register(interaction: Interaction): () => void {
    this.#entries.push(interaction);
    this.#refresh();
    return () => {
      const index = this.#entries.indexOf(interaction);
      if (index === -1) return;
      this.#entries.splice(index, 1);
      this.#refresh();
    };
  }

  /** The interaction `X` runs now: highest priority, the earliest registered among equals. */
  active(): Interaction | null {
    let best: Interaction | null = null;
    for (const entry of this.#entries)
      if (best === null || entry.priority > best.priority) best = entry;
    return best;
  }

  /** Runs the active interaction (as if `X` was pressed); `false` when there is none. */
  trigger(): boolean {
    const active = this.active();
    if (active === null) return false;
    active.run();
    return true;
  }

  readonly #onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || !isInteractKey(event)) return;
    const active = this.active();
    if (active === null) return;
    event.preventDefault();
    active.run();
  };

  #refresh(): void {
    const active = this.active()?.id ?? null;
    if (this.store.getState().active !== active) this.store.setState({ active });
    if (this.#entries.length > 0 && this.#attached === null) {
      this.#attached = this.#target();
      this.#attached.addEventListener('keydown', this.#onKeyDown);
    } else if (this.#entries.length === 0 && this.#attached !== null) {
      this.#attached.removeEventListener('keydown', this.#onKeyDown);
      this.#attached = null;
    }
  }
}

/** The app-wide interaction key dispatcher. */
export const interactionKeys = new InteractionKeys();

/**
 * Offers `run` on the interaction key while it is not `null`; returns whether `X` runs it now
 * (so the feature shows its "X" hint only then). The latest `run` is used without registering
 * again on every render.
 */
export function useInteraction(
  id: string,
  priority: number,
  run: (() => void) | null,
  keys: InteractionKeys = interactionKeys,
): boolean {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  const available = run !== null;
  useEffect(() => {
    if (!available) return undefined;
    return keys.register({
      id,
      priority,
      run: () => {
        latest.current?.();
      },
    });
  }, [available, id, priority, keys]);
  return useStore(keys.store, (state) => state.active === id);
}
