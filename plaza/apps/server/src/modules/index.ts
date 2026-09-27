import { authModule } from './auth/index.js';
import { chatModule } from './chat/index.js';
import { desksModule } from './desks/index.js';
import { eventsModule } from './events/index.js';
import { healthModule } from './health/index.js';
import { mediaModule } from './media/index.js';
import { presenceModule } from './presence/index.js';
import { roomsModule } from './rooms/index.js';
import { spacesModule } from './spaces/index.js';
import type { PlazaModule } from './types.js';
import { usersModule } from './users/index.js';
import { worldModule } from './world/index.js';

/**
 * Registered modules, in order: a module may only use services of modules above it.
 * To add a module, create `modules/<name>/index.ts` exporting a `PlazaModule` and add ONE line
 * here (see `modules/README.md`). Expected order: auth, users, spaces, rooms, desks, media, events,
 * world, presence, chat (world uses media for the server-side mute and the removal on kick, and
 * events for `room_entered`).
 */
export const modules: readonly PlazaModule[] = [
  healthModule,
  authModule,
  usersModule,
  spacesModule,
  roomsModule,
  desksModule,
  mediaModule,
  eventsModule,
  worldModule,
  presenceModule,
  chatModule,
];
