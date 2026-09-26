import type { z } from 'zod';

import type { Ack } from './ack.js';
import {
  ChatSendSchema,
  DeskGotoSchema,
  PlayerAwaySchema,
  PlayerMoveSchema,
  PlayerStatusSchema,
  ReactionSendSchema,
  RingSendSchema,
  SpaceJoinSchema,
  type ChatSend,
  type DeskGoto,
  type PlayerAway,
  type PlayerMove,
  type PlayerStatus,
  type ReactionSend,
  type RingSend,
  type SpaceJoin,
} from './client-events.js';
import {
  ChatMessageEventSchema,
  DeskUpdatedSchema,
  MediaPeersSchema,
  PlayerCorrectSchema,
  RealtimeErrorSchema,
  ReactionEventSchema,
  RingReceivedSchema,
  SpaceKickedSchema,
  SpaceSnapshotSchema,
  SpaceThemeSchema,
  WorldDeltaSchema,
  type ChatMessageEvent,
  type DeskUpdated,
  type MediaPeers,
  type PlayerCorrect,
  type RealtimeError,
  type ReactionEvent,
  type RingReceived,
  type SpaceKicked,
  type SpaceSnapshot,
  type SpaceTheme,
  type WorldDelta,
} from './server-events.js';

/** Socket.IO path on the server (proxied by Vite in development). */
export const REALTIME_PATH = '/realtime';

/** Typed Socket.IO events, client → server (architecture §9.2). */
export interface ClientToServerEvents {
  'space:join': (payload: SpaceJoin, ack: (res: Ack<SpaceSnapshot>) => void) => void;
  'player:move': (payload: PlayerMove) => void;
  'player:status': (payload: PlayerStatus) => void;
  'player:away': (payload: PlayerAway) => void;
  'chat:send': (payload: ChatSend, ack: (res: Ack<ChatMessageEvent>) => void) => void;
  reaction: (payload: ReactionSend) => void;
  'ring:send': (payload: RingSend, ack: (res: Ack<null>) => void) => void;
  'desk:goto': (payload: DeskGoto) => void;
}

/** Typed Socket.IO events, server → client (architecture §9.2). */
export interface ServerToClientEvents {
  'space:snapshot': (payload: SpaceSnapshot) => void;
  'player:correct': (payload: PlayerCorrect) => void;
  'world:delta': (payload: WorldDelta) => void;
  'media:peers': (payload: MediaPeers) => void;
  'chat:message': (payload: ChatMessageEvent) => void;
  reaction: (payload: ReactionEvent) => void;
  'ring:received': (payload: RingReceived) => void;
  'space:kicked': (payload: SpaceKicked) => void;
  'space:theme': (payload: SpaceTheme) => void;
  'desk:updated': (payload: DeskUpdated) => void;
  error: (payload: RealtimeError) => void;
}

export type ClientEventName = keyof ClientToServerEvents;
export type ServerEventName = keyof ServerToClientEvents;

/** Payload schema of each client event: the server validates with it (`safeHandler`). */
export const CLIENT_EVENT_SCHEMAS = {
  'space:join': SpaceJoinSchema,
  'player:move': PlayerMoveSchema,
  'player:status': PlayerStatusSchema,
  'player:away': PlayerAwaySchema,
  'chat:send': ChatSendSchema,
  reaction: ReactionSendSchema,
  'ring:send': RingSendSchema,
  'desk:goto': DeskGotoSchema,
} as const satisfies Record<ClientEventName, z.ZodType>;

/** Payload schema of each server event: the web `RealtimeClient` validates with it. */
export const SERVER_EVENT_SCHEMAS = {
  'space:snapshot': SpaceSnapshotSchema,
  'player:correct': PlayerCorrectSchema,
  'world:delta': WorldDeltaSchema,
  'media:peers': MediaPeersSchema,
  'chat:message': ChatMessageEventSchema,
  reaction: ReactionEventSchema,
  'ring:received': RingReceivedSchema,
  'space:kicked': SpaceKickedSchema,
  'space:theme': SpaceThemeSchema,
  'desk:updated': DeskUpdatedSchema,
  error: RealtimeErrorSchema,
} as const satisfies Record<ServerEventName, z.ZodType>;

/** Payload type of a client event. */
export type ClientEventPayload<E extends ClientEventName> = Parameters<ClientToServerEvents[E]>[0];
/** Payload type of a server event. */
export type ServerEventPayload<E extends ServerEventName> = Parameters<ServerToClientEvents[E]>[0];
