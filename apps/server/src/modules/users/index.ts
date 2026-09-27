import {
  API_PATHS,
  AvatarsResponseSchema,
  MeResponseSchema,
  UpdateMeBodySchema,
  type AvatarsResponse,
  type MeResponse,
} from '@bululu/shared';

import { currentUser } from '../auth/index.js';
import type { BululuModule } from '../types.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

export { isAdminEmail } from './me.mapper.js';

/** Users module (E1-S4): `GET|PATCH /api/me` and the avatar catalog `GET /api/avatars`. */
export const usersModule: BululuModule = {
  name: 'users',
  register({ app, container, services }) {
    const users = new UsersService(
      new UsersRepository(container.db),
      container.maps,
      container.now,
      container.config.adminEmails,
    );
    const { requireUser } = services.get('auth');

    app.get(API_PATHS.me, { preHandler: requireUser }, async (request): Promise<MeResponse> => {
      const user = await users.me(currentUser(request).userId);
      return MeResponseSchema.parse({ user });
    });

    app.patch(API_PATHS.me, { preHandler: requireUser }, async (request): Promise<MeResponse> => {
      const body = UpdateMeBodySchema.parse(request.body);
      const user = await users.updateMe(currentUser(request).userId, body);
      return MeResponseSchema.parse({ user });
    });

    app.get(API_PATHS.avatars, (): AvatarsResponse => {
      return AvatarsResponseSchema.parse({ avatars: users.avatars() });
    });
  },
};
