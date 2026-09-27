import type { WorldMap } from '@plaza/shared';
import * as Phaser from 'phaser';

import type { ThemeAssets } from '../api/assets';
import type { EventBus } from '../bridge/event-bus';
import type { WorldStore } from '../store/world-store';
import { registerGame } from './game-registry';
import { PreloadScene } from './scenes/PreloadScene';
import { WorldScene } from './scenes/WorldScene';

export interface WorldGameOptions {
  readonly parent: HTMLElement;
  readonly map: WorldMap;
  readonly theme: ThemeAssets;
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly events: EventBus;
  readonly store: WorldStore;
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
        events,
        store,
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
