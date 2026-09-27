import type { MeetingRoom } from '@prisma/client';

import type { Database } from '../../platform/db.js';

export interface NewMeetingRoom {
  spaceId: string;
  areaId: string;
  meetUri: string;
  source: 'api' | 'manual';
}

/** Prisma access for the Meet links of meeting rooms. */
export class RoomsRepository {
  constructor(private readonly db: Database) {}

  /** Inserts the rooms that do not exist yet (`@@unique([spaceId, areaId])`): never duplicates. */
  async createMissing(rooms: readonly NewMeetingRoom[]): Promise<void> {
    await this.db.meetingRoom.createMany({ data: [...rooms], skipDuplicates: true });
  }

  upsert(room: NewMeetingRoom): Promise<MeetingRoom> {
    return this.db.meetingRoom.upsert({
      where: { spaceId_areaId: { spaceId: room.spaceId, areaId: room.areaId } },
      create: room,
      update: { meetUri: room.meetUri, source: room.source },
    });
  }
}
