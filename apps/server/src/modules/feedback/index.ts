import {
  API_PATHS,
  FEEDBACK_RATE_PER_HOUR,
  FeedbackBodySchema,
  type FeedbackBody,
} from '@bululu/shared';

import type { Database } from '../../platform/db.js';
import { currentUser, sessionRateLimit } from '../auth/index.js';
import type { BululuModule } from '../types.js';

/** In-app feedback of the pilot teams (E8-S7), stored with its author so the team can reply. */
export class FeedbackService {
  constructor(private readonly db: Database) {}

  /** A `spaceId` the person is not a member of is not kept (it would leak nothing, but lie). */
  async send(userId: string, body: FeedbackBody): Promise<void> {
    const spaceId =
      body.spaceId === undefined
        ? null
        : ((
            await this.db.membership.findUnique({
              where: { userId_spaceId: { userId, spaceId: body.spaceId } },
              select: { spaceId: true },
            })
          )?.spaceId ?? null);
    await this.db.feedback.create({
      data: { userId, spaceId, message: body.message, rating: body.rating ?? null },
    });
  }
}

/** Feedback module (E8-S7): `POST /api/feedback`, rate-limited per session (and per IP). */
export const feedbackModule: BululuModule = {
  name: 'feedback',
  register({ app, container, services }) {
    const feedback = new FeedbackService(container.db);
    app.post(
      API_PATHS.feedback,
      {
        preHandler: [
          services.get('auth').requireUser,
          sessionRateLimit(app, { max: FEEDBACK_RATE_PER_HOUR, timeWindow: '1 hour' }),
        ],
      },
      async (request, reply) => {
        const body = FeedbackBodySchema.parse(request.body);
        await feedback.send(currentUser(request).userId, body);
        return reply.code(204).send();
      },
    );
  },
};
