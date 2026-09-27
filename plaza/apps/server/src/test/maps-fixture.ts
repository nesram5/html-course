import { parseManifest } from '@plaza/maps';

import {
  ManifestMapsCatalog,
  mapsPackageDir,
  type MapRoomArea,
  type ParsedMapInfo,
} from '../platform/maps-catalog.js';

let packageCatalog: ManifestMapsCatalog | undefined;

/**
 * The real `@plaza/maps` catalog (generated templates parsed with `parseMap`, 8 avatars), loaded
 * once per test file. Integration tests use it through `buildTestApp`.
 */
export function packageMapsCatalog(): ManifestMapsCatalog {
  packageCatalog ??= ManifestMapsCatalog.fromDir(mapsPackageDir());
  return packageCatalog;
}

/** Rooms of the fixture templates (areaId → name). */
export const FIXTURE_ROOMS = {
  'office-small@1': [{ areaId: 'sala-1', name: 'Sala 1' }],
  'campus@1': [
    { areaId: 'sala-norte', name: 'Sala Norte' },
    { areaId: 'sala-sur', name: 'Sala Sur' },
    { areaId: 'sala-grande', name: 'Sala Grande' },
  ],
} as const satisfies Record<string, readonly MapRoomArea[]>;

export const FIXTURE_AVATAR_IDS = Array.from(
  { length: 8 },
  (_, i) => `avatar-${String(i + 1).padStart(2, '0')}`,
);

const credit = { author: 'Plaza tests', license: 'CC0-1.0' };

export const FIXTURE_MANIFEST = parseManifest({
  version: 1,
  templates: [
    {
      id: 'office-small@1',
      dir: 'office-small',
      name: 'Oficina pequeña',
      defaultThemeId: 'pixel',
      themes: [{ id: 'pixel', name: 'Píxel' }],
    },
    {
      id: 'campus@1',
      dir: 'campus',
      name: 'Campus',
      defaultThemeId: 'pixel',
      themes: [
        { id: 'pixel', name: 'Píxel' },
        { id: 'night', name: 'Noche' },
      ],
    },
  ],
  avatars: FIXTURE_AVATAR_IDS.map((id) => ({
    id,
    name: `Avatar ${id.slice(-2)}`,
    file: `${id}.png`,
    frameWidth: 32,
    frameHeight: 32,
    credit,
  })),
  decor: [],
});

const FILES: Record<string, unknown> = {
  'templates/office-small/map.tmj': {
    width: 40,
    height: 30,
    rooms: FIXTURE_ROOMS['office-small@1'],
    desks: [{}, {}],
  },
  'templates/campus/map.tmj': {
    width: 80,
    height: 60,
    rooms: FIXTURE_ROOMS['campus@1'],
    desks: [],
  },
  'templates/office-small/themes/pixel/theme.json': themeFile('Píxel'),
  'templates/campus/themes/pixel/theme.json': themeFile('Píxel'),
  'templates/campus/themes/night/theme.json': {
    ...themeFile('Noche'),
    baseThemeId: 'pixel',
    colorMatrix: Array.from({ length: 20 }, () => 0),
  },
};

function themeFile(name: string) {
  return { name, author: credit.author, license: credit.license };
}

/**
 * Small synthetic catalog for unit tests of `ManifestMapsCatalog` (a template without the night
 * theme, eight avatars): the fixture "maps" are already-parsed objects.
 */
export function fixtureMapsCatalog(): ManifestMapsCatalog {
  return new ManifestMapsCatalog(
    FIXTURE_MANIFEST,
    {
      readJson: (relativePath) => {
        if (!(relativePath in FILES)) throw new Error(`fixture file not found: ${relativePath}`);
        return FILES[relativePath];
      },
    },
    // Fixture maps are stored already parsed.
    (tmj) => tmj as ParsedMapInfo,
  );
}
