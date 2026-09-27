/**
 * Small Tiled maps for the world tests. `tinyTmj()` returns a fresh, valid 8x6 map each call,
 * so a test can break one detail without affecting the others:
 *
 *   ########     # wall (collision)      D desk (collision, desk object "desk-a")
 *   #..RR..#     R room "sala-a" (x 3..4, y 1..2)
 *   #..RR.D#     s spawn
 *   #.s....#
 *   #...s..#
 *   ########
 */
const ASCII = ['########', '#..RR..#', '#..RR.D#', '#.s....#', '#...s..#', '########'];

export const TINY_WIDTH = 8;
export const TINY_HEIGHT = 6;
const T = 32;

export interface TmjObject {
  id: number;
  name?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  ellipse?: boolean;
  polygon?: { x: number; y: number }[];
  rotation?: number;
  gid?: number;
  properties?: { name: string; type: string; value: unknown }[];
}

export interface TmjLayer {
  type: string;
  name: string;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TmjObject[];
  [key: string]: unknown;
}

export interface Tmj {
  type: 'map';
  orientation: string;
  infinite: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TmjLayer[];
  [key: string]: unknown;
}

function tiles(predicate: (char: string) => boolean): number[] {
  return ASCII.join('')
    .split('')
    .map((char) => (predicate(char) ? 1 : 0));
}

export function prop(name: string, value: unknown) {
  return { name, type: 'string', value };
}

export function tinyTmj(): Tmj {
  return {
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: TINY_WIDTH,
    height: TINY_HEIGHT,
    tilewidth: T,
    tileheight: T,
    tilesets: [],
    layers: [
      { type: 'tilelayer', name: 'floor', width: 8, height: 6, data: tiles(() => true) },
      { type: 'tilelayer', name: 'decor-below', width: 8, height: 6, data: tiles(() => false) },
      { type: 'tilelayer', name: 'decor-above', width: 8, height: 6, data: tiles(() => false) },
      {
        type: 'tilelayer',
        name: 'collision',
        width: 8,
        height: 6,
        data: tiles((c) => c === '#' || c === 'D'),
      },
      {
        type: 'objectgroup',
        name: 'rooms',
        objects: [
          {
            id: 1,
            name: 'Sala A',
            x: 3 * T,
            y: 1 * T,
            width: 2 * T,
            height: 2 * T,
            properties: [prop('areaId', 'sala-a'), prop('name', 'Sala A')],
          },
        ],
      },
      {
        type: 'objectgroup',
        name: 'spawns',
        objects: [
          { id: 2, x: 2 * T + 16, y: 3 * T + 16, point: true },
          { id: 3, x: 4 * T + 16, y: 4 * T + 16, point: true },
        ],
      },
      {
        type: 'objectgroup',
        name: 'desks',
        objects: [
          {
            id: 4,
            x: 6 * T,
            y: 2 * T,
            width: T,
            height: T,
            properties: [prop('deskId', 'desk-a')],
          },
        ],
      },
    ],
  };
}

/** The layer with that name of a map built by `tinyTmj()` (throws if missing). */
export function layer(tmj: Tmj, name: string): TmjLayer {
  const found = tmj.layers.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`fixture has no layer ${name}`);
  return found;
}

/** The objects of an object layer of a map built by `tinyTmj()`. */
export function objects(tmj: Tmj, name: string): TmjObject[] {
  const found = layer(tmj, name).objects;
  if (found === undefined) throw new Error(`fixture layer ${name} has no objects`);
  return found;
}

/** Removes a layer by name. */
export function withoutLayer(tmj: Tmj, name: string): Tmj {
  return { ...tmj, layers: tmj.layers.filter((candidate) => candidate.name !== name) };
}
