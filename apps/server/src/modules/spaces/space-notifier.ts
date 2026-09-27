import type { DeskState, KickReason, MeetingRoomDto } from '@bululu/shared';

import type { BululuIo } from '../../platform/socket.js';

/** Called when a person is kicked out of a space, before their sockets are disconnected. */
export type KickListener = (spaceId: string, userId: string, reason: KickReason) => void;

/**
 * Pushes space changes to connected sockets. A socket belongs to a space once `space:join`
 * (E4-S1) sets `socket.data.spaceId`, so this works whatever Socket.IO rooms E4 uses.
 */
export class SpaceNotifier {
  readonly #kickListeners: KickListener[] = [];

  constructor(private readonly io: BululuIo) {}

  /**
   * Registers a listener for kicks (the world module removes the avatar at once instead of
   * waiting for a reconnection, and disconnects the person from the media room).
   */
  onKick(listener: KickListener): void {
    this.#kickListeners.push(listener);
  }

  async #sockets(spaceId: string, userId?: string) {
    const sockets = await this.io.fetchSockets();
    return sockets.filter(
      (socket) =>
        socket.data.spaceId === spaceId && (userId === undefined || socket.data.userId === userId),
    );
  }

  /** `space:kicked` + disconnect every socket of the person in the space (E2-S6, E4). */
  async kick(spaceId: string, userId: string, reason: KickReason): Promise<void> {
    for (const listener of this.#kickListeners) listener(spaceId, userId, reason);
    for (const socket of await this.#sockets(spaceId, userId)) {
      socket.emit('space:kicked', { reason });
      socket.disconnect(true);
    }
  }

  /** `room:updated` to everyone in the space (a Meet link was created or replaced, E2-S7). */
  async roomUpdated(spaceId: string, room: MeetingRoomDto): Promise<void> {
    for (const socket of await this.#sockets(spaceId)) socket.emit('room:updated', room);
  }

  /** `space:theme` to everyone in the space: the owner changed the office style (E9-S1). */
  async themeChanged(spaceId: string, themeId: string): Promise<void> {
    for (const socket of await this.#sockets(spaceId)) socket.emit('space:theme', { themeId });
  }

  /** `desk:updated` to everyone in the space: claimed, freed or decorated (E9-S2, E9-S3). */
  async deskUpdated(spaceId: string, desk: DeskState): Promise<void> {
    for (const socket of await this.#sockets(spaceId)) socket.emit('desk:updated', desk);
  }
}
