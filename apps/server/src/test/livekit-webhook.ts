import { createHash } from 'node:crypto';

import { AccessToken } from 'livekit-server-sdk';

/** A LiveKit webhook event, as JSON (only the fields Plaza reads, plus what LiveKit adds). */
export interface WebhookEventJson {
  event: 'participant_joined' | 'track_published' | 'participant_left' | 'room_started';
  room: { name: string };
  participant?: { identity: string; permission?: { canPublish: boolean; canSubscribe: boolean } };
}

/**
 * The request LiveKit's media server would POST to `API_PATHS.mediaWebhook` (E6-S3): the JSON
 * body and, in `Authorization`, a JWT signed with the API secret carrying the body's SHA-256
 * (base64), exactly as `livekit-server` signs its webhooks.
 */
export async function signedWebhook(
  keys: { apiKey: string; apiSecret: string },
  event: WebhookEventJson,
): Promise<{ payload: string; headers: Record<string, string> }> {
  const payload = JSON.stringify({
    ...event,
    id: `EV_${String(Date.now())}`,
    createdAt: String(Math.floor(Date.now() / 1000)),
  });
  const token = new AccessToken(keys.apiKey, keys.apiSecret, { ttl: '5m' });
  token.sha256 = createHash('sha256').update(payload).digest('base64');
  return {
    payload,
    headers: {
      'content-type': 'application/webhook+json',
      authorization: await token.toJwt(),
    },
  };
}
