import { API_PATHS, CLIENT_HEADER, SESSION_COOKIE_NAME, type Me } from '@plaza/shared';
import type { FastifyInstance } from 'fastify';

export interface TestUser {
  user: Me;
  /** `Cookie` header value with the session (`plaza_sid=<token>`). */
  cookie: string;
  /** Headers for authenticated state-changing requests (cookie + `X-Plaza-Client`). */
  headers: Record<string, string>;
}

/** Signs in through `POST /api/auth/test-login` and returns the session cookie. */
export async function signIn(
  app: FastifyInstance,
  email: string,
  options: { displayName?: string; googleSub?: string } = {},
): Promise<TestUser> {
  const response = await app.inject({
    method: 'POST',
    url: API_PATHS.authTestLogin,
    headers: { [CLIENT_HEADER]: 'test' },
    payload: { email, ...options },
  });
  if (response.statusCode !== 200) {
    throw new Error(`test-login failed: ${String(response.statusCode)} ${response.body}`);
  }
  const session = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
  if (session === undefined) throw new Error('test-login did not set the session cookie');
  const cookie = `${SESSION_COOKIE_NAME}=${session.value}`;
  return {
    user: response.json<{ user: Me }>().user,
    cookie,
    headers: { cookie, [CLIENT_HEADER]: 'test' },
  };
}
