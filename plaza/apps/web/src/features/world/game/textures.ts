/** Texture keys shared by the scenes. */
export const TEXTURES = {
  below: 'theme-below',
  above: 'theme-above',
  localAvatar: 'avatar-local',
} as const;

/** Scene keys. */
export const SCENES = {
  preload: 'preload',
  world: 'world',
} as const;

/** Avatar sprite sheets: rows down, left, right, up; 3 frames per row, frame 1 standing. */
export const AVATAR_FRAME_SIZE = 32;
export const AVATAR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
export const AVATAR_FRAMES_PER_ROW = 3;
