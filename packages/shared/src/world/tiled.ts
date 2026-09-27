import { z } from 'zod';

/**
 * Minimal zod schema of the Tiled JSON map format (`.tmj`) that Plaza uses (architecture §8):
 * a finite orthogonal map with uncompressed tile layers and object layers. Everything else in
 * the file (tilesets, editor settings, other layer types) is accepted and ignored.
 * Reference: https://doc.mapeditor.org/en/stable/reference/json-map-format/
 */

/** A custom property of a Tiled object (`properties: [{ name, type, value }]`). */
export const TiledPropertySchema = z.looseObject({
  name: z.string(),
  type: z.string().optional(),
  value: z.unknown(),
});

/** An object of an object layer. Shape flags tell rectangles, points, ellipses and polygons apart. */
export const TiledObjectSchema = z.looseObject({
  id: z.number().int(),
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  rotation: z.number().optional(),
  point: z.boolean().optional(),
  ellipse: z.boolean().optional(),
  polygon: z.array(z.unknown()).optional(),
  polyline: z.array(z.unknown()).optional(),
  text: z.unknown().optional(),
  gid: z.number().int().optional(),
  properties: z.array(TiledPropertySchema).optional(),
});
export type TiledObject = z.infer<typeof TiledObjectSchema>;

export const TiledTileLayerSchema = z.looseObject({
  type: z.literal('tilelayer'),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Only uncompressed layers: `data` is an array of global tile ids (0 = empty). */
  encoding: z.literal('csv').optional(),
  compression: z.literal('').optional(),
  data: z.array(z.number().int().nonnegative()),
});
export type TiledTileLayer = z.infer<typeof TiledTileLayerSchema>;

export const TiledObjectLayerSchema = z.looseObject({
  type: z.literal('objectgroup'),
  name: z.string(),
  objects: z.array(TiledObjectSchema),
});
export type TiledObjectLayer = z.infer<typeof TiledObjectLayerSchema>;

/** Any other layer type (image layers, groups): kept only to report a clear error by name. */
export const TiledOtherLayerSchema = z.looseObject({
  type: z.string(),
  name: z.string(),
});

export const TiledMapSchema = z.looseObject({
  type: z.literal('map').optional(),
  orientation: z.literal('orthogonal'),
  infinite: z.literal(false).optional(),
  width: z.number().int().positive().max(1000),
  height: z.number().int().positive().max(1000),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  layers: z.array(z.unknown()),
});
export type TiledMap = z.infer<typeof TiledMapSchema>;

/** Reads a custom property by name, or `undefined`. */
export function tiledProperty(object: TiledObject, name: string): unknown {
  return object.properties?.find((property) => property.name === name)?.value;
}
