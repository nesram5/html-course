import type { AvatarDto } from '@bululu/shared';
import type { CSSProperties } from 'react';

import './avatar-sprite.css';

/** Walking frames per row of the sprite sheet (rows: down, left, right, up). */
const FRAMES = 3;
const ROWS = 4;

interface AvatarSpriteProps {
  avatar: Pick<AvatarDto, 'spriteUrl' | 'frameWidth' | 'frameHeight'>;
  /** Display scale (sprites are pixel art). */
  scale?: number;
  /** Walk in place (facing down); static first frame otherwise. */
  walking?: boolean;
}

/** One avatar of the catalog, drawn from its sprite sheet with a CSS walking animation. */
export function AvatarSprite({ avatar, scale = 2, walking = true }: AvatarSpriteProps) {
  const width = avatar.frameWidth * scale;
  const height = avatar.frameHeight * scale;
  // Dynamic values only (standards §5): size and sheet depend on the catalog entry.
  const style = {
    width,
    height,
    backgroundImage: `url("${avatar.spriteUrl}")`,
    backgroundSize: `${String(width * FRAMES)}px ${String(height * ROWS)}px`,
    '--avatar-walk-to': `-${String(width * FRAMES)}px`,
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      data-testid="avatar-sprite"
      className={`avatar-sprite inline-block bg-no-repeat ${walking ? 'avatar-sprite--walking' : ''}`}
      style={style}
    />
  );
}
