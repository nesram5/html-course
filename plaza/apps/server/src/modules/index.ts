import { healthModule } from './health/index.js';
import type { PlazaModule } from './types.js';

/**
 * Registered modules, in order: a module may only use services of modules above it.
 * To add a module, create `modules/<name>/index.ts` exporting a `PlazaModule` and add ONE line
 * here (see `modules/README.md`). Expected order: auth, users, spaces, rooms, desks, world,
 * media, presence, chat, events.
 */
export const modules: readonly PlazaModule[] = [healthModule];
