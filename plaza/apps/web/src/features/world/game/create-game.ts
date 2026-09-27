import type { WorldMap } from '@plaza/shared';
import * as Phaser from 'phaser';

import {
  avatarUrl as conventionalAvatarUrl,
  decorUrl as conventionalDecorUrl,
  type ThemeAssets,
} from '../api/assets';
import type { EventBus } from '../bridge/event-bus';
import type { OfficeStore } from '../store/office-store';
import type { WorldStore } from '../store/world-store';
import { registerGame } from './game-registry';
import { PreloadScene } from './scenes/PreloadScene';
import { WorldScene } from './scenes/WorldScene';

export interface WorldGameOptions {
  readonly parent: HTMLElement;
  readonly map: WorldMap;
  readonly theme: ThemeAssets;
  readonly displayName: string;
  /** Sprite sheet of the local avatar. */
  readonly avatarUrl: string;
  /** Sprite sheets of the avatar catalog by id (remote players); missing ids use the default path. */
  readonly avatarUrls?: Readonly<Record<string, string>>;
  readonly events: EventBus;
  readonly store: WorldStore;
  /** Office style and desks (E9). */
  readonly office: OfficeStore;
  /** Resolves another style of this map for live changes (E9-S1). */
  readonly resolveTheme: (themeId: string) => Promise<ThemeAssets>;
  /** Sprite URL of a decoration object; the conventional `decor/<id>.png` by default (E9-S3). */
  readonly decorUrlOf?: (itemId: string) => string;
  /** Style ids of the template, loaded ahead once the office is drawn. */
  readonly listThemes?: () => Promise<readonly string[]>;
}

/** Handle of a running world: the only thing React keeps. */
export interface WorldGame {
  destroy(): void;
}

/** Creates the Phaser game of the world inside `parent` (E3-S2, E3-S6). */
export function createWorldGame(options: WorldGameOptions): WorldGame {
  const { parent, store, events } = options;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1e2130',
    // Crisp pixel art at every zoom and on HiDPI screens (E3-S2).
    pixelArt: true,
    roundPixels: true,
    banner: false,
    audio: { noAudio: true },
    // Keyboard handled by KeyboardInput so text fields and Tab keep working.
    input: { keyboard: false, gamepad: false },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: Math.max(1, parent.clientWidth),
      height: Math.max(1, parent.clientHeight),
    },
    scene: [
      new PreloadScene({ theme: options.theme, avatarUrl: options.avatarUrl, store }),
      new WorldScene({
        map: options.map,
        theme: options.theme,
        displayName: options.displayName,
        avatarUrlOf: (avatarId) =>
          options.avatarUrls?.[avatarId] ?? conventionalAvatarUrl(avatarId),
        events,
        store,
        office: options.office,
        resolveTheme: options.resolveTheme,
        decorUrlOf: options.decorUrlOf ?? conventionalDecorUrl,
        ...(options.listThemes !== undefined && { listThemes: options.listThemes }),
      }),
    ],
  });
  const release = registerGame();
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      release();
      game.destroy(true);
    },
  };
}
