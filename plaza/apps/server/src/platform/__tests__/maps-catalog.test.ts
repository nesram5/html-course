import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixtureMapsCatalog } from '../../test/maps-fixture.js';
import { ManifestMapsCatalog, mapsPackageDir } from '../maps-catalog.js';

describe('ManifestMapsCatalog', () => {
  it('answers templates, themes, rooms and avatars from the manifest', async () => {
    const catalog = fixtureMapsCatalog();

    expect(catalog.hasTemplate('campus@1')).toBe(true);
    expect(catalog.hasTemplate('campus@2')).toBe(false);
    expect(catalog.defaultThemeId('campus@1')).toBe('pixel');
    expect(catalog.defaultThemeId('nope@1')).toBeNull();
    expect(catalog.hasTheme('campus@1', 'night')).toBe(true);
    expect(catalog.hasTheme('office-small@1', 'night')).toBe(false);
    expect(catalog.thumbnailUrl('campus@1', 'night')).toBe(
      '/assets/maps/templates/campus/themes/night/thumbnail.png',
    );
    expect(catalog.thumbnailUrl('campus@1', 'watercolor')).toBeNull();
    expect(await catalog.roomAreas('office-small@1')).toEqual([
      { areaId: 'sala-1', name: 'Sala 1' },
    ]);
    await expect(catalog.roomAreas('nope@1')).rejects.toThrow(/Unknown map template/);
    expect(catalog.hasAvatar('avatar-08')).toBe(true);
    expect(catalog.hasAvatar('avatar-09')).toBe(false);
  });

  it('reports a map that cannot be parsed', async () => {
    const catalog = new ManifestMapsCatalog(
      {
        version: 1,
        templates: [
          {
            id: 'broken@1',
            dir: 'broken',
            name: 'Rota',
            defaultThemeId: 'pixel',
            themes: [{ id: 'pixel', name: 'Píxel' }],
          },
        ],
        avatars: [],
        decor: [],
      },
      { readJson: () => ({}) },
      () => {
        throw new Error('missing collision layer');
      },
    );

    await expect(catalog.roomAreas('broken@1')).rejects.toThrow('missing collision layer');
  });

  it('parses every generated template of @plaza/maps with parseMap', async () => {
    const catalog = ManifestMapsCatalog.fromDir(mapsPackageDir());

    const templates = await catalog.listTemplates();
    expect(templates.map((template) => template.id)).toEqual(['office-small@1', 'campus@1']);
    expect(await catalog.roomAreas('office-small@1')).toEqual([
      { areaId: 'sala-reuniones', name: 'Sala de reuniones' },
    ]);
    expect((await catalog.roomAreas('campus@1')).map((room) => room.areaId)).toEqual([
      'sala-mar',
      'sala-bosque',
      'sala-coral',
    ]);
    for (const template of templates) {
      expect(template.themes.map((theme) => theme.id)).toEqual(['pixel', 'night']);
      expect(catalog.hasTheme(template.id, 'night')).toBe(true);
    }
    const avatars = catalog.listAvatars();
    expect(avatars).toHaveLength(8);
    expect(avatars.every((avatar) => catalog.hasAvatar(avatar.id))).toBe(true);
  });

  it('loads the manifest of a folder (MAPS_DIR) and of the @plaza/maps package', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plaza-maps-'));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ version: 1, templates: [], avatars: [], decor: [] }),
    );

    expect(await ManifestMapsCatalog.fromDir(dir).listTemplates()).toEqual([]);
    expect(Array.isArray(ManifestMapsCatalog.fromDir(mapsPackageDir()).listAvatars())).toBe(true);
  });
});
