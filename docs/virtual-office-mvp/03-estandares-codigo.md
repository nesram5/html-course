# 03 · Estándares de código — Bululu MVP

Estos estándares aplican a todo el monorepo descrito en la [arquitectura](./02-arquitectura.md).
Lo que se puede automatizar **se automatiza** (lint, formato, tipos, tests en CI); el resto se revisa en los PR.

---

## 1. Versiones y herramientas

| Herramienta         | Versión                                                       | Uso                              |
| ------------------- | ------------------------------------------------------------- | -------------------------------- |
| Node.js             | 22 LTS (`.nvmrc`)                                             | Runtime                          |
| pnpm                | 9.x (`packageManager` en `package.json`)                      | Gestor de paquetes y workspaces  |
| TypeScript          | 5.x                                                           | Lenguaje                         |
| ESLint              | 9 (_flat config_) + `typescript-eslint` (`strictTypeChecked`) | Lint                             |
| Prettier            | 3.x                                                           | Formato                          |
| Vitest              | 2.x                                                           | Tests unitarios y de integración |
| Playwright          | 1.x                                                           | Tests E2E                        |
| Husky + lint-staged | —                                                             | _Hooks_ de pre-commit            |
| commitlint          | —                                                             | Conventional Commits             |

## 2. TypeScript

