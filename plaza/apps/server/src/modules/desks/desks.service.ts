import { validateDeskDecor, type DecorItemDto, type DeskState, type DeskArea } from '@plaza/shared';
import { Prisma } from '@prisma/client';

import type { Database } from '../../platform/db.js';
import { AppError } from '../../platform/errors.js';
import type { KeyedSerial } from '../../platform/keyed-serial.js';
import type { MapsCatalog } from '../../platform/maps-catalog.js';
import { freeDesk, type SpaceNotifier, type SpacesService } from '../spaces/index.js';
import { DesksRepository, deskStateOf, type DeskHolder } from './desks.repository.js';

export interface DesksServiceDeps {
  db: Database;
  maps: MapsCatalog;
  spaces: SpacesService;
  notifier: SpaceNotifier;
  /** Desk queue of the spaces module, shared with member removal (see `SpacesApi`). */
  serial: KeyedSerial;
}

/** Body of `PATCH …/decor` before the catalog check: any list of item ids or empty slots. */
export interface DecorRequest {
  readonly slots: readonly (string | null)[];
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** The membership to update is gone (removed from the space meanwhile). */
function isMissingRecord(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

function stateOf(holder: DeskHolder): DeskState {
  const state = deskStateOf(holder);
  if (state === null) throw new Error('The member lost the desk while it was being updated');
  return state;
}

/**
 * Desks of a space (E9-S2, E9-S3): claim a free desk (the previous one is freed, RN-13), owners
 * assign and free desks of others (RN-14), and the holder decorates it with up to 3 catalog
 * items (RN-15). Every change reaches the people in the space as `desk:updated`.
 *
 * Changes to the desks of one space run one at a time, reading and writing the database and
 * broadcasting in one go: concurrent requests (one person claiming two desks at once, an owner
 * assigning a desk while its member claims another) would otherwise announce desks in a
 * different order than they were stored, and everyone would see a name over a desk that is free.
 */
export class DesksService {
  readonly #repository: DesksRepository;
  readonly #catalogIds: ReadonlySet<string>;

  constructor(private readonly deps: DesksServiceDeps) {
    this.#repository = new DesksRepository(deps.db);
    this.#catalogIds = new Set(deps.maps.listDecor().map((item) => item.id));
  }

  /** Decoration catalog (`GET /api/decor`). */
  catalog(): DecorItemDto[] {
    return this.deps.maps.listDecor();
  }

  /** Occupied desks of the space (members only). */
  async list(spaceId: string, userId: string): Promise<DeskState[]> {
    await this.deps.spaces.assertMember(spaceId, userId);
    const held = await this.#repository.listHeld(spaceId);
    return held.map(stateOf);
  }

  /**
   * Gives a free desk to `targetUserId` (the actor by default; someone else only for owners).
   * A desk held by someone else → 409 `DESK_TAKEN`; already theirs → unchanged.
   */
  claim(
    spaceId: string,
    actorId: string,
    deskId: string,
    targetUserId: string = actorId,
  ): Promise<DeskState> {
    return this.deps.serial.run(spaceId, () => this.#claim(spaceId, actorId, deskId, targetUserId));
  }

  async #claim(
    spaceId: string,
    actorId: string,
    deskId: string,
    targetUserId: string,
  ): Promise<DeskState> {
    const actor = await this.deps.spaces.assertMember(spaceId, actorId);
    if (targetUserId !== actorId && actor.role !== 'OWNER') {
      throw new AppError('FORBIDDEN', 'Only owners can assign desks to others');
    }
    await this.#assertDesk(spaceId, deskId);
    const target =
      targetUserId === actorId
        ? actor
        : await this.#repository.findMembership(spaceId, targetUserId);
    if (target === null) throw new AppError('NOT_FOUND', 'Member not found');

    const holder = await this.#repository.findHolder(spaceId, deskId);
    if (holder !== null) {
      if (holder.userId === targetUserId) return stateOf(holder);
      throw new AppError('DESK_TAKEN', 'Someone already has this desk');
    }
    let updated: DeskHolder;
    try {
      updated = await this.#repository.setDesk(spaceId, targetUserId, deskId);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('DESK_TAKEN', 'Someone took this desk');
      if (isMissingRecord(error)) throw new AppError('NOT_FOUND', 'Member not found');
      throw error;
    }
    if (target.deskId !== null && target.deskId !== deskId) {
      await this.deps.notifier.deskUpdated(spaceId, freeDesk(target.deskId));
    }
    const state = stateOf(updated);
    await this.deps.notifier.deskUpdated(spaceId, state);
    return state;
  }

  /** Frees a desk: its holder or an owner (403 otherwise). A free desk stays free. */
  release(spaceId: string, actorId: string, deskId: string): Promise<void> {
    return this.deps.serial.run(spaceId, () => this.#release(spaceId, actorId, deskId));
  }

  async #release(spaceId: string, actorId: string, deskId: string): Promise<void> {
    const actor = await this.deps.spaces.assertMember(spaceId, actorId);
    await this.#assertDesk(spaceId, deskId);
    const holder = await this.#repository.findHolder(spaceId, deskId);
    if (holder === null) return;
    if (holder.userId !== actorId && actor.role !== 'OWNER') {
      throw new AppError('FORBIDDEN', 'Only its holder or an owner can free this desk');
    }
    if (await this.#repository.clearDesk(spaceId, holder.userId, deskId)) {
      await this.deps.notifier.deskUpdated(spaceId, freeDesk(deskId));
    }
  }

  /**
   * Decorates the actor's own desk (403 for any other desk, owners included). Items outside
   * the catalog → 400 `UNKNOWN_DECOR_ITEM`; more than 3 → 400 `VALIDATION_ERROR` (RN-15).
   */
  decorate(
    spaceId: string,
    actorId: string,
    deskId: string,
    request: DecorRequest,
  ): Promise<DeskState> {
    return this.deps.serial.run(spaceId, () => this.#decorate(spaceId, actorId, deskId, request));
  }

  async #decorate(
    spaceId: string,
    actorId: string,
    deskId: string,
    request: DecorRequest,
  ): Promise<DeskState> {
    const actor = await this.deps.spaces.assertMember(spaceId, actorId);
    await this.#assertDesk(spaceId, deskId);
    if (actor.deskId !== deskId) {
      throw new AppError('FORBIDDEN', 'Only the holder of a desk can decorate it');
    }
    const validation = validateDeskDecor(request, this.#catalogIds);
    if (!validation.ok) {
      throw new AppError(
        validation.code,
        validation.reason === 'unknown-item'
          ? `Unknown decoration item "${validation.itemId ?? ''}"`
          : 'A desk holds at most 3 items',
      );
    }
    const state = stateOf(await this.#repository.setDecor(spaceId, actorId, validation.decor));
    await this.deps.notifier.deskUpdated(spaceId, state);
    return state;
  }

  /** The desk exists in the map of the space (404 `UNKNOWN_DESK` otherwise). */
  async #assertDesk(spaceId: string, deskId: string): Promise<DeskArea> {
    const space = await this.deps.spaces.spaceWithRooms(spaceId);
    const map = await this.deps.maps.worldMap(space.mapTemplateId);
    const desk = map.desks.find((candidate) => candidate.deskId === deskId);
    if (desk === undefined) throw new AppError('UNKNOWN_DESK', `Unknown desk "${deskId}"`);
    return desk;
  }
}
