import { CHAT_HISTORY, type ChatMessageDto, type ReactionEmoji } from '@bululu/shared';

import type { Database } from '../../platform/db.js';
import type { BululuIo, BululuSocket } from '../../platform/socket.js';
import type { SpacesService } from '../spaces/index.js';
import { spaceRoom, type WorldService } from '../world/index.js';
import { ChatRepository } from './chat.repository.js';

export interface ChatServiceDeps {
  db: Database;
  io: BululuIo;
  world: WorldService;
  spaces: SpacesService;
}

/**
 * Space chat (E7-S3) and reactions (E7-S4). Messages are stored and only the last
 * {@link CHAT_HISTORY} of each space are kept; reactions are ephemeral. Message bodies are never
 * logged (standards §4).
 */
export class ChatService {
  readonly #repository: ChatRepository;

  constructor(private readonly deps: ChatServiceDeps) {
    this.#repository = new ChatRepository(deps.db);
  }

  /**
   * `chat:send`: stores the message (dropping the oldest beyond 100) and sends it to everyone
   * else in the space; the sender gets it in the ack. The body is already validated (trimmed,
   * 1..1000 characters) by the shared schema.
   */
  async send(socket: BululuSocket, body: string): Promise<ChatMessageDto> {
    const { runtime, userId } = this.deps.world.joinedRuntime(socket);
    const { spaceId } = runtime;
    const message = await this.deps.db.$transaction(async (tx) => {
      const repository = new ChatRepository(tx);
      const created = await repository.create(spaceId, userId, body);
      await repository.trim(spaceId, CHAT_HISTORY);
      return created;
    });
    socket.to(spaceRoom(spaceId)).emit('chat:message', message);
    return message;
  }

  /** `GET /api/spaces/:spaceId/messages`: the last 100 messages, oldest first (members only). */
  async history(spaceId: string, userId: string): Promise<ChatMessageDto[]> {
    await this.deps.spaces.assertMember(spaceId, userId);
    return this.#repository.latest(spaceId, CHAT_HISTORY);
  }

  /** `reaction`: shown over the avatar of the person for everyone in the space, sender included. */
  react(socket: BululuSocket, emoji: ReactionEmoji): void {
    const { runtime, userId } = this.deps.world.joinedRuntime(socket);
    this.deps.io.to(spaceRoom(runtime.spaceId)).emit('reaction', { userId, emoji });
  }
}
