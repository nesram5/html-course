import {
  API_PATHS,
  apiPath,
  CLIENT_HEADER,
  MapTemplatesResponseSchema,
  TestLoginResponseSchema,
  parseMap,
  SESSION_COOKIE_NAME,
  SpaceResponseSchema,
  type WorldMap,
} from '@plaza/shared';

/** A signed-in bot: its userId and the `Cookie` header with its session. */
export interface BotSession {
  userId: string;
  cookie: string;
}

async function request(
  baseUrl: string,
  path: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): Promise<Response> {
  const response = await fetch(new URL(path, baseUrl), {
    method: init.method ?? 'GET',
    headers: {
      [CLIENT_HEADER]: 'load-test',
      ...(init.cookie !== undefined && { cookie: init.cookie }),
      ...(init.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} → ${String(response.status)}: ${await response.text()}`,
    );
  }
  return response;
}

/** `POST /api/auth/test-login` (server started with `AUTH_TEST_LOGIN=true`). */
export async function signIn(
  baseUrl: string,
  email: string,
  displayName: string,
): Promise<BotSession> {
  const response = await request(baseUrl, API_PATHS.authTestLogin, {
    method: 'POST',
    body: { email, displayName },
  });
  const session = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0] ?? '')
    .find((pair) => pair.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (session === undefined) throw new Error('test-login did not set the session cookie');
  const { user } = TestLoginResponseSchema.parse(await response.json());
  return { userId: user.id, cookie: session };
}

/** Creates a space and returns its id and invite token. */
export async function createSpace(
  baseUrl: string,
  owner: BotSession,
  name: string,
  mapTemplateId: string,
): Promise<{ spaceId: string; mapTemplateId: string; inviteToken: string }> {
  const response = await request(baseUrl, API_PATHS.spaces, {
    method: 'POST',
    cookie: owner.cookie,
    body: { name, mapTemplateId },
  });
  const { space } = SpaceResponseSchema.parse(await response.json());
  const inviteToken = new URL(space.inviteUrl ?? '').pathname.split('/').pop() ?? '';
  return { spaceId: space.id, mapTemplateId: space.mapTemplateId, inviteToken };
}

export async function joinSpace(baseUrl: string, bot: BotSession, token: string): Promise<void> {
  await request(baseUrl, apiPath(API_PATHS.join, { token }), {
    method: 'POST',
    cookie: bot.cookie,
  });
}

/** Downloads and parses the Tiled map of a template, like the web client does. */
export async function fetchWorldMap(baseUrl: string, mapTemplateId: string): Promise<WorldMap> {
  const { templates } = MapTemplatesResponseSchema.parse(
    await (await request(baseUrl, API_PATHS.mapTemplates)).json(),
  );
  const template = templates.find((candidate) => candidate.id === mapTemplateId);
  if (template === undefined) throw new Error(`Unknown map template ${mapTemplateId}`);
  return parseMap(await (await request(baseUrl, template.mapUrl)).json());
}

/** `GET /api/health` as plain JSON (realtime figures of E8-S1). */
export async function health(baseUrl: string): Promise<unknown> {
  return (await request(baseUrl, API_PATHS.health)).json();
}
