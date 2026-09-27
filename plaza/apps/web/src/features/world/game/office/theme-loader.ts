import type { ThemeAssets } from '../../api/assets';

/**
 * What {@link ThemeLoader} needs from the engine (Phaser in the scene, a fake in tests). `T` is
 * the engine's handle of the textures (and images) of one drawn style.
 */
export interface ThemeBackend<T> {
  /** Loads the `below` / `above` images of a style as new textures (recolored if needed). */
  load(assets: ThemeAssets): Promise<T>;
  /** Fades `next` in over `previous`, then removes the images of `previous` from the scene. */
  show(next: T, previous: T): Promise<void>;
  /** Frees textures that are no longer drawn (or were loaded for nothing). */
  release(textures: T): void;
}

export interface DrawnTheme<T> {
  readonly assets: ThemeAssets;
  readonly textures: T;
}

export interface ThemeLoaderOptions<T> {
  /** The style the scene was created with. */
  readonly initial: DrawnTheme<T>;
  readonly backend: ThemeBackend<T>;
  /** Resolves a theme id into image URLs and color matrix (`loadTheme` of `api/assets`). */
  readonly resolve: (themeId: string) => Promise<ThemeAssets>;
  /** A style that cannot be loaded leaves the current one; the error goes here. */
  readonly onError?: (error: unknown) => void;
}

function sameMatrix(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Two styles that draw exactly the same pixels (same images and color matrix). */
export function sameImages(a: ThemeAssets, b: ThemeAssets): boolean {
  return (
    a.belowUrl === b.belowUrl &&
    a.aboveUrl === b.aboveUrl &&
    sameMatrix(a.colorMatrix, b.colorMatrix)
  );
}

/**
 * Changes the office style live (E9-S1, ADR-011): a style is only two images over the same
 * geometry, so switching loads the new textures, cross-fades them over the current ones and
 * frees the old textures. Nobody moves: avatars, collisions, rooms and desks are untouched.
 *
 * Requests are handled one at a time and the latest wins: a style that finishes loading after
 * another one was asked for is released without being shown.
 */
export class ThemeLoader<T> {
  #current: DrawnTheme<T>;
  #wanted: string;
  #queue: Promise<void> = Promise.resolve();
  #disposed = false;
  #swaps = 0;
  /** Styles loaded ahead and not drawn, by theme id (only after {@link preload}). */
  readonly #ready = new Map<string, DrawnTheme<T>>();
  /** Styles being loaded ahead, by theme id. */
  readonly #preloading = new Map<string, Promise<DrawnTheme<T> | null>>();
  /** Once preloading, styles stay loaded after being replaced, to come back at once. */
  #keep = false;

  constructor(private readonly options: ThemeLoaderOptions<T>) {
    this.#current = options.initial;
    this.#wanted = options.initial.assets.themeId;
  }

  /** Style currently drawn. */
  get themeId(): string {
    return this.#current.assets.themeId;
  }

  get textures(): T {
    return this.#current.textures;
  }

  /** Completed cross-fades (for the development probe). */
  get swaps(): number {
    return this.#swaps;
  }

  /** Switches to `themeId`. Resolves once this request (and the ones before it) settled. */
  apply(themeId: string): Promise<void> {
    this.#wanted = themeId;
    this.#queue = this.#queue.then(() => this.#run(themeId));
    return this.#queue;
  }

  /**
   * Loads the other styles of the template ahead (E9 follow-up), so a later change only has to
   * cross-fade: well under the 2 s budget even on a slow network. Their textures stay loaded
   * for the life of the scene, and so does every replaced style. Failures are only reported.
   */
  async preload(themeIds: readonly string[]): Promise<void> {
    this.#keep = true;
    for (const themeId of themeIds) {
      if (this.#disposed) return;
      if (themeId === this.themeId || this.#ready.has(themeId) || this.#preloading.has(themeId)) {
        continue;
      }
      const loading = this.#loadAhead(themeId);
      this.#preloading.set(themeId, loading);
      const loaded = await loading;
      this.#preloading.delete(themeId);
      if (loaded !== null) this.#ready.set(themeId, loaded);
    }
  }

  /** Styles loaded and ready to be shown at once (for the development probe and tests). */
  get preloaded(): readonly string[] {
    return [...this.#ready.keys()];
  }

  async #loadAhead(themeId: string): Promise<DrawnTheme<T> | null> {
    const { backend, resolve, onError } = this.options;
    try {
      const assets = await resolve(themeId);
      // Same pixels as the style drawn now: nothing to load, `#run` reuses the textures.
      if (sameImages(assets, this.#current.assets)) return null;
      const textures = await backend.load(assets);
      if (this.#disposed) {
        backend.release(textures);
        return null;
      }
      return { assets, textures };
    } catch (error) {
      onError?.(error);
      return null;
    }
  }

  /** The scene is going away: pending requests are dropped (and their textures freed). */
  dispose(): void {
    this.#disposed = true;
  }

  #stale(themeId: string): boolean {
    return this.#disposed || this.#wanted !== themeId;
  }

  async #run(themeId: string): Promise<void> {
    if (this.#stale(themeId) || themeId === this.themeId) return;
    const { backend, resolve, onError } = this.options;
    try {
      // Loaded ahead, or being loaded ahead: no second download.
      const pending = this.#preloading.get(themeId);
      const ahead = this.#ready.get(themeId) ?? (pending === undefined ? null : await pending);
      if (this.#stale(themeId)) return;
      const assets = ahead?.assets ?? (await resolve(themeId));
      if (this.#stale(themeId)) return;
      const previous = this.#current;
      if (sameImages(assets, previous.assets)) {
        this.#current = { assets, textures: previous.textures };
        return;
      }
      const textures = ahead?.textures ?? (await backend.load(assets));
      if (this.#stale(themeId)) {
        if (ahead === null) backend.release(textures);
        return;
      }
      this.#ready.delete(themeId);
      await backend.show(textures, previous.textures);
      this.#current = { assets, textures };
      this.#swaps++;
      if (this.#keep) this.#ready.set(previous.assets.themeId, previous);
      else backend.release(previous.textures);
    } catch (error) {
      onError?.(error);
    }
  }
}
