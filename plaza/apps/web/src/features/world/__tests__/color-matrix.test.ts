import { describe, expect, it } from 'vitest';

import { applyColorMatrix } from '../game/color-matrix';

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

describe('applyColorMatrix', () => {
  it('keeps pixels with the identity matrix', () => {
    const pixels = Uint8ClampedArray.from([10, 20, 30, 255, 200, 100, 50, 128]);

    applyColorMatrix(pixels, IDENTITY);

    expect(Array.from(pixels)).toEqual([10, 20, 30, 255, 200, 100, 50, 128]);
  });

  it('mixes channels, adds offsets in 0..255 units and clamps', () => {
    // Swap red and blue, add 50 to green, darken blue by half.
    const matrix = [0, 0, 1, 0, 0, 0, 1, 0, 0, 50, 0.5, 0, 0, 0, 0, 0, 0, 0, 1, 0];
    const pixels = Uint8ClampedArray.from([200, 230, 40, 255]);

    applyColorMatrix(pixels, matrix);

    expect(Array.from(pixels)).toEqual([40, 255, 100, 255]);
  });

  it('leaves fully transparent pixels untouched (the "above" image is mostly empty)', () => {
    const pixels = Uint8ClampedArray.from([0, 0, 0, 0]);

    applyColorMatrix(pixels, [0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255]);

    expect(Array.from(pixels)).toEqual([0, 0, 0, 0]);
  });
});
