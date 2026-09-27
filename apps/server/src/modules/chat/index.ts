import { systemTimers, type Timers } from '../../platform/timers.js';
import type { BululuModule } from '../types.js';
import { registerChatRoutes } from './chat.routes.js';
import { ChatService } from './chat.service.js';
import { registerChatSocket } from './chat.socket.js';

export { ChatService } from './chat.service.js';

declare module '../types.js' {
  interface ModuleServices {
    chat: ChatService;
  }
}

export interface ChatModuleOptions {
  /** Clock of the rate limits; tests pass `ManualTimers`. */
  timers?: Timers;
}

/**
 * Chat module (E7-S3, E7-S4): space chat (persisted, last 100 messages) and ephemeral
 * reactions. Needs `auth`, `spaces` and `world` registered before it.
 */
export function createChatModule(options: ChatModuleOptions = {}): BululuModule {
  return {
    name: 'chat',
    register({ app, io, container, services, socketDeps }) {
      const timers = options.timers ?? systemTimers;
      const chat = new ChatService({
        db: container.db,
        io,
        world: services.get('world'),
        spaces: services.get('spaces').service,
      });
      registerChatRoutes(app, { chat, requireUser: services.get('auth').requireUser });
      registerChatSocket(io, socketDeps, chat, () => timers.now());
      services.provide('chat', chat);
    },
  };
}

export const chatModule: BululuModule = createChatModule();
