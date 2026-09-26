import { z } from 'zod';

import { REACTION_EMOJIS } from '../../constants.js';
import { IdSchema, PresenceStatusSchema } from '../http/common.js';
import { ChatBodySchema } from '../http/messages.js';
import { DirectionSchema, TileCoordSchema } from './player.js';

/**
 * Every client → server payload carries the protocol version `v` (architecture §9.1).
 * The server compares it with `PROTOCOL_VERSION` BEFORE validating the rest and answers
 * `PROTOCOL_MISMATCH` when it differs, so `v` is a plain integer here, not a literal.
 */
export const VersionSchema = z.number().int().nonnegative();

function versioned<T extends z.ZodRawShape>(shape: T) {
  return z.object({ v: VersionSchema, ...shape });
}

/** `space:join` — ack with `space:snapshot` (E4-S1). */
export const SpaceJoinSchema = versioned({ spaceId: IdSchema });
export type SpaceJoin = z.infer<typeof SpaceJoinSchema>;

/** `player:move` — one tile per event, at most 10/s (E4-S3). A same-tile move only turns. */
export const PlayerMoveSchema = versioned({
  x: TileCoordSchema,
  y: TileCoordSchema,
  dir: DirectionSchema,
});
export type PlayerMove = z.infer<typeof PlayerMoveSchema>;

/** `player:status` — available / busy (E7-S1). */
export const PlayerStatusSchema = versioned({ status: PresenceStatusSchema });
export type PlayerStatus = z.infer<typeof PlayerStatusSchema>;

/** `player:away` — hidden tab or inactivity (E7-S1). */
export const PlayerAwaySchema = versioned({ away: z.boolean() });
export type PlayerAway = z.infer<typeof PlayerAwaySchema>;

/** `chat:send` — at most 5/s (E7-S3). Ack with the stored message. */
export const ChatSendSchema = versioned({ body: ChatBodySchema });
export type ChatSend = z.infer<typeof ChatSendSchema>;

export const ReactionEmojiSchema = z.enum(REACTION_EMOJIS);
export type ReactionEmoji = z.infer<typeof ReactionEmojiSchema>;

/** `reaction` (C→S) — at most 3/s (E7-S4). */
export const ReactionSendSchema = versioned({ emoji: ReactionEmojiSchema });
export type ReactionSend = z.infer<typeof ReactionSendSchema>;

/** `ring:send` — once per 30 s per target (RN-11). Ack; `RING_COOLDOWN` when too soon. */
export const RingSendSchema = versioned({ toUserId: IdSchema });
export type RingSend = z.infer<typeof RingSendSchema>;

/**
 * `desk:goto` — "Mi escritorio" button: the server moves the avatar next to the person's desk,
 * validated like a spawn, and answers with `player:correct` (E9-S2).
 */
export const DeskGotoSchema = versioned({});
export type DeskGoto = z.infer<typeof DeskGotoSchema>;
