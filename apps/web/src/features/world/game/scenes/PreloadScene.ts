import * as Phaser from 'phaser';

import type { ThemeAssets } from '../../api/assets';
import type { WorldStore } from '../../store/world-store';
import { AVATAR_FRAME_SIZE, SCENES, TEXTURES } from '../textures';

export interface PreloadSceneDeps {
  readonly theme: ThemeAssets;
  readonly avatarUrl: string;
  readonly store: WorldStore;
}

/**
 * Loads the images of the office style (`below` / `above`, architecture §8.1) and the local
 * avatar, publishing progress and errors to the `worldStore` so React can show a progress bar
 * or "Reintentar" (E3-S2). Starts the world scene when everything is in.
 */
export class PreloadScene extends Phaser.Scene {
  private failedFile: string | null = null;

  constructor(private readonly deps: PreloadSceneDeps) {
    super(SCENES.preload);
  }

  preload(): void {
    const { store, theme, avatarUrl } = this.deps;
    store.getState().setLoad({ kind: 'loading', progress: 0 });
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      if (this.failedFile === null) store.getState().setLoad({ kind: 'loading', progress });
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failedFile ??= file.src;
    });
    this.load.image(TEXTURES.below, theme.belowUrl);
    this.load.image(TEXTURES.above, theme.aboveUrl);
    this.load.spritesheet(TEXTURES.localAvatar, avatarUrl, {
      frameWidth: AVATAR_FRAME_SIZE,
      frameHeight: AVATAR_FRAME_SIZE,
    });
  }

  create(): void {
    if (this.failedFile !== null) {
      this.deps.store.getState().setLoad({ kind: 'error', file: this.failedFile });
      return;
    }
    this.scene.start(SCENES.world);
  }
}
