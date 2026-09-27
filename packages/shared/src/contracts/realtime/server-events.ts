import { z } from 'zod';

import { PROTOCOL_VERSION } from '../../constants.js';
import { ErrorPayloadSchema } from '../errors.js';
import { IdSchema, MapTemplateIdSchema, ThemeIdSchema } from '../http/common.js';
import { DeskStateSchema } from '../http/desks.js';
import { ChatMessageDtoSchema } from '../http/messages.js';
import { MeetingRoomDtoSchema } from '../http/rooms.js';
import { ReactionEmojiSchema } from './client-events.js';
import {
  PlayerChangedSchema,
  PlayerMovedSchema,
  PlayerStateSchema,
  PublicPlayerSchema,
  TileCoordSchema,
} from './player.js';

/** `space:snapshot` — full state after `space:join` and after every reconnection. */
export const SpaceSnapshotSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  spaceId: IdSchema,
  mapTemplateId: MapTemplateIdSchema,
  themeId: ThemeIdSchema,
  self: PlayerStateSchema,
  /** Other connected people (without `self`). */
  players: z.array(PublicPlayerSchema),
  rooms: z.array(MeetingRoomDtoSchema),
  /** Occupied desks with their decoration. */
  desks: z.array(DeskStateSchema),
});
export type SpaceSnapshot = z.infer<typeof SpaceSnapshotSchema>;

/** `player:correct` — rejected step: the client puts the avatar back here. */
export const PlayerCorrectSchema = z.object({ x: TileCoordSchema, y: TileCoordSchema });
export type PlayerCorrect = z.infer<typeof PlayerCorrectSchema>;

/** `world:delta` — sent every tick (15 Hz) only when something changed. */
export const WorldDeltaSchema = z.object({
  moved: z.array(PlayerMovedSchema),
  joined: z.array(PublicPlayerSchema),
  left: z.array(IdSchema),
  changed: z.array(PlayerChangedSchema),
});
export type WorldDelta = z.infer<typeof WorldDeltaSchema>;

/** `media:peers` — who this person must be connected to in the hallway (E5-S2). */
export const MediaPeersSchema = z.object({ peers: z.array(IdSchema) });
export type MediaPeers = z.infer<typeof MediaPeersSchema>;

/** `chat:message` — a new message for everyone in the space. */
export const ChatMessageEventSchema = ChatMessageDtoSchema;
export type ChatMessageEvent = z.infer<typeof ChatMessageEventSchema>;

/** `reaction` (S→C) — ephemeral emoji over an avatar for 3 s. */
export const ReactionEventSchema = z.object({ userId: IdSchema, emoji: ReactionEmojiSchema });
export type ReactionEvent = z.infer<typeof ReactionEventSchema>;

/** `ring:received` — `silent` when the target is busy: notification without sound (E7-S5). */
export const RingReceivedSchema = z.object({
  fromUserId: IdSchema,
  fromDisplayName: z.string(),
  silent: z.boolean(),
});
export type RingReceived = z.infer<typeof RingReceivedSchema>;

export const KickReasonSchema = z.enum(['SESSION_REPLACED', 'REMOVED', 'ACCOUNT_DELETED']);
export type KickReason = z.infer<typeof KickReasonSchema>;

/** `space:kicked` — removed by the owner or replaced by a newer tab; the socket is closed. */
export const SpaceKickedSchema = z.object({ reason: KickReasonSchema });
export type SpaceKicked = z.infer<typeof SpaceKickedSchema>;

/** `space:theme` — the owner changed the office style (RF-16). */
export const SpaceThemeSchema = z.object({ themeId: ThemeIdSchema });
export type SpaceTheme = z.infer<typeof SpaceThemeSchema>;

/**
 * `room:updated` — a meeting room got or changed its Meet link (created through the API or pasted
 * by the owner, E2-S7 / E6-S2), so connected people see it without reloading.
 */
export const RoomUpdatedSchema = MeetingRoomDtoSchema;
export type RoomUpdated = z.infer<typeof RoomUpdatedSchema>;

/** `desk:updated` — desk claimed, freed or decorated (RF-17, RF-18). */
export const DeskUpdatedSchema = DeskStateSchema;
export type DeskUpdated = z.infer<typeof DeskUpdatedSchema>;

/** `error` — codes live in `contracts/errors.ts`. */
export const RealtimeErrorSchema = ErrorPayloadSchema;
export type RealtimeError = z.infer<typeof RealtimeErrorSchema>;
