/** Desk decoration catalog (E9-S3): neutral 16×16 objects that fit every theme. */
import { P } from './palette.js';
import { Raster, mix } from './raster.js';

export const DECOR_SIZE = 16;

export interface DecorSpec {
  readonly id: string;
  readonly name: string;
  paint(r: Raster): void;
}

export const DECOR: readonly DecorSpec[] = [
  {
    id: 'plant',
    name: 'Planta',
    paint(r) {
      r.rect(5, 10, 6, 5, P.potA);
      r.rect(5, 10, 6, 1, P.potB);
      r.ellipse(3, 2, 10, 9, P.leafB);
      r.ellipse(4, 3, 7, 6, P.leafA);
      r.px(6, 4, P.leafC);
    },
  },
  {
    id: 'lamp',
    name: 'Lámpara',
    paint(r) {
      r.rect(3, 13, 7, 2, P.metalDark);
      r.vline(5, 7, 6, P.metalDark);
      r.hline(5, 6, 4, P.metalDark);
      r.roundRect(8, 3, 6, 5, P.lampShade, 1);
      r.hline(9, 4, 4, P.lampLight);
    },
  },
  {
    id: 'mug',
    name: 'Taza',
    paint(r) {
      r.roundRect(4, 5, 7, 9, P.white, 1);
      r.hline(4, 9, 7, '#3d9adb');
      r.rect(11, 7, 2, 1, P.white);
      r.rect(12, 8, 1, 3, P.white);
      r.rect(11, 11, 2, 1, P.white);
      r.hline(5, 5, 5, '#6b4527');
      r.px(6, 2, '#ffffff80');
      r.px(8, 1, '#ffffff80');
    },
  },
  {
    id: 'frame',
    name: 'Cuadro',
    paint(r) {
      r.rect(3, 2, 10, 12, P.shelfWood);
      r.rect(4, 3, 8, 10, P.glass);
      r.ellipse(4, 8, 8, 5, P.leafA);
      r.px(9, 5, P.flowerYellow);
      r.px(10, 5, P.flowerYellow);
    },
  },
  {
    id: 'trophy',
    name: 'Trofeo',
    paint(r) {
      const gold = '#e9c46a';
      const goldDark = '#c89b2c';
      r.roundRect(4, 2, 8, 6, gold, 1);
      r.px(3, 3, goldDark);
      r.px(12, 3, goldDark);
      r.rect(7, 8, 2, 3, goldDark);
      r.rect(5, 11, 6, 3, P.shelfWood);
      r.px(6, 3, '#fff3c4');
    },
  },
  {
    id: 'cat',
    name: 'Gato',
    paint(r) {
      const fur = '#f4a259';
      const dark = mix(fur, '#000000', 0.25);
      r.ellipse(3, 7, 10, 8, fur);
      r.ellipse(4, 2, 8, 7, fur);
      r.px(4, 1, fur);
      r.px(5, 2, fur);
      r.px(11, 1, fur);
      r.px(10, 2, fur);
      r.px(6, 5, P.outline);
      r.px(9, 5, P.outline);
      r.hline(3, 10, 3, dark);
      r.rect(12, 9, 2, 5, dark);
    },
  },
  {
    id: 'books',
    name: 'Libros',
    paint(r) {
      r.rect(2, 11, 12, 3, P.books[0]);
      r.rect(3, 8, 10, 3, P.books[1]);
      r.rect(2, 5, 11, 3, P.books[2]);
      r.hline(3, 12, 10, P.white);
      r.hline(4, 9, 8, P.white);
      r.hline(3, 6, 9, P.white);
    },
  },
  {
    id: 'globe',
    name: 'Globo terráqueo',
    paint(r) {
      r.rect(5, 13, 6, 2, P.shelfWood);
      r.vline(8, 11, 2, P.metalDark);
      r.ellipse(3, 1, 10, 10, '#4fa3d9');
      r.rect(5, 3, 3, 3, P.leafA);
      r.rect(8, 6, 3, 2, P.leafA);
      r.px(6, 2, '#ffffff');
    },
  },
  {
    id: 'cactus',
    name: 'Cactus',
    paint(r) {
      r.rect(5, 11, 6, 4, P.potA);
      r.roundRect(6, 2, 4, 9, '#5cab7d', 1);
      r.rect(3, 5, 2, 3, '#5cab7d');
      r.rect(4, 7, 2, 1, '#5cab7d');
      r.rect(11, 4, 2, 3, '#5cab7d');
      r.rect(10, 6, 2, 1, '#5cab7d');
      r.px(7, 4, '#9fe0b6');
      r.px(8, 7, '#9fe0b6');
    },
  },
  {
    id: 'radio',
    name: 'Radio',
    paint(r) {
      r.vline(11, 1, 5, P.metalDark);
      r.roundRect(1, 5, 14, 9, '#e07a5f', 1);
      r.ellipse(3, 7, 6, 6, P.outline);
      r.ellipse(4, 8, 4, 4, P.metalDark);
      r.rect(10, 7, 4, 2, P.white);
      r.rect(10, 10, 2, 2, P.flowerYellow);
    },
  },
  {
    id: 'clock',
    name: 'Reloj',
    paint(r) {
      r.ellipse(2, 1, 12, 12, '#3d405b');
      r.ellipse(3, 2, 10, 10, P.white);
      r.vline(8, 4, 4, P.outline);
      r.hline(8, 7, 3, P.outline);
      r.rect(4, 13, 2, 2, '#3d405b');
      r.rect(10, 13, 2, 2, '#3d405b');
    },
  },
  {
    id: 'flag',
    name: 'Banderín',
    paint(r) {
      r.rect(3, 13, 6, 2, P.metalDark);
      r.vline(5, 1, 12, P.metalDark);
      r.rect(6, 2, 8, 2, '#6d77b3');
      r.rect(6, 4, 8, 2, '#f2cc8f');
      r.rect(6, 6, 8, 2, '#3d9a8b');
    },
  },
  {
    id: 'headphones',
    name: 'Auriculares',
    paint(r) {
      // Headband: the top half of a ring.
      r.ellipse(2, 2, 12, 12, '#565b7a');
      for (let y = 4; y < DECOR_SIZE; y++) {
        for (let x = 0; x < DECOR_SIZE; x++) {
          if (y >= 9 || (x >= 4 && x < 12)) r.set(x, y, [0, 0, 0, 0]);
        }
      }
      r.roundRect(1, 8, 4, 6, '#e07a5f', 1);
      r.roundRect(11, 8, 4, 6, '#e07a5f', 1);
    },
  },
  {
    id: 'donut',
    name: 'Dónut',
    paint(r) {
      r.ellipse(2, 3, 12, 11, '#d4a373');
      r.ellipse(3, 3, 10, 9, '#f28fad');
      r.ellipse(6, 6, 4, 3, '#d4a373');
      r.px(5, 5, P.white);
      r.px(10, 5, P.flowerYellow);
      r.px(9, 10, '#6fb3dd');
      r.px(4, 8, P.leafC);
    },
  },
];

export function drawDecor(spec: DecorSpec): Raster {
  const r = new Raster(DECOR_SIZE, DECOR_SIZE);
  spec.paint(r);
  r.outline(P.outline);
  return r;
}
