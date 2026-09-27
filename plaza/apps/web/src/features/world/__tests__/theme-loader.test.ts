import { describe, expect, it, vi } from 'vitest';

import type { ThemeAssets } from '../api/assets';
import { ThemeLoader, sameImages, type ThemeBackend } from '../game/office/theme-loader';

const NIGHT = Array.from({ length: 20 }, (_, i) => (i % 6 === 0 ? 0.5 : 0));

const THEMES: Record<string, ThemeAssets> = {
  pixel: {
    themeId: 'pixel',
    belowUrl: '/pixel/below.png',
    aboveUrl: '/pixel/above.png',
    colorMatrix: null,
  },
  night: {
    themeId: 'night',
    belowUrl: '/pixel/below.png',
    aboveUrl: '/pixel/above.png',
    colorMatrix: NIGHT,
  },
  watercolor: {
    themeId: 'watercolor',
    belowUrl: '/watercolor/below.png',
    aboveUrl: '/watercolor/above.png',
    colorMatrix: null,
  },
  // Another id drawing exactly the pixel images (e.g. a renamed style).
  classic: {
    themeId: 'classic',
    belowUrl: '/pixel/below.png',
    aboveUrl: '/pixel/above.png',
    colorMatrix: null,
  },
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Textures are plain names: `<themeId>#<load number>`. Records every call. */
class FakeBackend implements ThemeBackend<string> {
  readonly calls: string[] = [];
  readonly released: string[] = [];
  /** Loads to hold until the test resolves them, by theme id. */
  readonly holds = new Map<string, Deferred<undefined>>();
  loads = 0;

  async load(assets: ThemeAssets): Promise<string> {
    const name = `${assets.themeId}#${String(++this.loads)}`;
    this.calls.push(`load ${name}`);
    await this.holds.get(assets.themeId)?.promise;
    return name;
  }

  show(next: string, previous: string): Promise<void> {
    this.calls.push(`show ${next} over ${previous}`);
    return Promise.resolve();
  }

  release(textures: string): void {
    this.calls.push(`release ${textures}`);
    this.released.push(textures);
  }
}

function setup(resolve?: (themeId: string) => Promise<ThemeAssets>) {
  const backend = new FakeBackend();
  const onError = vi.fn();
  const loader = new ThemeLoader({
    initial: { assets: THEMES.pixel as ThemeAssets, textures: 'pixel#0' },
    backend,
    resolve:
      resolve ??
      ((themeId) => {
        const theme = THEMES[themeId];
        return theme === undefined ? Promise.reject(new Error('404')) : Promise.resolve(theme);
      }),
    onError,
  });
  return { backend, loader, onError };
}

describe('ThemeLoader (E9-S1)', () => {
  it('does nothing for the style already drawn', async () => {
    const { backend, loader } = setup();

    await loader.apply('pixel');

    expect(backend.calls).toEqual([]);
    expect(loader.themeId).toBe('pixel');
  });

  it('loads the new images, fades them in over the old ones and then frees the old textures', async () => {
    const { backend, loader } = setup();

    await loader.apply('watercolor');

    expect(backend.calls).toEqual([
      'load watercolor#1',
      'show watercolor#1 over pixel#0',
      'release pixel#0',
    ]);
    expect(loader.themeId).toBe('watercolor');
    expect(loader.textures).toBe('watercolor#1');
    expect(loader.swaps).toBe(1);
  });

  it('recolors a color variant: same images, other matrix, new textures', async () => {
    const { backend, loader } = setup();

    await loader.apply('night');
    await loader.apply('pixel');

    expect(backend.calls).toEqual([
      'load night#1',
      'show night#1 over pixel#0',
      'release pixel#0',
      'load pixel#2',
      'show pixel#2 over night#1',
      'release night#1',
    ]);
  });

  it('keeps the textures when another style draws exactly the same pixels', async () => {
    const { backend, loader } = setup();

    await loader.apply('classic');

    expect(backend.calls).toEqual([]);
    expect(loader.themeId).toBe('classic');
    expect(sameImages(THEMES.pixel as ThemeAssets, THEMES.classic as ThemeAssets)).toBe(true);
    expect(sameImages(THEMES.pixel as ThemeAssets, THEMES.night as ThemeAssets)).toBe(false);
  });

  it('skips styles replaced before their turn came', async () => {
    const { backend, loader } = setup();

    await Promise.all([loader.apply('watercolor'), loader.apply('night')]);

    expect(backend.calls).toEqual(['load night#1', 'show night#1 over pixel#0', 'release pixel#0']);
  });

  it('shows only the latest style when another is asked for while loading', async () => {
    const { backend, loader } = setup();
    const hold = deferred<undefined>();
    backend.holds.set('watercolor', hold);

    const first = loader.apply('watercolor');
    await vi.waitFor(() => {
      expect(backend.calls).toEqual(['load watercolor#1']);
    });
    const second = loader.apply('night');
    hold.resolve(undefined);
    await Promise.all([first, second]);

    expect(backend.calls).toEqual([
      'load watercolor#1',
      'release watercolor#1',
      'load night#2',
      'show night#2 over pixel#0',
      'release pixel#0',
    ]);
    expect(loader.themeId).toBe('night');
  });

  it('drops a style loaded after going back to the current one', async () => {
    const { backend, loader } = setup();
    const hold = deferred<undefined>();
    backend.holds.set('watercolor', hold);

    const there = loader.apply('watercolor');
    await vi.waitFor(() => {
      expect(backend.calls).toEqual(['load watercolor#1']);
    });
    const back = loader.apply('pixel');
    hold.resolve(undefined);
    await Promise.all([there, back]);

    expect(backend.calls).toEqual(['load watercolor#1', 'release watercolor#1']);
    expect(loader.themeId).toBe('pixel');
    expect(loader.swaps).toBe(0);
  });

  it('keeps the current style when a new one cannot be loaded, and can try again', async () => {
    let fail = true;
    const { backend, loader, onError } = setup((themeId) =>
      fail ? Promise.reject(new Error('offline')) : Promise.resolve(THEMES[themeId] as ThemeAssets),
    );

    await loader.apply('watercolor');
    expect(onError).toHaveBeenCalledWith(new Error('offline'));
    expect(loader.themeId).toBe('pixel');
    expect(backend.calls).toEqual([]);

    fail = false;
    await loader.apply('watercolor');
    expect(loader.themeId).toBe('watercolor');
  });

  it('frees what finishes loading after the scene is gone', async () => {
    const { backend, loader } = setup();
    const hold = deferred<undefined>();
    backend.holds.set('watercolor', hold);

    const pending = loader.apply('watercolor');
    await vi.waitFor(() => {
      expect(backend.calls).toEqual(['load watercolor#1']);
    });
    loader.dispose();
    hold.resolve(undefined);
    await pending;

    expect(backend.calls).toEqual(['load watercolor#1', 'release watercolor#1']);
  });
});
