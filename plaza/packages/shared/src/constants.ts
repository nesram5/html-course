/**
 * Game and protocol constants. They live ONLY here (standards §6): web and server import them
 * from `@plaza/shared` so both sides always agree.
 */

/** Size of a map tile in pixels. */
export const TILE_SIZE = 32;

/** Hallway proximity radius in tiles (RF-08, RN-01). */
export const PROXIMITY_RADIUS = 3;
/** Extra tiles before an existing hallway connection is dropped (RN-02). */
export const PROXIMITY_HYSTERESIS = 1;
/** Maximum hallway peers per person, closest first (RN-07). */
export const MAX_PEERS = 8;

/** Server simulation ticks per second. */
export const TICK_HZ = 15;
/** Duration of a server tick in milliseconds. */
export const TICK_MS = Math.round(1000 / TICK_HZ);

/** Inactivity before a person is marked as away (RN-05). */
export const AWAY_IDLE_MS = 600_000;
/** Maximum connected people per space (RN-06). */
export const MAX_PLAYERS_PER_SPACE = 50;
/** Minimum delay between two rings to the same person (RN-11). */
export const RING_COOLDOWN_MS = 30_000;

/** Maximum chat message length in characters (RF-13). */
export const CHAT_MAX_LEN = 1000;
/** Number of chat messages kept and returned as history (RF-13). */
export const CHAT_HISTORY = 100;

/** Realtime protocol version. Bump it in the same PR as any incompatible protocol change. */
export const PROTOCOL_VERSION = 1;

/** Per-socket rate limits (architecture §11.1, E4-S3, E7-S3, E7-S4). */
export const MOVE_RATE_PER_SEC = 10;
export const CHAT_RATE_PER_SEC = 5;
export const REACTION_RATE_PER_SEC = 3;
/** `player:status` + `player:away` per socket: bursts of 10, 5 per second sustained (E7-S1). */
export const PRESENCE_RATE_PER_SEC = 5;
/** `space:join` per person: bursts of 5, then one every 2 s (5 per 10 s, E4 follow-up). */
export const SPACE_JOIN_BURST = 5;
export const SPACE_JOIN_WINDOW_MS = 10_000;

/** How long a reaction stays over the avatar (RF-14). */
export const REACTION_DURATION_MS = 3000;
/** Emojis available as reactions, in keyboard shortcut order `1`..`5` (E7-S4). */
export const REACTION_EMOJIS = ['❤️', '👍', '🎉', '😂', '👋'] as const;

/** A space runtime is released this long after the last person leaves (E4-S2). */
export const SPACE_UNLOAD_DELAY_MS = 60_000;
/** A disconnected avatar stays (semi-transparent) this long before leaving (E4-S6). */
export const RECONNECT_GRACE_MS = 30_000;

/** Decoration slots per desk (RF-18, RN-15). */
export const DESK_DECOR_SLOTS = 3;

/**
 * Session cookie (architecture §11.1). The `__Host-` prefix makes the browser refuse it unless it
 * is `Secure`, has `Path=/` and no `Domain`: a sibling subdomain cannot plant or overwrite it
 * (cookie tossing, login CSRF).
 */
export const SESSION_COOKIE_NAME = '__Host-plaza_sid';
/** Sliding session lifetime: 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Header required on state-changing requests (CSRF defence, architecture §11.1). */
export const CLIENT_HEADER = 'x-plaza-client';

/**
 * LiveKit token lifetime in seconds (E5-S3). Short on purpose: a member removed from the space is
 * disconnected from the media room, and whatever token they kept stops working within 10 min.
 */
export const MEDIA_TOKEN_TTL_SECONDS = 600;
/** The web client asks for a fresh media token this long before the current one expires. */
export const MEDIA_TOKEN_REFRESH_MARGIN_SECONDS = 120;

/** Maximum width/height in pixels of a theme image (architecture §8.1). */
export const MAX_THEME_IMAGE_PX = 4096;

/** Defaults for new users and spaces (architecture §7). */
export const DEFAULT_AVATAR_ID = 'avatar-01';
export const DEFAULT_THEME_ID = 'pixel';

/** Every Google Meet link starts with this prefix (E2-S7). */
export const MEET_URI_PREFIX = 'https://meet.google.com/';

/** Maximum length of an in-app feedback message (E8-S7). */
export const FEEDBACK_MAX_LEN = 2000;
/** In-app feedback messages per person and hour (E8-S7). */
export const FEEDBACK_RATE_PER_HOUR = 10;

/** Client telemetry (E8-S7): samples per request and requests per minute and session. */
export const TELEMETRY_MAX_SAMPLES = 20;
export const TELEMETRY_RATE_PER_MINUTE = 30;
/** Longest duration accepted in a telemetry sample (10 min). */
export const TELEMETRY_MAX_VALUE_MS = 600_000;
/** O1: a hallway conversation counts as spontaneous when it lasts longer than this (brief §3). */
export const CONVERSATION_MIN_MS = 30_000;
/** RNF-04: a connection or media cut not recovered within this is a critical error (O4). */
export const CRITICAL_OUTAGE_MS = 30_000;

/** Limits of user-provided text fields. */
export const DISPLAY_NAME_MAX_LEN = 40;
export const SPACE_NAME_MAX_LEN = 60;

/** LiveKit room name of a space: one room per space (architecture §10.2). */
export function mediaRoomName(spaceId: string): string {
  return `space_${spaceId}`;
}
