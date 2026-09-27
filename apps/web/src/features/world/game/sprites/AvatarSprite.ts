import { TILE_SIZE, type Direction, type EffectivePresence } from '@bululu/shared';
import * as Phaser from 'phaser';

import { PRESENCE_COLORS } from '../constants';
import { AVATAR_FRAMES_PER_ROW, AVATAR_ROW } from '../textures';
import { ConversationBubble, MEETING_GLYPH } from './ConversationBubble';
import { avatarDepth, labelDepth } from './depth';

export { ABOVE_DEPTH, AVATAR_BASE_DEPTH } from './depth';

/** Label offset from the avatar center, in pixels (just over the head). */
const LABEL_OFFSET_Y = -TILE_SIZE / 2 - 6;

/** Radius of the status dot drawn left of the name (RF-11). */
const DOT_RADIUS = 4;
/** Gap between the status dot and the name label. */
const DOT_GAP = 3;

const REACTION_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
  fontSize: '22px',
};

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
 * An avatar and its name label (E3-S3, E3-S5, E4-S5), for the local and the remote players,
 * with a status dot (E7-S1), the 💬 of a hallway conversation (E5-S2), the 📹 of a meeting room
 * (E6-S4) and reactions (E7-S4). Position it with `setTilePosition`
 * (fractional tiles while walking), animate it with `setMotion`, fade it with `setOpacity`.
 *
 * The label, the dot, the 💬 and the reaction are separate game objects drawn over the `above` art layer
 * (a container child would share the avatar depth and hide under trees). Every setter is a no-op when the value
 * does not change, so calling them every frame neither allocates nor re-sorts the scene.
 */
export class AvatarSprite extends Phaser.GameObjects.Container {
  private readonly figure: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private readonly dot: Phaser.GameObjects.Arc;
  private reaction: Phaser.GameObjects.Text | null = null;
  private reactionTimer: ReturnType<typeof setTimeout> | null = null;
  private presence: EffectivePresence = 'available';
  private textureKey: string;
  private motionDir: Direction | null = null;
  private motionMoving = false;
  private opacity = 1;
  /** Created the first time the person talks in the hallway. */
  private bubble: ConversationBubble | null = null;
  /** Created the first time the person enters a meeting room. */
  private meeting: ConversationBubble | null = null;

  constructor(scene: Phaser.Scene, textureKey: string, displayName: string) {
    super(scene, 0, 0);
    this.textureKey = textureKey;
    ensureAvatarAnimations(scene, textureKey);
    this.figure = scene.add.sprite(0, 0, textureKey, AVATAR_ROW.down * AVATAR_FRAMES_PER_ROW + 1);
    this.label = scene.add.text(0, 0, displayName, LABEL_STYLE).setOrigin(0.5, 1);
    // Crisp text at every zoom level although the game renders in pixel-art mode.
    this.label.setResolution(Math.max(2, Math.ceil(window.devicePixelRatio * 2)));
    this.label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.dot = scene.add
      .circle(0, 0, DOT_RADIUS, PRESENCE_COLORS.available)
      .setStrokeStyle(1, 0x0f172a, 0.8);
    this.add(this.figure);
    scene.add.existing(this);
  }

  /** Places the avatar centered on a tile; fractional values while walking between tiles. */
  setTilePosition(x: number, y: number): this {
    const px = x * TILE_SIZE + TILE_SIZE / 2;
    const py = y * TILE_SIZE + TILE_SIZE / 2;
    if (px !== this.x || py !== this.y) {
      this.setPosition(px, py);
      this.placeOverlays();
    }
    const depth = avatarDepth(y);
    if (depth !== this.depth) {
      this.setDepth(depth);
      this.label.setDepth(labelDepth(y));
      this.dot.setDepth(labelDepth(y));
      this.reaction?.setDepth(labelDepth(y));
      this.bubble?.setDepth(labelDepth(y));
      this.meeting?.setDepth(labelDepth(y));
    }
    return this;
  }

