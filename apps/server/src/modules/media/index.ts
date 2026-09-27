import { WebhookReceiver } from 'livekit-server-sdk';

import { currentUser } from '../auth/index.js';
import type { BululuModule } from '../types.js';
import { MediaRepository } from './media.repository.js';
import { registerMediaRoutes, registerMediaWebhook } from './media.routes.js';
import { MediaService } from './media.service.js';

export type { MediaAuth } from './media.routes.js';
export { MediaService } from './media.service.js';

declare module '../types.js' {
  interface ModuleServices {
    media: MediaService;
  }
}

/**
 * Media module (E5-S3, E6-S3): LiveKit tokens for the space room, the server-side mute used
 * when someone enters a meeting room (`services.get('media').muteParticipantTracks`) and the
 * signed LiveKit webhook that isolates people who connect from inside a meeting room.
 * Must be registered after `auth`, whose session guard protects the token endpoint.
 */
export const mediaModule: BululuModule = {
  name: 'media',
  async register({ app, container, services }) {
    const media = new MediaService({
      members: new MediaRepository(container.db),
      media: container.media,
    });
    registerMediaRoutes(app, {
      media,
      auth: {
        requireUser: services.get('auth').requireUser,
        currentUserId: (request) => currentUser(request).userId,
      },
    });
    const { apiKey, apiSecret } = container.config.livekit;
    await registerMediaWebhook(app, { media, receiver: new WebhookReceiver(apiKey, apiSecret) });
    services.provide('media', media);
  },
};
