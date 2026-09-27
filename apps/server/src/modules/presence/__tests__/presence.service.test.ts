import type { PresenceStatus } from '@bululu/shared';
import { describe, expect, it } from 'vitest';

import type { BululuSocket } from '../../../platform/socket.js';
import type { WorldService } from '../../world/index.js';
import type { PresenceRepository } from '../presence.repository.js';
import { PresenceService } from '../presence.service.js';
import { RingCooldowns } from '../ring-cooldowns.js';

describe('PresenceService.setStatus (E7-S1)', () => {
  it('keeps the last of two quick changes, in the runtime and in the database', async () => {
    let status: PresenceStatus = 'available';
    const runtime = {
      spaceId: 'space-1',
      update: (_userId: string, change: { status: PresenceStatus }) => {
        status = change.status;
      },
    };
    const world = { joinedRuntime: () => ({ runtime, userId: 'user-1' }) };
    // The first write is slow: without ordering it would land after the second one.
    const stored: PresenceStatus[] = [];
    let releaseFirst = (): void => undefined;
    let calls = 0;
    const repository = {
      saveStatus: (_spaceId: string, _userId: string, value: PresenceStatus) => {
        calls++;
        if (calls === 1) {
          return new Promise<void>((resolve) => {
            releaseFirst = () => {
              stored.push(value);
              resolve();
            };
          });
        }
        stored.push(value);
        return Promise.resolve();
      },
    };
    const presence = new PresenceService({
      world: world as unknown as WorldService,
      repository: repository as unknown as PresenceRepository,
      cooldowns: new RingCooldowns(),
      now: () => 0,
    });
    const socket = {} as BululuSocket;

    const busy = presence.setStatus(socket, 'busy');
    const available = presence.setStatus(socket, 'available');
    await Promise.resolve();
    releaseFirst();
    await Promise.all([busy, available]);

    expect(status).toBe('available');
    expect(stored).toEqual(['busy', 'available']);
  });
});
