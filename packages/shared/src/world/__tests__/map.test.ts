import { describe, expect, it } from 'vitest';

import {
  MapParseError,
  deskDecorSlots,
  isWalkable,
  parseMap,
  roomAt,
  tilesOf,
  type WorldMap,
} from '../map.js';
import { tiledProperty } from '../tiled.js';
import tiledExport from './fixtures/tiled-export.json' with { type: 'json' };
import {
  TINY_HEIGHT,
  TINY_WIDTH,
  layer,
  objects,
  prop,
  tinyTmj,
  withoutLayer,
  type Tmj,
} from './fixtures/tiny-map.js';

const T = 32;

/** Problems reported by `parseMap`, or `[]` when it succeeds. */
function problemsOf(tmj: unknown): readonly string[] {
  try {
    parseMap(tmj);
    return [];
  } catch (error) {
    if (error instanceof MapParseError) return error.problems;
    throw error;
  }
}

function withRoom(extra: Record<string, unknown>): Tmj {
  const tmj = tinyTmj();
  const [room] = objects(tmj, 'rooms');
  Object.assign(room!, extra);
  return tmj;
}

describe('parseMap', () => {
  it('turns a valid .tmj into a WorldMap', () => {
    const map = parseMap(tinyTmj());

    expect(map.width).toBe(TINY_WIDTH);
    expect(map.height).toBe(TINY_HEIGHT);
    expect(map.collisionGrid).toBeInstanceOf(Uint8Array);
    expect(map.collisionGrid).toHaveLength(TINY_WIDTH * TINY_HEIGHT);
    expect(map.rooms).toEqual([
      { x: 3, y: 1, width: 2, height: 2, areaId: 'sala-a', name: 'Sala A' },
    ]);
    expect(map.spawns).toEqual([
      { x: 2, y: 3 },
      { x: 4, y: 4 },
    ]);
    expect(map.desks).toEqual([
      {
        x: 6,
        y: 2,
        width: 1,
        height: 1,
        deskId: 'desk-a',
        decorSlots: [
          { x: 6 * T + 8, y: 2 * T + 16 },
          { x: 6 * T + 16, y: 2 * T + 16 },
          { x: 6 * T + 24, y: 2 * T + 16 },
        ],
      },
    ]);
  });

  it('accepts a real Tiled export with extra fields and layer types', () => {
    const map = parseMap(tiledExport);

    expect(map.width).toBe(5);
    expect(Array.from(map.collisionGrid)).toEqual([
      1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1,
    ]);
    expect(map.rooms[0]).toMatchObject({ areaId: 'cabina', name: 'Cabina', width: 2, height: 1 });
    expect(map.spawns).toEqual([{ x: 1, y: 2 }]);
    expect(map.desks[0]?.deskId).toBe('d1');
  });

  it('uses the object name when the room has no "name" property', () => {
    const tmj = tinyTmj();
    const [room] = objects(tmj, 'rooms');
    room!.properties = [prop('areaId', 'sala-a')];
    room!.name = '  Sala con nombre  ';

    expect(parseMap(tmj).rooms[0]?.name).toBe('Sala con nombre');
  });

  it('rejects anything that is not a finite orthogonal map', () => {
    expect(problemsOf(null)[0]).toMatch(/not a finite orthogonal Tiled map/);
    expect(problemsOf({ ...tinyTmj(), orientation: 'isometric' })[0]).toMatch(/orientation/);
    expect(problemsOf({ ...tinyTmj(), infinite: true })[0]).toMatch(/infinite/);
  });

  it('requires 32x32 px tiles', () => {
    expect(problemsOf({ ...tinyTmj(), tilewidth: 16, tileheight: 16 })).toEqual([
      'tiles must be 32x32 px, found 16x16',
    ]);
  });

  it.each(['floor', 'collision', 'rooms', 'spawns', 'desks'])(
    'fails without the "%s" layer',
    (name) => {
      expect(problemsOf(withoutLayer(tinyTmj(), name))).toContain(`missing layer "${name}"`);
    },
  );

  it('reports duplicated layers', () => {
    const tmj = tinyTmj();
    tmj.layers.push(layer(tinyTmj(), 'collision'));

    expect(problemsOf(tmj)).toContain('layer "collision" appears 2 times');
  });

  it('requires collision to be an uncompressed tile layer of the map size', () => {
    const asObjects = tinyTmj();
    asObjects.layers = asObjects.layers.map((l) =>
      l.name === 'collision' ? { type: 'objectgroup', name: 'collision', objects: [] } : l,
    );
    expect(problemsOf(asObjects).join('\n')).toMatch(
      /layer "collision" must be an uncompressed tile layer/,
    );

    const compressed = tinyTmj();
    Object.assign(layer(compressed, 'collision'), {
      encoding: 'base64',
      compression: 'zlib',
      data: 'eJw=',
    });
    expect(problemsOf(compressed).join('\n')).toMatch(/layer "collision" must be an uncompressed/);

    const wrongSize = tinyTmj();
    Object.assign(layer(wrongSize, 'collision'), { width: 4 });
    expect(problemsOf(wrongSize)).toContain('layer "collision" is 4x6, the map is 8x6');

    const short = tinyTmj();
    layer(short, 'collision').data = [0, 0, 0];
    expect(problemsOf(short)).toContain('layer "collision" has 3 tiles, expected 48');
  });

  it('requires rooms to be an object layer', () => {
    const tmj = tinyTmj();
    tmj.layers = tmj.layers.map((l) =>
      l.name === 'rooms' ? { type: 'tilelayer', name: 'rooms', width: 8, height: 6, data: [] } : l,
    );

    expect(problemsOf(tmj).join('\n')).toMatch(/layer "rooms" must be an object layer/);
  });

  it.each([
    ['an ellipse', { ellipse: true }],
    ['a polygon', { polygon: [{ x: 0, y: 0 }] }],
    ['a polyline', { polyline: [{ x: 0, y: 0 }] }],
    ['a point', { point: true }],
    ['a text', { text: { text: 'hola' } }],
    ['a tile object', { gid: 5 }],
  ])('rejects a room that is %s', (shape, extra) => {
    expect(problemsOf(withRoom(extra))).toContain(
      `rooms: object 1 "Sala A" must be a rectangle, found ${shape}`,
    );
  });

  it('rejects rotated, unaligned, empty or out-of-bounds rooms', () => {
    expect(problemsOf(withRoom({ rotation: 45 }))).toContain(
      'rooms: object 1 "Sala A" must not be rotated',
    );
    expect(problemsOf(withRoom({ x: 100 }))[0]).toMatch(/must cover whole tiles/);
    expect(problemsOf(withRoom({ width: 0 }))[0]).toMatch(/must cover whole tiles/);
    expect(problemsOf(withRoom({ x: 7 * T }))).toContain(
      'rooms: object 1 "Sala A" lies outside the map',
    );
    expect(problemsOf(withRoom({ y: -T }))).toContain(
      'rooms: object 1 "Sala A" lies outside the map',
    );
  });

  it('requires a valid areaId and a name on every room', () => {
    expect(problemsOf(withRoom({ properties: [prop('name', 'Sala A')] }))).toContain(
      'rooms: object 1 "Sala A" needs the property "areaId"',
    );
    expect(
      problemsOf(withRoom({ properties: [prop('areaId', 'Sala A!'), prop('name', 'x')] }))[0],
    ).toMatch(/property "areaId" must be lowercase/);
    expect(problemsOf(withRoom({ name: '', properties: [prop('areaId', 'sala-a')] }))).toContain(
      'rooms: object 1 needs a non-empty "name" property',
    );
  });

  it('rejects duplicated or overlapping rooms', () => {
    const duplicated = tinyTmj();
    objects(duplicated, 'rooms').push({
      id: 9,
      x: 1 * T,
      y: 1 * T,
      width: T,
      height: T,
      properties: [prop('areaId', 'sala-a'), prop('name', 'Otra')],
    });
    expect(problemsOf(duplicated)).toContain('rooms: object 9: duplicate areaId "sala-a"');

    const overlapping = tinyTmj();
    objects(overlapping, 'rooms').push({
      id: 9,
      x: 4 * T,
      y: 2 * T,
      width: 2 * T,
      height: T,
      properties: [prop('areaId', 'sala-b'), prop('name', 'Otra')],
    });
    expect(problemsOf(overlapping)).toContain('rooms: object 9 overlaps room "sala-a"');
  });

  it('requires spawns to be points on walkable tiles inside the map and outside rooms', () => {
    const rect = tinyTmj();
    objects(rect, 'spawns')[0] = { id: 2, x: 64, y: 64, width: 32, height: 32 };
    expect(problemsOf(rect)).toContain('spawns: object 2 must be a point, found a rectangle');

    const outside = tinyTmj();
    objects(outside, 'spawns')[0] = { id: 2, x: 9 * T, y: 16, point: true };
    expect(problemsOf(outside)).toContain('spawns: object 2 lies outside the map');

    const blocked = tinyTmj();
    objects(blocked, 'spawns')[0] = { id: 2, x: 16, y: 16, point: true };
    expect(problemsOf(blocked)).toContain('spawns: object 2 is on a blocked tile (0,0)');

    // Inside "sala-a" (3,1)-(4,2): a newcomer would start cut from the hallway (E6).
    const inRoom = tinyTmj();
    objects(inRoom, 'spawns')[0] = { id: 2, x: 3 * T + 16, y: T + 16, point: true };
    expect(problemsOf(inRoom)).toContain('spawns: object 2 is inside meeting room "sala-a"');

    const none = tinyTmj();
    layer(none, 'spawns').objects = [];
    expect(problemsOf(none)).toContain('spawns: the map needs at least one spawn point');
  });

  it('requires unique deskIds on tile-aligned rectangles', () => {
    const missing = tinyTmj();
    objects(missing, 'desks')[0]!.properties = [];
    expect(problemsOf(missing)).toContain('desks: object 4 needs the property "deskId"');

    const duplicated = tinyTmj();
    objects(duplicated, 'desks').push({
      id: 5,
      x: 6 * T,
      y: 1 * T,
      width: T,
      height: T,
      properties: [prop('deskId', 'desk-a')],
    });
    expect(problemsOf(duplicated)).toContain('desks: object 5: duplicate deskId "desk-a"');

    const point = tinyTmj();
    objects(point, 'desks')[0]!.point = true;
    expect(problemsOf(point)).toContain('desks: object 4 must be a rectangle, found a point');
  });

  it('reports every problem at once in the error message', () => {
    const tmj = withoutLayer(withRoom({ ellipse: true }), 'desks');

    const error = (() => {
      try {
        parseMap(tmj);
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(MapParseError);
    expect((error as MapParseError).message).toBe(
      'invalid map:\n  - missing layer "desks"\n  - rooms: object 1 "Sala A" must be a rectangle, found an ellipse',
    );
  });
});

describe('isWalkable', () => {
  const map = parseMap(tinyTmj());

  it('is true on free floor, including rooms', () => {
    expect(isWalkable(map, 1, 1)).toBe(true);
    expect(isWalkable(map, 3, 1)).toBe(true);
  });

  it('is false on collision tiles (walls and furniture)', () => {
    expect(isWalkable(map, 0, 0)).toBe(false);
    expect(isWalkable(map, 6, 2)).toBe(false);
  });

  it('is false out of bounds or on non-integer coordinates', () => {
    expect(isWalkable(map, -1, 1)).toBe(false);
    expect(isWalkable(map, 1, -1)).toBe(false);
    expect(isWalkable(map, TINY_WIDTH, 1)).toBe(false);
    expect(isWalkable(map, 1, TINY_HEIGHT)).toBe(false);
    expect(isWalkable(map, 1.5, 1)).toBe(false);
    expect(isWalkable(map, Number.NaN, 1)).toBe(false);
  });
});

describe('roomAt', () => {
  const map = parseMap(tinyTmj());

  it('returns the areaId inside the room rectangle (edges included)', () => {
    expect(roomAt(map, 3, 1)).toBe('sala-a');
    expect(roomAt(map, 4, 2)).toBe('sala-a');
  });

  it('returns null in the hallway and out of bounds', () => {
    expect(roomAt(map, 5, 2)).toBeNull();
    expect(roomAt(map, 3, 3)).toBeNull();
    expect(roomAt(map, -1, 0)).toBeNull();
    expect(roomAt(map, 99, 99)).toBeNull();
  });

  it('also works on maps built by hand (index built lazily)', () => {
    const handMade: WorldMap = {
      width: 4,
      height: 4,
      collisionGrid: new Uint8Array(16),
      rooms: [
        { x: 0, y: 0, width: 2, height: 2, areaId: 'a', name: 'A' },
        { x: 2, y: 2, width: 5, height: 5, areaId: 'b', name: 'B' },
      ],
      spawns: [],
      desks: [],
    };

    expect(roomAt(handMade, 1, 1)).toBe('a');
    expect(roomAt(handMade, 3, 3)).toBe('b');
    expect(roomAt(handMade, 2, 1)).toBeNull();
  });
});

describe('helpers', () => {
  it('tilesOf lists every tile of a rectangle row by row', () => {
    expect(tilesOf({ x: 1, y: 2, width: 2, height: 2 })).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ]);
  });

  it('deskDecorSlots spreads 3 slots along a 2-tile desk', () => {
    expect(deskDecorSlots({ x: 1, y: 1, width: 2, height: 1 })).toEqual([
      { x: 48, y: 48 },
      { x: 64, y: 48 },
      { x: 80, y: 48 },
    ]);
  });

  it('tiledProperty reads a custom property or undefined', () => {
    const [room] = objects(tinyTmj(), 'rooms');
    const object = { ...room!, properties: [prop('areaId', 'x')] };
    expect(tiledProperty(object, 'areaId')).toBe('x');
    expect(tiledProperty(object, 'missing')).toBeUndefined();
    expect(tiledProperty({ id: 1, x: 0, y: 0 }, 'areaId')).toBeUndefined();
  });
});
