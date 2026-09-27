import {
  API_PATHS,
  AvatarsResponseSchema,
  MeResponseSchema,
  SafeNextPathSchema,
  TestLoginResponseSchema,
  WEB_PATHS,
  type AvatarDto,
  type Me,
  type UpdateMeBody,
} from '@plaza/shared';

import { http, isApiError } from '@/shared/api';

/** Query keys of the auth feature (standards §5). */
export const authKeys = {
  me: ['auth', 'me'] as const,
  avatars: ['auth', 'avatars'] as const,
};

/** My user, or `null` when there is no valid session (401). */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  try {
    const { user } = await http(API_PATHS.me, MeResponseSchema, signal ? { signal } : {});
    return user;
  } catch (error) {
    if (isApiError(error) && error.status === 401) return null;
    throw error;
  }
}

export async function updateMe(body: UpdateMeBody): Promise<Me> {
  const { user } = await http(API_PATHS.me, MeResponseSchema, { method: 'PATCH', body });
  return user;
}

export async function fetchAvatars(signal?: AbortSignal): Promise<AvatarDto[]> {
  const { avatars } = await http(
    API_PATHS.avatars,
    AvatarsResponseSchema,
    signal ? { signal } : {},
  );
  return avatars;
}

export function logout(): Promise<void> {
  return http(API_PATHS.authLogout, null, { method: 'POST' });
}

/** Test-only sign-in (server with `AUTH_TEST_LOGIN=true`; the form only exists in dev builds). */
export async function testLogin(email: string): Promise<Me> {
  const { user } = await http(API_PATHS.authTestLogin, TestLoginResponseSchema, {
    method: 'POST',
    body: { email },
  });
  return user;
}

/** A safe in-app path to go back to after signing in (`/spaces` by default). */
export function safeNext(next: string | null | undefined): string {
  const parsed = SafeNextPathSchema.safeParse(next);
  return parsed.success ? parsed.data : WEB_PATHS.spaces;
}

/** Full-page navigation target that starts "Entrar con Google". */
export function googleLoginHref(next: string): string {
  return `${API_PATHS.authGoogle}?${new URLSearchParams({ next: safeNext(next) }).toString()}`;
}
