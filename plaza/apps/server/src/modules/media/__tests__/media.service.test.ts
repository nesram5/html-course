import { describe, expect, it } from 'vitest';

import { FakeMediaProvider } from '../../../adapters/fakes/index.js';
import { MediaService, type MediaMembers } from '../media.service.js';

const members: MediaMembers = {
  findMemberDisplayName: (spaceId, userId) =>
    Promise.resolve(spaceId === 'space-1' && userId === 'user-ana' ? 'Ana' : null),
};

describe('MediaService', () => {
  it('issues a 10 min token for the space room to a member, saying when it expires', async () => {
    const media = new FakeMediaProvider('wss://lk.example.com');
    const service = new MediaService({ members, media });

    await expect(service.issueToken('space-1', 'user-ana')).resolves.toEqual({
      url: 'wss://lk.example.com',
      token: 'fake-token:space_space-1:user-ana',
      expiresInSeconds: 600,
    });
    expect(media.tokens).toEqual([
      {
        roomName: 'space_space-1',
        identity: 'user-ana',
        displayName: 'Ana',
        ttlSeconds: 600,
        canPublish: true,
      },
    ]);
  });

  it('issues a token that may not publish to someone inside a meeting room (E6-S3)', async () => {
    const media = new FakeMediaProvider();
    const service = new MediaService({ members, media });
    let inRoom = true;
    service.trackMeetingRooms((spaceId, userId) => {
      expect([spaceId, userId]).toEqual(['space-1', 'user-ana']);
      return inRoom;
    });

    await service.issueToken('space-1', 'user-ana');
    inRoom = false;
    await service.issueToken('space-1', 'user-ana');

    expect(media.tokens.map((token) => token.canPublish)).toEqual([false, true]);
  });

  it('entering a meeting room mutes the tracks and revokes publishing; leaving grants it back', async () => {
    const media = new FakeMediaProvider();
    const service = new MediaService({ members, media });

    await service.enterMeetingRoom('space-1', 'user-luis');
    expect(media.mutes).toEqual([{ roomName: 'space_space-1', identity: 'user-luis' }]);
    expect(media.permissions).toEqual([
      { roomName: 'space_space-1', identity: 'user-luis', canPublish: false },
    ]);

    await service.leaveMeetingRoom('space-1', 'user-luis');
    expect(media.permissions.at(-1)).toEqual({
      roomName: 'space_space-1',
      identity: 'user-luis',
      canPublish: true,
    });
    // Leaving never unmutes remotely.
    expect(media.mutes).toHaveLength(1);
  });

  it('revokes publishing even when the mute fails, then reports the failure', async () => {
    const media = new FakeMediaProvider();
    const failure = new Error('mute failed');
    media.mutePublishedTracks = () => Promise.reject(failure);
    const service = new MediaService({ members, media });

    await expect(service.enterMeetingRoom('space-1', 'user-luis')).rejects.toBe(failure);
    expect(media.permissions).toEqual([
      { roomName: 'space_space-1', identity: 'user-luis', canPublish: false },
    ]);
  });

  it('rejects non-members with NOT_A_MEMBER (404)', async () => {
    const media = new FakeMediaProvider();
    const service = new MediaService({ members, media });

    await expect(service.issueToken('space-1', 'user-luis')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
      httpStatus: 404,
    });
    await expect(service.issueToken('space-2', 'user-ana')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    expect(media.tokens).toEqual([]);
  });

  it('mutes the participant in the space room', async () => {
    const media = new FakeMediaProvider();
    const service = new MediaService({ members, media });

    await service.muteParticipantTracks('space-1', 'user-luis');

    expect(media.mutes).toEqual([{ roomName: 'space_space-1', identity: 'user-luis' }]);
  });

  it('removes a kicked member from the space room', async () => {
    const media = new FakeMediaProvider();
    const service = new MediaService({ members, media });

    await service.removeParticipant('space-1', 'user-luis');

    expect(media.removals).toEqual([{ roomName: 'space_space-1', identity: 'user-luis' }]);
  });
});
