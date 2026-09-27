import {
  DEFAULT_THEME_ID,
  PresenceStatusSchema,
  type CreateSpaceBody,
  type DeskState,
  type EnterSpaceResponse,
  type InviteLinkResponse,
  type JoinPreviewResponse,
  type JoinResponse,
  type MeetingRoomDto,
  type MemberDto,
  type Role,
  type SpaceBanDto,
  type SpaceDetailDto,
  type SpaceSummaryDto,
  type UpdateSpaceBody,
} from '@plaza/shared';
import { Prisma, type Membership, type Space } from '@prisma/client';

import type { Database } from '../../platform/db.js';
import type { ErrorReporter } from '../../platform/error-reporter.js';
import { AppError } from '../../platform/errors.js';
import { KeyedSerial } from '../../platform/keyed-serial.js';
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
  /**
   * Queue of the desk changes of each space (keyed by space id), shared with the desks module:
   * removing a member frees their desk, so it must not interleave with a desk claim (E8-S2).
   */
  deskChanges: KeyedSerial;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** `desk:updated` payload of a desk nobody owns. */
export function freeDesk(deskId: string): DeskState {
  return { deskId, userId: null, displayName: null, decor: null };
}

/**
 * Spaces, memberships and access (E2-S2..S6). Guards: `assertMember` (non-members get 404
 * `NOT_A_MEMBER`, so existence is not leaked) and `assertOwner` (members get 403).
 */
export class SpacesService {
  readonly #repository: SpacesRepository;
  /** Settings changes of one space, one at a time: the last `space:theme` sent is the stored one. */
  readonly #settings = new KeyedSerial();

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
    await this.#assertUsableTemplate(body.mapTemplateId);
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
  update(spaceId: string, userId: string, body: UpdateSpaceBody): Promise<SpaceDetailDto> {
    return this.#settings.run(spaceId, () => this.#update(spaceId, userId, body));
  }

  async #update(spaceId: string, userId: string, body: UpdateSpaceBody): Promise<SpaceDetailDto> {
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
    // E9-S1: everyone connected switches to the new style live.
    if (updated.themeId !== space.themeId)
      await this.deps.notifier.themeChanged(spaceId, updated.themeId);
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
   * `/s/:slug`: members enter; people whose Google Workspace account belongs to `allowedDomain`
   * (the `hd` claim of their last sign-in) become members first (E2-S4). The e-mail domain alone
   * is not enough: a personal Google account can be registered with a corporate address, and it
   * stays verified after the person leaves the company. Everyone else gets 404.
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
      user.hostedDomain !== space.allowedDomain
    ) {
      throw new AppError('NOT_A_MEMBER', 'Space not found');
    }
    await this.#assertNotBanned(space.id, userId);
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
    await this.#assertNotBanned(space.id, userId);
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
   * Removes a member (owner only). Access is lost at once: the membership is deleted, the person
   * is banned (invite links and the allowed domain no longer let them in) and their sockets get
   * `space:kicked`. The last owner cannot be removed (409 `LAST_OWNER`).
   */
  removeMember(spaceId: string, actorId: string, targetUserId: string): Promise<void> {
    // In the desk queue of the space: the desk read here is the one really freed, and a claim
    // queued after the removal finds no membership (E8-S2).
    return this.deps.deskChanges.run(spaceId, () =>
      this.#removeMember(spaceId, actorId, targetUserId),
    );
  }

  async #removeMember(spaceId: string, actorId: string, targetUserId: string): Promise<void> {
    await this.assertOwner(spaceId, actorId);
    const target = await this.#repository.findMembership(spaceId, targetUserId);
    if (target === null) throw new AppError('NOT_FOUND', 'Member not found');
    if (target.role === 'OWNER' && (await this.#repository.countOwners(spaceId)) <= 1) {
      throw new AppError('LAST_OWNER');
    }
    await this.deps.db.$transaction(async (tx) => {
      const repository = new SpacesRepository(tx);
      await repository.removeMember(spaceId, targetUserId);
      await repository.ban(spaceId, targetUserId);
    });
    await this.deps.notifier.kick(spaceId, targetUserId, 'REMOVED');
    // E9-S2: the membership (and its desk) is gone, so the desk is free for everyone.
    if (target.deskId !== null)
      await this.deps.notifier.deskUpdated(spaceId, freeDesk(target.deskId));
  }

  /** People removed from the space (owner only), newest first. */
  async bans(spaceId: string, actorId: string): Promise<SpaceBanDto[]> {
    await this.assertOwner(spaceId, actorId);
    const bans = await this.#repository.listBans(spaceId);
    return bans.map((ban) => ({
      userId: ban.userId,
      displayName: ban.user.displayName,
      avatarId: ban.user.avatarId,
      email: ban.user.email,
      createdAt: ban.createdAt.toISOString(),
    }));
  }

  /** Lifts a ban (owner only): the person may join again. Not banned → 404 `NOT_FOUND`. */
  async unban(spaceId: string, actorId: string, targetUserId: string): Promise<void> {
    await this.assertOwner(spaceId, actorId);
    if (!(await this.#repository.unban(spaceId, targetUserId))) {
      throw new AppError('NOT_FOUND', 'This person is not banned');
    }
  }

  async #assertNotBanned(spaceId: string, userId: string): Promise<void> {
    if (await this.#repository.isBanned(spaceId, userId)) {
      throw new AppError('BANNED_FROM_SPACE', 'You were removed from this space');
    }
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

  /**
   * A new space needs a map that `parseMap` accepts (walls, spawns, rooms): a template whose map
   * cannot be parsed is refused like an unknown one, and the problem is reported.
   */
  async #assertUsableTemplate(mapTemplateId: string): Promise<void> {
    try {
      await this.deps.maps.roomAreas(mapTemplateId);
    } catch (error) {
      this.deps.logger.error({ err: error, mapTemplateId }, 'Map template cannot be parsed');
      this.deps.reporter.captureException(error);
      throw new AppError('UNKNOWN_MAP_TEMPLATE', `Map template "${mapTemplateId}" is not valid`);
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
