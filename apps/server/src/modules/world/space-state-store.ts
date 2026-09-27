import { SPACE_UNLOAD_DELAY_MS } from '@bululu/shared';

import type { CancelTimer, Timers } from '../../platform/timers.js';
import type { SpaceRuntime } from './space-runtime.js';

/**
 * Where the live state of the spaces lives (architecture §5.3). In memory for the MVP: one server
 * process. Replaceable (e.g. Redis) behind this interface if the service has to scale out.
 */
export interface SpaceStateStore {
  /** The runtime of the space, created (map loaded) by the first person to enter. */
  getOrLoad(spaceId: string): Promise<SpaceRuntime>;
  /** The runtime if it is loaded. */
  get(spaceId: string): SpaceRuntime | undefined;
  /** Releases the runtime {@link SPACE_UNLOAD_DELAY_MS} after it becomes empty (E4-S2). */
  unloadIfEmpty(spaceId: string): void;
  /** Loaded runtimes. */
  runtimes(): SpaceRuntime[];
  /** Drops every runtime and pending timer (server shutdown). */
  close(): void;
}

export interface InMemorySpaceStateStoreDeps {
  /** Builds the runtime of a space: reads the space and parses its map once. */
  load(spaceId: string): Promise<SpaceRuntime>;
  timers: Timers;
  /** Delay before an empty runtime is released; {@link SPACE_UNLOAD_DELAY_MS} by default. */
  unloadDelayMs?: number;
  /** Called once per runtime, after it is created (the world service starts its tick). */
  onLoad?(runtime: SpaceRuntime): void;
  /** Called once per runtime, when it is released (the world service stops its tick). */
  onUnload?(runtime: SpaceRuntime): void;
}

export class InMemorySpaceStateStore implements SpaceStateStore {
  readonly #runtimes = new Map<string, SpaceRuntime>();
  /** Loads in progress: concurrent `getOrLoad` calls share one load. */
  readonly #loading = new Map<string, Promise<SpaceRuntime>>();
  readonly #unloadTimers = new Map<string, CancelTimer>();

  constructor(private readonly deps: InMemorySpaceStateStoreDeps) {}

  getOrLoad(spaceId: string): Promise<SpaceRuntime> {
    this.#cancelUnload(spaceId);
    const loaded = this.#runtimes.get(spaceId);
    if (loaded !== undefined) return Promise.resolve(loaded);
    let loading = this.#loading.get(spaceId);
    if (loading === undefined) {
      loading = this.deps
        .load(spaceId)
        .then((runtime) => {
          this.#runtimes.set(spaceId, runtime);
          this.deps.onLoad?.(runtime);
          return runtime;
        })
        .finally(() => this.#loading.delete(spaceId));
      this.#loading.set(spaceId, loading);
    }
    return loading;
  }

  get(spaceId: string): SpaceRuntime | undefined {
    return this.#runtimes.get(spaceId);
  }

  unloadIfEmpty(spaceId: string): void {
    const runtime = this.#runtimes.get(spaceId);
    if (runtime === undefined || runtime.size > 0 || this.#unloadTimers.has(spaceId)) return;
    const delay = this.deps.unloadDelayMs ?? SPACE_UNLOAD_DELAY_MS;
    const cancel = this.deps.timers.after(delay, () => {
      this.#unloadTimers.delete(spaceId);
      if (this.#runtimes.get(spaceId) !== runtime || runtime.size > 0) return;
      this.#runtimes.delete(spaceId);
      this.deps.onUnload?.(runtime);
    });
    this.#unloadTimers.set(spaceId, cancel);
  }

  runtimes(): SpaceRuntime[] {
    return [...this.#runtimes.values()];
  }

  close(): void {
    for (const cancel of this.#unloadTimers.values()) cancel();
    this.#unloadTimers.clear();
    for (const runtime of this.#runtimes.values()) this.deps.onUnload?.(runtime);
    this.#runtimes.clear();
  }

  #cancelUnload(spaceId: string): void {
    this.#unloadTimers.get(spaceId)?.();
    this.#unloadTimers.delete(spaceId);
  }
}