  /** Status dot color: green available, red busy, grey away (RF-11). */
  setPresence(presence: EffectivePresence): this {
    if (presence === this.presence) return this;
    this.presence = presence;
    this.dot.setFillStyle(PRESENCE_COLORS[presence]);
    return this;
  }

  /**
   * Shows `emoji` over the name for `durationMs` of wall-clock time (E7-S4; the scene clock slows
   * down in background tabs); a new reaction replaces the current one.
   */
  showReaction(emoji: string, durationMs: number): this {
    if (this.reactionTimer !== null) clearTimeout(this.reactionTimer);
    if (this.reaction === null) {
      this.reaction = this.scene.add
        .text(0, 0, emoji, REACTION_STYLE)
        .setOrigin(0.5, 1)
        .setDepth(this.label.depth)
        .setAlpha(this.opacity);
    } else {
      this.reaction.setText(emoji);
    }
    this.placeOverlays();
    this.reactionTimer = setTimeout(() => {
      this.clearReaction();
    }, durationMs);
    return this;
  }

  /** Current status dot (debug probe). */
  get presenceState(): EffectivePresence {
    return this.presence;
  }

  /** Emoji currently shown over the avatar, `null` when none (debug probe). */
  get currentReaction(): string | null {
    return this.reaction?.text ?? null;
  }

  /** Shows the 💬 over the name while the person is in a hallway conversation (E5-S2). */
  setInConversation(talking: boolean): this {
    if (talking === (this.bubble?.visible ?? false)) return this;
    if (this.bubble === null) {
      this.bubble = new ConversationBubble(this.scene)
        .setDepth(this.label.depth)
        .setAlpha(this.opacity);
      this.placeOverlays();
    }
    this.bubble.setVisible(talking);
    return this;
  }

  /** Shows the 📹 next to the name while the person is in a meeting room (E6-S4). */
  setInMeeting(inMeeting: boolean): this {
    if (inMeeting === (this.meeting?.visible ?? false)) return this;
    if (this.meeting === null) {
      this.meeting = new ConversationBubble(this.scene, MEETING_GLYPH)
        .setDepth(this.label.depth)
        .setAlpha(this.opacity);
      this.placeOverlays();
    }
    this.meeting.setVisible(inMeeting);
    return this;
  }

  /** Whether the 📹 is shown (debug probe). */
  get inMeeting(): boolean {
    return this.meeting?.visible ?? false;
  }

  /** Whether the 💬 is shown (debug probe). */
  get inConversation(): boolean {
    return this.bubble?.visible ?? false;
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
    this.dot.setAlpha(alpha);
    this.reaction?.setAlpha(alpha);
    this.bubble?.setAlpha(alpha);
    this.meeting?.setAlpha(alpha);
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
    if (this.label.text !== name) {
      this.label.setText(name);
      this.placeOverlays();
    }
    return this;
  }

  /** The name label, for tests and debugging. */
  get nameLabel(): Phaser.GameObjects.Text {
    return this.label;
  }

  override destroy(fromScene?: boolean): void {
    this.clearReaction();
    this.label.destroy();
    this.dot.destroy();
    this.bubble?.destroy();
    this.meeting?.destroy();
    super.destroy(fromScene);
  }

  /** Label over the head, the dot left of it, the 💬 / 📹 right of it, the reaction over them. */
  private placeOverlays(): void {
    const labelY = this.y + LABEL_OFFSET_Y;
    this.label.setPosition(this.x, labelY);
    const labelHeight = this.label.height;
    this.dot.setPosition(
      this.x - this.label.width / 2 - DOT_GAP - DOT_RADIUS,
      labelY - labelHeight / 2,
    );
    this.bubble?.setPosition(this.x + this.label.width / 2 + DOT_GAP, labelY);
    this.meeting?.setPosition(this.x + this.label.width / 2 + DOT_GAP, labelY);
    this.reaction?.setPosition(this.x, labelY - labelHeight - 2);
  }

  private clearReaction(): void {
    if (this.reactionTimer !== null) clearTimeout(this.reactionTimer);
    this.reactionTimer = null;
    this.reaction?.destroy();
    this.reaction = null;
  }
}