`tsconfig.base.json` (raíz del monorepo):

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
  },
}
```

Reglas:

- **Prohibido `any`** (`@typescript-eslint/no-explicit-any: error`). Usar `unknown` y estrechar.
- **Sin `as` para "callar" al compilador.** Solo se permite `as const` y aserciones justificadas con comentario.
- **Sin `!` (non-null assertion)** salvo en tests.
- **Tipos de datos externos = inferidos de zod.** Nunca escribir a mano un tipo que ya describe un esquema:
  ```ts
  export const PlayerMoveSchema = z.object({
    seq: z.number().int().nonnegative(),
    x: z.number().int(),
    y: z.number().int(),
    dir: DirectionSchema,
  });
  export type PlayerMove = z.infer<typeof PlayerMoveSchema>;
  ```
- **`type` vs `interface`:** `interface` para formas de objetos extensibles (puertos, props); `type` para uniones, utilidades y tipos inferidos.
- **Uniones discriminadas** en vez de _flags_ booleanos para estados (`{ kind: 'connecting' } | { kind: 'connected'; room: Room }`).
- **Enums:** no usar `enum` de TS; usar uniones de _string literals_ o `as const` (el `enum` de Prisma se re-exporta como unión).
- **Errores esperados** en servicios: lanzar `AppError` con código tipado. No lanzar _strings_.
- **Exportaciones con nombre**; nada de `export default` (salvo donde la herramienta lo exige, p. ej. configs).

## 3. Nombres y archivos

| Elemento              | Convención                     | Ejemplo                                    |
| --------------------- | ------------------------------ | ------------------------------------------ |
| Archivos TS           | `kebab-case` con sufijo de rol | `space.service.ts`, `invitation.routes.ts` |
| Componentes React     | `PascalCase.tsx`               | `MemberList.tsx`                           |
| Hooks                 | `useCamelCase.ts`              | `useMediaDevices.ts`                       |
| Escenas Phaser        | `PascalCaseScene.ts`           | `WorldScene.ts`                            |
| Variables y funciones | `camelCase`                    | `computePeers`                             |
| Tipos e interfaces    | `PascalCase`, sin prefijo `I`  | `PlayerState`                              |
| Constantes globales   | `UPPER_SNAKE_CASE`             | `PROXIMITY_RADIUS`                         |
| Esquemas zod          | `PascalCase` + `Schema`        | `ChatSendSchema`                           |
| Eventos de socket     | `dominio:accion` en minúsculas | `player:move`, `media:peers`               |
| Rutas REST            | plural, `kebab-case`           | `/api/spaces/:spaceId/invitations`         |
| Tablas/modelos Prisma | `PascalCase` singular          | `Membership`                               |
| Ramas git             | `tipo/ID-descripcion-corta`    | `feat/E5-S2-media-peers`                   |

Idioma: **código, identificadores y commits en inglés**; documentación de producto y textos de UI en
español (a través de i18n).

## 4. Estándares del backend

- **Capas** (ver arquitectura §5.1): `routes/socket → service → repository/domain`. Un _route handler_ hace solo: validar, llamar al servicio, mapear la respuesta.
- **Validación en el borde:** todo `body`, `params`, `query` y payload de socket pasa por su esquema zod de `@bululu/shared` antes de llegar al servicio.
- **Inyección de dependencias manual** en `container.ts`; los servicios reciben interfaces, no instancias de Prisma globales.
- **Transacciones** con `prisma.$transaction` en el servicio, nunca en el _repository_ de forma implícita.
- **Handlers de socket**: siempre con `try/catch` central (_wrapper_ `safeHandler`) que registra y emite `error`; un error nunca tumba el proceso.
- **Nada de lógica en el _tick_** fuera de `@bululu/shared/world`: el _tick_ del servidor solo orquesta funciones puras y emite.
- **Logs**: usar el `logger` inyectado (pino), nunca `console.*`. Nunca registrar _tokens_ (de sesión, de Google o de LiveKit), códigos OAuth ni el cuerpo de los mensajes de chat.
- **Servicios externos** (Google, LiveKit) solo a través de las interfaces de `adapters/`; ningún servicio importa sus SDK directamente.
- **Tokens de Google**: se usan en memoria durante la petición y se descartan; nunca se guardan en BD ni en logs.
- **Configuración**: `platform/config.ts` valida `process.env` con zod al arrancar; si falta algo, el proceso no arranca.

Ejemplo de ruta:

```ts
export function registerInvitationRoutes(
  app: FastifyInstance,
  deps: { invitations: InvitationService },
) {
  app.post('/api/spaces/:spaceId/invitations', { preHandler: requireUser }, async (req, reply) => {
    const { spaceId } = SpaceParamsSchema.parse(req.params);
    const invitation = await deps.invitations.create({ spaceId, actorId: req.user.id });
    return reply.code(201).send(CreateInvitationResponseSchema.parse(invitation));
  });
}
```

## 5. Estándares del frontend

- **Organización por _feature_** (`features/<feature>/{components,hooks,api,store,__tests__}`); lo compartido va a `shared/`. Una _feature_ no importa de otra salvo por su `index.ts` público.
- **Componentes funcionales** y _hooks_. Componentes ≤ ~150 líneas; si crecen, extraer.
- **Estado:**
  - Datos del servidor por REST → TanStack Query (claves en `features/<f>/api/keys.ts`).
  - Estado vivo del mundo y de medios → Zustand (un _store_ por dominio: `worldStore`, `mediaStore`, `presenceStore`, `chatStore`).
  - Estado local de UI → `useState`.
- **Phaser aislado:** solo `features/world` importa Phaser. Las escenas leen de los _stores_ con `store.subscribe` y se limpian en `shutdown`.
- **Sin lógica de negocio en componentes**: cálculos de mundo en `@bululu/shared/world`, llamadas de red en `RealtimeClient`/`MediaController`/clientes API.
- **Accesibilidad:** elementos interactivos nativos (`<button>`, no `<div onClick>`), `aria-label` en botones de icono, foco visible, orden de tabulación lógico; `eslint-plugin-jsx-a11y` activo.
- **Textos:** siempre con `t('clave')` (i18next); nada de _strings_ de UI incrustados.
- **Estilos:** Tailwind CSS con _tokens_ de diseño en `tailwind.config.ts`; sin estilos en línea salvo valores dinámicos.
- **Recursos de medios** (`MediaStream`, pistas, `Room`): siempre liberados en el _cleanup_ del efecto o del controlador.

## 6. Contratos compartidos (`@bululu/shared`)

- Cada evento de socket y cada endpoint REST tiene su esquema en `packages/shared/src/{http,realtime}/`.
- Mapa tipado de eventos, usado por el servidor y el cliente de Socket.IO:
  ```ts
  export interface ClientToServerEvents {
    'space:join': (p: SpaceJoin, ack: (r: Ack<SpaceSnapshot>) => void) => void;
    'player:move': (p: PlayerMove) => void;
    // ...
  }
  ```
- **Cambio incompatible de protocolo** ⇒ subir `PROTOCOL_VERSION` en `shared` en el mismo PR.
- Constantes de juego (`TILE_SIZE = 32`, `PROXIMITY_RADIUS = 3`, `PROXIMITY_HYSTERESIS = 1`, `TICK_HZ = 15`, `MAX_PEERS = 8`, `AWAY_IDLE_MS = 600_000`) viven **solo** aquí.

## 7. Testing

| Nivel               | Herramienta                                                                                                                           | Qué se prueba                                                                                             | Dónde                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Unitario            | Vitest                                                                                                                                | `shared/world` (colisiones, proximidad, salas, parseo de mapas), dominio de módulos, utilidades, _stores_ | junto al código en `__tests__/`              |
| Integración backend | Vitest + Postgres en contenedor + `fastify.inject` + cliente Socket.IO real                                                           | Rutas, servicios con BD, _handlers_ de socket, autorización                                               | `apps/server/src/**/__tests__/*.int.test.ts` |
| Componentes         | Vitest + Testing Library                                                                                                              | Formularios, paneles, estados de carga/error                                                              | `apps/web`                                   |
| E2E                 | Playwright (2+ contextos, `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, login de prueba con `AUTH_TEST_LOGIN`) | Flujos 2, 3 y 4 del brief §8                                                                              | `e2e/`                                       |
| Carga               | Script con `socket.io-client` (50 bots), una ejecución antes de la beta                                                               | RNF-01, RN-06                                                                                             | `tools/load/`                                |

Reglas:

- **Cobertura mínima** solo donde más importa: `packages/shared` ≥ 90 % de líneas (el CI falla si baja). En `apps/*` se exigen tests de integración de los casos de uso críticos (login, acceso al espacio, entrar en sala), sin porcentaje fijo.
- Tests con estructura **Arrange / Act / Assert** y nombres descriptivos: `it('disconnects peers only beyond radius + hysteresis')`.
- Sin `sleep` en tests: usar _fake timers_ o esperar a eventos.
- Cada bug corregido añade un test que lo reproduce.
- `computePeers` se prueba también con **tests basados en propiedades** (`fast-check`): la proximidad es simétrica y nadie dentro de una sala tiene _peers_.
- Google y LiveKit se sustituyen por dobles (_fakes_) de los adaptadores en los tests; nunca se llama a servicios reales en CI.

## 8. Git y flujo de trabajo

- **Trunk-based:** `main` siempre desplegable; ramas cortas (≤ 2 días) que salen de `main`.
- **Conventional Commits** (validado por commitlint):
  `feat(world): add hysteresis to proximity engine`, `feat(rooms): create meet spaces on space creation`, `fix(media): release tracks on leave`, `chore`, `docs`, `test`, `refactor`, `ci`.
  El _scope_ es el módulo o paquete.
- **Pull Requests:**
  - Título en formato Conventional Commit; descripción con: historia (ID), qué cambia, cómo probarlo, capturas si hay UI.
  - ≤ 400 líneas cambiadas (sin contar _lockfiles_ ni generados). Si es más grande, dividir.
  - 1 aprobación mínima; CI en verde obligatorio; _squash merge_.
- **Feature flags** simples (variables de entorno leídas en `config`) para funciones a medio terminar en `main`.

## 9. Integración continua

Pipeline de GitHub Actions en cada PR y en `main`:

```text
install (pnpm, caché) → lint → typecheck → test:unit → test:int (servicios: Postgres y `livekit-server --dev`)
  → build → validate:maps → test:e2e (Playwright, solo en main y PR con label e2e)
```

- Caché de pnpm; si el CI supera 10 min, se valora Turborepo (ADR-001).
- `pnpm audit --prod` y Dependabot/Renovate semanal.
- Imágenes Docker de `server` y `web` construidas y etiquetadas con el SHA en `main`.

## 10. Definition of Ready (DoR) de una historia

- [ ] Redactada como "Como … quiero … para …" y enlazada a un requisito del brief (RF/RN/RNF).
- [ ] Criterios de aceptación en formato _Dado / Cuando / Entonces_.
- [ ] Dependencias resueltas o planificadas antes.
- [ ] Estimada en puntos (escala Fibonacci 1, 2, 3, 5, 8). Si es 13 o más, se divide.
- [ ] Contratos nuevos (eventos/endpoints) identificados.

## 11. Definition of Done (DoD) de una historia

- [ ] Código que cumple estos estándares; lint y _typecheck_ sin errores ni `eslint-disable` injustificados.
- [ ] Tests del nivel adecuado escritos y en verde; cobertura mínima respetada.
- [ ] Contratos actualizados en `@bululu/shared` (y `PROTOCOL_VERSION` si hubo cambio incompatible).
- [ ] Textos de UI en i18n; accesibilidad básica verificada con teclado.
- [ ] Revisión de código aprobada; CI en verde; desplegado en _staging_.
- [ ] Criterios de aceptación verificados en _staging_ por otra persona.
- [ ] Documentación actualizada (ADR nuevo si cambia una decisión de arquitectura).
