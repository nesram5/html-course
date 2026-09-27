import {
  DEFAULT_THEME_ID,
  PresenceStatusSchema,
  type CreateSpaceBody,
  type EnterSpaceResponse,
  type InviteLinkResponse,
  type JoinPreviewResponse,
  type JoinResponse,
  type MeetingRoomDto,
  type MemberDto,
  type Role,
  type SpaceDetailDto,
  type SpaceSummaryDto,
  type UpdateSpaceBody,
} from '@plaza/shared';
import { Prisma, type Membership, type Space } from '@prisma/client';

import type { Database } from '../../platform/db.js';
import type { ErrorReporter } from '../../platform/error-reporter.js';
import { AppError } from '../../platform/errors.js';
import type { Logger } from '../../platform/logger.js';
import type { MapRoomArea, MapsCatalog } from '../../platform/maps-catalog.js';
import { hashToken, randomToken } from '../auth/tokens.js';
import { deriveInviteToken } from './invite-token.js';
import { inviteUrl } from './invite-url.js';
import type { SpaceNotifier } from './space-notifier.js';
import { mergeRooms } from './space-rooms.js';
import { firstFreeSlug, slugify } from './slug.js';
import { SpacesRepository, type SpaceWithRooms } from './spaces.repository.js';

const MAX_CREATE_ATTEMPTS = 5;

export interface SpacesServiceDeps {
  db: Database;
  maps: MapsCatalog;
  notifier: SpaceNotifier;
  logger: Logger;
  reporter: ErrorReporter;
  /** `SESSION_SECRET`: derives invite tokens. */
  secret: string;
  publicUrl: string;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function emailDomain(email: string): string {
  return (email.split('@').pop() ?? '').toLowerCase();
}

/**
 * Spaces, memberships and access (E2-S2..S6). Guards: `assertMember` (non-members get 404
 * `NOT_A_MEMBER`, so existence is not leaked) and `assertOwner` (members get 403).
 */
export class SpacesService {
  readonly #repository: SpacesRepository;

  constructor(private readonly deps: SpacesServiceDeps) {
    this.#repository = new SpacesRepository(deps.db);
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  async assertMember(spaceId: string, userId: string): Promise<Membership> {
    const membership = await this.#repository.findMembership(spaceId, userId);
    if (membership === null) throw new AppError('NOT_A_MEMBER', 'Space not found');
    return membership;
  }

  async assertOwner(spaceId: string, userId: string): Promise<Membership> {
    const membership = await this.assertMember(spaceId, userId);
    if (membership.role !== 'OWNER') throw new AppError('FORBIDDEN', 'Only owners can do this');
    return membership;
  }

  // ── Spaces ────────────────────────────────────────────────────────────────

  /** Creates the space with a unique slug, an invite link and the creator as `OWNER` (E2-S2). */
  async create(userId: string, body: CreateSpaceBody): Promise<SpaceDetailDto> {
    const { maps } = this.deps;
    if (!maps.hasTemplate(body.mapTemplateId)) {
      throw new AppError('UNKNOWN_MAP_TEMPLATE', `Unknown map template "${body.mapTemplateId}"`);
    }
    const base = slugify(body.name);
    for (let attempt = 1; ; attempt++) {
      const taken = await this.#repository.slugsStartingWith(base);
      const slug = firstFreeSlug(base, taken);
      try {
        const space = await this.deps.db.$transaction(async (tx) => {
          const repository = new SpacesRepository(tx);
          const created = await repository.createSpace({
            name: body.name,
            slug,
            mapTemplateId: body.mapTemplateId,
            themeId: maps.defaultThemeId(body.mapTemplateId) ?? DEFAULT_THEME_ID,
            ownerId: userId,
            // Placeholder until the id is known: the real token derives from it.
            inviteTokenHash: hashToken(randomToken()),
          });
          const token = deriveInviteToken(this.deps.secret, created.id, created.inviteVersion);
          await repository.addMember(created.id, userId, 'OWNER');
          return repository.updateSpace(created.id, { inviteTokenHash: hashToken(token) });
        });
        return await this.#detail({ ...space, rooms: [] }, 'OWNER');
      } catch (error) {
        // Two spaces with the same name created at once: pick the next free slug.
        if (!isUniqueViolation(error) || attempt >= MAX_CREATE_ATTEMPTS) throw error;
      }
    }
  }

  /** "My spaces" (E2-S3). */
  async listMine(userId: string): Promise<SpaceSummaryDto[]> {
    const memberships = await this.#repository.listMembershipsOfUser(userId);
    return memberships.map((membership) => this.#summary(membership.space, membership.role));
  }

  async get(spaceId: string, userId: string): Promise<SpaceDetailDto> {
    const membership = await this.assertMember(spaceId, userId);
    return this.#detail(await this.#spaceOrThrow(spaceId), membership.role);
  }

  /** Owner-only settings: name, `allowedDomain` (E2-S4) and theme (validated, E9-S1). */
  async update(spaceId: string, userId: string, body: UpdateSpaceBody): Promise<SpaceDetailDto> {
    await this.assertOwner(spaceId, userId);
    const space = await this.#spaceOrThrow(spaceId);
    if (body.themeId !== undefined && !this.deps.maps.hasTheme(space.mapTemplateId, body.themeId)) {
      throw new AppError('UNKNOWN_THEME', `Unknown theme "${body.themeId}"`);
    }
    const updated = await this.#repository.updateSpace(spaceId, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.allowedDomain !== undefined && { allowedDomain: body.allowedDomain }),
      ...(body.themeId !== undefined && { themeId: body.themeId }),
    });
    return this.#detail({ ...updated, rooms: space.rooms }, 'OWNER');
  }

