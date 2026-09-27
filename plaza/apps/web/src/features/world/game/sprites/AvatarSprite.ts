import { TILE_SIZE, type Direction } from '@plaza/shared';
import * as Phaser from 'phaser';

import { AVATAR_FRAMES_PER_ROW, AVATAR_ROW } from '../textures';
import { avatarDepth, labelDepth } from './depth';

export { ABOVE_DEPTH, AVATAR_BASE_DEPTH } from './depth';

/** Label offset from the avatar center, in pixels (just over the head). */
const LABEL_OFFSET_Y = -TILE_SIZE / 2 - 6;

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: '11px',
  color: '#ffffff',
  backgroundColor: 'rgba(15, 23, 42, 0.78)',
  padding: { x: 4, y: 2 },
};

function walkKey(textureKey: string, dir: Direction): string {
  return `${textureKey}-walk-${dir}`;
}

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
 * An avatar and its name label (E3-S3, E3-S5, E4-S5), for the local and the remote players.
 * Position it with `setTilePosition` (fractional tiles while walking), animate it with
 * `setMotion` and fade it with `setOpacity`.
 *
 * The label is a separate game object drawn over the `above` art layer (a container child
 * would share the avatar depth and hide under trees). Every setter is a no-op when the value
 * does not change, so calling them every frame neither allocates nor re-sorts the scene.
 */
export class AvatarSprite extends Phaser.GameObjects.Container {
  private readonly figure: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private textureKey: string;
  private motionDir: Direction | null = null;
  private motionMoving = false;
  private opacity = 1;

  constructor(scene: Phaser.Scene, textureKey: string, displayName: string) {
    super(scene, 0, 0);
    this.textureKey = textureKey;
    ensureAvatarAnimations(scene, textureKey);
    this.figure = scene.add.sprite(0, 0, textureKey, AVATAR_ROW.down * AVATAR_FRAMES_PER_ROW + 1);
    this.label = scene.add.text(0, 0, displayName, LABEL_STYLE).setOrigin(0.5, 1);
    // Crisp text at every zoom level although the game renders in pixel-art mode.
    this.label.setResolution(Math.max(2, Math.ceil(window.devicePixelRatio * 2)));
    this.label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.add(this.figure);
    scene.add.existing(this);
  }

  /** Places the avatar centered on a tile; fractional values while walking between tiles. */
  setTilePosition(x: number, y: number): this {
    const px = x * TILE_SIZE + TILE_SIZE / 2;
    const py = y * TILE_SIZE + TILE_SIZE / 2;
    if (px !== this.x || py !== this.y) {
      this.setPosition(px, py);
      this.label.setPosition(px, py + LABEL_OFFSET_Y);
    }
    const depth = avatarDepth(y);
    if (depth !== this.depth) {
      this.setDepth(depth);
      this.label.setDepth(labelDepth(y));
    }
    return this;
  }

  /** Plays the walk animation towards `dir`, or shows the standing frame when not moving. */
  setMotion(dir: Direction, moving: boolean): this {
    if (this.motionDir === dir && this.motionMoving === moving) return this;
    this.motionDir = dir;
    this.motionMoving = moving;
    if (moving) this.figure.play(walkKey(this.textureKey, dir), true);
    else this.figure.stop().setFrame(AVATAR_ROW[dir] * AVATAR_FRAMES_PER_ROW + 1);
    return this;
  }

  /** Opacity of the avatar and its label (fades, reconnecting). */
  setOpacity(alpha: number): this {
    if (alpha === this.opacity) return this;
    this.opacity = alpha;
    this.setAlpha(alpha);
    this.label.setAlpha(alpha);
    return this;
  }

  /** Shows or hides the figure (a remote sprite sheet still loading); the name stays. */
  setFigureVisible(visible: boolean): this {
    this.figure.setVisible(visible);
    return this;
  }

  /** Switches to another sprite sheet (a remote avatar loaded late or changed). */
  setAvatarTexture(textureKey: string): this {
    if (textureKey === this.textureKey) return this;
    this.textureKey = textureKey;
    ensureAvatarAnimations(this.scene, textureKey);
    this.figure.setTexture(textureKey, AVATAR_ROW.down * AVATAR_FRAMES_PER_ROW + 1);
    // Replay the current motion with the new sheet.
    const dir = this.motionDir ?? 'down';
    const moving = this.motionMoving;
    this.motionDir = null;
    return this.setMotion(dir, moving);
  }

  setDisplayName(name: string): this {
    if (this.label.text !== name) this.label.setText(name);
    return this;
  }

  /** The name label, for tests and debugging. */
  get nameLabel(): Phaser.GameObjects.Text {
    return this.label;
  }

  override destroy(fromScene?: boolean): void {
    this.label.destroy();
    super.destroy(fromScene);
  }
}
