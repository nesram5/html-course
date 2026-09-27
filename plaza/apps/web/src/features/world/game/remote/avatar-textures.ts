import * as Phaser from 'phaser';

import { AVATAR_FRAME_SIZE, avatarTextureKey } from '../textures';

type Ready = (textureKey: string) => void;

/**
 * Loads avatar sprite sheets on demand (remote players, E4-S5): each sheet once, shared by
 * every avatar that uses it. `request` calls back at once when the texture is already there.
 * A sheet that fails to load falls back to `fallbackKey` (the local avatar).
 */
export class AvatarTextures {
  private readonly pending = new Map<string, Set<Ready>>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly urlOf: (avatarId: string) => string,
    private readonly fallbackKey: string,
  ) {}

  /** Calls `ready` with the texture key of `avatarId` once it is loaded. Returns a canceller. */
  request(avatarId: string, ready: Ready): () => void {
    const key = avatarTextureKey(avatarId);
    if (this.scene.textures.exists(key)) {
      ready(key);
      return () => undefined;
    }
    let waiting = this.pending.get(key);
    if (waiting === undefined) {
      waiting = new Set();
      this.pending.set(key, waiting);
      this.load(key, avatarId);
    }
    waiting.add(ready);
    const set = waiting;
    return () => {
      set.delete(ready);
    };
  }

  private load(key: string, avatarId: string): void {
    const { load } = this.scene;
    const completeEvent = `${Phaser.Loader.Events.FILE_KEY_COMPLETE}spritesheet-${key}`;
    const settle = (textureKey: string) => {
      const waiting = this.pending.get(key);
      this.pending.delete(key);
      load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      load.off(completeEvent, onComplete);
      for (const ready of waiting ?? []) ready(textureKey);
    };
    const onError = (file: Phaser.Loader.File) => {
      if (file.key === key) settle(this.fallbackKey);
    };
    const onComplete = () => {
      settle(key);
    };
    load.on(completeEvent, onComplete);
    load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    load.spritesheet(key, this.urlOf(avatarId), {
      frameWidth: AVATAR_FRAME_SIZE,
      frameHeight: AVATAR_FRAME_SIZE,
    });
    if (!load.isLoading()) load.start();
  }
}
