import * as Phaser from 'phaser';

import type { ThemeAssets } from '../../api/assets';
import { recolorImage } from '../color-matrix';
import { ABOVE_DEPTH } from '../sprites/depth';
import type { ThemeBackend } from './theme-loader';

/** Cross-fade of a style change (E9-S1: the whole change takes < 2 s). */
export const THEME_FADE_MS = 600;
/** While fading in, the new images sit just over the old ones (and under everything else). */
const FADING_BELOW_DEPTH = 1;
const FADING_ABOVE_DEPTH = ABOVE_DEPTH + 0.25;

/** Textures and images of one drawn style. */
export interface PhaserTheme {
  readonly belowKey: string;
  readonly aboveKey: string;
  below: Phaser.GameObjects.Image | null;
  above: Phaser.GameObjects.Image | null;
  /** More textures to free with this style (the unrecolored images of the first style). */
  readonly extraKeys?: readonly string[];
}

/** Style textures of the scene, removed on release (the textures of the page's first style too). */
export class PhaserThemeBackend implements ThemeBackend<PhaserTheme> {
  #loads = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  async load(assets: ThemeAssets): Promise<PhaserTheme> {
    const id = ++this.#loads;
    const [belowKey, aboveKey] = await Promise.all([
      this.#loadImage(`theme:${String(id)}:below`, assets.belowUrl, assets.colorMatrix),
      this.#loadImage(`theme:${String(id)}:above`, assets.aboveUrl, assets.colorMatrix),
    ]);
    return { belowKey, aboveKey, below: null, above: null };
  }

  show(next: PhaserTheme, previous: PhaserTheme): Promise<void> {
    const { scene } = this;
    const below = scene.add.image(0, 0, next.belowKey).setOrigin(0).setDepth(FADING_BELOW_DEPTH);
    const above = scene.add.image(0, 0, next.aboveKey).setOrigin(0).setDepth(FADING_ABOVE_DEPTH);
    below.setAlpha(0);
    above.setAlpha(0);
    next.below = below;
    next.above = above;
    return new Promise((resolve) => {
      scene.tweens.add({
        targets: [below, above],
        alpha: 1,
        duration: THEME_FADE_MS,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          previous.below?.destroy();
          previous.above?.destroy();
          previous.below = null;
          previous.above = null;
          below.setDepth(0);
          above.setDepth(ABOVE_DEPTH);
          resolve();
        },
      });
    });
  }

  release(textures: PhaserTheme): void {
    textures.below?.destroy();
    textures.above?.destroy();
    for (const key of [textures.belowKey, textures.aboveKey, ...(textures.extraKeys ?? [])]) {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
  }

  /** Loads one image under `key`; a color variant is recolored once into a canvas texture. */
  #loadImage(key: string, url: string, matrix: readonly number[] | null): Promise<string> {
    const { load, textures } = this.scene;
    const rawKey = matrix === null ? key : `${key}:raw`;
    return new Promise((resolve, reject) => {
      const completeEvent = `${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${rawKey}`;
      const settle = () => {
        load.off(completeEvent, onComplete);
        load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      };
      const onComplete = () => {
        settle();
        if (matrix === null) {
          resolve(key);
          return;
        }
        const source = textures.get(rawKey).getSourceImage();
        if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
          reject(new Error(`Style image ${url} cannot be recolored`));
          return;
        }
        textures.addCanvas(key, recolorImage(source, matrix));
        textures.remove(rawKey);
        resolve(key);
      };
      const onError = (file: Phaser.Loader.File) => {
        if (file.key !== rawKey) return;
        settle();
        reject(new Error(`Style image ${url} could not be loaded`));
      };
      load.on(completeEvent, onComplete);
      load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      load.image(rawKey, url);
      if (!load.isLoading()) load.start();
    });
  }
}
