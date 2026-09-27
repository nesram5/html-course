import { describe, expect, it } from 'vitest';

import { FakeMediaProvider } from '../../../adapters/fakes/index.js';
import { MediaService, type MediaMembers } from '../media.service.js';

const members: MediaMembers = {
  findMemberDisplayName: (spaceId, userId) =>
    Promise.resolve(spaceId === 'space-1' && userId === 'user-ana' ? 'Ana' : null),
};

describe('MediaService', () => {
  it('issues a 1 h token for the space room to a member', async () => {
    const media = new FakeMediaProvider('wss://lk.example.com');
    const service = new MediaService({ members, media });

    await expect(service.issueToken('space-1', 'user-ana')).resolves.toEqual({
      url: 'wss://lk.example.com',
      token: 'fake-token:space_space-1:user-ana',
    });
    expect(media.tokens).toEqual([
      { roomName: 'space_space-1', identity: 'user-ana', displayName: 'Ana', ttlSeconds: 3600 },
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
});
