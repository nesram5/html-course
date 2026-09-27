import type { CreateSpaceBody, Role, UpdateSpaceBody } from '@plaza/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  authorizeRooms,
  createSpace,
  enterSpace,
  fetchBans,
  fetchJoinPreview,
  fetchMapTemplates,
  fetchMembers,
  fetchSpace,
  fetchSpaces,
  joinSpace,
  regenerateInviteLink,
  removeMember,
  setMemberRole,
  spacesKeys,
  unbanMember,
  updateRoomLink,
  updateSpace,
} from '../api/spaces-api';

export function useMySpaces() {
  return useQuery({ queryKey: spacesKeys.list, queryFn: ({ signal }) => fetchSpaces({ signal }) });
}

export function useSpace(spaceId: string) {
  return useQuery({
    queryKey: spacesKeys.detail(spaceId),
    queryFn: ({ signal }) => fetchSpace(spaceId, { signal }),
  });
}

export function useMembers(spaceId: string) {
  return useQuery({
    queryKey: spacesKeys.members(spaceId),
    queryFn: ({ signal }) => fetchMembers(spaceId, { signal }),
  });
}

export function useBans(spaceId: string) {
  return useQuery({
    queryKey: spacesKeys.bans(spaceId),
    queryFn: ({ signal }) => fetchBans(spaceId, { signal }),
  });
}

export function useMapTemplates() {
  return useQuery({
    queryKey: spacesKeys.templates,
    queryFn: ({ signal }) => fetchMapTemplates({ signal }),
    staleTime: Infinity,
  });
}

export function useJoinPreview(token: string) {
  return useQuery({
    queryKey: spacesKeys.invite(token),
    queryFn: ({ signal }) => fetchJoinPreview(token, { signal }),
  });
}

/**
 * Space of `/s/:slug` (for the world feature): members get it; people whose verified e-mail
 * matches the allowed domain join first (E2-S4). Non-members get a 404 `NOT_A_MEMBER` error.
 * Always stale: membership is checked again every time the page is opened, so someone removed
 * from the space loses access at once (E2-S6) even if the space is still cached.
 */
export function useEnterSpace(slug: string) {
  return useQuery({
    queryKey: spacesKeys.enter(slug),
    queryFn: () => enterSpace(slug),
    staleTime: 0,
  });
}

export function useCreateSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSpaceBody) => createSpace(body),
    meta: { silent: true },
    onSuccess: (space) => {
      queryClient.setQueryData(spacesKeys.detail(space.id), space);
      void queryClient.invalidateQueries({ queryKey: spacesKeys.list });
    },
  });
}

export function useUpdateSpace(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSpaceBody) => updateSpace(spaceId, body),
    meta: { silent: true },
    onSuccess: (space) => {
      queryClient.setQueryData(spacesKeys.detail(spaceId), space);
    },
  });
}

export function useRegenerateInvite(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => regenerateInviteLink(spaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spacesKeys.detail(spaceId) }),
  });
}

export function useRemoveMember(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(spaceId, userId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: spacesKeys.members(spaceId) }),
        queryClient.invalidateQueries({ queryKey: spacesKeys.bans(spaceId) }),
      ]),
  });
}

/** Hands the administration to a member (or takes it back): `LAST_OWNER` keeps one owner. */
export function useSetMemberRole(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      setMemberRole(spaceId, userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spacesKeys.members(spaceId) }),
  });
}

export function useUnbanMember(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => unbanMember(spaceId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spacesKeys.bans(spaceId) }),
  });
}

export function useJoinSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => joinSpace(token),
    // Handled by the join page ("Esta invitación ya no es válida").
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spacesKeys.list }),
  });
}

export function useAuthorizeRooms(spaceId: string) {
  return useMutation({ mutationFn: () => authorizeRooms(spaceId) });
}

export function useUpdateRoomLink(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, meetUri }: { areaId: string; meetUri: string }) =>
      updateRoomLink(spaceId, areaId, meetUri),
    meta: { silent: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spacesKeys.detail(spaceId) }),
  });
}
