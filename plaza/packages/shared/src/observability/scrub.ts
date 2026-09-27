/**
 * Scrubbing of error reports before they leave the process (E8-S1, standards §4): Sentry must
 * get the version, the `userId` and the `spaceId`, never chat bodies, tokens, cookies or
 * e-mails. Used as `beforeSend` / `beforeBreadcrumb` by the server and the web app.
 *
 * Pure and dependency-free: it works on any JSON-like value (a Sentry event, a breadcrumb).
 */

export const REDACTED = '[redacted]';

/** Keys whose value is always replaced, wherever they appear (case-insensitive). */
const SENSITIVE_KEYS = new Set(
  [
    'body',
    'chatBody',
    'token',
    'tokens',
    'accessToken',
    'access_token',
    'idToken',
    'id_token',
    'refreshToken',
    'refresh_token',
    'codeVerifier',
    'code_verifier',
    'verifier',
    'cookie',
    'cookies',
    'set-cookie',
    'authorization',
    'proxy-authorization',
    'x-health-token',
    'password',
    'secret',
    'clientSecret',
    'sessionSecret',
    'apiSecret',
    'plaza_sid',
    'email',
    'ip_address',
    // Local variables of stack frames may hold anything (a chat message being sent).
    'vars',
  ].map((key) => key.toLowerCase()),
);

/**
 * Secrets recognised by their shape inside any string (messages, URLs, breadcrumbs):
 * JWTs (Google `id_token`, LiveKit tokens), Google access / refresh tokens and OAuth codes,
 * OAuth and token query parameters, invite links, the session cookie and e-mail addresses.
 */
const VALUE_PATTERNS: readonly [RegExp, string][] = [
  [/eyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]+/g, REDACTED],
  [/ya29\.[\w.-]+/g, REDACTED],
  [/1\/\/0[\w-]{10,}/g, REDACTED],
  [/4\/0[\w-]{10,}/g, REDACTED],
  [
    /([?&#](?:code|state|token|access_token|id_token|refresh_token|code_verifier)=)[^&#\s"']+/gi,
    `$1${REDACTED}`,
  ],
  [/(\/join\/)[\w-]{16,}/g, `$1${REDACTED}`],
  [/(plaza_sid=)[^;\s"']+/g, `$1${REDACTED}`],
  [/(Bearer\s+)[\w.~+/=-]+/gi, `$1${REDACTED}`],
  [/[\w.+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, '[email]'],
];

/** Replaces the secrets that {@link VALUE_PATTERNS} recognise in one string. */
export function scrubString(value: string): string {
  let result = value;
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

const MAX_DEPTH = 12;

function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object' || value === null) return value;
  if (depth > MAX_DEPTH || seen.has(value)) return REDACTED;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1, seen));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? REDACTED
      : scrubValue(item, depth + 1, seen);
  }
  return result;
}

/** Minimal shape of the parts of a Sentry event that need special handling. */
interface EventLike {
  user?: Record<string, unknown> | null;
  request?: Record<string, unknown> | null;
}

/**
 * Returns a scrubbed copy of a Sentry event (or breadcrumb): sensitive keys are replaced,
 * secrets inside strings are redacted, the request body and cookies are dropped and the user
 * keeps only its `id`. Never throws; an unexpected shape is scrubbed as plain data.
 */
export function scrubEvent<T>(event: T): T {
  const value = scrubValue(event, 0, new WeakSet());
  if (typeof value !== 'object' || value === null) return value as T;
  const scrubbed = value as EventLike;
  if (scrubbed.user !== undefined && scrubbed.user !== null) {
    const { id } = scrubbed.user;
    scrubbed.user = id === undefined ? {} : { id };
  }
  if (scrubbed.request !== undefined && scrubbed.request !== null) {
    // Request bodies carry chat messages and OAuth codes; cookies carry the session.
    delete scrubbed.request.data;
    delete scrubbed.request.cookies;
  }
  return scrubbed as T;
}

/** Breadcrumb categories never sent: the console may print anything. */
const DROPPED_BREADCRUMB_CATEGORIES = new Set(['console']);

/** `beforeBreadcrumb`: drops console breadcrumbs and scrubs the rest (URLs, messages). */
export function scrubBreadcrumb<T extends object>(breadcrumb: T): T | null {
  const { category } = breadcrumb as { category?: unknown };
  if (typeof category === 'string' && DROPPED_BREADCRUMB_CATEGORIES.has(category)) {
    return null;
  }
  return scrubEvent(breadcrumb);
}
