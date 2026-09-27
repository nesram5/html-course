import { describe, expect, it } from 'vitest';

import { Raster, createRandom, mix, rgba, withAlpha } from '../generator/raster.js';
import { decodePng, encodePng, readPngSize } from '../lib/png.js';

describe('png', () => {
  it('round-trips RGBA pixels through encode/decode', () => {
    const random = createRandom(42);
    const width = 13;
    const height = 7;
    const pixels = Uint8Array.from({ length: width * height * 4 }, () =>
      Math.floor(random() * 256),
    );

    const png = encodePng(width, height, pixels);
    const decoded = decodePng(png);

    expect(readPngSize(png)).toEqual({ width, height });
    expect(decoded.width).toBe(width);
    expect(Buffer.from(decoded.rgba).equals(Buffer.from(pixels))).toBe(true);
  });

  it('is deterministic', () => {
    const pixels = new Uint8Array(16 * 16 * 4).fill(200);
    expect(encodePng(16, 16, pixels).equals(encodePng(16, 16, pixels))).toBe(true);
  });

  it('rejects wrong buffers and non-PNG bytes', () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(/wrong buffer size/);
    expect(readPngSize(Buffer.from('definitely not a png, just some text'))).toBeNull();
    expect(() => decodePng(Buffer.from('nope'))).toThrow(/not a PNG/);
  });
});

describe('raster', () => {
  it('parses and mixes colors', () => {
    expect(rgba('#ff8000')).toEqual([255, 128, 0, 255]);
    expect(rgba('#ff800080')).toEqual([255, 128, 0, 128]);
    expect(withAlpha('#ff8000', 0.5)).toBe('#ff800080');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(() => rgba('red')).toThrow(/bad color/);
  });

  it('blends, clips and applies color matrices', () => {
    const r = new Raster(2, 1);
    r.px(0, 0, '#ff0000');
    r.px(0, 0, '#0000ff80');
    r.px(5, 5, '#ffffff');
    expect(r.get(0, 0)).toEqual([127, 0, 128, 255]);
    expect(r.get(9, 9)).toEqual([0, 0, 0, 0]);

    r.applyColorMatrix([0, 0, 1, 0, 0, 0, 1, 0, 0, 10, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(r.get(0, 0)).toEqual([128, 10, 127, 255]);
  });
});
