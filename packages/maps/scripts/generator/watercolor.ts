/**
 * "Acuarela" office style (E9-S1): a painted-looking skin produced from the tile layers of the
 * same map, so it keeps the exact geometry (architecture §8.1, ADR-011). The floor becomes a
 * flat wash with soft blotches; furniture and objects get lighter pastel colors, soft edges and
 * a sepia ink line. Deterministic, like the rest of the generator.
 */
import { hash2, Raster } from './raster.js';

/** Paper color the washes blend into. */
const PAPER = [247, 240, 226] as const;
/** Channel quantization step: flat washes compress much better in PNG. */
const QUANT = 4;

interface WashOptions {
  /** Blur radius of the wash, in pixels. */
  readonly radius: number;
  /** How much of the sharp original survives under the wash (0..1). */
  readonly detail: number;
  /** Share of paper color in every pixel (0..1): lighter, pastel colors. */
  readonly paper: number;
  /** Size in pixels of the pigment blotches and their strength (± fraction of brightness). */
  readonly blotchCell: number;
  readonly blotch: number;
  /** Seed of the blotches. */
  readonly salt: number;
}

const FLOOR_WASH: WashOptions = {
  radius: 10,
  detail: 0.08,
  paper: 0.28,
  blotchCell: 56,
  blotch: 0.07,
  salt: 1,
};
const OBJECT_WASH: WashOptions = {
  radius: 1,
  detail: 0.55,
  paper: 0.18,
  blotchCell: 24,
  blotch: 0.04,
  salt: 2,
};
/** Ink line around objects. */
const INK = '#6b5443b0';

/** Separable box blur of premultiplied RGBA, clamped at the borders (running sums). */
function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const pass = (input: Float32Array, horizontal: boolean): Float32Array => {
    const output = new Float32Array(input.length);
    const size = radius * 2 + 1;
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const index = (line: number, i: number) =>
      (horizontal ? line * width + i : i * width + line) * 4;
    for (let line = 0; line < lines; line++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          sum += input[index(line, Math.min(length - 1, Math.max(0, k))) + c] ?? 0;
        }
        for (let i = 0; i < length; i++) {
          output[index(line, i) + c] = sum / size;
          const leaving = Math.max(0, i - radius);
          const entering = Math.min(length - 1, i + radius + 1);
          sum += (input[index(line, entering) + c] ?? 0) - (input[index(line, leaving) + c] ?? 0);
        }
      }
    }
    return output;
  };
  return pass(pass(src, true), false);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [-1, 1]: soft pigment blotches of about `cell` pixels. */
function blotches(x: number, y: number, cell: number, salt: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = smoothstep(x / cell - gx);
  const ty = smoothstep(y / cell - gy);
  const top = hash2(gx, gy, salt) * (1 - tx) + hash2(gx + 1, gy, salt) * tx;
  const bottom = hash2(gx, gy + 1, salt) * (1 - tx) + hash2(gx + 1, gy + 1, salt) * tx;
  return (top * (1 - ty) + bottom * ty) * 2 - 1;
}

function quantize(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / QUANT) * QUANT));
}

/** A watercolor wash of `src` (same size). Transparent pixels stay transparent. */
function wash(src: Raster, options: WashOptions): Raster {
  const { width, height } = src;
  const premultiplied = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = (src.data[i * 4 + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c++) premultiplied[i * 4 + c] = (src.data[i * 4 + c] ?? 0) * a;
    premultiplied[i * 4 + 3] = a;
  }
  const washed = boxBlur(premultiplied, width, height, options.radius);
  const out = new Raster(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = src.data[i + 3] ?? 0;
      if (alpha === 0) continue;
      const washAlpha = washed[i + 3] ?? 0;
      const shade = 1 + blotches(x, y, options.blotchCell, options.salt) * options.blotch;
      const channel = (c: 0 | 1 | 2) => {
        const soft = washAlpha > 0 ? (washed[i + c] ?? 0) / washAlpha : 0;
        const mixed = soft * (1 - options.detail) + (src.data[i + c] ?? 0) * options.detail;
        return quantize((mixed * (1 - options.paper) + PAPER[c] * options.paper) * shade);
      };
      out.set(x, y, [channel(0), channel(1), channel(2), alpha]);
    }
  }
  return out;
}

/** The `below` image of the watercolor style: washed floor, then inked pastel objects. */
export function watercolorBelow(floor: Raster, objects: Raster): Raster {
  const out = wash(floor, FLOOR_WASH);
  out.draw(watercolorObjects(objects), 0, 0);
  return out;
}

/** Objects (furniture, tree tops…) in watercolor: pastel wash and a sepia ink line. */
export function watercolorObjects(objects: Raster): Raster {
  const painted = wash(objects, OBJECT_WASH);
  painted.outline(INK, 128);
  return painted;
}
