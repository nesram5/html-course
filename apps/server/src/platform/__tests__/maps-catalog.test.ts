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
    expect(catalog.thumbnailUrl('campus@1', 'sepia')).toBeNull();
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
    await expect(catalog.worldMap('broken@1')).rejects.toThrow('missing collision layer');
    await expect(catalog.worldMap('nope@1')).rejects.toThrow(/Unknown map template/);
  });

  it('parses the whole world map once and caches it (E4-S2)', async () => {
    const catalog = ManifestMapsCatalog.fromDir(mapsPackageDir());

    const map = await catalog.worldMap('office-small@1');

    expect(map.spawns.length).toBeGreaterThan(0);
    expect(map.collisionGrid).toHaveLength(map.width * map.height);
    expect(await catalog.worldMap('office-small@1')).toBe(map);
  });

  it('parses every generated template of @bululu/maps with parseMap', async () => {
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
      expect(template.themes.map((theme) => theme.id)).toEqual(['pixel', 'night', 'watercolor']);
      expect(catalog.hasTheme(template.id, 'night')).toBe(true);
      // The watercolor style has its own images; night reuses the pixel ones (color variant).
      const watercolor = template.themes.find((theme) => theme.id === 'watercolor');
      expect(watercolor?.belowUrl).toMatch(/\/themes\/watercolor\/below\.png$/);
      expect(watercolor?.colorMatrix).toBeNull();
    }
    const decor = catalog.listDecor();
    expect(decor.length).toBeGreaterThanOrEqual(12);
    expect(decor.find((item) => item.id === 'plant')).toEqual({
      id: 'plant',
      name: expect.any(String) as unknown,
      spriteUrl: '/assets/maps/decor/plant.png',
    });
    const avatars = catalog.listAvatars();
    expect(avatars).toHaveLength(8);
    expect(avatars.every((avatar) => catalog.hasAvatar(avatar.id))).toBe(true);
  });

  it('loads the manifest of a folder (MAPS_DIR) and of the @bululu/maps package', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bululu-maps-'));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ version: 1, templates: [], avatars: [], decor: [] }),
    );

    expect(await ManifestMapsCatalog.fromDir(dir).listTemplates()).toEqual([]);
    expect(Array.isArray(ManifestMapsCatalog.fromDir(mapsPackageDir()).listAvatars())).toBe(true);
  });
});
