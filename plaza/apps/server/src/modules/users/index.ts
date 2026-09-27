import {
  API_PATHS,
  AvatarsResponseSchema,
  MeResponseSchema,
  UpdateMeBodySchema,
  type AvatarsResponse,
  type MeResponse,
} from '@plaza/shared';

import { currentUser } from '../auth/index.js';
import type { PlazaModule } from '../types.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

/** Users module (E1-S4): `GET|PATCH /api/me` and the avatar catalog `GET /api/avatars`. */
export const usersModule: PlazaModule = {
  name: 'users',
  register({ app, container, services }) {
    const users = new UsersService(
      new UsersRepository(container.db),
      container.maps,
      container.now,
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
