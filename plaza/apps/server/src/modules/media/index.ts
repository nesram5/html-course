import type { PlazaModule, ServiceRegistry } from '../types.js';
import { MediaRepository } from './media.repository.js';
import { registerMediaRoutes, type MediaAuth } from './media.routes.js';
import { MediaService } from './media.service.js';

export type { MediaAuth } from './media.routes.js';
export { MediaService } from './media.service.js';

declare module '../types.js' {
  interface ModuleServices {
    media: MediaService;
  }
}

/**
 * Media module (E5-S3, E6-S3): LiveKit tokens for the space room and the server-side mute used
 * when someone enters a meeting room (`services.get('media').muteParticipantTracks`).
 *
 * Authentication comes from a resolver so that this module does not depend on the auth module's
 * internals. Register it after `auth` in `modules/index.ts` with:
 *
 * ```ts
 * createMediaModule((services) => ({
 *   requireUser: services.get('auth').requireUser,
 *   currentUserId: (request) => currentUser(request).userId,
 * })),
 * ```
 */
export function createMediaModule(
  resolveAuth: (services: ServiceRegistry) => MediaAuth,
): PlazaModule {
  return {
    name: 'media',
    register({ app, container, services }) {
      const media = new MediaService({
        members: new MediaRepository(container.db),
        media: container.media,
      });
      registerMediaRoutes(app, { media, auth: resolveAuth(services) });
      services.provide('media', media);
    },
  };
}
