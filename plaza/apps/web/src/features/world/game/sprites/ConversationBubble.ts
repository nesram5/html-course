import type * as Phaser from 'phaser';

const BUBBLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
  fontSize: '14px',
};

/** The 💬 of a hallway conversation (E5-S2). */
export const CONVERSATION_GLYPH = '💬';
/** The 📹 of someone in a meeting room (E6-S4). */
export const MEETING_GLYPH = '📹';

/**
 * A small emoji badge right of the name label (the status dot is on its left and reactions over
 * it), at the label depth (over the `above` art layer):
 * - 💬 over a person in a hallway conversation (E5-S2, `inConversation`): tells everyone, also
 *   the people far away, that the hallway there is not private (RN-12);
 * - 📹 over a person in a meeting room (E6-S4, `roomId`): there is a meeting going on.
 */
export class ConversationBubble {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, glyph: string = CONVERSATION_GLYPH) {
    this.text = scene.add.text(0, 0, glyph, BUBBLE_STYLE).setOrigin(0, 1).setVisible(false);
    this.text.setResolution(Math.max(2, Math.ceil(window.devicePixelRatio * 2)));
  }

  get visible(): boolean {
    return this.text.visible;
  }

  setVisible(visible: boolean): this {
    this.text.setVisible(visible);
    return this;
  }

  /** Bottom left corner of the bubble, in pixels. */
  setPosition(x: number, y: number): this {
    this.text.setPosition(x, y);
    return this;
  }

  setDepth(depth: number): this {
    this.text.setDepth(depth);
    return this;
  }

  setAlpha(alpha: number): this {
    this.text.setAlpha(alpha);
    return this;
  }

  destroy(): void {
    this.text.destroy();
  }
}
