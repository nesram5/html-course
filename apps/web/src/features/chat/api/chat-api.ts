import { API_PATHS, apiPath, MessagesResponseSchema, type ChatMessageDto } from '@plaza/shared';

import { http } from '@/shared/api';

/** `GET /api/spaces/:spaceId/messages`: the last 100 messages, oldest first (E7-S3). */
export async function fetchMessages(
  spaceId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ChatMessageDto[]> {
  const path = apiPath(API_PATHS.messages, { spaceId });
  return (await http(path, MessagesResponseSchema, options)).messages;
}
