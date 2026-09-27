import { z } from 'zod';

import { CHAT_MAX_LEN } from '../../constants.js';
import { IdSchema, IsoDateTimeSchema, textSchema } from './common.js';

/** Chat text: trimmed, 1..1000 characters, no control characters but new lines (E7-S3). */
export const ChatBodySchema = textSchema(CHAT_MAX_LEN);

/** A persisted chat message. Also the payload of the realtime `chat:message` event. */
export const ChatMessageDtoSchema = z.object({
  id: IdSchema,
  /** `null` when the author deleted their account ("Usuario eliminado"). */
  authorId: IdSchema.nullable(),
  body: z.string().max(CHAT_MAX_LEN),
  createdAt: IsoDateTimeSchema,
});
export type ChatMessageDto = z.infer<typeof ChatMessageDtoSchema>;

/** `GET /api/spaces/:spaceId/messages`: the last 100 messages, oldest first. */
export const MessagesResponseSchema = z.object({ messages: z.array(ChatMessageDtoSchema) });
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;
