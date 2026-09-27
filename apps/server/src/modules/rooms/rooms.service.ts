import type { MeetingRoomDto } from '@bululu/shared';

import type { CodeExchange } from '../../adapters/identity-provider.js';
import type { MeetingProvider } from '../../adapters/meeting-provider.js';
import { AppError } from '../../platform/errors.js';
import { mergeRooms, type SpaceNotifier, type SpacesService } from '../spaces/index.js';
import type { RoomsRepository } from './rooms.repository.js';

export interface RoomsServiceDeps {
  repository: RoomsRepository;
  spaces: SpacesService;
  notifier: SpaceNotifier;
  meetings: MeetingProvider;
}

/** Meeting rooms of a space and their Google Meet links (E2-S7). */
export class RoomsService {
  constructor(private readonly deps: RoomsServiceDeps) {}

  async list(spaceId: string, userId: string): Promise<MeetingRoomDto[]> {
    await this.deps.spaces.assertMember(spaceId, userId);
    return this.deps.spaces.rooms(await this.deps.spaces.spaceWithRooms(spaceId));
  }

  /** Owner check before sending the owner to Google's consent screen. */
  async assertCanAuthorize(spaceId: string, userId: string): Promise<void> {
    await this.deps.spaces.assertOwner(spaceId, userId);
  }

  /**
   * Creates one Meet space per room of the map that has no link yet. Idempotent: rooms that
   * already have a link are kept and, when none is missing, Google is not called at all. The
   * authorization code is handed to the provider, which uses the token and discards it.
   */
  async createAll(
    spaceId: string,
    userId: string,
    authorization: CodeExchange,
  ): Promise<MeetingRoomDto[]> {
    const { spaces, meetings, repository, notifier } = this.deps;
    await spaces.assertOwner(spaceId, userId);
    const space = await spaces.spaceWithRooms(spaceId);
    const areas = await spaces.roomAreas(space.mapTemplateId);
    const existing = new Set(space.rooms.map((room) => room.areaId));
    const missing = areas.filter((area) => !existing.has(area.areaId));
    if (missing.length === 0) return mergeRooms(areas, space.rooms);

    const created = await meetings.createMeetingSpaces({ authorization, count: missing.length });
    const rooms = missing.flatMap((area, i) => {
      const meetUri = created[i]?.meetingUri;
      return meetUri === undefined
        ? []
        : [{ spaceId, areaId: area.areaId, meetUri, source: 'api' as const }];
    });
    await repository.createMissing(rooms);

    const updated = mergeRooms(areas, (await spaces.spaceWithRooms(spaceId)).rooms);
    for (const room of updated.filter((r) => missing.some((area) => area.areaId === r.areaId))) {
      await notifier.roomUpdated(spaceId, room);
    }
    return updated;
  }

  /** Replaces a room's link by hand (`source: "manual"`, owner only). */
  async replace(
    spaceId: string,
    userId: string,
    areaId: string,
    meetUri: string,
  ): Promise<MeetingRoomDto> {
    const { spaces, repository, notifier } = this.deps;
    await spaces.assertOwner(spaceId, userId);
    const space = await spaces.spaceWithRooms(spaceId);
    const areas = await spaces.roomAreas(space.mapTemplateId);
    const known =
      areas.some((area) => area.areaId === areaId) ||
      space.rooms.some((room) => room.areaId === areaId);
    if (!known) throw new AppError('UNKNOWN_ROOM', `Unknown room "${areaId}"`);

    const record = await repository.upsert({ spaceId, areaId, meetUri, source: 'manual' });
    const others = space.rooms.filter((room) => room.areaId !== areaId);
    const room = mergeRooms(areas, [...others, record]).find((r) => r.areaId === areaId);
    if (room === undefined) throw new AppError('UNKNOWN_ROOM');
    await notifier.roomUpdated(spaceId, room);
    return room;
  }
}
