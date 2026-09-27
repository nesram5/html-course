import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MapsManifestSchema, ThemeFileSchema, parseManifest } from '../manifest.js';

const credit = { author: 'Kenney', license: 'CC0-1.0' };

describe('maps manifest', () => {
  it('accepts the committed manifest.json', () => {
    const json: unknown = JSON.parse(
      readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8'),
    );
    expect(() => parseManifest(json)).not.toThrow();
  });

  it('accepts a complete catalog', () => {
    const result = MapsManifestSchema.safeParse({
      version: 1,
      templates: [
        {
          id: 'office-small@1',
          dir: 'office-small',
          name: 'Nombre',
          defaultThemeId: 'pixel',
          themes: [
            { id: 'pixel', name: 'Nombre' },
            { id: 'night', name: 'Nombre' },
          ],
        },
      ],
      avatars: [
        {
          id: 'avatar-01',
          name: 'Nombre',
          file: 'avatar-01.png',
          frameWidth: 32,
          frameHeight: 32,
          credit,
        },
      ],
      decor: [{ id: 'plant', name: 'Nombre', file: 'plant.png', credit }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate ids and a missing default theme', () => {
    const template = {
      id: 'campus@1',
      dir: 'campus',
      name: 'Nombre',
      defaultThemeId: 'watercolor',
      themes: [{ id: 'pixel', name: 'Nombre' }],
    };
    expect(
      MapsManifestSchema.safeParse({ version: 1, templates: [template], avatars: [], decor: [] })
        .success,
    ).toBe(false);
    const item = { id: 'plant', name: 'Nombre', file: 'plant.png', credit };
    expect(
      MapsManifestSchema.safeParse({ version: 1, templates: [], avatars: [], decor: [item, item] })
        .success,
    ).toBe(false);
  });

  it('validates theme.json, including color variants', () => {
    expect(
      ThemeFileSchema.safeParse({ name: 'Pixel', author: 'Plaza', license: 'CC0-1.0' }).success,
    ).toBe(true);
    expect(
      ThemeFileSchema.safeParse({
        name: 'Noche',
        author: 'Plaza',
        license: 'CC0-1.0',
        baseThemeId: 'pixel',
        colorMatrix: Array.from({ length: 20 }, () => 0),
      }).success,
    ).toBe(true);
    expect(ThemeFileSchema.safeParse({ name: 'Sin licencia', author: 'x' }).success).toBe(false);
  });
});
