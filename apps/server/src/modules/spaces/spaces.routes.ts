import {
  API_PATHS,
  CreateSpaceBodySchema,
  EnterSpaceResponseSchema,
  InviteLinkResponseSchema,
  JoinParamsSchema,
  JoinPreviewResponseSchema,
  JoinResponseSchema,
  MapTemplatesResponseSchema,
  MemberParamsSchema,
  UpdateMemberBodySchema,
  MembersResponseSchema,
  SpaceBanParamsSchema,
  SpaceBansResponseSchema,
  SpaceParamsSchema,
  SpaceResponseSchema,
  SpaceSlugParamsSchema,
  SpacesResponseSchema,
  UpdateSpaceBodySchema,
  type EnterSpaceResponse,
  type InviteLinkResponse,
  type JoinPreviewResponse,
  type JoinResponse,
  type MapTemplatesResponse,
  type MembersResponse,
  type SpaceBansResponse,
  type SpaceResponse,
  type SpacesResponse,
} from '@plaza/shared';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';

import { AppError } from '../../platform/errors.js';
import type { MapsCatalog } from '../../platform/maps-catalog.js';
import { currentUser } from '../auth/index.js';
import type { SpacesService } from './spaces.service.js';

interface SpacesRoutesDeps {
  spaces: SpacesService;
  maps: MapsCatalog;
  requireUser: preHandlerAsyncHookHandler;
}

/** A malformed token is just an invalid invitation ("Esta invitación ya no es válida"). */
function inviteTokenOf(params: unknown): string {
  const parsed = JoinParamsSchema.safeParse(params);
  if (!parsed.success) throw new AppError('INVALID_INVITE');
  return parsed.data.token;
}

export function registerSpacesRoutes(app: FastifyInstance, deps: SpacesRoutesDeps): void {
  const { spaces, maps } = deps;
  const auth = { preHandler: deps.requireUser };

  app.get(API_PATHS.mapTemplates, async (): Promise<MapTemplatesResponse> => {
    return MapTemplatesResponseSchema.parse({ templates: await maps.listTemplates() });
  });

  app.get(API_PATHS.spaces, auth, async (request): Promise<SpacesResponse> => {
    const list = await spaces.listMine(currentUser(request).userId);
    return SpacesResponseSchema.parse({ spaces: list });
  });

  app.post(API_PATHS.spaces, auth, async (request, reply) => {
    const body = CreateSpaceBodySchema.parse(request.body);
    const space = await spaces.create(currentUser(request).userId, body);
    const response: SpaceResponse = SpaceResponseSchema.parse({ space });
    return reply.code(201).send(response);
  });

  app.get(API_PATHS.space, auth, async (request): Promise<SpaceResponse> => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    const space = await spaces.get(spaceId, currentUser(request).userId);
    return SpaceResponseSchema.parse({ space });
  });

  app.patch(API_PATHS.space, auth, async (request): Promise<SpaceResponse> => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    const body = UpdateSpaceBodySchema.parse(request.body);
    const space = await spaces.update(spaceId, currentUser(request).userId, body);
    return SpaceResponseSchema.parse({ space });
  });

  app.post(API_PATHS.spaceEnterBySlug, auth, async (request): Promise<EnterSpaceResponse> => {
    const { slug } = SpaceSlugParamsSchema.parse(request.params);
    return EnterSpaceResponseSchema.parse(
      await spaces.enterBySlug(slug, currentUser(request).userId),
    );
  });

  app.post(API_PATHS.inviteLink, auth, async (request): Promise<InviteLinkResponse> => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    return InviteLinkResponseSchema.parse(
      await spaces.regenerateInvite(spaceId, currentUser(request).userId),
    );
  });

  app.get(API_PATHS.members, auth, async (request): Promise<MembersResponse> => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    const members = await spaces.members(spaceId, currentUser(request).userId);
    return MembersResponseSchema.parse({ members });
  });

  app.delete(API_PATHS.member, auth, async (request, reply) => {
    const { spaceId, userId } = MemberParamsSchema.parse(request.params);
    await spaces.removeMember(spaceId, currentUser(request).userId, userId);
    return reply.code(204).send();
  });

  app.patch(API_PATHS.member, auth, async (request, reply) => {
    const { spaceId, userId } = MemberParamsSchema.parse(request.params);
    const { role } = UpdateMemberBodySchema.parse(request.body);
    await spaces.setMemberRole(spaceId, currentUser(request).userId, userId, role);
    return reply.code(204).send();
  });

  app.get(API_PATHS.bans, auth, async (request): Promise<SpaceBansResponse> => {
    const { spaceId } = SpaceParamsSchema.parse(request.params);
    const bans = await spaces.bans(spaceId, currentUser(request).userId);
    return SpaceBansResponseSchema.parse({ bans });
  });

  app.delete(API_PATHS.ban, auth, async (request, reply) => {
    const { spaceId, userId } = SpaceBanParamsSchema.parse(request.params);
    await spaces.unban(spaceId, currentUser(request).userId, userId);
    return reply.code(204).send();
  });

  // Public preview of an invitation: the join page shows the space name before signing in.
  app.get(API_PATHS.join, async (request): Promise<JoinPreviewResponse> => {
    const token = inviteTokenOf(request.params);
    return JoinPreviewResponseSchema.parse(await spaces.joinPreview(token));
  });

  app.post(API_PATHS.join, auth, async (request): Promise<JoinResponse> => {
    const token = inviteTokenOf(request.params);
    return JoinResponseSchema.parse(await spaces.join(token, currentUser(request).userId));
  });
}
