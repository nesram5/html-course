/**
 * Avatar sprite sheets (E1-S4): 3 columns (walking frames; frame 1 is the standing pose) ×
 * 4 rows (down, left, right, up), 32×32 px per frame.
 */
import { P } from './palette.js';
import { Raster, mix, withAlpha } from './raster.js';

export const AVATAR_FRAME = 32;
export const AVATAR_ROWS = ['down', 'left', 'right', 'up'] as const;
export const AVATAR_FRAMES = 3;

type HairStyle = 'short' | 'long' | 'bun' | 'spiky' | 'ponytail' | 'curly';

export interface AvatarSpec {
  readonly id: string;
  readonly name: string;
  readonly skin: string;
  readonly hair: string;
  readonly style: HairStyle;
  readonly shirt: string;
  readonly pants: string;
}

export const AVATARS: readonly AvatarSpec[] = [
  {
    id: 'avatar-01',
    name: 'Coral',
    skin: '#f1c7a5',
    hair: '#4a2c1d',
    style: 'short',
    shirt: '#e07a5f',
    pants: '#3d405b',
  },
  {
    id: 'avatar-02',
    name: 'Menta',
    skin: '#e8b894',
    hair: '#e9c46a',
    style: 'long',
    shirt: '#81b29a',
    pants: '#2b2d42',
  },
  {
    id: 'avatar-03',
    name: 'Cielo',
    skin: '#c68863',
    hair: '#1f1a17',
    style: 'curly',
    shirt: '#6fa8dc',
    pants: '#4a4e69',
  },
  {
    id: 'avatar-04',
    name: 'Lavanda',
    skin: '#f5d0b5',
    hair: '#b5651d',
    style: 'bun',
    shirt: '#9b8ec7',
    pants: '#3d405b',
  },
  {
    id: 'avatar-05',
    name: 'Mostaza',
    skin: '#8d5a3b',
    hair: '#2b1a12',
    style: 'spiky',
    shirt: '#e9b949',
    pants: '#264653',
  },
  {
    id: 'avatar-06',
    name: 'Grafito',
    skin: '#f0c8a8',
    hair: '#a3a8b4',
    style: 'short',
    shirt: '#565b7a',
    pants: '#1f2937',
  },
  {
    id: 'avatar-07',
    name: 'Tomate',
    skin: '#d9a07a',
    hair: '#c0392b',
    style: 'ponytail',
    shirt: '#f4f1de',
    pants: '#e07a5f',
  },
  {
    id: 'avatar-08',
    name: 'Pino',
    skin: '#a86b4c',
    hair: '#3b2a20',
    style: 'long',
    shirt: '#2a9d8f',
    pants: '#3d405b',
  },
];

type View = 'down' | 'left' | 'up';

function legs(r: Raster, spec: AvatarSpec, view: View, frame: number): void {
  const shoe = mix(spec.pants, '#000000', 0.45);
  const step = frame === 1 ? 0 : frame === 0 ? -1 : 1;
  if (view === 'left') {
    // Profile: legs scissor forwards / backwards.
    const front = 14 - Math.abs(step) * 2;
    const back = 16 + Math.abs(step) * 2;
    r.rect(back, 24, 3, 4, mix(spec.pants, '#000000', 0.2));
    r.rect(back, 28, 3, 1, shoe);
    r.rect(front, 24, 3, 4, spec.pants);
    r.rect(front - 1, 28, 4, 1, shoe);
    return;
  }
  const leftLift = step < 0 ? 1 : 0;
  const rightLift = step > 0 ? 1 : 0;
  r.rect(12, 24, 3, 4 - leftLift, spec.pants);
  r.rect(12, 28 - leftLift, 3, 1, shoe);
  r.rect(17, 24, 3, 4 - rightLift, spec.pants);
  r.rect(17, 28 - rightLift, 3, 1, shoe);
}

function torso(r: Raster, spec: AvatarSpec, view: View, frame: number): void {
  const shade = mix(spec.shirt, '#000000', 0.18);
  const swing = frame === 1 ? 0 : frame === 0 ? -1 : 1;
  if (view === 'left') {
    r.roundRect(11, 17, 10, 8, spec.shirt, 2);
    r.hline(11, 24, 10, shade);
    r.rect(14 + swing * 2, 18, 3, 5, shade);
    r.rect(14 + swing * 2, 23, 3, 1, spec.skin);
    return;
  }
  r.roundRect(10, 17, 12, 8, spec.shirt, 2);
  r.hline(10, 24, 12, shade);
  r.rect(8, 18 - swing, 2, 5, spec.shirt);
  r.rect(8, 23 - swing, 2, 1, spec.skin);
  r.rect(22, 18 + swing, 2, 5, spec.shirt);
  r.rect(22, 23 + swing, 2, 1, spec.skin);
  if (view === 'down') r.rect(14, 17, 4, 1, mix(spec.shirt, '#ffffff', 0.35));
}

