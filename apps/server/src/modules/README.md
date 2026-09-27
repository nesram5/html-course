# Server modules

One folder per module (architecture §5.2), with the layers of §5.1:

```text
modules/<name>/
├── index.ts               # exports `<name>Module: BululuModule` — the ONLY entry point
├── <name>.routes.ts       # HTTP adapter: parse with zod from @bululu/shared, call the service, map the response
├── <name>.socket.ts       # Socket.IO adapter (if any), always through `safeHandler`
├── <name>.service.ts      # use cases; receives interfaces (repositories, adapters), throws AppError
├── <name>.repository.ts   # Prisma access
└── __tests__/             # *.test.ts (unit) and *.int.test.ts (integration, real Postgres)
```

## Registering a module

1. Export a `BululuModule` from `modules/<name>/index.ts`:

   ```ts
   export const chatModule: BululuModule = {
     name: 'chat',
     register({ app, io, container, services, socketDeps }) {
       const chat = new ChatService(new ChatRepository(container.db), container.now);
       registerChatRoutes(app, { chat, auth: services.get('auth') });
       io.on('connection', (socket) => {
         socket.on(
           'chat:send',
           safeHandler(socketDeps, socket, 'chat:send', (p) => chat.send(socket.data, p)),
         );
       });
     },
   };
   ```

2. Add one line to `modules/index.ts`. Modules register in that order.

3. To share a service with later modules, augment `ModuleServices` and `provide` it:

   ```ts
   declare module '../types.js' {
     interface ModuleServices {
       auth: AuthService;
     }
   }
   // in register(): services.provide('auth', authService);
   ```

## Rules

- Routes use the paths of `API_PATHS` and the schemas of `@bululu/shared` for params, query, body and response.
- State-changing requests need the `X-Bululu-Client` header (checked globally in `app.ts`).
- External services only through `container.identity`, `container.meetings`, `container.media`.
- Use `container.logger` (pino); never log tokens, OAuth codes or chat bodies.
- Integration tests build the app with `buildTestApp()` from `src/test/app.ts` and reset the DB with `resetDatabase()`.
