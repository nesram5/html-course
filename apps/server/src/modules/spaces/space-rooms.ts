import { MeetingRoomSourceSchema, type MeetingRoomDto } from '@bululu/shared';
import type { MeetingRoom } from '@prisma/client';

import type { MapRoomArea } from '../../platform/maps-catalog.js';

/**
 * Meeting rooms of a space: every room of the map, with its Meet link when one was created or
 * pasted (`MeetingRoom` rows). Rows whose area is not in `areas` (e.g. the map could not be
 * loaded) are listed too, named after their `areaId`.
 */
export function mergeRooms(
  areas: readonly MapRoomArea[],
  records: readonly MeetingRoom[],
): MeetingRoomDto[] {
  const byArea = new Map(records.map((record) => [record.areaId, record]));
  const toDto = (areaId: string, name: string): MeetingRoomDto => {
    const record = byArea.get(areaId);
    const source = MeetingRoomSourceSchema.safeParse(record?.source);
    return {
      areaId,
      name,
      meetUri: record?.meetUri ?? null,
      source: record !== undefined && source.success ? source.data : null,
    };
  };
  const known = new Set(areas.map((area) => area.areaId));
  return [
    ...areas.map((area) => toDto(area.areaId, area.name)),
    ...records
      .filter((record) => !known.has(record.areaId))
      .map((record) => toDto(record.areaId, record.areaId)),
  ];
}
