/**
 * Color variants of an office style (architecture §8.1, plan B): a 4×5 matrix in Phaser's
 * `ColorMatrix` layout (rows r, g, b, a; columns r, g, b, a, offset with offsets in 0..255).
 *
 * It is applied once to the pixels of the `below` / `above` images instead of as a Phaser FX:
 * pre-FX cannot handle objects larger than the game canvas (maps are up to 4096 px) and does
 * not exist in the Canvas renderer.
 */
export function applyColorMatrix(pixels: Uint8ClampedArray, matrix: readonly number[]): void {
  const m = (i: number) => matrix[i] ?? 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    if (a === 0) continue;
    // Uint8ClampedArray rounds and clamps to 0..255 on assignment.
    pixels[i] = m(0) * r + m(1) * g + m(2) * b + m(3) * a + m(4);
    pixels[i + 1] = m(5) * r + m(6) * g + m(7) * b + m(8) * a + m(9);
    pixels[i + 2] = m(10) * r + m(11) * g + m(12) * b + m(13) * a + m(14);
    pixels[i + 3] = m(15) * r + m(16) * g + m(17) * b + m(18) * a + m(19);
  }
}

/** A recolored copy of an image, as a canvas Phaser can use as a texture. */
export function recolorImage(
  image: CanvasImageSource & { width: number; height: number },
  matrix: readonly number[],
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('2D canvas not available');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  applyColorMatrix(data.data, matrix);
  context.putImageData(data, 0, 0);
  return canvas;
}
