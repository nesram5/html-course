import { afterEach, describe, expect, it, vi } from 'vitest';

import { avatarUrl, loadTheme, loadWorldAssets, mapUrl, templateDir } from '../api/assets';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TINY_TMJ = {
  type: 'map',
  orientation: 'orthogonal',
  infinite: false,
  width: 3,
  height: 3,
  tilewidth: 32,
  tileheight: 32,
  layers: [
    { type: 'tilelayer', name: 'floor', width: 3, height: 3, data: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
    {
      type: 'tilelayer',
      name: 'collision',
      width: 3,
      height: 3,
      data: [1, 1, 1, 1, 0, 1, 1, 1, 1],
    },
    { type: 'objectgroup', name: 'rooms', objects: [] },
    { type: 'objectgroup', name: 'spawns', objects: [{ id: 1, x: 48, y: 48, point: true }] },
    { type: 'objectgroup', name: 'desks', objects: [] },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('map asset URLs', () => {
  it('follows the layout of @bululu/maps served at /assets/maps', () => {
    expect(templateDir('office-small@1')).toBe('office-small');
    expect(mapUrl('campus@2')).toBe('/assets/maps/templates/campus/map.tmj');
    expect(avatarUrl('avatar-03')).toBe('/assets/maps/avatars/avatar-03.png');
  });
});

describe('loadTheme', () => {
  it('uses the images of the theme itself', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse({ name: 'Pixel', author: 'x', license: 'CC0-1.0' })),
      ),
    );

    await expect(loadTheme('office-small@1', 'pixel')).resolves.toEqual({
      themeId: 'pixel',
      belowUrl: '/assets/maps/templates/office-small/themes/pixel/below.png',
      aboveUrl: '/assets/maps/templates/office-small/themes/pixel/above.png',
      colorMatrix: null,
    });
  });

  it('reuses the base images of a color variant and returns its matrix', async () => {
    const matrix = Array.from({ length: 20 }, (_, i) => i);
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          name: 'Noche',
          author: 'x',
          license: 'CC0-1.0',
          baseThemeId: 'pixel',
          colorMatrix: matrix,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const theme = await loadTheme('campus@1', 'night');

    expect(fetchMock).toHaveBeenCalledWith(
      '/assets/maps/templates/campus/themes/night/theme.json',
      expect.anything(),
    );
    expect(theme.belowUrl).toBe('/assets/maps/templates/campus/themes/pixel/below.png');
    expect(theme.colorMatrix).toEqual(matrix);
  });
});

describe('loadWorldAssets', () => {
  it('downloads and parses the map with parseMap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('.tmj')
            ? jsonResponse(TINY_TMJ)
            : jsonResponse({ name: 'P', author: 'a', license: 'CC0-1.0' }),
        ),
      ),
    );

    const { map, theme } = await loadWorldAssets('office-small@1', 'pixel');

    expect(map.width).toBe(3);
    expect(map.spawns).toEqual([{ x: 1, y: 1 }]);
    expect(theme.themeId).toBe('pixel');
  });

  it('fails when an asset is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({}, 404))),
    );

    await expect(loadWorldAssets('office-small@1', 'pixel')).rejects.toThrow(/failed with 404/);
  });
});
