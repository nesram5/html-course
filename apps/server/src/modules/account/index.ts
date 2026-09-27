import {
  AccountDeletionPreviewSchema,
  API_PATHS,
  type AccountDeletionPreview,
} from '@bululu/shared';

import { clearSessionCookie, currentUser } from '../auth/index.js';
import type { BululuModule } from '../types.js';
import { AccountService } from './account.service.js';

export { AccountService } from './account.service.js';

/**
 * Account module (E8-S6): `GET /api/me/deletion` (what deleting would do) and `DELETE /api/me`.
 * Registered after `world`, whose kick listener takes the avatar out of every office.
 */
export const accountModule: BululuModule = {
  name: 'account',
  register({ app, io, container, services }) {
    const spaces = services.get('spaces');
    const account = new AccountService({
      db: container.db,
      io,
      notifier: spaces.notifier,
      deskChanges: spaces.deskChanges,
      logger: container.logger,
    });
    const { requireUser } = services.get('auth');

    app.get(
      API_PATHS.meDeletion,
      { preHandler: requireUser },
      async (request): Promise<AccountDeletionPreview> => {
        const preview = await account.preview(currentUser(request).userId);
        return AccountDeletionPreviewSchema.parse(preview);
      },
    );

    app.delete(API_PATHS.me, { preHandler: requireUser }, async (request, reply) => {
      await account.deleteAccount(currentUser(request).userId);
      clearSessionCookie(reply);
      return reply.code(204).send();
    });
  },
};
