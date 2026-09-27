/** Duration of one tile step of the local avatar (E3-S3: "~120 ms"). */
export const STEP_MS = 120;

/** Camera zoom levels (E3-S5), cycled with `+` / `-`. */
export const ZOOM_LEVELS = [1, 1.5, 2] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
export const DEFAULT_ZOOM: ZoomLevel = 1.5;

/** Camera follow smoothing (0 = never moves, 1 = sticks to the avatar). */
export const CAMERA_LERP = 0.15;

/** "Localizar" (E7-S2): how long the camera stays on the located person. */
export const LOCATE_MS = 3000;

/** Status dot over the avatars (RF-11), same colors as the `--color-status-*` CSS tokens. */
export const PRESENCE_COLORS = {
  available: 0x22c55e,
  busy: 0xef4444,
  away: 0x9ca3af,
} as const;

/** Next zoom level in a direction, clamped to the available levels. */
export function nextZoom(current: ZoomLevel, direction: 'in' | 'out'): ZoomLevel {
  const index = ZOOM_LEVELS.indexOf(current);
  const next = direction === 'in' ? index + 1 : index - 1;
  return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, next))] ?? current;
}
