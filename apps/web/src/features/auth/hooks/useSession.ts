import type { Me } from '@plaza/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  authKeys,
  deleteAccount,
  fetchAvatars,
  fetchDeletionPreview,
  fetchMe,
  logout,
  testLogin,
  updateMe,
} from '../api/auth-api';

export type Session =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: Me };

/** The signed-in person (TanStack Query over `GET /api/me`). */
export function useSession(): Session {
  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 5 * 60_000,
  });
  if (query.isPending) return { status: 'loading', user: null };
  if (query.data === null || query.data === undefined) return { status: 'anonymous', user: null };
  return { status: 'authenticated', user: query.data };
}

/** Closes the session and forgets every cached server response. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}

/** What deleting my account would do (E8-S6); always fresh. */
export function useDeletionPreview() {
  return useQuery({
    queryKey: authKeys.deletion,
    queryFn: ({ signal }) => fetchDeletionPreview(signal),
    staleTime: 0,
  });
}

/** Deletes my account and forgets every cached server response, like a logout. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAccount,
    // Errors are shown in the confirmation dialog.
    meta: { silent: true },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    // Errors are shown next to the form.
    meta: { silent: true },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

export function useTestLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: testLogin,
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

/** Avatar catalog (`GET /api/avatars`). */
export function useAvatars() {
  return useQuery({
    queryKey: authKeys.avatars,
    queryFn: ({ signal }) => fetchAvatars(signal),
    staleTime: Infinity,
  });
}