  /** Regenerates the invite link: the previous one stops working at once (E2-S4). */
  async regenerateInvite(spaceId: string, userId: string): Promise<InviteLinkResponse> {
    await this.assertOwner(spaceId, userId);
    const space = await this.#spaceOrThrow(spaceId);
    const inviteVersion = space.inviteVersion + 1;
    const token = deriveInviteToken(this.deps.secret, spaceId, inviteVersion);
    await this.#repository.updateSpace(spaceId, {
      inviteVersion,
      inviteTokenHash: hashToken(token),
    });
    return { url: inviteUrl(this.deps.publicUrl, token) };
  }

  /**
   * `/s/:slug`: members enter; people whose verified e-mail belongs to `allowedDomain` become
   * members first (E2-S4). Everyone else gets 404.
   */
  async enterBySlug(slug: string, userId: string): Promise<EnterSpaceResponse> {
    const space = await this.#repository.findSpaceBySlug(slug);
    if (space === null) throw new AppError('NOT_A_MEMBER', 'Space not found');
    const membership = await this.#repository.findMembership(space.id, userId);
    if (membership !== null) {
      return { space: await this.#detail(space, membership.role), joined: false };
    }
    const user = await this.#repository.findUser(userId);
    if (
      space.allowedDomain === null ||
      user === null ||
      emailDomain(user.email) !== space.allowedDomain
    ) {
      throw new AppError('NOT_A_MEMBER', 'Space not found');
    }
    const joined = await this.#addMemberIdempotent(space.id, userId);
    return { space: await this.#detail(space, 'MEMBER'), joined };
  }

  // ── Invitations (E2-S5) ───────────────────────────────────────────────────

  async joinPreview(token: string): Promise<JoinPreviewResponse> {
    const space = await this.#repository.findSpaceByInviteHash(hashToken(token));
    if (space === null) throw new AppError('INVALID_INVITE');
    return {
      space: {
        name: space.name,
        mapTemplateId: space.mapTemplateId,
        memberCount: space.memberCount,
      },
    };
  }

  /** Joins with an invite token. Idempotent: existing members just get the space. */
  async join(token: string, userId: string): Promise<JoinResponse> {
    const space = await this.#repository.findSpaceByInviteHash(hashToken(token));
    if (space === null) throw new AppError('INVALID_INVITE');
    const existing = await this.#repository.findMembership(space.id, userId);
    if (existing !== null) {
      return { space: this.#summary(space, existing.role), alreadyMember: true };
    }
    const joined = await this.#addMemberIdempotent(space.id, userId);
    return { space: this.#summary(space, 'MEMBER'), alreadyMember: !joined };
  }

  // ── Members (E2-S6) ───────────────────────────────────────────────────────

  /** Members of the space; e-mails are only visible to owners. */
  async members(spaceId: string, userId: string): Promise<MemberDto[]> {
    const requester = await this.assertMember(spaceId, userId);
    const members = await this.#repository.listMembers(spaceId);
    return members.map((member) => ({
      userId: member.userId,
      displayName: member.user.displayName,
      avatarId: member.user.avatarId,
      email: requester.role === 'OWNER' ? member.user.email : null,
      role: member.role,
      status: PresenceStatusSchema.catch('available').parse(member.status),
      deskId: member.deskId,
      joinedAt: member.joinedAt.toISOString(),
    }));
  }

  /**
   * Removes a member (owner only). Access is lost at once: the membership is deleted and their
   * sockets get `space:kicked`. The last owner cannot be removed (409 `LAST_OWNER`).
   */
  async removeMember(spaceId: string, actorId: string, targetUserId: string): Promise<void> {
    await this.assertOwner(spaceId, actorId);
    const target = await this.#repository.findMembership(spaceId, targetUserId);
    if (target === null) throw new AppError('NOT_FOUND', 'Member not found');
    if (target.role === 'OWNER' && (await this.#repository.countOwners(spaceId)) <= 1) {
      throw new AppError('LAST_OWNER');
    }
    await this.#repository.removeMember(spaceId, targetUserId);
    await this.deps.notifier.kick(spaceId, targetUserId, 'REMOVED');
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  /** Meeting rooms of the space map, each with its Meet link if any. */
  async rooms(space: SpaceWithRooms): Promise<MeetingRoomDto[]> {
    return mergeRooms(await this.roomAreas(space.mapTemplateId), space.rooms);
  }

  /**
   * Rooms of the template map. If the map cannot be read the space still works: the error is
   * reported and only the stored Meet links are listed.
   */
  async roomAreas(mapTemplateId: string): Promise<readonly MapRoomArea[]> {
    try {
      return await this.deps.maps.roomAreas(mapTemplateId);
    } catch (error) {
      this.deps.logger.error({ err: error, mapTemplateId }, 'Could not read the rooms of the map');
      this.deps.reporter.captureException(error);
      return [];
    }
  }

  async spaceWithRooms(spaceId: string): Promise<SpaceWithRooms> {
    return this.#spaceOrThrow(spaceId);
  }

  // ── Mapping ───────────────────────────────────────────────────────────────

  async #spaceOrThrow(spaceId: string): Promise<SpaceWithRooms> {
    const space = await this.#repository.findSpace(spaceId);
    if (space === null) throw new AppError('NOT_A_MEMBER', 'Space not found');
    return space;
  }

  async #addMemberIdempotent(spaceId: string, userId: string): Promise<boolean> {
    try {
      await this.#repository.addMember(spaceId, userId, 'MEMBER');
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  #summary(space: Space, role: Role): SpaceSummaryDto {
    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      mapTemplateId: space.mapTemplateId,
      themeId: space.themeId,
      role,
      thumbnailUrl: this.deps.maps.thumbnailUrl(space.mapTemplateId, space.themeId),
    };
  }

  async #detail(space: SpaceWithRooms, role: Role): Promise<SpaceDetailDto> {
    const token =
      role === 'OWNER' ? deriveInviteToken(this.deps.secret, space.id, space.inviteVersion) : null;
    return {
      ...this.#summary(space, role),
      ownerId: space.ownerId,
      allowedDomain: space.allowedDomain,
      createdAt: space.createdAt.toISOString(),
      rooms: await this.rooms(space),
      inviteUrl: token === null ? null : inviteUrl(this.deps.publicUrl, token),
    };
  }
}
