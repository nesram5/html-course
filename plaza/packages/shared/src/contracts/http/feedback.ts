import { z } from 'zod';

import { FEEDBACK_MAX_LEN } from '../../constants.js';
import { IdSchema } from './common.js';

/**
 * `POST /api/feedback` (signed in) → 204. In-app feedback form of the pilot teams (E8-S7).
 * Stored with its author so the team can follow up; product events stay anonymous.
 */
export const FeedbackBodySchema = z.object({
  message: z.string().trim().min(1).max(FEEDBACK_MAX_LEN),
  /** Optional 1–5 satisfaction score. */
  rating: z.number().int().min(1).max(5).optional(),
  /** Space the person was in when sending it, if any. */
  spaceId: IdSchema.optional(),
});
export type FeedbackBody = z.infer<typeof FeedbackBodySchema>;
