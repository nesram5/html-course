import { authModule } from './auth/index.js';
import { chatModule } from './chat/index.js';
import { accountModule } from './account/index.js';
import { adminModule } from './admin/index.js';
import { desksModule } from './desks/index.js';
import { eventsModule } from './events/index.js';
import { feedbackModule } from './feedback/index.js';
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
 * here (see `modules/README.md`). Expected order: auth, users, spaces, events, rooms, desks, media,
 * world, presence, chat, feedback, admin, account (world uses media for the server-side mute and
 * the removal on kick; events comes right after spaces so rooms and world can record product
 * events; account deletion kicks the person out of every space through the world).
 */
export const modules: readonly PlazaModule[] = [
  healthModule,
  authModule,
  usersModule,
  spacesModule,
  eventsModule,
  roomsModule,
  desksModule,
  mediaModule,
  worldModule,
  presenceModule,
  chatModule,
  feedbackModule,
  adminModule,
  accountModule,
];
