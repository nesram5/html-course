import {
  AccountDeletionPreviewSchema,
  API_PATHS,
  AvatarsResponseSchema,
  MeResponseSchema,
  SafeNextPathSchema,
  TestLoginResponseSchema,
  WEB_PATHS,
  type AccountDeletionPreview,
  type AvatarDto,
  type Me,
  type UpdateMeBody,
} from '@bululu/shared';

import { http, isApiError } from '@/shared/api';

/** Query keys of the auth feature (standards §5). */
export const authKeys = {
  me: ['auth', 'me'] as const,
  avatars: ['auth', 'avatars'] as const,
  deletion: ['auth', 'deletion'] as const,
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

/** What "Borrar mi cuenta" would do: spaces blocking it and spaces deleted with it (E8-S6). */
export function fetchDeletionPreview(signal?: AbortSignal): Promise<AccountDeletionPreview> {
  return http(API_PATHS.meDeletion, AccountDeletionPreviewSchema, signal ? { signal } : {});
}

/** Deletes the account for good (E8-S6). */
export function deleteAccount(): Promise<void> {
  return http(API_PATHS.me, null, { method: 'DELETE' });
}

export function logout(): Promise<void> {
  return http(API_PATHS.authLogout, null, { method: 'POST' });
}

/** Test-only sign-in (server with `AUTH_TEST_LOGIN=true`; the form only exists in dev builds). */
export async function testLogin(input: { email: string; hostedDomain?: string }): Promise<Me> {
  const body =
    input.hostedDomain === undefined || input.hostedDomain === ''
      ? { email: input.email }
      : { email: input.email, hostedDomain: input.hostedDomain };
  const { user } = await http(API_PATHS.authTestLogin, TestLoginResponseSchema, {
    method: 'POST',
    body,
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
