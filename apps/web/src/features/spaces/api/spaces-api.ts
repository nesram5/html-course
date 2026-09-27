import {
  API_PATHS,
  apiPath,
  AuthorizeRoomsResponseSchema,
  EnterSpaceResponseSchema,
  InviteLinkResponseSchema,
  JoinPreviewResponseSchema,
  JoinResponseSchema,
  MapTemplatesResponseSchema,
  MembersResponseSchema,
  RoomResponseSchema,
  SpaceBansResponseSchema,
  SpaceResponseSchema,
  SpacesResponseSchema,
  type CreateSpaceBody,
  type Role,
  type UpdateSpaceBody,
} from '@bululu/shared';

import { http } from '@/shared/api';

/** Query keys of the spaces feature (standards §5). */
export const spacesKeys = {
  all: ['spaces'] as const,
  list: ['spaces', 'list'] as const,
  detail: (spaceId: string) => ['spaces', 'detail', spaceId] as const,
  members: (spaceId: string) => ['spaces', 'members', spaceId] as const,
  bans: (spaceId: string) => ['spaces', 'bans', spaceId] as const,
  templates: ['spaces', 'map-templates'] as const,
  invite: (token: string) => ['spaces', 'invite', token] as const,
  enter: (slug: string) => ['spaces', 'enter', slug] as const,
};

type Signal = { signal?: AbortSignal };
const opts = ({ signal }: Signal) => (signal ? { signal } : {});

export async function fetchSpaces(o: Signal = {}) {
  return (await http(API_PATHS.spaces, SpacesResponseSchema, opts(o))).spaces;
}

export async function fetchSpace(spaceId: string, o: Signal = {}) {
  return (await http(apiPath(API_PATHS.space, { spaceId }), SpaceResponseSchema, opts(o))).space;
}

/** `/s/:slug`: the space for members, joining first when the e-mail domain is allowed. */
export function enterSpace(slug: string) {
  const path = apiPath(API_PATHS.spaceEnterBySlug, { slug });
  return http(path, EnterSpaceResponseSchema, { method: 'POST' });
}

export async function createSpace(body: CreateSpaceBody) {
  return (await http(API_PATHS.spaces, SpaceResponseSchema, { method: 'POST', body })).space;
}

export async function updateSpace(spaceId: string, body: UpdateSpaceBody) {
  const path = apiPath(API_PATHS.space, { spaceId });
  return (await http(path, SpaceResponseSchema, { method: 'PATCH', body })).space;
}

export async function regenerateInviteLink(spaceId: string) {
  const path = apiPath(API_PATHS.inviteLink, { spaceId });
  return (await http(path, InviteLinkResponseSchema, { method: 'POST' })).url;
}

export async function fetchMembers(spaceId: string, o: Signal = {}) {
  const path = apiPath(API_PATHS.members, { spaceId });
  return (await http(path, MembersResponseSchema, opts(o))).members;
}

export function removeMember(spaceId: string, userId: string) {
  return http(apiPath(API_PATHS.member, { spaceId, userId }), null, { method: 'DELETE' });
}

/** Makes a member an owner, or an owner a member again (owner only). */
export function setMemberRole(spaceId: string, userId: string, role: Role) {
  return http(apiPath(API_PATHS.member, { spaceId, userId }), null, {
    method: 'PATCH',
    body: { role },
  });
}

/** People removed from the space (owner only, E2-S6 follow-up). */
export async function fetchBans(spaceId: string, o: Signal = {}) {
  const path = apiPath(API_PATHS.bans, { spaceId });
  return (await http(path, SpaceBansResponseSchema, opts(o))).bans;
}

/** Lifts a ban: the person may join again with the invite link or the allowed domain. */
export function unbanMember(spaceId: string, userId: string) {
  return http(apiPath(API_PATHS.ban, { spaceId, userId }), null, { method: 'DELETE' });
}

export async function fetchMapTemplates(o: Signal = {}) {
  return (await http(API_PATHS.mapTemplates, MapTemplatesResponseSchema, opts(o))).templates;
}

export async function fetchJoinPreview(token: string, o: Signal = {}) {
  const path = apiPath(API_PATHS.join, { token });
  return (await http(path, JoinPreviewResponseSchema, opts(o))).space;
}

export function joinSpace(token: string) {
  return http(apiPath(API_PATHS.join, { token }), JoinResponseSchema, { method: 'POST' });
}

export async function authorizeRooms(spaceId: string) {
  const path = apiPath(API_PATHS.roomsAuthorize, { spaceId });
  return (await http(path, AuthorizeRoomsResponseSchema, { method: 'POST' })).authorizeUrl;
}

export async function updateRoomLink(spaceId: string, areaId: string, meetUri: string) {
  const path = apiPath(API_PATHS.room, { spaceId, areaId });
  return (await http(path, RoomResponseSchema, { method: 'PUT', body: { meetUri } })).room;
}
