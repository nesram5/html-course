import type { ChatMessageDto } from '@plaza/shared';
import type { ChatMessage, Prisma } from '@prisma/client';

import type { Database } from '../../platform/db.js';

/** Prisma client or the client of an open transaction. */
export type ChatDbClient = Database | Prisma.TransactionClient;

/** Newest first; `id` breaks ties between messages stored in the same millisecond. */
const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.ChatMessageOrderByWithRelationInput[];

function toDto(row: ChatMessage): ChatMessageDto {
  return {
    id: row.id,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Prisma access of the chat module (RF-13). */
export class ChatRepository {
  constructor(private readonly db: ChatDbClient) {}

  async create(spaceId: string, authorId: string, body: string): Promise<ChatMessageDto> {
    return toDto(await this.db.chatMessage.create({ data: { spaceId, authorId, body } }));
  }

  /** Deletes every message of the space but the newest `keep`. */
  async trim(spaceId: string, keep: number): Promise<void> {
    const stale = await this.db.chatMessage.findMany({
      where: { spaceId },
      orderBy: NEWEST_FIRST,
      skip: keep,
      select: { id: true },
    });
    if (stale.length === 0) return;
    await this.db.chatMessage.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }

  /** The newest `limit` messages of the space, oldest first. */
  async latest(spaceId: string, limit: number): Promise<ChatMessageDto[]> {
    const rows = await this.db.chatMessage.findMany({
      where: { spaceId },
      orderBy: NEWEST_FIRST,
      take: limit,
    });
    return rows.reverse().map(toDto);
  }
}
