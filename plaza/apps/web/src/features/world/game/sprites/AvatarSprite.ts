import { TILE_SIZE, type Direction } from '@plaza/shared';
import * as Phaser from 'phaser';

import { AVATAR_FRAMES_PER_ROW, AVATAR_ROW } from '../textures';

/** Depth of avatars: above the `below` image and room overlays, sorted by row. */
export const AVATAR_BASE_DEPTH = 100;
/** Depth of the `above` image: always over the avatars (architecture §8.1). */
export const ABOVE_DEPTH = 100_000;

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: '11px',
  color: '#ffffff',
  backgroundColor: 'rgba(15, 23, 42, 0.78)',
  padding: { x: 4, y: 2 },
};

/** Registers the walking animations of a sprite sheet once per texture (4 directions). */
export function ensureAvatarAnimations(scene: Phaser.Scene, textureKey: string): void {
  for (const [dir, row] of Object.entries(AVATAR_ROW)) {
    const key = `${textureKey}-walk-${dir}`;
    if (scene.anims.exists(key)) continue;
    const first = row * AVATAR_FRAMES_PER_ROW;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        frames: [first, first + 1, first + 2, first + 1],
      }),
      // Half a walk cycle (2 frames) per tile step.
      frameRate: 16,
      repeat: -1,
    });
  }
}

/**
 * An avatar with its name label (E3-S3, E3-S5). Reusable for remote players (E4): position it
 * with `setTilePosition` (fractional tiles while walking) and animate it with `setMotion`.
 */
export class AvatarSprite extends Phaser.GameObjects.Container {
  private readonly figure: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private readonly textureKey: string;
  private motion: { dir: Direction; moving: boolean } | null = null;

  constructor(scene: Phaser.Scene, textureKey: string, displayName: string) {
    super(scene, 0, 0);
    this.textureKey = textureKey;
    ensureAvatarAnimations(scene, textureKey);
    this.figure = scene.add.sprite(0, 0, textureKey, AVATAR_ROW.down * AVATAR_FRAMES_PER_ROW + 1);
    this.label = scene.add.text(0, -TILE_SIZE / 2 - 6, displayName, LABEL_STYLE).setOrigin(0.5, 1);
    // Crisp text at every zoom level although the game renders in pixel-art mode.
    this.label.setResolution(Math.max(2, Math.ceil(window.devicePixelRatio * 2)));
    this.label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.add([this.figure, this.label]);
    scene.add.existing(this);
  }

  /** Places the avatar centered on a tile; fractional values while walking between tiles. */
  setTilePosition(x: number, y: number): this {
    this.setPosition(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2);
    this.setDepth(AVATAR_BASE_DEPTH + y);
    return this;
  }

  /** Plays the walk animation towards `dir`, or shows the standing frame when not moving. */
  setMotion(dir: Direction, moving: boolean): this {
    if (this.motion?.dir === dir && this.motion.moving === moving) return this;
    this.motion = { dir, moving };
    if (moving) this.figure.play(`${this.textureKey}-walk-${dir}`, true);
    else this.figure.stop().setFrame(AVATAR_ROW[dir] * AVATAR_FRAMES_PER_ROW + 1);
    return this;
  }

  setDisplayName(name: string): this {
    this.label.setText(name);
    return this;
  }
}
