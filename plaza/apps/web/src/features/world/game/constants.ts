/** Duration of one tile step of the local avatar (E3-S3: "~120 ms"). */
export const STEP_MS = 120;

/** Camera zoom levels (E3-S5), cycled with `+` / `-`. */
export const ZOOM_LEVELS = [1, 1.5, 2] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
export const DEFAULT_ZOOM: ZoomLevel = 1.5;

/** Camera follow smoothing (0 = never moves, 1 = sticks to the avatar). */
export const CAMERA_LERP = 0.15;

/** Next zoom level in a direction, clamped to the available levels. */
export function nextZoom(current: ZoomLevel, direction: 'in' | 'out'): ZoomLevel {
  const index = ZOOM_LEVELS.indexOf(current);
  const next = direction === 'in' ? index + 1 : index - 1;
  return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, next))] ?? current;
}
