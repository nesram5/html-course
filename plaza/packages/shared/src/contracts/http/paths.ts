/**
 * REST paths, written in Fastify syntax. The server registers routes with them and the web
 * client builds URLs with `apiPath()`, so both sides never drift apart.
 */
export const API_PATHS = {
  health: '/api/health',

  // E1 · Auth and profile
  authGoogle: '/api/auth/google',
  authGoogleCallback: '/api/auth/google/callback',
  authTestLogin: '/api/auth/test-login',
  authLogout: '/api/auth/logout',
  me: '/api/me',
  avatars: '/api/avatars',

  // E2 · Spaces, access and Meet rooms
  mapTemplates: '/api/map-templates',
  spaces: '/api/spaces',
  space: '/api/spaces/:spaceId',
  spaceEnterBySlug: '/api/spaces/by-slug/:slug/enter',
  inviteLink: '/api/spaces/:spaceId/invite-link',
  members: '/api/spaces/:spaceId/members',
  member: '/api/spaces/:spaceId/members/:userId',
  join: '/api/join/:token',
  rooms: '/api/spaces/:spaceId/rooms',
  roomsAuthorize: '/api/spaces/:spaceId/rooms/authorize',
  roomsAuthCallback: '/api/auth/google/meet/callback',
  room: '/api/spaces/:spaceId/rooms/:areaId',

  // E5 · Hallway media
  mediaToken: '/api/spaces/:spaceId/media-token',

  // E7 · Chat
  messages: '/api/spaces/:spaceId/messages',

  // E9 · Personalization (theme is changed with PATCH `space`)
  decorCatalog: '/api/decor',
  desks: '/api/spaces/:spaceId/desks',
  desk: '/api/spaces/:spaceId/desks/:deskId',
  deskDecor: '/api/spaces/:spaceId/desks/:deskId/decor',

  // E6-S2 / E8-S7 · Product events (no personal data)
  events: '/api/spaces/:spaceId/events',
} as const;

export type ApiPathTemplate = (typeof API_PATHS)[keyof typeof API_PATHS];

type PathParamNames<T extends string> = T extends `${string}:${infer P}/${infer Rest}`
  ? P | PathParamNames<`/${Rest}`>
  : T extends `${string}:${infer P}`
    ? P
    : never;

/** Parameters required by a path template, e.g. `{ spaceId: string }`. */
export type PathParams<T extends string> = Record<PathParamNames<T>, string>;

/** Fills a path template: `apiPath(API_PATHS.space, { spaceId })` → `/api/spaces/abc`. */
export function apiPath<T extends string>(template: T, params: PathParams<T>): string {
  const values: Record<string, string> = params;
  return template.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${template}`);
    return encodeURIComponent(value);
  });
}
