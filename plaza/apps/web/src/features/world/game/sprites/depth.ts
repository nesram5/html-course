/**
 * Draw order of the world (architecture §8.1), Phaser-free so it can be unit tested:
 * `below` image (0; a style fading in: 1) → room overlays (10) → desk objects (20) → avatars
 * (100 + row) → `above` image (a style fading in just over it) → desk owner names → avatar name
 * labels, with their status dot, 💬 and reaction.
 */

/** `below` image of the drawn style. */
export const BELOW_DEPTH = 0;
/** `below` image of a style fading in (E9-S1): over the old one, under everything else. */
export const FADING_BELOW_DEPTH = 1;
/** Meeting room borders and names. */
export const ROOM_DEPTH = 10;
/** Desk objects lie on the furniture: over the `below` art and rooms, under every avatar. */
export const DESK_DECOR_DEPTH = 20;

/** Depth of avatars: above the `below` image and room overlays, sorted by row. */
export const AVATAR_BASE_DEPTH = 100;
/** Depth of the `above` image: always over the avatars (architecture §8.1). */
export const ABOVE_DEPTH = 100_000;
/** `above` image of a style fading in (E9-S1): over the old one, under every label. */
export const FADING_ABOVE_DEPTH = ABOVE_DEPTH + 0.25;
/** Desk owner names: over trees and roofs (like avatar names), under the avatar names. */
export const DESK_LABEL_DEPTH = ABOVE_DEPTH + 0.5;
/**
 * Depth of the name labels: over the `above` image, so trees and roofs never hide a name,
 * sorted by row among themselves.
 */
export const LABEL_BASE_DEPTH = ABOVE_DEPTH + 1;

/**
 * Depth of an avatar on a (possibly fractional) row: lower rows are drawn in front. Whole rows
 * only, so an avatar walking between two tiles re-sorts the scene once, not every frame.
 */
export function avatarDepth(tileY: number): number {
  return AVATAR_BASE_DEPTH + Math.round(tileY);
}

/** Depth of the name label of an avatar on a row: always over the `above` art. */
export function labelDepth(tileY: number): number {
  return LABEL_BASE_DEPTH + Math.round(tileY);
}
