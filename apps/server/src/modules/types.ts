import type { FastifyInstance } from 'fastify';

import type { Container } from '../container.js';
import type { BululuIo, SafeHandlerDeps } from '../platform/socket.js';

/**
 * Services that modules expose to modules registered after them. Each module adds its entry
 * by declaration merging in its own `index.ts`, e.g.:
 *
 * ```ts
 * declare module '../types.js' {
 *   interface ModuleServices { auth: AuthService }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by each module
export interface ModuleServices {}

/** Registry of module services, filled in module registration order. */
export class ServiceRegistry {
  readonly #services = new Map<keyof ModuleServices, unknown>();

  provide<K extends keyof ModuleServices>(name: K, service: ModuleServices[K]): void {
    if (this.#services.has(name)) throw new Error(`Service "${name}" is already provided`);
    this.#services.set(name, service);
  }

  get<K extends keyof ModuleServices>(name: K): ModuleServices[K] {
    if (!this.#services.has(name)) {
      throw new Error(
        `Service "${name}" is not available: register its module earlier in modules/index.ts`,
      );
    }
    // Only `provide` writes the map, with the value type bound to the key.
    return this.#services.get(name) as ModuleServices[K];
  }
}

export interface ModuleContext {
  app: FastifyInstance;
  io: BululuIo;
  container: Container;
  services: ServiceRegistry;
  /** Dependencies for `safeHandler` (logger + error reporter). */
  socketDeps: SafeHandlerDeps;
}

/** A backend module (architecture §5.2). Listed in `modules/index.ts`. */
export interface BululuModule {
  name: string;
  register(ctx: ModuleContext): void | Promise<void>;
}
