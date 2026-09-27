import type { CreateSpaceBody, UpdateSpaceBody } from '@plaza/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  authorizeRooms,
  createSpace,
  fetchJoinPreview,
  fetchMapTemplates,
  fetchMembers,
  fetchSpace,
  fetchSpaces,
  joinSpace,
  regenerateInviteLink,
  removeMember,
  spacesKeys,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spacesKeys.members(spaceId) }),
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
