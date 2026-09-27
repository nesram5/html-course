import type { KickReason, MeetingRoomDto } from '@plaza/shared';

import type { PlazaIo } from '../../platform/socket.js';

/**
 * Pushes space changes to connected sockets. A socket belongs to a space once `space:join`
 * (E4-S1) sets `socket.data.spaceId`, so this works whatever Socket.IO rooms E4 uses.
 */
export class SpaceNotifier {
  constructor(private readonly io: PlazaIo) {}

  async #sockets(spaceId: string, userId?: string) {
    const sockets = await this.io.fetchSockets();
    return sockets.filter(
      (socket) =>
        socket.data.spaceId === spaceId && (userId === undefined || socket.data.userId === userId),
    );
  }

  /** `space:kicked` + disconnect every socket of the person in the space (E2-S6, E4). */
  async kick(spaceId: string, userId: string, reason: KickReason): Promise<void> {
    for (const socket of await this.#sockets(spaceId, userId)) {
      socket.emit('space:kicked', { reason });
      socket.disconnect(true);
    }
  }

  /** `room:updated` to everyone in the space (a Meet link was created or replaced, E2-S7). */
  async roomUpdated(spaceId: string, room: MeetingRoomDto): Promise<void> {
    for (const socket of await this.#sockets(spaceId)) socket.emit('room:updated', room);
  }
}
