/**
 * A tiny RGBA raster with the drawing primitives the procedural art needs. Integer pixel
 * coordinates only; colors are `#rrggbb` or `#rrggbbaa` strings. Every drawing call
 * alpha-blends ("source over"), so pixels outside the raster are silently clipped.
 */

export type Rgba = readonly [number, number, number, number];

const colorCache = new Map<string, Rgba>();

/** Parses `#rrggbb` / `#rrggbbaa`. */
export function rgba(hex: string): Rgba {
  const cached = colorCache.get(hex);
  if (cached !== undefined) return cached;
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (match === null) throw new Error(`bad color ${hex}`);
  const value = Number.parseInt(match[1] ?? '000000', 16);
  const color: Rgba = [
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
    match[2] === undefined ? 255 : Number.parseInt(match[2], 16),
  ];
  colorCache.set(hex, color);
  return color;
}

/** Same color with another alpha (0..1). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex.slice(0, 7)}${a.toString(16).padStart(2, '0')}`;
}

/** Mixes two `#rrggbb` colors (`t = 0` → a, `t = 1` → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = rgba(a);
  const cb = rgba(b);
  const channel = (i: 0 | 1 | 2) => Math.round(ca[i] + (cb[i] - ca[i]) * t);
  return `#${[channel(0), channel(1), channel(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export class Raster {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  /** Blends one pixel. */
  px(x: number, y: number, color: string | Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const [r, g, b, a] = typeof color === 'string' ? rgba(color) : color;
    if (a === 0) return;
    const i = (y * this.width + x) * 4;
    if (a === 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    const da = (this.data[i + 3] ?? 0) / 255;
    const sa = a / 255;
    const outA = sa + da * (1 - sa);
    const blend = (src: number, dst: number) => Math.round((src * sa + dst * da * (1 - sa)) / outA);
    this.data[i] = blend(r, this.data[i] ?? 0);
    this.data[i + 1] = blend(g, this.data[i + 1] ?? 0);
    this.data[i + 2] = blend(b, this.data[i + 2] ?? 0);
    this.data[i + 3] = Math.round(outA * 255);
  }

  /** Reads one pixel (transparent outside). */
  get(x: number, y: number): Rgba {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i] ?? 0, this.data[i + 1] ?? 0, this.data[i + 2] ?? 0, this.data[i + 3] ?? 0];
  }

  /** Overwrites one pixel, alpha included. */
  set(x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data.set(color, (y * this.width + x) * 4);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    const c = rgba(color);
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.width, x + w); xx++) this.px(xx, yy, c);
    }
  }

  /** Rectangle with the four corner pixels cut (soft pixel-art corners). */
  roundRect(x: number, y: number, w: number, h: number, color: string, radius = 1): void {
    for (let yy = 0; yy < h; yy++) {
      const fromEdge = Math.min(yy, h - 1 - yy);
      const inset = fromEdge < radius ? radius - fromEdge : 0;
      this.rect(x + inset, y + yy, w - inset * 2, 1, color);
    }
  }

  /** Filled ellipse inside the box (x, y, w, h). */
  ellipse(x: number, y: number, w: number, h: number, color: string): void {
    const c = rgba(color);
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const dx = (xx + 0.5 - cx) / rx;
        const dy = (yy + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(xx, yy, c);
      }
    }
  }

  /** Horizontal line. */
  hline(x: number, y: number, w: number, color: string): void {
    this.rect(x, y, w, 1, color);
  }

  /** Vertical line. */
  vline(x: number, y: number, h: number, color: string): void {
    this.rect(x, y, 1, h, color);
  }

  /** Draws another raster (or a region of it) with alpha blending. */
  draw(src: Raster, dx: number, dy: number, sx = 0, sy = 0, w = src.width, h = src.height): void {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const color = src.get(sx + x, sy + y);
        if (color[3] !== 0) this.px(dx + x, dy + y, color);
      }
    }
  }

  /** Copy of a region. */
  crop(x: number, y: number, w: number, h: number): Raster {
    const out = new Raster(w, h);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) out.set(xx, yy, this.get(x + xx, y + yy));
    }
    return out;
  }

  /** Mirrored copy (left ↔ right). */
  flipX(): Raster {
    const out = new Raster(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) out.set(this.width - 1 - x, y, this.get(x, y));
    }
    return out;
  }

  /** Box-filter downscale by an integer factor (premultiplied, so edges do not darken). */
  downscale(factor: number): Raster {
    const out = new Raster(Math.floor(this.width / factor), Math.floor(this.height / factor));
    const n = factor * factor;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let yy = 0; yy < factor; yy++) {
          for (let xx = 0; xx < factor; xx++) {
            const c = this.get(x * factor + xx, y * factor + yy);
            r += c[0] * c[3];
            g += c[1] * c[3];
            b += c[2] * c[3];
            a += c[3];
          }
        }
        out.set(
          x,
          y,
          a === 0
            ? [0, 0, 0, 0]
            : [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / n)],
        );
      }
    }
    return out;
  }

  /**
   * Adds a 1 px outline around opaque shapes: every transparent pixel touching (4-neighbourhood)
   * a pixel with alpha ≥ `threshold` gets `color`.
   */
  outline(color: string, threshold = 200): void {
    const solid = (x: number, y: number) => this.get(x, y)[3] >= threshold;
    const targets: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y)[3] !== 0) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
          targets.push([x, y]);
        }
      }
    }
    for (const [x, y] of targets) this.px(x, y, color);
  }

  /**
   * Applies a 4×5 color matrix (Phaser `ColorMatrix` layout: offsets in 0..255 units) to every
   * pixel. Used to preview color-variant themes in thumbnails.
   */
  applyColorMatrix(m: readonly number[]): void {
    const at = (i: number) => m[i] ?? 0;
    for (let i = 0; i < this.data.length; i += 4) {
      const r = this.data[i] ?? 0;
      const g = this.data[i + 1] ?? 0;
      const b = this.data[i + 2] ?? 0;
      const a = this.data[i + 3] ?? 0;
      const channel = (row: number) =>
        Math.max(
          0,
          Math.min(
            255,
            Math.round(
              at(row * 5) * r +
                at(row * 5 + 1) * g +
                at(row * 5 + 2) * b +
                at(row * 5 + 3) * a +
                at(row * 5 + 4),
            ),
          ),
        );
      this.data[i] = channel(0);
      this.data[i + 1] = channel(1);
      this.data[i + 2] = channel(2);
      this.data[i + 3] = channel(3);
    }
  }
}

/** Deterministic PRNG (mulberry32): same seed → same sequence on every machine. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of tile coordinates in [0, 1): stable texture variation per tile. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
