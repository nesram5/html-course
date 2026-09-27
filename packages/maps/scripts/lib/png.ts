/**
 * Minimal PNG encoder / header reader (RGBA 8-bit, no interlacing) on top of `node:zlib`,
 * so the maps package needs no image dependency. Output is deterministic for a given Node.js
 * (zlib) version: same pixels → same bytes.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Filters every scanline with the filter of smallest absolute sum (the usual heuristic). */
function filterScanlines(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const out = Buffer.alloc((stride + 1) * height);
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    let best = 0;
    let bestSum = Number.POSITIVE_INFINITY;
    for (let filter = 0; filter < 5; filter++) {
      const line = candidates[filter] ?? new Uint8Array(stride);
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const x = row[i] ?? 0;
        const a = i >= 4 ? (row[i - 4] ?? 0) : 0;
        const b = prev[i] ?? 0;
        const c = i >= 4 ? (prev[i - 4] ?? 0) : 0;
        let value: number;
        if (filter === 0) value = x;
        else if (filter === 1) value = x - a;
        else if (filter === 2) value = x - b;
        else if (filter === 3) value = x - ((a + b) >> 1);
        else value = x - paeth(a, b, c);
        value &= 0xff;
        line[i] = value;
        sum += value < 128 ? value : 256 - value;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = filter;
      }
    }
    const offset = y * (stride + 1);
    out[offset] = best;
    out.set(candidates[best] ?? new Uint8Array(stride), offset + 1);
  }
  return out;
}

/** Encodes RGBA pixels (`width * height * 4` bytes) as a PNG file. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new Error('encodePng: wrong buffer size');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter method
  header[12] = 0; // no interlace
  const idat = deflateSync(filterScanlines(width, height, rgba), { level: 9, memLevel: 9 });
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array()),
  ]);
}

export interface PngInfo {
  readonly width: number;
  readonly height: number;
}

/** Reads the size of a PNG from its IHDR chunk; `null` if the bytes are not a PNG. */
export function readPngSize(bytes: Uint8Array): PngInfo | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(SIGNATURE)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Decodes a PNG written by {@link encodePng} (8-bit RGBA, non-interlaced). Used by tests to
 * look at generated pixels.
 */
export function decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const size = readPngSize(bytes);
  if (size === null) throw new Error('decodePng: not a PNG');
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer[24] !== 8 || buffer[25] !== 6 || buffer[28] !== 0) {
    throw new Error('decodePng: only 8-bit RGBA non-interlaced images are supported');
  }
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = size;
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0;
      const a = i >= 4 ? (rgba[y * stride + i - 4] ?? 0) : 0;
      const b = y > 0 ? (rgba[(y - 1) * stride + i] ?? 0) : 0;
      const c = i >= 4 && y > 0 ? (rgba[(y - 1) * stride + i - 4] ?? 0) : 0;
      let value = x;
      if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else if (filter === 4) value = x + paeth(a, b, c);
      rgba[y * stride + i] = value & 0xff;
    }
  }
  return { width, height, rgba };
}
