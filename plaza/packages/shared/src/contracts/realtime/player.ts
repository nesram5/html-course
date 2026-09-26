import { z } from 'zod';

import { AreaIdSchema, AvatarIdSchema, IdSchema, PresenceStatusSchema } from '../http/common.js';

export const DirectionSchema = z.enum(['up', 'down', 'left', 'right']);
export type Direction = z.infer<typeof DirectionSchema>;

/** Tile coordinates (not pixels). */
export const TileCoordSchema = z.number().int().min(0).max(10_000);

/**
 * Live state of a connected person (architecture §5.3). Positions are ephemeral: never stored
 * in the database. Everything here is visible to the other members of the space.
 */
export const PlayerStateSchema = z.object({
  userId: IdSchema,
  displayName: z.string(),
  avatarId: AvatarIdSchema,
  x: TileCoordSchema,
  y: TileCoordSchema,
  dir: DirectionSchema,
  /** Chosen by the person. */
  status: PresenceStatusSchema,
  /** Hidden tab or inactivity (RN-05). */
  away: z.boolean(),
  /** Current meeting room, computed by the server. */
  roomId: AreaIdSchema.nullable(),
  /** Has hallway peers → 💬 bubble. */
  inConversation: z.boolean(),
  /** Connection lost, waiting up to 30 s for a reconnection (E4-S6): drawn semi-transparent. */
  reconnecting: z.boolean(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

/** What other members receive about a player. Identical today; kept separate on purpose. */
export const PublicPlayerSchema = PlayerStateSchema;
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;

/** A position change inside `world:delta.moved`. */
export const PlayerMovedSchema = z.object({
  userId: IdSchema,
  x: TileCoordSchema,
  y: TileCoordSchema,
  dir: DirectionSchema,
});
export type PlayerMoved = z.infer<typeof PlayerMovedSchema>;

/** Non-positional changes inside `world:delta.changed`: only the fields that changed. */
export const PlayerChangedSchema = PlayerStateSchema.omit({ x: true, y: true, dir: true })
  .partial()
  .required({ userId: true });
export type PlayerChanged = z.infer<typeof PlayerChangedSchema>;