function face(r: Raster, view: View): void {
  if (view === 'up') return;
  const eye = P.outline;
  if (view === 'down') {
    r.rect(12, 10, 2, 3, eye);
    r.rect(18, 10, 2, 3, eye);
    r.px(12, 10, '#ffffff');
    r.px(18, 10, '#ffffff');
    r.px(11, 13, withAlpha('#f28fad', 0.6));
    r.px(20, 13, withAlpha('#f28fad', 0.6));
    r.hline(15, 14, 2, withAlpha('#7a3b2e', 0.7));
  } else {
    r.rect(10, 10, 2, 3, eye);
    r.px(10, 10, '#ffffff');
    r.px(10, 13, withAlpha('#f28fad', 0.6));
  }
}

function hair(r: Raster, spec: AvatarSpec, view: View): void {
  const h = spec.hair;
  const dark = mix(h, '#000000', 0.25);
  const light = mix(h, '#ffffff', 0.25);
  // Behind-the-head parts first for long styles.
  if (spec.style === 'long') {
    if (view === 'up') r.roundRect(8, 4, 16, 16, dark, 3);
    else if (view === 'down') {
      r.rect(8, 7, 3, 12, dark);
      r.rect(21, 7, 3, 12, dark);
    } else r.rect(15, 7, 8, 12, dark);
  }
  if (spec.style === 'ponytail' && view !== 'down') {
    if (view === 'up') r.roundRect(14, 12, 4, 8, dark, 1);
    else r.roundRect(21, 7, 4, 9, dark, 1);
  }
  if (spec.style === 'curly') {
    for (const [x, y] of [
      [7, 4],
      [11, 1],
      [16, 1],
      [21, 4],
      [7, 9],
      [22, 9],
    ] as const) {
      // In profile the curls in front of the face would hide the eye.
      if (view === 'left' && x < 11) continue;
      r.ellipse(x, y, 7, 7, view === 'down' && y === 9 ? dark : h);
    }
  }
  // Top of the head.
  r.roundRect(9, 2, 14, 6, h, 3);
  r.hline(12, 3, 6, light);
  if (view === 'down') {
    r.rect(9, 6, 3, 4, h);
    r.rect(20, 6, 3, 4, h);
    r.rect(12, 6, 3, 2, h);
    r.rect(17, 6, 2, 1, h);
  } else if (view === 'left') {
    r.rect(14, 6, 9, 8, h);
    r.rect(9, 6, 3, 2, h);
  } else {
    r.roundRect(9, 5, 14, 11, h, 3);
    r.hline(11, 14, 10, dark);
  }
  if (spec.style === 'bun') r.ellipse(12, -1, 8, 7, dark);
  if (spec.style === 'spiky') {
    for (let i = 0; i < 4; i++) {
      r.rect(10 + i * 3, 0, 2, 3, h);
      r.px(10 + i * 3, 0, light);
    }
  }
}

function drawFrame(spec: AvatarSpec, view: View, frame: number): Raster {
  const body = new Raster(AVATAR_FRAME, AVATAR_FRAME);
  legs(body, spec, view, frame);
  torso(body, spec, view, frame);
  body.roundRect(9, 3, 14, 14, spec.skin, 3);
  if (view === 'left') body.px(8, 11, spec.skin);
  face(body, view);
  hair(body, spec, view);
  body.outline(P.outline);

  const out = new Raster(AVATAR_FRAME, AVATAR_FRAME);
  out.ellipse(9, 27, 14, 5, P.shadow);
  // Bob up one pixel on the stepping frames.
  out.draw(body, 0, frame === 1 ? 0 : -1);
  return out;
}

/** Sprite sheet of `3 × 32` by `4 × 32` px. */
export function drawAvatarSheet(spec: AvatarSpec): Raster {
  const sheet = new Raster(AVATAR_FRAME * AVATAR_FRAMES, AVATAR_FRAME * AVATAR_ROWS.length);
  AVATAR_ROWS.forEach((row, rowIndex) => {
    for (let frame = 0; frame < AVATAR_FRAMES; frame++) {
      const view: View = row === 'right' ? 'left' : row;
      const picture = drawFrame(spec, view, frame);
      sheet.draw(
        row === 'right' ? picture.flipX() : picture,
        frame * AVATAR_FRAME,
        rowIndex * AVATAR_FRAME,
      );
    }
  });
  return sheet;
}
