import { PROXIMITY_HYSTERESIS, PROXIMITY_RADIUS } from '@bululu/shared';

/** Opacity of a hallway video at the edge of the conversation, just before it is cut. */
export const VIDEO_MIN_OPACITY = 0.35;

/** Distance in tiles between two people, measured like the proximity engine (euclidean). */
export function tileDistance(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Opacity of the video of a hallway peer by distance (E5-S6, RN-02): fully visible up to one
 * tile before the radius, then fading linearly until `radius + hysteresis`, where the server
 * ends the conversation; so people see the video fade before it disappears.
 */
export function videoOpacity(
  distance: number,
  radius: number = PROXIMITY_RADIUS,
  hysteresis: number = PROXIMITY_HYSTERESIS,
): number {
  const fadeStart = radius - 1;
  const fadeEnd = radius + hysteresis;
  if (distance <= fadeStart) return 1;
  if (distance >= fadeEnd) return VIDEO_MIN_OPACITY;
  const t = (distance - fadeStart) / (fadeEnd - fadeStart);
  return 1 - t * (1 - VIDEO_MIN_OPACITY);
}
